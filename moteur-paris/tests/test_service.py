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
        suivre(s, "backtest", "en_cours", "Lancé en arrière-plan.")
    autre = Service(reglages_test, sessions, reseau=False)  # ex. le backtest lui-même qui démarre
    with sessions() as s:
        assert etat_taches(s)["backtest"]["etat"] == "en_cours"  # surtout pas « interrompu »
    autre.nettoyer_taches()  # démarrage du service principal
    with sessions() as s:
        assert etat_taches(s)["backtest"]["etat"] == "erreur"


def test_rapport_backtest_affichable_sous_windows(capsys):
    import sys

    from moteur.cli import _sorties_utf8

    _sorties_utf8()
    print("ξ − →")  # symboles absents de l'encodage Windows par défaut
    assert "ξ" in capsys.readouterr().out or sys.stdout.encoding.lower().startswith("utf")


def test_prediction_figee_apres_le_coup_d_envoi(service, sessions, scenario):
    from datetime import timedelta

    from moteur.db import Prediction

    service.analyser(scenario["maintenant"])
    with sessions() as s:
        avant = {p.match_id: p.maj_le for p in s.query(Prediction)}
    apres_debut = scenario["maintenant"] + timedelta(hours=30)
    service.horloge_modifiable["t"] = apres_debut
    service.analyser(apres_debut)
    with sessions() as s:
        assert {p.match_id: p.maj_le for p in s.query(Prediction)} == avant


class FauxOdds:
    def __init__(self, scores):
        self.a_rendre, self.appels, self.restant = scores, [], 450

    def scores(self, ligue, jours=3):
        self.appels.append(ligue)
        return [x for x in self.a_rendre if x.ligue == ligue]

    def cotes(self, *a, **k):
        return []


def test_resultats_depuis_odds_api_puis_clv(service, sessions, scenario):
    from moteur.db import Prediction
    from moteur.donnees.odds_api import Score
    from moteur.journal import completer_clv

    service.analyser(scenario["maintenant"])
    joues = scenario["complet"].loc[scenario["fixtures"].index]
    noms = {"Club A": "Club A FC"}  # l'API écrit parfois les noms autrement
    service.odds = FauxOdds([Score("E1", noms.get(l.dom, l.dom), noms.get(l.ext, l.ext), l.date.to_pydatetime(),
                                   int(l.bd), int(l.be)) for l in joues.itertuples()])
    service.reseau = True
    apres = scenario["maintenant"] + timedelta(days=2, hours=12)
    service.r.odds_api_credits_jour = 20
    service.resultats_api(apres)
    with sessions() as s:
        assert s.query(Prediction).filter(Prediction.fraction.is_(None)).count() == 0  # tout est réglé
        assert lire_etat(s, "odds_api:budget")["credits"] == 2
    assert service.odds.appels == ["E1"]
    service.resultats_api(apres + timedelta(hours=1))  # plus rien à régler : aucun appel payant
    assert service.odds.appels == ["E1"]
    # la CLV arrive plus tard, avec les cotes de clôture de football-data
    with sessions() as s:
        assert s.query(Prediction).filter(Prediction.clv.is_not(None)).count() == 0
        assert completer_clv(s, scenario["complet"], apres) > 0
        assert s.query(Prediction).filter(Prediction.clv.is_(None)).count() == 0
        assert completer_clv(s, scenario["complet"], apres) == 0  # déjà fait


def test_coupure_internet_sans_avalanche_d_alertes(service, sessions, scenario):
    from moteur.journal import alertes_depuis

    class OddsHorsLigne(FauxOdds):
        def scores(self, ligue, jours=3):
            self.appels.append(ligue)
            raise httpx.ConnectError("[Errno -3] Temporary failure in name resolution")

    service.analyser(scenario["maintenant"])
    service.odds, service.reseau = OddsHorsLigne([]), True
    apres = scenario["maintenant"] + timedelta(days=2, hours=12)
    for minutes in range(0, 50, 5):  # le service repasse souvent : une seule tentative par heure
        service.resultats_api(apres + timedelta(minutes=minutes))
    assert service.odds.appels == ["E1"]
    service.resultats_api(apres + timedelta(hours=1, minutes=1))
    assert service.odds.appels == ["E1", "E1"]
    with sessions() as s:
        alertes = alertes_depuis(s, apres - timedelta(hours=1))
    assert len(alertes) == 1 and "pas accès à Internet" in alertes[0]  # même alerte : notée une fois


