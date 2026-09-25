import numpy as np
import pytest

from moteur.calcul import kelly, kelly_general
from moteur.marches import (
    Selection,
    cote_juste,
    cote_minimale,
    esperance,
    fraction_gagnee,
    gain_perte,
    kelly_selection,
    kelly_wl,
    repartition,
    selections_fiche,
)
from moteur.modeles.grille import grille_dc


@pytest.mark.parametrize(
    "sel,score,attendu",
    [
        (Selection("1x2", "1"), (2, 1), 1), (Selection("1x2", "X"), (1, 1), 1), (Selection("1x2", "2"), (1, 1), -1),
        (Selection("dc", "1X"), (0, 0), 1), (Selection("dc", "12"), (0, 0), -1), (Selection("dc", "X2"), (0, 1), 1),
        (Selection("dnb", "1"), (1, 1), 0), (Selection("dnb", "2"), (0, 2), 1),
        (Selection("btts", "oui"), (1, 1), 1), (Selection("btts", "non"), (2, 0), 1),
        (Selection("total", "plus", 2.5), (2, 1), 1), (Selection("total", "moins", 2.5), (2, 1), -1),
        (Selection("total", "plus", 2.0), (1, 1), 0),
        (Selection("total", "plus", 2.25), (1, 1), -0.5),  # moitié remboursée, moitié perdue
        (Selection("total", "plus", 2.75), (2, 1), 0.5),  # moitié gagnée, moitié remboursée
        (Selection("total", "moins", 2.25), (1, 1), 0.5),
        (Selection("ah", "1", -0.5), (1, 0), 1), (Selection("ah", "1", -0.75), (1, 0), 0.5),
        (Selection("ah", "1", -1.0), (1, 0), 0), (Selection("ah", "2", 0.25), (1, 1), 0.5),
        (Selection("ah", "2", 0.75), (1, 0), -0.5), (Selection("ah", "2", 0.25), (1, 0), -1), (Selection("ah", "2", 1.5), (2, 1), 1),
    ],
)
def test_reglement(sel, score, attendu):
    assert fraction_gagnee(sel, *score) == attendu


def test_selection_invalide():
    with pytest.raises(ValueError):
        Selection("total", "plus")  # ligne manquante
    with pytest.raises(ValueError):
        Selection("1x2", "1", 0.5)  # ligne inutile
    with pytest.raises(ValueError):
        Selection("ah", "1", 0.3)  # pas un multiple de 0,25
    with pytest.raises(ValueError):
        Selection("1x2", "3")


def test_cle_aller_retour():
    for sel in selections_fiche():
        assert Selection.depuis_cle(sel.cle) == sel


def test_libelles_francais():
    assert Selection("total", "plus", 2.5).libelle() == "Plus de 2,5 buts"
    assert Selection("ah", "2", 0.5).libelle("Lyon", "Nice") == "Handicap asiatique Nice +0,5"
    assert Selection("ah", "1", -0.75).libelle("Lyon", "Nice") == "Handicap asiatique Lyon −0,75"


def test_marches_coherents_sur_la_grille():
    g = grille_dc(1.6, 1.1, -0.05)
    p = {i: gain_perte(g, Selection("1x2", i))[0] for i in ("1", "X", "2")}
    assert sum(p.values()) == pytest.approx(1)
    assert gain_perte(g, Selection("dc", "1X"))[0] == pytest.approx(p["1"] + p["X"])
    w, l_ = gain_perte(g, Selection("dnb", "1"))
    assert (w, l_) == (pytest.approx(p["1"]), pytest.approx(p["2"]))
    # handicap 0 = remboursé si nul
    assert gain_perte(g, Selection("ah", "1", 0.0)) == pytest.approx(gain_perte(g, Selection("dnb", "1")))
    plus, moins = gain_perte(g, Selection("total", "plus", 2.5))[0], gain_perte(g, Selection("total", "moins", 2.5))[0]
    assert plus + moins == pytest.approx(1)


def test_cote_juste_pari_simple():
    g = grille_dc(1.4, 1.2)
    W, L = gain_perte(g, Selection("btts", "oui"))
    assert cote_juste(W, L) == pytest.approx(1 / W)
    assert esperance(W, L, cote_juste(W, L)) == pytest.approx(0)
    assert esperance(W, L, cote_minimale(W, L, 0.03)) == pytest.approx(0.03)


def test_esperance_egale_repartition_avec_demi_gains():
    g = grille_dc(1.5, 1.2, -0.05)
    sel = Selection("ah", "1", -0.75)
    W, L = gain_perte(g, sel)
    rep = repartition(g, sel)
    direct = sum(p * (f * (2.1 - 1) if f > 0 else f) for f, p in rep.items())
    assert esperance(W, L, 2.1) == pytest.approx(direct)


def test_kelly_general_retrouve_kelly_simple():
    assert kelly_general([(0.52, 1.05), (0.48, -1)]) == pytest.approx(kelly(0.52, 2.05), abs=1e-6)
    assert kelly_general([(0.4, 1.0), (0.6, -1)]) == 0


def test_kelly_marches_asiatiques():
    g = grille_dc(1.5, 1.1, -0.05)
    sel = Selection("total", "plus", 2.25)
    exact, approx = kelly_selection(g, sel, 2.3), kelly_wl(*gain_perte(g, sel), 2.3)
    assert 0 < approx <= exact + 1e-9  # l'approximation reste prudente
    assert kelly_wl(0.4, 0.6, 2.0) == 0


def test_matrice_en_lecture_seule():
    from moteur.marches import matrice

    with pytest.raises(ValueError):
        matrice(Selection("1x2", "1"))[0, 0] = 5
    assert isinstance(matrice(Selection("1x2", "1")), np.ndarray)
