from datetime import timezone

import numpy as np
import pandas as pd
import pytest

from moteur.modeles.grille import grille_dc
from moteur.modeles.ligue import ajuster_ligue
from moteur.simulation import (
    buts_attendus,
    classement,
    confrontations,
    derniers_matchs,
    matchs_restants,
    scores_probables,
    simuler_saison,
)


def _saison_en_cours(ligue_simulee, part=0.5):
    """Dernière saison du championnat simulé, coupée à mi-parcours."""
    derniere = ligue_simulee[ligue_simulee["saison"] == ligue_simulee["saison"].max()].sort_values("date")
    coupe = derniere.iloc[int(len(derniere) * part)]["date"]
    jouee = derniere[derniere["date"] < coupe]
    modele = ajuster_ligue(ligue_simulee, coupe, equipes_a_predire=set(derniere["dom"]))
    return derniere, jouee, coupe, modele


def test_classement_et_matchs_restants():
    saison = pd.DataFrame({"dom": ["A", "B", "C"], "ext": ["B", "C", "A"], "bd": [2, 1, 0], "be": [0, 1, 3]})
    t = classement(saison)
    assert [(x.equipe, x.points, x.diff) for x in t] == [("A", 6, 5), ("B", 1, -2), ("C", 1, -3)]
    assert sorted(matchs_restants(saison, ["A", "B", "C"])) == [("A", "C"), ("B", "A"), ("C", "B")]


def test_simulation_de_fin_de_saison(ligue_simulee):
    derniere, jouee, coupe, modele = _saison_en_cours(ligue_simulee)
    a_suivre = list(zip(derniere[derniere["date"] >= coupe]["dom"], derniere[derniere["date"] >= coupe]["ext"]))[:3]
    s = simuler_saison("E1", jouee, modele, coupe.to_pydatetime(), a_suivre, n=3000)
    nb = len(s.classement)
    assert s.restants == len(derniere) - len(jouee)
    # chaque saison simulée a exactement un champion, top 6 et 3 relégués
    assert sum(x.p_titre for x in s.classement) == pytest.approx(1)
    assert sum(x.p_haut for x in s.classement) == pytest.approx(6)
    assert sum(x.p_bas for x in s.classement) == pytest.approx(3)
    # le leader actuel a plus de chances de titre que le dernier ; les points finaux dépassent les actuels
    assert s.classement[0].p_titre > s.classement[-1].p_titre
    assert all(x.points_moyens >= x.points for x in s.classement)
    total_matchs = nb * (nb - 1)
    assert sum(x.points_moyens for x in s.classement) == pytest.approx(
        sum(x.points for x in s.classement) + (total_matchs - len(jouee)) * 2.7, rel=0.05)
    # enjeu : gagner améliore toujours les chances d'être en haut
    assert s.enjeux and all(e.haut_si_victoire[e.dom] >= e.haut_si_defaite[e.dom] - 0.02 for e in s.enjeux)
    assert simuler_saison("SC0", jouee, modele, coupe.to_pydatetime(), n=100) is None  # phases finales : non simulé


def test_meme_graine_meme_resultat(ligue_simulee):
    _, jouee, coupe, modele = _saison_en_cours(ligue_simulee)
    a = simuler_saison("E1", jouee, modele, coupe.to_pydatetime(), n=500)
    b = simuler_saison("E1", jouee, modele, coupe.to_pydatetime(), n=500)
    assert [x.p_haut for x in a.classement] == [x.p_haut for x in b.classement]


def test_scores_forme_et_confrontations(ligue_simulee):
    g = grille_dc(1.6, 0.9, -0.05)
    scores = scores_probables(g, 3)
    assert scores[0][0] == "1-0" and scores[0][1] >= scores[1][1] >= scores[2][1]
    assert buts_attendus(g) == pytest.approx((1.6, 0.9), abs=0.01)
    quand = ligue_simulee["date"].max().to_pydatetime().astimezone(timezone.utc)
    forme = derniers_matchs(ligue_simulee, "Club A", quand)
    assert len(forme) == 5 and all(m["issue"] in "VND" for m in forme)
    assert forme[0]["date"] >= forme[-1]["date"]
    duels = confrontations(ligue_simulee, "Club A", "Club B", quand, 4)
    assert len(duels) == 4 and all({m["dom"], m["ext"]} == {"Club A", "Club B"} for m in duels)
    assert np.isclose(sum(p for _, p in scores_probables(g, 400)), g.sum())
