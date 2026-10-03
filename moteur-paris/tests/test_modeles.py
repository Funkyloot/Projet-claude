import numpy as np
import pandas as pd
import pytest

from moteur.modeles.dixon_coles import ajuster
from moteur.modeles.grille import (
    grille_dc,
    grille_depuis_cotes,
    grille_depuis_probas,
    melanger,
    proba_plus,
    probas_1x2,
)
from moteur.modeles.ligue import PRIOR_PROMU, PRIOR_RELEGUE, ParamsLigue, ajuster_ligue, priors_nouvelles_equipes


def test_grille_normalisee_et_correction_petits_scores():
    g0, g1 = grille_dc(1.3, 1.1, 0.0), grille_dc(1.3, 1.1, -0.1)
    assert g0.sum() == pytest.approx(1) and g1.sum() == pytest.approx(1)
    assert g1[0, 0] > g0[0, 0]  # ρ négatif : plus de 0-0 et de 1-1
    assert g1[1, 1] > g0[1, 1]


def test_grille_depuis_probas_reproduit_le_marche():
    g = grille_depuis_probas((0.47, 0.27, 0.26), 0.53)
    p1, px, p2 = probas_1x2(g)
    assert (p1, px, p2) == (pytest.approx(0.47, abs=0.01), pytest.approx(0.27, abs=0.015), pytest.approx(0.26, abs=0.01))
    assert proba_plus(g) == pytest.approx(0.53, abs=0.015)


def test_grille_depuis_cotes_retire_la_marge():
    g = grille_depuis_cotes((2.0, 3.4, 3.9), None)
    assert sum(probas_1x2(g)) == pytest.approx(1)
    assert grille_depuis_cotes(None, None) is None


def test_melange():
    a, b = grille_dc(2, 0.5), grille_dc(0.5, 2)
    m = melanger(a, b, 0.25)
    assert m.sum() == pytest.approx(1)
    assert probas_1x2(m)[0] == pytest.approx(0.25 * probas_1x2(a)[0] + 0.75 * probas_1x2(b)[0])
    assert melanger(a, None, 0.3) is a


def test_dixon_coles_retrouve_les_forces():
    rng = np.random.default_rng(3)
    n = 16
    att, dfn = rng.normal(0, 0.3, n), rng.normal(0, 0.25, n)
    dom, ext, bd, be = [], [], [], []
    for _ in range(2):
        for i in range(n):
            for j in range(n):
                if i != j:
                    dom.append(f"E{i}"), ext.append(f"E{j}")
                    bd.append(rng.poisson(np.exp(0.1 + 0.3 + att[i] + dfn[j])))
                    be.append(rng.poisson(np.exp(0.1 + att[j] + dfn[i])))
    m = ajuster(dom, ext, bd, be, np.ones(len(dom)), reg=1.0)
    estime = np.array([m.att[m.equipes[f"E{i}"]] for i in range(n)])
    assert np.corrcoef(estime, att)[0, 1] > 0.8
    assert m.dom == pytest.approx(0.3, abs=0.12)
    lh, la = m.lambdas("E0", "E1")
    assert lh > 0 and la > 0
    assert m.grille("inconnu", "E1").sum() == pytest.approx(1)


def test_ajuster_ligue_sans_voir_le_futur(ligue_simulee):
    date = pd.Timestamp("2024-01-01", tz="UTC")
    m1 = ajuster_ligue(ligue_simulee, date)
    futur_modifie = ligue_simulee.copy()
    futur_modifie.loc[futur_modifie["date"] >= date, "bd"] = 9
    m2 = ajuster_ligue(futur_modifie, date)
    assert m1.mu == pytest.approx(m2.mu) and np.allclose(m1.att, m2.att)


def test_trop_peu_de_matchs(ligue_simulee):
    assert ajuster_ligue(ligue_simulee.head(10), pd.Timestamp("2030-01-01", tz="UTC")) is None


def test_a_priori_promus_et_relegues(ligue_simulee):
    date = pd.Timestamp("2024-09-01", tz="UTC")
    fen = ligue_simulee[ligue_simulee["date"] < date]
    sup = pd.DataFrame({"date": [date - pd.Timedelta(days=100)], "dom": ["Relégué FC"], "ext": ["Autre"]})
    priors = priors_nouvelles_equipes(fen, date, {"Relégué FC", "Promu FC", "Club A"}, sup)
    assert priors == {"Relégué FC": PRIOR_RELEGUE, "Promu FC": PRIOR_PROMU}
    m = ajuster_ligue(ligue_simulee, date, ParamsLigue(), {"Promu FC"})
    assert m.att[m.equipes["Promu FC"]] == pytest.approx(PRIOR_PROMU[0], abs=1e-3)


def test_params_depuis_dict():
    p = ParamsLigue.depuis_dict({"xi": 0.004, "poids_modele": 0.1, "autre": 1})
    assert p.xi == 0.004 and p.poids_modele == 0.1 and p.reg == ParamsLigue().reg


def test_melange_buts_et_tirs_cadres(ligue_simulee):
    from moteur.modeles.ligue import cibles_buts_tirs

    date = pd.Timestamp("2024-01-01", tz="UTC")
    fen = ligue_simulee[ligue_simulee["date"] < date].copy()
    poids = np.ones(len(fen))
    assert cibles_buts_tirs(fen, poids, 0.5) is None  # pas de tirs dans les données : buts seuls
    fen["tc_d"], fen["tc_e"] = fen["bd"] * 3 + 2, fen["be"] * 3 + 1
    assert cibles_buts_tirs(fen, poids, 1.0) is None
    fen.loc[fen.index[0], "tc_d"] = np.nan  # match sans tirs connus : ses vrais buts sont gardés
    yd, ye = cibles_buts_tirs(fen, poids, 0.5)
    assert yd[0] == fen["bd"].iloc[0]
    connu = fen["tc_d"].notna().to_numpy()
    # les buts « lissés » gardent la même moyenne que les vrais buts
    assert (yd[connu] + ye[connu]).sum() == pytest.approx((fen["bd"] + fen["be"]).to_numpy()[connu].sum())
    # et le modèle s'ajuste dessus, avec ou sans tirs
    tirs = ligue_simulee.assign(tc_d=ligue_simulee["bd"] * 3 + 2, tc_e=ligue_simulee["be"] * 3 + 1)
    m = ajuster_ligue(tirs, date, ParamsLigue(poids_buts=0.5))
    assert m is not None and m.grille(*fen.iloc[0][["dom", "ext"]]).sum() == pytest.approx(1)
    assert ParamsLigue.depuis_dict({"poids_buts": 0.5}).poids_buts == 0.5
