from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from moteur.capital import enregistrer, solde
from moteur.chasseurs import Candidat
from moteur.db import Pari, Recommandation
from moteur.journal import (
    changer_mode,
    conditions_reel,
    confirmer_pari,
    controle_arret,
    cote_cloture_juste,
    dimensionner,
    ecrire_etat,
    enregistrer_candidats,
    evaluer_cote,
    mode_actuel,
    regler_depuis_resultats,
    regler_manuellement,
    stats_paris,
    stats_signaux,
)
from moteur.marches import Selection

T0 = datetime(2026, 9, 26, 8, tzinfo=timezone.utc)
DEBUT = datetime(2026, 9, 27, 14, tzinfo=timezone.utc)


def candidat(sel=Selection("total", "plus", 2.5), W=0.55, cote=2.0, valide=True, dom="Leeds", ext="Hull", **kw):
    L = 1 - W
    return Candidat(chasseur="B", ligue="E1", dom=dom, ext=ext, debut=DEBUT, selection=sel, p_gain=W, p_perte=L,
                    cote_juste=1 / W, cote_min=(1.03) / W, cote_indicative=cote, ev=W * cote - 1,
                    kelly=0.1, valide=valide, **kw)


def test_signal_valide_devient_pari_simule(session, reglages_test):
    nouvelles = enregistrer_candidats(session, reglages_test, [candidat()], T0)
    assert len(nouvelles) == 1
    (p,) = session.query(Pari).all()
    assert p.mode == "simulation" and p.cote_prise == 2.0 and p.source_cote == "moyenne (indicative)"
    # Kelly 10 % × 0,25 × 100 $ = 2,50 $, sous le plafond de 3 $
    assert p.mise == pytest.approx(2.5)
    # le même signal ne crée ni nouvelle alerte ni nouveau pari
    assert enregistrer_candidats(session, reglages_test, [candidat(cote=2.05)], T0) == []
    assert session.query(Pari).count() == 1
    assert session.query(Recommandation).one().cote_indicative == 2.05


def test_signaux_non_valides_ou_suspects(session, reglages_test):
    nouvelles = enregistrer_candidats(session, reglages_test, [
        candidat(valide=False), candidat(sel=Selection("btts", "oui"), suspect=True),
        candidat(sel=Selection("1x2", "1"), cote=1.5)], T0)  # sous la cote minimale : pas de pari simulé
    assert len(nouvelles) == 1 and session.query(Recommandation).count() == 3
    # le signal d'un marché non validé devient un pari « observation », jamais un pari simulé
    (p,) = session.query(Pari).all()
    assert p.mode == "observation" and p.mise == pytest.approx(2.5)
    assert conditions_reel(session, reglages_test, T0) == ["aucun pari simulé pour l'instant"]
    assert stats_paris(session, "simulation").n == 0


def test_match_passe_ignore(session, reglages_test):
    assert enregistrer_candidats(session, reglages_test, [candidat()], DEBUT + timedelta(hours=1)) == []


def test_plafonds_d_exposition(session, reglages_test):
    enorme = [candidat(sel=Selection("total", "plus", x), W=0.8, cote=2.0) for x in (0.5, 1.5, 2.5)]
    enregistrer_candidats(session, reglages_test, enorme, T0)
    mises = [p.mise for p in session.query(Pari).all()]
    assert mises[0] == 3.0  # plafond par pari (3 %)
    assert sum(mises) <= 5.0 + 1e-9  # plafond par match (5 %)
    autres = [candidat(sel=Selection("1x2", "1"), W=0.8, dom=f"D{i}", ext=f"E{i}") for i in range(10)]
    enregistrer_candidats(session, reglages_test, autres, T0)
    assert sum(p.mise for p in session.query(Pari).all()) <= 15.0 + 1e-9  # plafond par jour (15 %)


