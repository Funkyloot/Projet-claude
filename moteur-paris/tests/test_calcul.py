import pytest

from moteur.calcul import (
    analyser_value,
    arrondi_naturel,
    esperance,
    kelly,
    marge,
    mise_conseillee,
    proba_implicite,
    probas_justes,
    surebet,
)


def test_proba_implicite():
    assert proba_implicite(2.0) == 0.5
    assert proba_implicite(4.0) == 0.25


@pytest.mark.parametrize("cote", [1.0, 0.5, 0, -2])
def test_cote_invalide_refusee(cote):
    with pytest.raises(ValueError):
        proba_implicite(cote)


def test_marge_marche_1x2():
    # 2,10 / 3,40 / 3,60 : marge typique d'environ 4,8 %
    assert marge([2.10, 3.40, 3.60]) == pytest.approx(0.0481, abs=1e-3)


def test_marge_marche_equitable_nulle():
    assert marge([2.0, 2.0]) == pytest.approx(0.0)


@pytest.mark.parametrize("methode", ["proportionnelle", "puissance"])
def test_probas_justes_somment_a_un(methode):
    p = probas_justes([1.50, 4.20, 6.50], methode)
    assert sum(p) == pytest.approx(1.0, abs=1e-9)
    assert p[0] > p[1] > p[2]


def test_methode_puissance_retire_plus_de_marge_a_l_outsider():
    prop = probas_justes([1.50, 4.20, 6.50], "proportionnelle")
    puis = probas_justes([1.50, 4.20, 6.50], "puissance")
    assert puis[0] > prop[0]  # le favori récupère de la probabilité
    assert puis[2] < prop[2]  # l'outsider en perd


def test_methode_inconnue():
    with pytest.raises(ValueError):
        probas_justes([2.0, 2.0], "magie")


def test_esperance_exemple_du_cahier():
    # 52 % à 2,05 : EV = +6,6 %
    assert esperance(0.52, 2.05) == pytest.approx(0.066)


def test_kelly_nul_sans_value():
    assert kelly(0.40, 2.0) == 0.0


def test_mise_exemple_du_cahier():
    # 100 $, 52 % à 2,05, Kelly × 0,25 → 1,57 $ arrondi au 0,10 $ inférieur → 1,50 $
    m = mise_conseillee(100, 0.52, 2.05)
    assert m.kelly_complet == pytest.approx(0.0629, abs=1e-4)
    assert m.montant == 1.5
    assert not m.plafonnee


def test_mise_plafonnee_a_3_pourcent():
    m = mise_conseillee(100, 0.70, 2.00)  # énorme avantage apparent
    assert m.montant == 3.0
    assert m.plafonnee


def test_mise_nulle_sans_value_ou_sans_capital():
    assert mise_conseillee(100, 0.40, 2.0).montant == 0
    assert mise_conseillee(0, 0.60, 2.0).montant == 0


@pytest.mark.parametrize(
    "brut,attendu", [(1.57, 1.5), (4.99, 4.9), (7.8, 7.5), (19.99, 19.5), (39.68, 39.0), (0, 0)]
)
def test_arrondi_naturel(brut, attendu):
    assert arrondi_naturel(brut) == attendu


def test_value_detectee_et_non_suspecte():
    v = analyser_value(0.52, 2.05)
    assert v.est_value and not v.suspecte


def test_value_trop_belle_signalee():
    v = analyser_value(0.60, 2.50)  # EV +50 % : erreur de cote probable
    assert v.est_value and v.suspecte


def test_pas_de_value_sous_le_seuil():
    assert not analyser_value(0.50, 2.04).est_value  # EV +2 % < 3 %


def test_surebet_exemple_du_cahier():
    # Victoire extérieur @ 5,00 + 1X @ 1,30, 50 $ au total → 10,32 $ / 39,68 $, retour 51,59 $
    s = surebet([5.00, 1.30], total=50)
    assert s.est_surebet
    assert s.mises == [10.32, 39.68]
    assert s.retour == 51.59
    assert s.profit == pytest.approx(0.032, abs=1e-3)
    assert not s.suspect


def test_pas_de_surebet_chez_un_seul_bookmaker():
    assert not surebet([2.10, 3.40, 3.60]).est_surebet


def test_surebet_25_pourcent_signale_suspect():
    s = surebet([2.5, 2.5], total=50)
    assert s.profit == pytest.approx(0.25)
    assert s.suspect
