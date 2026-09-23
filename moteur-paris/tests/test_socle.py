import pytest
from pydantic import ValidationError

from moteur.capital import arret_atteint, depot_initial, enregistrer, solde
from moteur.cli import main
from moteur.config import Reglages
from moteur.db import Match, fabrique_sessions, initialiser, moteur_bdd


@pytest.fixture
def session(tmp_path):
    engine = moteur_bdd(f"sqlite:///{tmp_path}/test.db")
    initialiser(engine)
    with fabrique_sessions(engine)() as s:
        yield s


def test_reglages_par_defaut_respectent_le_cahier_des_charges(monkeypatch):
    for cle in ("MOTEUR_MODE", "MOTEUR_CAPITAL_INITIAL", "MOTEUR_SEUIL_ARRET", "MOTEUR_MISE_MAX_PCT"):
        monkeypatch.delenv(cle, raising=False)
    r = Reglages(_env_file=None)
    assert r.mode == "simulation"
    assert r.capital_initial == 100
    assert r.seuil_arret == 60
    assert r.mise_max_pct == 0.03


def test_mise_max_plafonnee_a_5_pourcent():
    with pytest.raises(ValidationError):
        Reglages(_env_file=None, mise_max_pct=0.2)


def test_seuil_arret_doit_etre_sous_le_capital():
    with pytest.raises(ValidationError):
        Reglages(_env_file=None, capital_initial=100, seuil_arret=150)


def test_depot_initial_une_seule_fois(session):
    assert depot_initial(session, "simulation", 100) == 100
    enregistrer(session, "simulation", -5, "pari perdu")
    assert depot_initial(session, "simulation", 100) == 95
    assert solde(session, "reel") is None


def test_arret_automatique(session):
    depot_initial(session, "simulation", 100)
    assert not arret_atteint(session, "simulation", 60)
    enregistrer(session, "simulation", -45, "série perdante")
    assert arret_atteint(session, "simulation", 60)


def test_schema_matchs(session):
    from datetime import datetime, timezone

    session.add(Match(sport="football", competition="Ligue 1", domicile="Lyon", exterieur="Nice",
                      debut=datetime(2026, 9, 27, 19, tzinfo=timezone.utc)))
    session.commit()
    assert session.query(Match).count() == 1


def test_cli_init_et_etat(tmp_path, monkeypatch, capsys):
    from moteur.config import reglages

    monkeypatch.setenv("MOTEUR_DATABASE_URL", f"sqlite:///{tmp_path}/cli.db")
    reglages.cache_clear()
    assert main(["init"]) == 0
    assert main(["etat"]) == 0
    assert "100.00 $" in capsys.readouterr().out
    reglages.cache_clear()