def test_reglement_clv_et_capital(session, reglages_test):
    enregistrer_candidats(session, reglages_test, [candidat()], T0)
    resultats = pd.DataFrame([{
        "ligue": "E1", "dom": "Leeds", "ext": "Hull", "date": pd.Timestamp(DEBUT), "bd": 2, "be": 1,
        "refc_plus": 1.90, "refc_moins": 1.98,
    }])
    (p,) = regler_depuis_resultats(session, resultats, DEBUT + timedelta(hours=3))
    assert p.statut == "gagne" and p.gain_net == pytest.approx(2.5)
    assert solde(session, "simulation") == pytest.approx(102.5)
    assert p.clv == pytest.approx(2.0 / p.cote_cloture_juste - 1) and p.clv > 0
    reco = session.query(Recommandation).one()
    assert reco.fraction == 1 and reco.clv is not None
    st = stats_paris(session, "simulation")
    assert (st.n, st.gagnes, st.roi) == (1, 1, pytest.approx(1.0))
    assert stats_signaux(session, T0)[0]["roi"] == pytest.approx(1.0)


def test_reglement_manuel_et_handicap(session, reglages_test):
    enregistrer_candidats(session, reglages_test, [candidat(sel=Selection("ah", "2", 0.25), W=0.6)], T0)
    match_id = session.query(Pari).one().match_id
    regles, texte = regler_manuellement(session, match_id, 0, 0, DEBUT + timedelta(hours=3))
    assert regles[0].statut == "demi_gagne" and regles[0].gain_net == pytest.approx(regles[0].mise * 0.5)
    assert "réglé" in texte
    assert "déjà réglé" in regler_manuellement(session, match_id, 1, 0, DEBUT)[1]


def test_cote_cloture_juste():
    ligne = pd.Series({"refc_1": 2.0, "refc_x": 3.5, "refc_2": 4.0, "refc_plus": 1.9, "refc_moins": 2.0,
                       "ahc_ligne": -0.5, "refc_ah1": 1.95, "refc_ah2": 1.95})
    assert cote_cloture_juste(ligne, Selection("ah", "1", -0.5)) == pytest.approx(2.0)
    assert cote_cloture_juste(ligne, Selection("1x2", "1")) > 2.0  # sans marge : plus haute
    assert cote_cloture_juste(ligne, Selection("btts", "oui")) > 1  # via la grille de clôture
    assert cote_cloture_juste(None, Selection("1x2", "1")) is None


def test_mode_reel_verrouille(session, reglages_test):
    assert mode_actuel(session, reglages_test) == "simulation"
    assert "refusé" in changer_mode(session, reglages_test, "reel", T0)
    enregistrer_candidats(session, reglages_test, [candidat()], T0)
    plus_tard = T0 + timedelta(days=15)
    assert conditions_reel(session, reglages_test, plus_tard) == []
    assert "Mode réel activé" in changer_mode(session, reglages_test, "reel", plus_tard)
    assert solde(session, "reel") == 100


def test_confirmer_pari_reel(session, reglages_test):
    enregistrer_candidats(session, reglages_test, [candidat()], T0)
    reco = session.query(Recommandation).one()
    pari, texte = confirmer_pari(session, reglages_test, reco.id, 2.1, None, T0)
    assert pari is None and "simulation" in texte.lower()
    ecrire_etat(session, "mode", "reel")
    assert confirmer_pari(session, reglages_test, reco.id, 1.80, None, T0)[0] is None  # sous la cote minimale
    assert confirmer_pari(session, reglages_test, reco.id, 2.1, None, DEBUT)[0] is None  # match commencé
    pari, texte = confirmer_pari(session, reglages_test, reco.id, 2.1, 50, T0)
    assert pari.mode == "reel" and pari.mise <= 3.0 and "ramenée" in texte
    assert "Ne pas jouer" in evaluer_cote(session, reglages_test, reco.id, 1.5, T0)
    assert "Mise conseillée (reel)" in evaluer_cote(session, reglages_test, reco.id, 2.2, T0)


def test_arret_automatique(session, reglages_test):
    ecrire_etat(session, "mode", "reel")
    enregistrer(session, "reel", 100, "dépôt")
    assert controle_arret(session, reglages_test) is None
    enregistrer(session, "reel", -45, "pertes")
    assert "ARRÊT AUTOMATIQUE" in controle_arret(session, reglages_test)
    assert mode_actuel(session, reglages_test) == "simulation"


def test_dimensionner_sans_value(session, reglages_test):
    assert dimensionner(session, reglages_test, "simulation", 0.4, 0.6, 2.0, None, T0) == 0
