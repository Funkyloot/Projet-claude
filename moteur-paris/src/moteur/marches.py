"""Marchés de paris football et lecture de la grille des scores (cahier des charges, sections 7 et 8).

Tous les marchés se déduisent de la même grille : grille[i, j] = probabilité du score i-j
(i buts à domicile, j à l'extérieur). Un seul calcul, des prix cohérents entre eux.

Le règlement d'un pari est exprimé en « fraction gagnée » :
  1 gagné · 0,5 demi-gagné · 0 remboursé · -0,5 demi-perdu · -1 perdu
ce qui couvre les handicaps asiatiques et les lignes en quart (2,25 ; -0,75…).
"""

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from .calcul import kelly_general

MAX_BUTS = 10
TAILLE_GRILLE = MAX_BUTS + 1

ISSUES: dict[str, tuple[str, ...]] = {
    "1x2": ("1", "X", "2"),
    "dc": ("1X", "12", "X2"),
    "dnb": ("1", "2"),
    "total": ("plus", "moins"),
    "ah": ("1", "2"),
    "btts": ("oui", "non"),
}
AVEC_LIGNE = {"total", "ah"}

# Famille de validation : dc et dnb se déduisent du 1X2 et sont validés avec lui.
FAMILLE = {"1x2": "1x2", "dc": "1x2", "dnb": "1x2", "total": "total", "ah": "ah", "btts": "btts"}


def _nombre(x: float, signe: bool = False) -> str:
    texte = f"{x:+g}" if signe else f"{x:g}"
    return texte.replace(".", ",").replace("-", "−")


@dataclass(frozen=True)
class Selection:
    """Un pari précis : marché, issue et, pour les totaux et handicaps, la ligne.

    Pour un handicap asiatique, `ligne` est le handicap de l'équipe choisie
    (ex. issue "2", ligne +0,5 = extérieur +0,5).
    """

    marche: str
    issue: str
    ligne: float | None = None

    def __post_init__(self) -> None:
        if self.marche not in ISSUES or self.issue not in ISSUES[self.marche]:
            raise ValueError(f"sélection inconnue : {self.marche} / {self.issue}")
        if (self.ligne is None) == (self.marche in AVEC_LIGNE):
            raise ValueError(f"ligne {'manquante' if self.ligne is None else 'inutile'} pour {self.marche}")
        if self.ligne is not None:
            quarts = self.ligne * 4
            if abs(quarts - round(quarts)) > 1e-9:
                raise ValueError(f"ligne invalide : {self.ligne} (multiple de 0,25 attendu)")
            object.__setattr__(self, "ligne", round(quarts) / 4)

    @property
    def cle(self) -> str:
        return f"{self.marche}:{self.issue}" + (f":{self.ligne:g}" if self.ligne is not None else "")

    @classmethod
    def depuis_cle(cls, cle: str) -> "Selection":
        morceaux = cle.split(":")
        return cls(morceaux[0], morceaux[1], float(morceaux[2]) if len(morceaux) > 2 else None)

    @property
    def famille(self) -> str:
        return FAMILLE[self.marche]

    def libelle(self, dom: str = "domicile", ext: str = "extérieur") -> str:
        m, i = self.marche, self.issue
        if m == "1x2":
            return {"1": f"Victoire {dom}", "X": "Match nul", "2": f"Victoire {ext}"}[i]
        if m == "dc":
            return {"1X": f"Double chance {dom} ou nul", "12": "Double chance pas de nul",
                    "X2": f"Double chance nul ou {ext}"}[i]
        if m == "dnb":
            return f"Remboursé si nul : {dom if i == '1' else ext}"
        if m == "btts":
            return f"Les deux équipes marquent : {i}"
        if m == "total":
            return f"{'Plus' if i == 'plus' else 'Moins'} de {_nombre(self.ligne)} buts"
        return f"Handicap asiatique {dom if i == '1' else ext} {_nombre(self.ligne, signe=True)}"


def _simple(ecart: float) -> float:
    if ecart > 1e-9:
        return 1.0
    if ecart < -1e-9:
        return -1.0
    return 0.0