def test_cotes_relevees_juste_avant_les_matchs(service, sessions, scenario):
    from moteur.db import Pari, Recommandation
    from moteur.donnees.cotes import CoteBrute
    from moteur.donnees.odds_api import EvenementCotes
    from moteur.marches import Selection

    m = scenario["fixtures"].iloc[0]
    debut = m["date"].to_pydatetime()

    class OddsDirect(FauxOdds):
        def __init__(self):
            super().__init__([])
            self.cotes_demandees = []

        def evenements(self, ligue):
            return [(m["dom"], m["ext"], debut)] if ligue == "E1" else []

        def cotes(self, ligue, *a, **k):
            self.cotes_demandees.append(ligue)
            quand = service.horloge()
            cotes = [CoteBrute("pinnacle", Selection("1x2", i), c, quand) for i, c in zip("1X2", (2.0, 3.6, 4.0))]
            cotes += [CoteBrute("onexbet", Selection("1x2", i), c, quand) for i, c in zip("1X2", (2.2, 3.3, 3.7))]
            return [EvenementCotes("E1", m["dom"], m["ext"], debut, cotes)]

    service.odds, service.reseau = OddsDirect(), True
    service.r.odds_api_credits_jour, service.r.odds_api_credits_scores = 15, 6
    service.maj_donnees = lambda quand: 0  # pas de téléchargement dans le test
    service.horloge_modifiable["t"] = debut - timedelta(hours=5)
    assert service.ligues_avant_match(service.horloge()) == []  # trop tôt : aucun crédit dépensé
    service.horloge_modifiable["t"] = debut - timedelta(hours=1)
    assert service.ligues_avant_match(service.horloge()) == ["E1"]
    service.tick()
    assert service.odds.cotes_demandees == ["E1"]
    with sessions() as s:
        (reco,) = s.query(Recommandation).filter(Recommandation.chasseur == "S").all()
        assert reco.valide and reco.selection == Selection("1x2", "1").cle
        assert s.query(Pari).filter(Pari.mode == "simulation", Pari.recommandation_id == reco.id).count() == 1
        assert lire_etat(s, "odds_api:budget")["credits"] == 2  # h2h + totals, région eu
    service.horloge_modifiable["t"] = debut - timedelta(minutes=40)
    service.tick()  # relevé trop récent : pas de nouvel appel payant
    assert service.odds.cotes_demandees == ["E1"]
    alerte = next(x for x, _ in service.telegram.envoyes if "URGENT" in x)  # utilisable sans ouvrir l'app
    assert "coup d'envoi dans 60 min" in alerte and "Sur 22bet : jouer si la cote est ≥" in alerte


def test_mouvement_de_pinnacle_et_clv_par_les_releves(service, sessions, scenario):
    from moteur.db import Cote, Match, Recommandation
    from moteur.donnees.cotes import CoteBrute
    from moteur.donnees.odds_api import EvenementCotes
    from moteur.journal import cloture_releves, enregistrer_releves
    from moteur.marches import Selection

    m = scenario["fixtures"].iloc[0]
    debut = m["date"].to_pydatetime()
    # 1er relevé : rien à jouer ; 2e relevé (après les compositions) : Pinnacle monte sur le domicile,
    # 1xBet n'a pas bougé
    prix = [((2.1, 3.5, 3.8), (2.15, 3.4, 3.7)), ((1.9, 3.7, 4.3), (2.15, 3.4, 3.7))]

    class OddsQuiBouge(FauxOdds):
        def __init__(self):
            super().__init__([])
            self.n = 0

        def evenements(self, ligue):
            return [(m["dom"], m["ext"], debut)] if ligue == "E1" else []

        def cotes(self, ligue, *a, **k):
            quand = service.horloge()
            ref, cible = prix[min(self.n, 1)]
            self.n += 1
            cotes = [CoteBrute("pinnacle", Selection("1x2", i), c, quand) for i, c in zip("1X2", ref)]
            cotes += [CoteBrute("onexbet", Selection("1x2", i), c, quand) for i, c in zip("1X2", cible)]
            return [EvenementCotes("E1", m["dom"], m["ext"], debut, cotes)]

    service.odds, service.reseau = OddsQuiBouge(), True
    service.maj_donnees = lambda quand: 0
    service.horloge_modifiable["t"] = debut - timedelta(minutes=110)
    service.tick()
    with sessions() as s:
        assert s.query(Recommandation).filter(Recommandation.chasseur == "S").count() == 0
    service.horloge_modifiable["t"] = debut - timedelta(minutes=45)
    service.tick()
    assert service.odds.n == 2  # un second relevé dans la dernière heure
    with sessions() as s:
        (reco,) = s.query(Recommandation).filter(Recommandation.chasseur == "S").all()
        assert reco.selection == Selection("1x2", "1").cle and "Ses chances ont monté" in reco.note
        assert "22bet est souvent en retard" in reco.note
        assert s.query(Cote).count() == 12  # 2 relevés × (3 Pinnacle + 3 1xBet)
        match = s.get(Match, reco.match_id)
        # CLV : seulement sur un relevé pris APRÈS le pari
        assert cloture_releves(s, match, Selection("1x2", "1"), reco.cree_le) is None
        plus_tard = debut - timedelta(minutes=5)
        enregistrer_releves(s, match, [CoteBrute("pinnacle", Selection("1x2", i), c, plus_tard)
                                       for i, c in zip("1X2", (1.8, 3.8, 4.8))], reco.cree_le)
        s.commit()
        cc = cloture_releves(s, match, Selection("1x2", "1"), reco.cree_le)
        assert cc is not None and 1.8 < cc < 1.95  # la cote prise (2,15) bat la clôture : CLV positive


