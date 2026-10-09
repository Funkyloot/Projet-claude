"""Simulateur : fin de saison jouée des milliers de fois, et contexte de chaque match.

Recherche (RECHERCHE.md §7) : les enjeux, la forme récente et les confrontations directes sont déjà
dans les cotes de Pinnacle (aucun écart stable sur 86 000 matchs). Ils sont donc affichés pour
comprendre un match, mais n'entrent pas dans les probabilités utilisées pour parier.
"""

from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd

from .modeles.dixon_coles import ModeleDC

# Places qui comptent : (en haut : titre, montée, barrages ou Europe ; en bas : relégation et barrage).
# Approximations : les formats changent selon les saisons.
ZONES: dict[str, tuple[int, int, str]] = {
    "E0": (7, 3, "Europe"), "E1": (6, 3, "montée ou barrages"), "E2": (6, 4, "montée ou barrages"),
    "E3": (7, 2, "montée ou barrages"), "D1": (7, 3, "Europe"), "D2": (3, 3, "montée ou barrage"),
    "I1": (7, 3, "Europe"), "I2": (8, 5, "montée ou barrages"), "SP1": (7, 3, "Europe"),
    "SP2": (6, 4, "montée ou barrages"), "F1": (6, 3, "Europe"), "F2": (5, 3, "montée ou barrages"),
    "N1": (8, 3, "Europe ou barrages"), "P1": (5, 3, "Europe"), "T1": (4, 4, "Europe"),
}
# Championnats en aller-retour simple : les autres (Écosse, Belgique, Grèce) ont des phases finales.
SIMULABLES = frozenset(ZONES)
SIMULATIONS = 10_000


@dataclass
class LigneClassement:
    equipe: str
    joues: int
    points: int
    diff: int
    buts: int
    rang: int
    points_moyens: float = 0.0
    p_titre: float = 0.0
    p_haut: float = 0.0
    p_bas: float = 0.0


@dataclass
class Enjeu:
    """Effet du résultat d'un match sur les chances de chaque équipe (en haut et en bas)."""

    dom: str
    ext: str
    haut_si_victoire: dict[str, float] = field(default_factory=dict)
    haut_si_defaite: dict[str, float] = field(default_factory=dict)
    bas_si_victoire: dict[str, float] = field(default_factory=dict)
    bas_si_defaite: dict[str, float] = field(default_factory=dict)

    def importance(self, equipe: str) -> float:
        """Écart de chances entre gagner et perdre ce match (0 = sans enjeu)."""
        return max(abs(self.haut_si_victoire[equipe] - self.haut_si_defaite[equipe]),
                   abs(self.bas_si_victoire[equipe] - self.bas_si_defaite[equipe]))


@dataclass
class Simulation:
    ligue: str
    quand: datetime
    n: int
    classement: list[LigneClassement]
    restants: int
    enjeux: list[Enjeu] = field(default_factory=list)

    def enjeu(self, dom: str, ext: str) -> Enjeu | None:
        return next((e for e in self.enjeux if e.dom == dom and e.ext == ext), None)

    def ligne(self, equipe: str) -> LigneClassement | None:
        return next((x for x in self.classement if x.equipe == equipe), None)


def classement(saison: pd.DataFrame, equipes: set[str] | None = None) -> list[LigneClassement]:
    """Classement actuel (points, puis différence de buts, puis buts marqués)."""
    equipes = set(equipes or ()) | set(saison["dom"]) | set(saison["ext"])
    t = {e: {"joues": 0, "points": 0, "diff": 0, "buts": 0} for e in equipes}
    for l in saison.itertuples(index=False):
        bd, be = int(l.bd), int(l.be)
        for e, pour, contre in ((l.dom, bd, be), (l.ext, be, bd)):
            t[e]["joues"] += 1
            t[e]["diff"] += pour - contre
            t[e]["buts"] += pour
            t[e]["points"] += 3 if pour > contre else 1 if pour == contre else 0
    ordre = sorted(t, key=lambda e: (-t[e]["points"], -t[e]["diff"], -t[e]["buts"], e))
    return [LigneClassement(e, rang=i + 1, **t[e]) for i, e in enumerate(ordre)]


