from datetime import datetime, timezone

import pytest

from moteur.analyse import analyser, fusionner_api, matchs_depuis_fixtures
from moteur.chasseurs import ContexteMatch, Filtre, chasseur_incoherences, chasseur_surebet, chasseur_value
from moteur.donnees.cotes import CoteBrute, plus_recentes
from moteur.donnees.equipes import Correspondance
from moteur.donnees.odds_api import EvenementCotes
from moteur.marches import Selection, esperance, gain_perte
from moteur.modeles.grille import grille_dc, probas_1x2, proba_plus

MAJ = datetime(2026, 9, 26, tzinfo=timezone.utc)
DEBUT = datetime(2026, 9, 27, 14, tzinfo=timezone.utc)


def _cotes_justes(g, bookmaker, marge=0.03, surcote=None):
    """Cotes d'un bookmaker tirées de la grille, avec marge ; `surcote` : {sélection: cote forcée}."""
    p1, px, p2 = probas_1x2(g)
    pp = proba_plus(g)
    base = {Selection("1x2", "1"): p1, Selection("1x2", "X"): px, Selection("1x2", "2"): p2,
            Selection("total", "plus", 2.5): pp, Selection("total", "moins", 2.5): 1 - pp}
    cotes = [CoteBrute(bookmaker, s, round(1 / (p * (1 + marge)), 2), MAJ) for s, p in base.items()]
    for s, c in (surcote or {}).items():
        cotes = [x for x in cotes if x.selection != s] + [CoteBrute(bookmaker, s, c, MAJ)]
    return cotes


def _ctx(g_modele, cotes):
    return ContexteMatch("E1", "Leeds", "Hull", DEBUT, g_modele, plus_recentes(cotes))


def test_value_detectee_avec_cote_minimale():
    g = grille_dc(1.5, 1.0, -0.05)
    cible = Selection("total", "plus", 2.5)
    prix = round(1.06 / proba_plus(g), 2)  # environ +6 % de value
    cotes = _cotes_justes(g, "pinnacle", 0.02) + _cotes_justes(g, "moyenne", 0.05, {cible: prix})
    f = Filtre(poids_modele=0.3, familles_validees=frozenset({"total"}))
    (c,) = chasseur_value(_ctx(g, cotes), f)
    assert c.selection == cible and c.chasseur == "B" and c.valide and not c.suspect
    assert c.cote_vue is None and c.cote_indicative == prix
    assert esperance(c.p_gain, c.p_perte, c.cote_min) == pytest.approx(0.03)
    assert c.cote_min < prix and c.kelly > 0


def test_cote_du_bookmaker_cible_prioritaire_et_signal_suspect():
    g = grille_dc(1.5, 1.0, -0.05)
    cible = Selection("1x2", "2")
    cotes = _cotes_justes(g, "pinnacle", 0.02) + _cotes_justes(g, "onexbet", 0.05, {cible: 9.0})
    f = Filtre(bookmaker_cible="onexbet", familles_validees=frozenset({"1x2"}))
    (c,) = [x for x in chasseur_value(_ctx(g, cotes), f) if x.selection == cible]
    assert c.cote_vue == 9.0 and c.bookmaker == "onexbet" and c.suspect


def test_pas_valide_si_marche_non_valide():
    g = grille_dc(1.5, 1.0)
    cotes = _cotes_justes(g, "pinnacle", 0.02) + _cotes_justes(g, "moyenne", 0.0, {Selection("1x2", "1"): 3.0})
    (c,) = chasseur_value(_ctx(g, cotes), Filtre(familles_validees=frozenset()))
    assert not c.valide


def test_desaccord_modele_reference_bloque_le_signal():
    marche = grille_dc(1.5, 1.0)
    modele = grille_dc(0.6, 2.2)  # le modèle voit l'inverse du marché
    cotes = _cotes_justes(marche, "pinnacle", 0.02) + _cotes_justes(marche, "moyenne", 0.0, {Selection("1x2", "2"): 5.0})
    signaux = chasseur_value(_ctx(modele, cotes), Filtre(poids_modele=0.9, seuil_desaccord=0.1))
    assert Selection("1x2", "2") not in {c.selection for c in signaux}
    avec_tolerance = chasseur_value(_ctx(modele, cotes), Filtre(poids_modele=0.9, seuil_desaccord=1.0))
    assert Selection("1x2", "2") in {c.selection for c in avec_tolerance}


