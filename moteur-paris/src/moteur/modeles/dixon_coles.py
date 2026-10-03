"""Modèle Dixon-Coles pondéré dans le temps (cahier des charges, section 7).

log λ_dom = μ + avantage_domicile + attaque[dom] + faiblesse_défense[ext]
log λ_ext = μ + attaque[ext] + faiblesse_défense[dom]

Ajustement : vraisemblance de Poisson pondérée (les matchs récents comptent plus,
poids = exp(−ξ × âge en jours)) + pénalité ridge qui ramène chaque équipe vers un
a priori (0 en général, négatif pour un promu). Le ρ de Dixon-Coles, qui corrige les
petits scores, est estimé ensuite à λ fixés.
"""

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize, minimize_scalar

from .grille import grille_dc


@dataclass
class ModeleDC:
    equipes: dict[str, int]
    att: np.ndarray
    dfn: np.ndarray
    mu: float
    dom: float
    rho: float

    def connait(self, equipe: str) -> bool:
        return equipe in self.equipes

    def lambdas(self, dom: str, ext: str) -> tuple[float, float]:
        i, j = self.equipes.get(dom), self.equipes.get(ext)
        att_d, dfn_d = (self.att[i], self.dfn[i]) if i is not None else (0.0, 0.0)
        att_e, dfn_e = (self.att[j], self.dfn[j]) if j is not None else (0.0, 0.0)
        return (
            math.exp(self.mu + self.dom + att_d + dfn_e),
            math.exp(self.mu + att_e + dfn_d),
        )

    def grille(self, dom: str, ext: str) -> np.ndarray:
        lh, la = self.lambdas(dom, ext)
        return grille_dc(lh, la, self.rho)


def ajuster(
    dom,
    ext,
    bd,
    be,
    poids,
    reg: float = 2.0,
    priors: dict[str, tuple[float, float]] | None = None,
    depart: ModeleDC | None = None,
    equipes_sans_match=(),
    cibles: tuple | None = None,
) -> ModeleDC:
    """Ajuste le modèle sur des matchs joués. `priors` : équipe → (attaque, défense) a priori.

    `cibles` : nombres de buts « lissés » (ex. mélange buts / tirs cadrés) à expliquer à la place
    des buts réels ; le ρ, qui corrige les petits scores, reste estimé sur les vrais scores.
    """
    dom = list(dom)
    ext = list(ext)
    priors = priors or {}
    noms = sorted(set(dom) | set(ext) | set(equipes_sans_match) | set(priors))
    index = {e: k for k, e in enumerate(noms)}
    n = len(noms)
    ih = np.array([index[e] for e in dom], dtype=np.intp)
    ia = np.array([index[e] for e in ext], dtype=np.intp)
    bd = np.asarray(bd, dtype=float)
    be = np.asarray(be, dtype=float)
    w = np.asarray(poids, dtype=float)
    yd, ye = (bd, be) if cibles is None else (np.asarray(cibles[0], dtype=float), np.asarray(cibles[1], dtype=float))

    pa = np.zeros(n)
    pd_ = np.zeros(n)
    for e, (a, d) in priors.items():
        pa[index[e]], pd_[index[e]] = a, d

    moyenne = max(float((w @ yd + w @ ye) / (2 * w.sum())), 0.1)
    x0 = np.concatenate([[math.log(moyenne), 0.25], pa, pd_])
    if depart is not None:
        x0[0], x0[1] = depart.mu, depart.dom
        for e, k in index.items():
            if e in depart.equipes:
                x0[2 + k] = depart.att[depart.equipes[e]]
                x0[2 + n + k] = depart.dfn[depart.equipes[e]]

    def objectif(x: np.ndarray) -> tuple[float, np.ndarray]:
        mu, h = x[0], x[1]
        att, dfn = x[2 : 2 + n], x[2 + n :]
        eh = mu + h + att[ih] + dfn[ia]
        ea = mu + att[ia] + dfn[ih]
        lh, la = np.exp(eh), np.exp(ea)
        rh, ra = w * (lh - yd), w * (la - ye)
        da, dd = att - pa, dfn - pd_
        nll = float(w @ (lh - yd * eh) + w @ (la - ye * ea) + reg / 2 * (da @ da + dd @ dd))
        g = np.empty_like(x)
        g[0] = rh.sum() + ra.sum()
        g[1] = rh.sum()
        g[2 : 2 + n] = np.bincount(ih, rh, n) + np.bincount(ia, ra, n) + reg * da
        g[2 + n :] = np.bincount(ia, rh, n) + np.bincount(ih, ra, n) + reg * dd
        return nll, g

    res = minimize(objectif, x0, jac=True, method="L-BFGS-B")
    x = res.x
    att, dfn = x[2 : 2 + n].copy(), x[2 + n :].copy()
    lh = np.exp(x[0] + x[1] + att[ih] + dfn[ia])
    la = np.exp(x[0] + att[ia] + dfn[ih])
    return ModeleDC(index, att, dfn, float(x[0]), float(x[1]), _estimer_rho(bd, be, lh, la, w))


def _estimer_rho(bd, be, lh, la, w) -> float:
    m = (bd <= 1) & (be <= 1)
    if not m.any():
        return 0.0
    x, y, l1, l2, ww = bd[m], be[m], lh[m], la[m], w[m]

    def nll(r: float) -> float:
        tau = np.where(
            (x == 0) & (y == 0),
            1 - l1 * l2 * r,
            np.where((x == 0) & (y == 1), 1 + l1 * r, np.where((x == 1) & (y == 0), 1 + l2 * r, 1 - r)),
        )
        if (tau <= 0).any():
            return 1e12
        return float(-(ww * np.log(tau)).sum())

    return float(minimize_scalar(nll, bounds=(-0.3, 0.3), method="bounded").x)