def matchs_restants(saison: pd.DataFrame, equipes: list[str]) -> list[tuple[str, str]]:
    """Aller-retour : chaque équipe reçoit chacune des autres une fois. Restent les paires non jouées."""
    joues = set(zip(saison["dom"], saison["ext"]))
    return [(a, b) for a in equipes for b in equipes if a != b and (a, b) not in joues]


def simuler_saison(
    ligue: str,
    saison: pd.DataFrame,
    modele: ModeleDC,
    quand: datetime,
    a_suivre: list[tuple[str, str]] = (),
    n: int = SIMULATIONS,
    graine: int = 0,
    equipes: set[str] | None = None,
) -> Simulation | None:
    """Joue n fois tous les matchs restants (buts tirés selon le modèle) et compte les places.

    `saison` : matchs déjà joués cette saison (colonnes dom, ext, bd, be). `a_suivre` : matchs dont on
    mesure l'enjeu (chances en haut / en bas selon victoire ou défaite).
    """
    if ligue not in SIMULABLES:
        return None
    actuel = classement(saison, equipes)
    noms = [x.equipe for x in actuel]
    nb = len(noms)
    haut, bas, _ = ZONES[ligue]
    if nb < max(haut + bas + 1, 8) or any(x.joues > 2 * (nb - 1) for x in actuel):
        return None  # pas un aller-retour simple (ou saison mal connue) : pas de simulation honnête
    index = {e: i for i, e in enumerate(noms)}
    restants = matchs_restants(saison, noms)
    rng = np.random.default_rng(graine)
    lam = np.array([modele.lambdas(a, b) for a, b in restants]).reshape(-1, 2)
    i_dom = np.array([index[a] for a, _ in restants], dtype=np.intp)
    i_ext = np.array([index[b] for _, b in restants], dtype=np.intp)
    suivis = [(a, b, restants.index((a, b))) for a, b in a_suivre if (a, b) in restants]

    pts0 = np.array([x.points for x in actuel], dtype=np.int32)
    diff0 = np.array([x.diff for x in actuel], dtype=np.int32)
    buts0 = np.array([x.buts for x in actuel], dtype=np.int32)
    titre, en_haut, en_bas, somme_pts = (np.zeros(nb), np.zeros(nb), np.zeros(nb), np.zeros(nb))
    cond = {(a, b): np.zeros((3, 2, nb)) for a, b, _ in suivis}  # [issue 0/1/2][haut, bas][équipe]
    effectifs = {(a, b): np.zeros(3) for a, b, _ in suivis}
    paquet = 2000
    for debut in range(0, n, paquet):
        k = min(paquet, n - debut)
        gd = rng.poisson(lam[:, 0], size=(k, len(restants))) if restants else np.zeros((k, 0), int)
        ge = rng.poisson(lam[:, 1], size=(k, len(restants))) if restants else np.zeros((k, 0), int)
        pts = np.tile(pts0, (k, 1)).astype(np.int32)
        diff = np.tile(diff0, (k, 1)).astype(np.int32)
        buts = np.tile(buts0, (k, 1)).astype(np.int32)
        p_dom = np.where(gd > ge, 3, np.where(gd == ge, 1, 0))
        p_ext = np.where(ge > gd, 3, np.where(gd == ge, 1, 0))
        for j in range(len(restants)):
            pts[:, i_dom[j]] += p_dom[:, j]
            pts[:, i_ext[j]] += p_ext[:, j]
            diff[:, i_dom[j]] += gd[:, j] - ge[:, j]
            diff[:, i_ext[j]] += ge[:, j] - gd[:, j]
            buts[:, i_dom[j]] += gd[:, j]
            buts[:, i_ext[j]] += ge[:, j]
        cle = pts * 1_000_000 + (diff + 500) * 1_000 + buts + rng.random((k, nb))  # départage au hasard en dernier
        rangs = np.empty_like(cle, dtype=np.int32)
        rangs[np.arange(k)[:, None], np.argsort(-cle, axis=1)] = np.arange(1, nb + 1)
        h, b = rangs <= haut, rangs > nb - bas
        titre += (rangs == 1).sum(axis=0)
        en_haut += h.sum(axis=0)
        en_bas += b.sum(axis=0)
        somme_pts += pts.sum(axis=0)
        for a, bb, j in suivis:
            issue = np.where(gd[:, j] > ge[:, j], 0, np.where(gd[:, j] == ge[:, j], 1, 2))
            for o in range(3):
                m = issue == o
                effectifs[(a, bb)][o] += m.sum()
                cond[(a, bb)][o, 0] += h[m].sum(axis=0)
                cond[(a, bb)][o, 1] += b[m].sum(axis=0)
    for i, x in enumerate(actuel):
        x.p_titre, x.p_haut, x.p_bas = titre[i] / n, en_haut[i] / n, en_bas[i] / n
        x.points_moyens = somme_pts[i] / n
    enjeux = []
    for a, bb, _ in suivis:
        e = effectifs[(a, bb)]
        if min(e[0], e[2]) < 50:
            continue  # issue trop rare dans les simulations pour mesurer un effet
        c = cond[(a, bb)]
        en = Enjeu(a, bb)
        for eq, gagne, perd in ((a, 0, 2), (bb, 2, 0)):
            i = index[eq]
            en.haut_si_victoire[eq] = c[gagne, 0, i] / e[gagne]
            en.haut_si_defaite[eq] = c[perd, 0, i] / e[perd]
            en.bas_si_victoire[eq] = c[gagne, 1, i] / e[gagne]
            en.bas_si_defaite[eq] = c[perd, 1, i] / e[perd]
        enjeux.append(en)
    return Simulation(ligue, quand, n, actuel, len(restants), enjeux)