def test_sans_reference_exige_le_double():
    g = grille_dc(1.5, 1.0)
    W, L = gain_perte(g, Selection("1x2", "1"))
    prix = round(1 + (0.045 + L) / W, 2)  # ≈ +4,5 % : assez avec référence, pas sans
    cotes = [CoteBrute("bet365", Selection("1x2", "1"), prix, MAJ)]
    assert chasseur_value(_ctx(g, cotes), Filtre(valeur_min=0.03)) == []
    cotes = [CoteBrute("bet365", Selection("1x2", "1"), round(1 + (0.07 + L) / W, 2), MAJ)]  # ≈ +7 %
    (c,) = chasseur_value(_ctx(g, cotes), Filtre(valeur_min=0.03))
    assert c.note == "sans référence sharp" and not c.valide


def test_incoherence_interne_du_bookmaker():
    g = grille_dc(1.4, 1.1, -0.05)
    ah = Selection("ah", "1", -0.5)  # = victoire domicile : doit coûter comme le « 1 »
    W, _ = gain_perte(g, ah)
    cotes = _cotes_justes(g, "onexbet", 0.03, {ah: round(1.12 / W, 2)}) + _cotes_justes(g, "pinnacle", 0.02)
    (c,) = chasseur_incoherences(_ctx(g, cotes), Filtre(bookmaker_cible="onexbet"))
    assert c.selection == ah and c.chasseur == "A" and not c.valide


def test_surebet_entre_bookmakers():
    g = grille_dc(1.4, 1.1)
    cotes = [CoteBrute("a", Selection("total", "plus", 2.5), 2.15, MAJ),
             CoteBrute("b", Selection("total", "moins", 2.5), 2.10, MAJ),
             CoteBrute("moyenne", Selection("total", "moins", 2.5), 5.0, MAJ)]
    (sb,) = chasseur_surebet(_ctx(g, cotes), Filtre(), exclus=("moyenne",))
    assert sb.profit == pytest.approx(1 / (1 / 2.15 + 1 / 2.10) - 1)
    assert {bk for _, bk, _, _ in sb.jambes} == {"a", "b"}


def test_analyse_bout_en_bout(scenario, reglages_test):
    matchs = matchs_depuis_fixtures(scenario["fixtures"], ["E1"], scenario["maintenant"], 48, MAJ)
    assert matchs and all(m.cotes for m in matchs)
    res = analyser(matchs, scenario["hist"], reglages_test, scenario["maintenant"])
    assert "E1" in res.modeles and res.nb_matchs == len(matchs)
    assert any(c.suspect for c in res.candidats)  # la cote « trop belle » du scénario
    assert all(c.cote_min > 1 for c in res.candidats)


def test_fusion_des_cotes_api(scenario):
    matchs = matchs_depuis_fixtures(scenario["fixtures"], ["E1"], scenario["maintenant"], 48, MAJ)
    m = matchs[0]
    ev = EvenementCotes("E1", m.dom.upper() + " FC", m.ext, m.debut,
                        [CoteBrute("onexbet", Selection("1x2", "1"), 2.0, MAJ)])
    inconnu = EvenementCotes("E1", "Inconnu United", m.ext, m.debut, [])
    avant = len(m.cotes)
    matchs, alertes = fusionner_api(matchs, [ev, inconnu], {"E1": {m.dom, m.ext}}, Correspondance())
    assert len(m.cotes) == avant + 1
    assert len(alertes) == 1 and "Inconnu United" in alertes[0]


