from datetime import timedelta

import httpx
import pytest

from moteur import commandes
from moteur.db import Pari
from moteur.journal import lire_etat
from moteur.promo import cashback, cote_boostee, meilleur_pari_gratuit, pari_gratuit
from moteur.service import Service
from moteur.taches import demander, enregistrer_reglages, etat_taches
from moteur.telegram import Message, Telegram, decouper


class FauxTelegram:
    def __init__(self, messages=()):
        self.envoyes: list[tuple[str, str | None]] = []
        self.a_lire = list(messages)
        self.chat_id = ""

    def envoyer(self, texte, chat_id=None):
        self.envoyes.append((texte, chat_id))

    def lire(self, attente=20):
        lus, self.a_lire = self.a_lire, []
        return lus


@pytest.fixture
def service(reglages_test, sessions, scenario):
    horloge = {"t": scenario["maintenant"]}
    svc = Service(reglages_test, sessions, telegram=FauxTelegram(), horloge=lambda: horloge["t"], reseau=False)
    svc.hist, svc.fixtures = scenario["hist"], scenario["fixtures"]
    svc.horloge_modifiable = horloge
    return svc


def test_tick_quotidien(service, scenario):
    assert service.tick() == ["analyse"]  # 4 h du matin : ni données (6 h) ni rapport (9 h)
    service.horloge_modifiable["t"] = scenario["maintenant"] + timedelta(hours=6)
    faites = service.tick()
    assert "donnees" in faites and "rapport" in faites
    assert any("Rapport du" in t for t, _ in service.telegram.envoyes)
    assert service.tick() == []  # rien n'est refait dans la même journée
    service.horloge_modifiable["t"] = scenario["maintenant"] + timedelta(days=1, hours=6)
    assert "rapport" in service.tick()


def test_analyse_alerte_et_pari_simule(service, sessions):
    nouvelles = service.analyser(service.horloge())
    textes = [t for t, _ in service.telegram.envoyes]
    assert len(textes) == len(nouvelles)
    assert all("jouer si 22bet" in t or "Cote" in t for t in textes)
    with sessions() as s:
        assert s.query(Pari).count() >= 1 or not nouvelles


def test_demandes_depuis_l_interface(service, sessions):
    with sessions() as s:
        demander(s, "analyse")
        demander(s, "rapport")
        with pytest.raises(ValueError):
            demander(s, "inconnue")
    assert service.traiter_demandes(service.horloge()) == ["analyse", "rapport"]
    with sessions() as s:
        taches = etat_taches(s)
    assert taches["analyse"]["etat"] == "termine" and "match" in taches["analyse"]["message"]
    assert taches["rapport"]["etat"] == "termine"


def test_reglages_de_l_interface_appliques(service, sessions):
    with sessions() as s:
        enregistrer_reglages(s, {"valeur_min": 0.05, "fuseau": "Europe/Paris"}, service.base)
    service.recharger()
    assert service.r.valeur_min == 0.05 and service.r.fuseau == "Europe/Paris"
    from pydantic import ValidationError
    with sessions() as s, pytest.raises(ValidationError):
        enregistrer_reglages(s, {"fuseau": "Mars/Olympus"}, service.base)
    service.recharger()
    assert service.r.fuseau == "Europe/Paris"  # la valeur invalide n'a pas été enregistrée


def test_liaison_telegram_par_code(service, sessions):
    code = service.code_liaison()
    service.telegram.a_lire = [Message("42", "bonjour"), Message("42", f"/start {code}")]
    service.traiter_messages()
    assert "code affiché" in service.telegram.envoyes[0][0]
    assert service.r.telegram_chat_id == "42"
    service.telegram.a_lire = [Message("99", "/capital"), Message("42", "/capital")]
    service.telegram.envoyes.clear()
    service.traiter_messages()
    assert len(service.telegram.envoyes) == 1 and "Capital" in service.telegram.envoyes[0][0]


