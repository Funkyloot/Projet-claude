import json
from datetime import timedelta

import pandas as pd
import pytest

from fabrique import championnat
from moteur.config import Reglages
from moteur.db import fabrique_sessions, initialiser, moteur_bdd


@pytest.fixture
def reglages_test(tmp_path) -> Reglages:
    return Reglages(_env_file=None, database_url=f"sqlite:///{tmp_path}/t.db", dossier_donnees=str(tmp_path),
                    ligues="E1", fuseau="UTC")


@pytest.fixture
def sessions(reglages_test):
    engine = moteur_bdd(reglages_test.database_url)
    initialiser(engine)
    return fabrique_sessions(engine)


@pytest.fixture
def session(sessions):
    with sessions() as s:
        yield s


@pytest.fixture(scope="session")
def ligue_simulee() -> pd.DataFrame:
    return championnat(saisons=(2021, 2022, 2023, 2024, 2025))


@pytest.fixture
def scenario(ligue_simulee, reglages_test):
    """Historique jusqu'à une date, matchs de la semaine suivante comme « fixtures »."""
    df = ligue_simulee
    coupure = df["date"].max() - pd.Timedelta(days=20)
    hist = df[df["date"] < coupure].copy()
    futurs = df[df["date"] >= coupure]
    maintenant = futurs["date"].min().to_pydatetime() - timedelta(hours=10)
    fixtures = futurs[futurs["date"] <= futurs["date"].min() + pd.Timedelta(days=2)].copy()
    fixtures.loc[fixtures.index[0], "moy_plus"] = 3.0  # une cote « trop belle »
    fixtures[["bd", "be"]] = float("nan")
    (reglages_test.dossier / "parametres.json").write_text(json.dumps({"ligues": {"E1": {
        "xi": 0.0019, "reg": 2.0, "fenetre_jours": 730, "poids_modele": 0.3,
        "marches_valides": ["1x2", "total", "ah"]}}}))
    return {"hist": hist, "fixtures": fixtures, "maintenant": maintenant, "complet": df}
