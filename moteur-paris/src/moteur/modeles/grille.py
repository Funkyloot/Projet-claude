"""Construction de grilles des scores : Poisson / Dixon-Coles, mélange, et grille déduite des cotes."""

import math

import numpy as np
from scipy.optimize import least_squares

from ..calcul import probas_justes
from ..marches import TAILLE_GRILLE

_LGAMMA = np.array([math.lgamma(k + 1) for k in range(64)])


def pmf_poisson(lam: float, taille: int = TAILLE_GRILLE) -> np.ndarray:
    k = np.arange(taille)
    return np.exp(k * math.log(lam) - lam - _LGAMMA[:taille])


def grille_dc(lh: float, la: float, rho: float = 0.0, taille: int = TAILLE_GRILLE) -> np.ndarray:
    """Poisson indépendant corrigé par Dixon-Coles sur les petits scores (0-0, 1-0, 0-1, 1-1)."""
    g = np.outer(pmf_poisson(lh, taille), pmf_poisson(la, taille))
    g[0, 0] *= 1 - lh * la * rho
    g[0, 1] *= 1 + lh * rho
    g[1, 0] *= 1 + la * rho
    g[1, 1] *= 1 - rho
    np.clip(g, 0, None, out=g)
    return g / g.sum()


def probas_1x2(g: np.ndarray) -> tuple[float, float, float]:
    return float(np.tril(g, -1).sum()), float(np.trace(g)), float(np.triu(g, 1).sum())


def proba_plus(g: np.ndarray, ligne: float = 2.5) -> float:
    i, j = np.indices(g.shape)
    return float(g[(i + j) > ligne].sum())


def melanger(modele: np.ndarray, reference: np.ndarray | None, poids_modele: float) -> np.ndarray:
    """Moyenne pondérée de deux grilles ; les probabilités de tous les marchés se mélangent pareil."""
    if reference is None:
        return modele
    return poids_modele * modele + (1 - poids_modele) * reference


def grille_depuis_probas(
    p1x2: tuple[float, float, float] | None = None,
    p_plus: float | None = None,
    ligne_total: float = 2.5,
    rho: float = -0.05,
) -> np.ndarray:
    """Retrouve la grille qui reproduit des probabilités de marché (1X2 et/ou plus/moins).

    Sert à transformer les cotes d'un bookmaker en grille complète : on peut alors
    comparer ses prix sur tous les autres marchés (chasseur A) ou le mélanger au modèle.
    """
    if p1x2 is None and p_plus is None:
        raise ValueError("il faut au moins le 1X2 ou le plus/moins")

    def residus(x: np.ndarray) -> list[float]:
        g = grille_dc(math.exp(x[0]), math.exp(x[1]), rho)
        r: list[float] = []
        if p1x2 is not None:
            q = probas_1x2(g)
            r += [q[0] - p1x2[0], q[1] - p1x2[1], q[2] - p1x2[2]]
        if p_plus is not None:
            r.append(proba_plus(g, ligne_total) - p_plus)
        return r

    borne = (math.log(0.05), math.log(6.0))
    res = least_squares(residus, x0=[math.log(1.4), math.log(1.1)], bounds=([borne[0]] * 2, [borne[1]] * 2))
    return grille_dc(math.exp(res.x[0]), math.exp(res.x[1]), rho)


def grille_depuis_cotes(
    cotes_1x2: tuple[float, float, float] | None = None,
    cotes_total: tuple[float, float] | None = None,
    ligne_total: float = 2.5,
) -> np.ndarray | None:
    """Grille « du marché » : cotes sans marge (méthode puissance) puis ajustement."""
    p1x2 = tuple(probas_justes(list(cotes_1x2), "puissance")) if cotes_1x2 else None
    p_plus = probas_justes(list(cotes_total), "puissance")[0] if cotes_total else None
    if p1x2 is None and p_plus is None:
        return None
    return grille_depuis_probas(p1x2, p_plus, ligne_total)
