"""Ajustement d'un modèle pour un championnat à une date donnée, sans jamais voir le futur."""

from collections import Counter
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from .dixon_coles import ModeleDC, ajuster

# A priori pour une équipe qui arrive dans le championnat : un promu est en général plus
# faible que la moyenne, un relégué plus fort. Les matchs joués prennent vite le relais.
PRIOR_PROMU = (-0.15, 0.15)
PRIOR_RELEGUE = (0.15, -0.15)
MATCHS_MIN = 30


@dataclass(frozen=True)
class ParamsLigue:
    xi: float = 0.0019  # décroissance du poids par jour (≈ poids divisé par 2 en un an)
    reg: float = 2.0  # force de rappel vers l'a priori
    fenetre_jours: int = 730
    poids_modele: float = 0.3  # part du modèle face à la référence dans le mélange

    def en_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def depuis_dict(cls, d: dict) -> "ParamsLigue":
        return cls(**{k: d[k] for k in ("xi", "reg", "fenetre_jours", "poids_modele") if k in d})


def priors_nouvelles_equipes(
    fenetre: pd.DataFrame, date: pd.Timestamp, equipes: set[str], hist_sup: pd.DataFrame | None
) -> dict[str, tuple[float, float]]:
    recents = fenetre[fenetre["date"] >= date - pd.Timedelta(days=300)]
    nb = Counter(recents["dom"]) + Counter(recents["ext"])
    venues_du_dessus: set[str] = set()
    if hist_sup is not None and len(hist_sup):
        sup = hist_sup[(hist_sup["date"] < date) & (hist_sup["date"] >= date - pd.Timedelta(days=400))]
        venues_du_dessus = set(sup["dom"]) | set(sup["ext"])
    return {e: (PRIOR_RELEGUE if e in venues_du_dessus else PRIOR_PROMU) for e in equipes if nb[e] < 8}


def ajuster_ligue(
    hist: pd.DataFrame,
    date,
    params: ParamsLigue = ParamsLigue(),
    equipes_a_predire=(),
    hist_sup: pd.DataFrame | None = None,
    depart: ModeleDC | None = None,
) -> ModeleDC | None:
    """`hist` : matchs du championnat (colonnes date, dom, ext, bd, be). Seuls ceux avant `date` servent."""
    date = pd.Timestamp(date)
    fen = hist[
        (hist["date"] < date)
        & (hist["date"] >= date - pd.Timedelta(days=params.fenetre_jours))
        & hist["bd"].notna()
        & hist["be"].notna()
    ]
    if len(fen) < MATCHS_MIN:
        return None
    age = (date - fen["date"]).dt.total_seconds().to_numpy() / 86400
    poids = np.exp(-params.xi * age)
    equipes = set(fen["dom"]) | set(fen["ext"]) | set(equipes_a_predire)
    priors = priors_nouvelles_equipes(fen, date, equipes, hist_sup)
    return ajuster(
        fen["dom"], fen["ext"], fen["bd"], fen["be"], poids,
        reg=params.reg, priors=priors, depart=depart, equipes_sans_match=equipes_a_predire,
    )