def test_apercu_dit_pourquoi_une_option_est_bloquee():
    from moteur.chasseurs import meilleure_option

    marche = grille_dc(1.5, 1.0)
    modele = grille_dc(0.6, 2.2)  # contredit le marché
    cotes = _cotes_justes(marche, "pinnacle", 0.02) + _cotes_justes(marche, "moyenne", 0.0, {Selection("1x2", "2"): 5.0})
    a = meilleure_option(_ctx(modele, cotes), Filtre(poids_modele=0.9, seuil_desaccord=0.1))
    assert a.statut != "recommande"
    g = grille_dc(1.5, 1.0, -0.05)
    prix = round(1.06 / proba_plus(g), 2)
    cotes = _cotes_justes(g, "pinnacle", 0.02) + _cotes_justes(g, "moyenne", 0.05, {Selection("total", "plus", 2.5): prix})
    assert meilleure_option(_ctx(g, cotes), Filtre(familles_validees=frozenset({"total"}))).statut == "recommande"
    assert meilleure_option(_ctx(g, cotes), Filtre()).statut == "observation"


def _sharp(quand, debut, ref=(2.0, 3.6, 4.0), cible=(2.2, 3.3, 3.7), age_ref=10, age_cible=5, bk_ref="pinnacle",
           totaux=None):
    from datetime import timedelta

    from moteur.chasseurs import chasseur_sharp

    cotes = []
    for bk, valeurs, age in ((bk_ref, ref, age_ref), ("onexbet", cible, age_cible)):
        maj = quand - timedelta(minutes=age)
        cotes += [CoteBrute(bk, Selection("1x2", i), c, maj) for i, c in zip(("1", "X", "2"), valeurs)]
    for bk, (plus, moins) in (totaux or {}).items():
        cotes += [CoteBrute(bk, Selection("total", "plus", 2.5), plus, quand),
                  CoteBrute(bk, Selection("total", "moins", 2.5), moins, quand)]
    ctx = ContexteMatch("E1", "Leeds", "Hull", debut, None, plus_recentes(cotes), quand=quand)
    return chasseur_sharp(ctx, Filtre(valeur_min=0.03, bookmaker_cible="onexbet"))


def test_chasseur_sharp_contre_pinnacle():
    from datetime import timedelta

    quand = DEBUT - timedelta(hours=1)
    (c,) = _sharp(quand, DEBUT)  # 1xBet paie 2,20 la victoire de Leeds, juste ≈ 2,06 chez Pinnacle
    assert c.chasseur == "S" and c.selection == Selection("1x2", "1") and c.valide and c.bookmaker == "onexbet"
    assert c.cote_vue == 2.2 and 0.03 <= c.ev <= 0.10 and c.cote_min <= 2.2 and "pinnacle" in c.note
    assert _sharp(quand, DEBUT, age_ref=200) == []  # prix Pinnacle trop ancien
    assert _sharp(quand, DEBUT, age_cible=200) == []  # cote 1xBet trop ancienne
    assert _sharp(DEBUT - timedelta(hours=10), DEBUT) == []  # trop tôt avant le match
    assert _sharp(DEBUT + timedelta(minutes=5), DEBUT) == []  # match commencé
    assert _sharp(quand, DEBUT, cible=(2.05, 3.5, 3.9)) == []  # pas assez d'écart
    # au-delà de 4,5 : écarts historiques pas fiables, ignoré
    assert _sharp(quand, DEBUT, ref=(1.6, 4.2, 5.5), cible=(1.55, 4.0, 6.5)) == []
    # Betfair en secours, mais pas un marché Betfair trop large
    assert len(_sharp(quand, DEBUT, bk_ref="betfair_ex_eu")) == 1
    assert _sharp(quand, DEBUT, bk_ref="betfair_ex_eu", ref=(1.9, 3.3, 3.6)) == []
    # plus / moins 2,5 : même principe sur le marché à deux issues
    s = _sharp(quand, DEBUT, cible=(2.0, 3.4, 3.8), totaux={"pinnacle": (1.95, 1.95), "onexbet": (2.12, 1.80)})
    assert [x.selection for x in s] == [Selection("total", "plus", 2.5)]
