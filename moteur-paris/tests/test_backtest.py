import json
from datetime import datetime, timezone

import pandas as pd
import pytest

from moteur.backtest import (
    OptionsBacktest,
    ecrire_parametres,
    lancer,
    log_loss,
    paris_simules,
    predictions_modele,
    preparer_ligue,
    rapport_markdown,
    resume_paris,
    simuler_capital,
    tournoi_ligue,
)
from moteur.modeles.ligue import ParamsLigue

RAPIDE = OptionsBacktest(grille_xi=(0.0019,))


@pytest.fixture(scope="module")
def joint(ligue_simulee):
    df = ligue_simulee
    return preparer_ligue(df).join(predictions_modele(df, None, ParamsLigue()), how="inner")


def test_predictions_sans_saisons_de_chauffe(ligue_simulee, joint):
    premieres = sorted(ligue_simulee["saison"].unique())[:2]
    assert not joint["saison"].isin(premieres).any()
    assert joint[["Wm_1", "Wm_x", "Wm_2"]].sum(axis=1).round(6).eq(1).all()
    assert joint["ref_source"].eq("pinnacle").all()


def test_log_loss_la_reference_bat_un_modele_bruité(joint):
    # la « référence » simulée connaît les vraies probabilités : elle doit gagner
    assert log_loss(joint, 0.0) < log_loss(joint, 1.0)
    assert log_loss(joint.iloc[0:0], 0.5) == float("inf")


def test_paris_simules_respectent_les_filtres(joint):
    paris = paris_simules(joint, 0.0, 0.03, 0.10, 0.10, "moy")
    assert not paris.empty
    assert (paris["ev"] >= 0.03 - 1e-9).all() and (paris["ev"] <= 0.10 + 1e-9).all()
    assert set(paris["famille"]) <= {"1x2", "total", "ah"}
    assert paris["date"].is_monotonic_increasing
    plus_strict = paris_simules(joint, 0.0, 0.08, 0.10, 0.10, "moy")
    assert len(plus_strict) < len(paris)


def test_capital_simule():
    paris = pd.DataFrame({
        "date": pd.to_datetime(["2025-01-01", "2025-01-02", "2025-03-01"], utc=True),
        "W": [0.55, 0.55, 0.55], "L": [0.45, 0.45, 0.45], "cote": [2.0, 2.0, 2.0], "profit": [1.0, -1.0, 1.0],
    })
    res = simuler_capital(paris, 100.0)
    assert res["capital_final"] != 100 and 0 < res["pire_baisse"] < 0.05
    assert res["pire_mois"] is not None
    assert simuler_capital(paris.iloc[0:0])["capital_final"] == 100


def test_resume():
    assert resume_paris(pd.DataFrame({"profit": [], "clv": []}))["n"] == 0
    r = resume_paris(pd.DataFrame({"profit": [1.0, -1.0, 0.5], "clv": [0.02, None, 0.04]}))
    assert r["n"] == 3 and r["roi"] == pytest.approx(0.1667, abs=1e-3) and r["clv"] == pytest.approx(0.03)


def test_tournoi_complet(ligue_simulee):
    res = tournoi_ligue("E1", ligue_simulee, None, RAPIDE)
    assert res.erreur is None and res.params is not None
    assert res.params.poids_modele == 0.0  # la référence simulée est parfaite : le modèle ne doit pas l'emporter
    assert set(res.coffre) == {"1x2", "total", "ah"}
    assert set(res.marches_valides) <= {"1x2", "total", "ah"}
    for famille in res.marches_valides:
        assert res.coffre[famille]["roi"] > 0 and res.dev[famille]["roi"] > 0


def test_pas_assez_de_saisons(ligue_simulee):
    court = ligue_simulee[ligue_simulee["saison"] >= 2024]
    assert "pas assez" in tournoi_ligue("E1", court, None, RAPIDE).erreur


def test_lancer_rapport_et_parametres(ligue_simulee, tmp_path):
    autre = ligue_simulee.assign(ligue="E2")
    resultats = lancer(pd.concat([ligue_simulee, autre]), ["E1", "E2"], RAPIDE, travailleurs=1)
    assert [r.ligue for r in resultats] == ["E1", "E2"]
    texte = rapport_markdown(resultats, RAPIDE, datetime(2026, 9, 25, tzinfo=timezone.utc))
    assert "Championship" in texte and "League One" in texte
    chemin = ecrire_parametres(resultats, tmp_path, datetime(2026, 9, 25, tzinfo=timezone.utc))
    contenu = json.loads(chemin.read_text())
    assert set(contenu["ligues"]) == {"E1", "E2"} and "poids_modele" in contenu["ligues"]["E1"]
    ecrire_parametres(resultats, tmp_path, datetime(2026, 9, 26, tzinfo=timezone.utc))
    assert (tmp_path / "parametres.precedent.json").exists()


def test_progression_et_repli_sequentiel(ligue_simulee, monkeypatch):
    import moteur.backtest as bt

    vus = []
    autre = ligue_simulee.assign(ligue="E2")
    donnees = pd.concat([ligue_simulee, autre])

    class PoolCasse:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def map(self, *a):
            raise bt.BrokenProcessPool("processus tué")

    monkeypatch.setattr(bt, "ProcessPoolExecutor", PoolCasse)
    res = bt.lancer(donnees, ["E1", "E2"], RAPIDE, travailleurs=2, progression=lambda f, t, l: vus.append((f, t, l)))
    assert [r.ligue for r in res] == ["E1", "E2"] and all(r.params for r in res)
    assert vus == [(1, 2, "E1"), (2, 2, "E2")]


def test_validation_globale(ligue_simulee):
    from moteur.backtest import PARIS_MIN_GLOBAL, validation_globale

    resultats = lancer(pd.concat([ligue_simulee, ligue_simulee.assign(ligue="E2")]), ["E1", "E2"], RAPIDE, travailleurs=1)
    bilan = validation_globale(resultats, RAPIDE)
    assert set(bilan["familles"]) == {"1x2", "total", "ah"}
    for famille, v in bilan["familles"].items():
        valide = famille in bilan["valides"]
        assert valide == (v["coffre"]["n"] >= PARIS_MIN_GLOBAL and v["coffre"]["roi"] > 0 and v["dev"]["roi"] > 0
                          and (v["coffre"]["clv"] is None or v["coffre"]["clv"] >= 0))
        if valide:
            assert all(famille in r.marches_valides for r in resultats)
    texte = rapport_markdown(resultats, RAPIDE, datetime(2026, 9, 27, tzinfo=timezone.utc), bilan)
    assert "Tous championnats réunis" in texte
    texte.encode("cp1252")  # affichable sous Windows