def test_pas_de_releve_payant_pour_les_grands_championnats(service, scenario):
    debut = scenario["maintenant"] + timedelta(hours=1)

    class OddsGrands(FauxOdds):
        def evenements(self, ligue):
            return [("A", "B", debut)]

    service.odds, service.reseau = OddsGrands([]), True
    service.r.ligues = "E0,E1"
    assert service.ligues_avant_match(scenario["maintenant"]) == ["E1"]  # Premier League exclue


def test_budget_de_credits_automatique(service, sessions):
    from datetime import datetime, timezone

    from moteur.journal import ecrire_etat

    quand = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)  # 26 jours jusqu'au 1er novembre
    service.r.odds_api_credits_jour, service.r.fuseau = 0, "UTC"
    assert service.limite_jour(quand) == 15  # crédits restants encore inconnus : prudence
    with sessions() as s:
        ecrire_etat(s, "odds_api:restant", 312)
        ecrire_etat(s, "odds_api:budget", {"jour": "2026-10-06", "credits": 4})
    assert service.limite_jour(quand) == 4 + 312 // 26
    with sessions() as s:
        ecrire_etat(s, "odds_api:restant", 0)
    assert service.limite_jour(quand) == 4  # mois épuisé : plus rien aujourd'hui
    assert service._limite_cotes(quand) == 4 - 2  # la moitié au plus réservée aux scores
    service.r.odds_api_credits_jour = 20  # nombre fixe choisi dans les réglages
    assert service.limite_jour(quand) == 20


def test_migration_des_reglages_une_seule_fois(service, sessions):
    from moteur.taches import enregistrer_reglages, surcharges

    with sessions() as s:
        enregistrer_reglages(s, {"fraction_kelly": 0.25, "mise_max_pct": 0.03, "odds_api_credits_jour": 15},
                             service.base)  # réglages enregistrés avant la mise à jour
    assert set(service.appliquer_migrations()) == {"0.5.3-mises", "0.5.2-credits-auto"}
    assert service.r.fraction_kelly == 0.5 and service.r.mise_max_pct == 0.05 and service.r.odds_api_credits_jour == 0
    with sessions() as s:
        enregistrer_reglages(s, {"fraction_kelly": 0.3}, service.base)  # choix fait ensuite dans l'interface
    assert service.appliquer_migrations() == []  # jamais réappliquée
    with sessions() as s:
        assert surcharges(s)["fraction_kelly"] == 0.3


def test_simulation_refaite_quand_les_matchs_arrivent(service, scenario):
    service.analyser(scenario["maintenant"])
    matchs, service.matchs = service.matchs, []
    avant = service.simulation_saison("E1", n=400)  # simulée la nuit, avant l'analyse des matchs
    assert avant is not None and avant.enjeux == []
    service.matchs = matchs
    apres = service.simulation_saison("E1", n=400)
    m = matchs[0]
    assert apres.enjeu(m.dom, m.ext) is not None
    assert service.simulation_saison("E1", n=400) is apres  # sinon : en cache