def test_commandes(service):
    nouvelles = service.analyser(service.horloge())
    assert "Commandes" in commandes.executer("/aide", service)
    assert "Mode" in commandes.executer("/capital", service)
    assert "Rapport du" in commandes.executer("/jour", service)
    assert "Journal" in commandes.executer("/journal", service)
    assert "refusé" in commandes.executer("/reel", service)
    assert "simulation" in commandes.executer("/stop", service)
    assert "Usage" in commandes.executer("/cote 12", service)
    assert "Usage" in commandes.executer("/resultat 3 abc", service)
    assert "incorrecte" in commandes.executer("/cote x 1,9", service)
    assert "inconnue" in commandes.executer("/rien", service)
    if nouvelles:
        assert "minimum" in commandes.executer(f"/cote {nouvelles[0].id} 1,01", service)
    m = service.matchs[0]
    assert "Fiche" in commandes.executer(f"/fiche {m.dom} - {m.ext}", service)
    assert "introuvables" in commandes.executer("/fiche Personne - Inconnu", service)
    assert "Bilan hebdomadaire" in commandes.executer("/bilan", service)


def test_decoupage_telegram():
    texte = "\n".join(f"ligne {i} " + "x" * 50 for i in range(200))
    morceaux = decouper(texte, 1000)
    assert all(len(m) <= 1000 for m in morceaux) and "\n".join(morceaux) == texte
    assert decouper("a" * 2500, 1000) == ["a" * 1000, "a" * 1000, "a" * 500]


def test_client_telegram():
    requetes = []

    def repondre(r: httpx.Request):
        requetes.append(r)
        if r.url.path.endswith("getUpdates"):
            return httpx.Response(200, json={"ok": True, "result": [
                {"update_id": 7, "message": {"chat": {"id": 42}, "text": "/jour"}},
                {"update_id": 8, "message": {"chat": {"id": 42}, "photo": []}}]})
        return httpx.Response(200, json={"ok": True})

    t = Telegram("TOKEN", "42", httpx.Client(transport=httpx.MockTransport(repondre)))
    assert t.lire(0) == [Message("42", "/jour")] and t.decalage == 9
    t.envoyer("a" * 5000)
    assert sum(r.url.path.endswith("sendMessage") for r in requetes) == 2


def test_promotions():
    assert pari_gratuit(0.3, 3.4, 10).esperance == pytest.approx(7.2)
    assert cashback(0.45, 2.2, 10, 0.5).esperance == pytest.approx(10 * (0.45 * 1.2 - 0.55 * 0.5))
    assert cote_boostee(0.5, 2.2, 10).esperance == pytest.approx(1.0)
    choix = meilleur_pari_gratuit([("favori", 0.7, 1.4), ("outsider", 0.25, 4.4)], 10)
    assert choix[0] == "outsider"
    assert meilleur_pari_gratuit([], 10) is None


def test_battement_du_service(service, sessions):
    service.tick()
    with sessions() as s:
        assert lire_etat(s, "service:battement") is not None


def test_une_seule_copie_du_moteur(tmp_path):
    from moteur.verrou import VerrouOccupe, verrou_exclusif

    premier = verrou_exclusif(tmp_path / "moteur.verrou")
    with pytest.raises(VerrouOccupe):
        verrou_exclusif(tmp_path / "moteur.verrou")
    premier.close()
    verrou_exclusif(tmp_path / "moteur.verrou").close()  # libéré : on peut relancer


def test_taches_interrompues_nettoyees(reglages_test, sessions):
    from moteur.taches import suivre

    with sessions() as s:
        suivre(s, "analyse", "en_cours", "En cours…")
    Service(reglages_test, sessions, reseau=False)
    with sessions() as s:
        assert etat_taches(s)["analyse"]["etat"] == "erreur"


def test_rapport_backtest_affichable_sous_windows(capsys):
    import sys

    from moteur.cli import _sorties_utf8

    _sorties_utf8()
    print("ξ − →")  # symboles absents de l'encodage Windows par défaut
    assert "ξ" in capsys.readouterr().out or sys.stdout.encoding.lower().startswith("utf")