def scores_probables(grille: np.ndarray, nb: int = 6) -> list[tuple[str, float]]:
    """Les scores exacts les plus probables, ex. [("1-0", 0.12), ...]."""
    ordre = np.argsort(grille, axis=None)[::-1][:nb]
    return [(f"{i}-{j}", float(grille[i, j])) for i, j in zip(*np.unravel_index(ordre, grille.shape))]


def buts_attendus(grille: np.ndarray) -> tuple[float, float]:
    i, j = np.indices(grille.shape)
    return float((grille * i).sum()), float((grille * j).sum())


def derniers_matchs(resultats: pd.DataFrame, equipe: str, avant: datetime, nb: int = 5) -> list[dict]:
    """Forme : derniers résultats d'une équipe (toutes compétitions suivies), du plus récent au plus ancien."""
    r = resultats[((resultats["dom"] == equipe) | (resultats["ext"] == equipe)) & (resultats["date"] < pd.Timestamp(avant))]
    sortie = []
    for l in r.sort_values("date", ascending=False).head(nb).itertuples(index=False):
        dom = l.dom == equipe
        pour, contre = (int(l.bd), int(l.be)) if dom else (int(l.be), int(l.bd))
        sortie.append({"date": l.date, "adversaire": l.ext if dom else l.dom, "domicile": dom,
                       "score": f"{int(l.bd)}-{int(l.be)}", "issue": "V" if pour > contre else "N" if pour == contre else "D"})
    return sortie


def confrontations(resultats: pd.DataFrame, a: str, b: str, avant: datetime, nb: int = 5) -> list[dict]:
    r = resultats[(((resultats["dom"] == a) & (resultats["ext"] == b)) | ((resultats["dom"] == b) & (resultats["ext"] == a)))
                  & (resultats["date"] < pd.Timestamp(avant))]
    return [{"date": l.date, "dom": l.dom, "ext": l.ext, "score": f"{int(l.bd)}-{int(l.be)}"}
            for l in r.sort_values("date", ascending=False).head(nb).itertuples(index=False)]