def _asiatique(mesure: float, ligne: float) -> float:
    """Gagne si mesure + ligne > 0. Une ligne en quart est coupée en deux demi-mises."""
    if round(ligne * 4) % 2:
        return (_simple(mesure + ligne - 0.25) + _simple(mesure + ligne + 0.25)) / 2
    return _simple(mesure + ligne)


def fraction_gagnee(sel: Selection, bd: int, be: int) -> float:
    """Règlement d'une sélection pour le score final bd-be."""
    m, i = sel.marche, sel.issue
    if m == "1x2":
        return 1.0 if {"1": bd > be, "X": bd == be, "2": bd < be}[i] else -1.0
    if m == "dc":
        return 1.0 if {"1X": bd >= be, "12": bd != be, "X2": bd <= be}[i] else -1.0
    if m == "dnb":
        return _simple(bd - be if i == "1" else be - bd)
    if m == "btts":
        les_deux = bd > 0 and be > 0
        return 1.0 if les_deux == (i == "oui") else -1.0
    if m == "total":
        total = bd + be
        return _asiatique(total, -sel.ligne) if i == "plus" else _asiatique(-total, sel.ligne)
    ecart = bd - be if i == "1" else be - bd
    return _asiatique(ecart, sel.ligne)


@lru_cache(maxsize=8192)
def matrice(sel: Selection, taille: int = TAILLE_GRILLE) -> np.ndarray:
    """Fraction gagnée pour chaque case de la grille (calculée une fois par sélection)."""
    m = np.array([[fraction_gagnee(sel, i, j) for j in range(taille)] for i in range(taille)])
    m.setflags(write=False)
    return m


def gain_perte(grille: np.ndarray, sel: Selection) -> tuple[float, float]:
    """(W, L) : probabilité pondérée de gain et de perte.

    W = P(gagné) + ½ P(demi-gagné), L = P(perdu) + ½ P(demi-perdu).
    Espérance à la cote o : W × (o − 1) − L. Pour un pari simple, W = p et L = 1 − p.
    """
    f = matrice(sel, grille.shape[0])
    return float((grille * np.clip(f, 0, None)).sum()), float((grille * np.clip(-f, 0, None)).sum())


def repartition(grille: np.ndarray, sel: Selection) -> dict[float, float]:
    f = matrice(sel, grille.shape[0])
    return {float(v): float(grille[f == v].sum()) for v in np.unique(f)}


def proba_effective(W: float, L: float) -> float:
    """Probabilité de gagner hors remboursements, pour afficher et comparer des modèles."""
    return W / (W + L) if W + L > 0 else 0.0


def cote_juste(W: float, L: float) -> float | None:
    """Cote pour laquelle l'espérance est nulle."""
    return 1 + L / W if W > 0 else None


def cote_minimale(W: float, L: float, valeur: float) -> float | None:
    """Plus petite cote qui donne une espérance d'au moins `valeur` (ex. 0,03)."""
    return 1 + (valeur + L) / W if W > 0 else None


def esperance(W: float, L: float, cote: float) -> float:
    return W * (cote - 1) - L


def kelly_wl(W: float, L: float, cote: float) -> float:
    """Kelly à partir de (W, L) : issues gagné / remboursé / perdu."""
    return kelly_general([(W, cote - 1), (L, -1.0), (max(0.0, 1 - W - L), 0.0)])


def kelly_selection(grille: np.ndarray, sel: Selection, cote: float) -> float:
    """Kelly exact sur la répartition complète (demi-gains compris)."""
    return kelly_general([(p, g * (cote - 1) if g > 0 else g) for g, p in repartition(grille, sel).items()])


def selections_fiche() -> list[Selection]:
    """Les marchés affichés sur la fiche d'un match."""
    s = [Selection("1x2", i) for i in ISSUES["1x2"]]
    s += [Selection("dc", i) for i in ISSUES["dc"]]
    s += [Selection("dnb", i) for i in ISSUES["dnb"]]
    s += [Selection("btts", i) for i in ISSUES["btts"]]
    for ligne in (1.5, 2.5, 3.5):
        s += [Selection("total", "plus", ligne), Selection("total", "moins", ligne)]
    for ligne in (-1.5, -1.0, -0.5, 0.0, 0.5):
        s += [Selection("ah", "1", ligne), Selection("ah", "2", -ligne)]
    return s
