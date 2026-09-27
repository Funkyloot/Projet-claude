"""Chasseurs d'erreurs (cahier des charges, section 8) et filtre commun (section 9).

B · value : la probabilité (mélange modèle + référence sharp) vaut plus que la cote.
A · incohérences : un marché du bookmaker cible ne colle pas avec ses propres cotes 1X2 et plus/moins.
L · surebet : combinaison qui couvre toutes les issues chez plusieurs bookmakers.

Chaque signal donne une « cote minimale » : si 22bet affiche au moins cette cote, le pari
a une espérance ≥ valeur_min. Utile quand la cote exacte de 22bet n'est pas connue.
"""

from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

from .calcul import surebet
from .donnees.cotes import BET365, MOYENNE, CoteBrute
from .marches import (
    Selection,
    cote_juste,
    cote_minimale,
    esperance,
    gain_perte,
    kelly_wl,
    proba_effective,
)
from .modeles.grille import grille_depuis_cotes, melanger


@dataclass
class Candidat:
    chasseur: str
    ligue: str
    dom: str
    ext: str
    debut: datetime
    selection: Selection
    p_gain: float  # W
    p_perte: float  # L
    cote_juste: float
    cote_min: float
    cote_vue: float | None = None  # cote relevée chez le bookmaker cible
    bookmaker: str | None = None
    cote_indicative: float | None = None  # prix d'un autre bookmaker quand la cible manque
    ev: float = 0.0
    kelly: float = 0.0
    valide: bool = False
    suspect: bool = False
    note: str = ""

    @property
    def proba(self) -> float:
        return proba_effective(self.p_gain, self.p_perte)

    @property
    def cote_retenue(self) -> float | None:
        return self.cote_vue or self.cote_indicative


@dataclass
class ContexteMatch:
    ligue: str
    dom: str
    ext: str
    debut: datetime
    grille_modele: np.ndarray | None
    cotes: dict[tuple[str, Selection], CoteBrute] = field(default_factory=dict)


@dataclass(frozen=True)
class Filtre:
    valeur_min: float = 0.03
    seuil_suspect: float = 0.10
    seuil_desaccord: float = 0.10
    poids_modele: float = 0.3
    bookmaker_cible: str = ""
    bookmaker_reference: str = "pinnacle"
    familles_validees: frozenset[str] = frozenset()


def _cotes_de(ctx: ContexteMatch, bookmaker: str) -> dict[Selection, float]:
    return {sel: c.cote for (bk, sel), c in ctx.cotes.items() if bk == bookmaker}


def grille_bookmaker(cotes: dict[Selection, float]) -> np.ndarray | None:
    """Grille implicite d'un bookmaker à partir de son 1X2 et de son plus/moins 2,5."""
    c1x2 = tuple(cotes.get(Selection("1x2", i)) for i in ("1", "X", "2"))
    ctot = (cotes.get(Selection("total", "plus", 2.5)), cotes.get(Selection("total", "moins", 2.5)))
    return grille_depuis_cotes(
        c1x2 if all(c1x2) else None,
        ctot if all(ctot) else None,
    )


def grille_reference(ctx: ContexteMatch, f: Filtre) -> tuple[np.ndarray | None, str | None]:
    """Référence : le bookmaker sharp, sinon la moyenne du marché (consensus)."""
    for bk in (f.bookmaker_reference, MOYENNE):
        g = grille_bookmaker(_cotes_de(ctx, bk))
        if g is not None:
            return g, bk
    return None, None


def chasseur_value(ctx: ContexteMatch, f: Filtre) -> list[Candidat]:
    """Chasseur B."""
    ref, source_ref = grille_reference(ctx, f)
    if ctx.grille_modele is None and ref is None:
        return []
    modele = ctx.grille_modele if ctx.grille_modele is not None else ref
    grille = melanger(modele, ref, f.poids_modele) if ctx.grille_modele is not None else ref
    # Sans référence, rien ne contrôle le modèle : on exige deux fois plus de valeur.
    vmin = f.valeur_min if ref is not None else 2 * f.valeur_min

    cible = _cotes_de(ctx, f.bookmaker_cible) if f.bookmaker_cible else {}
    indicatif = _cotes_de(ctx, MOYENNE) or _cotes_de(ctx, BET365)
    candidats = []
    for sel in sorted(set(cible) | set(indicatif), key=lambda s: s.cle):
        W, L = gain_perte(grille, sel)
        cj, cmin = cote_juste(W, L), cote_minimale(W, L, vmin)
        if cj is None:
            continue
        cote_vue, cote_ind = cible.get(sel), indicatif.get(sel)
        prix = cote_vue if cote_vue is not None else cote_ind
        if prix is None or prix < cmin:
            continue
        note = []
        if ref is not None and ctx.grille_modele is not None:
            p_mod = proba_effective(*gain_perte(ctx.grille_modele, sel))
            p_ref = proba_effective(*gain_perte(ref, sel))
            if abs(p_mod - p_ref) > f.seuil_desaccord:
                continue  # le modèle contredit fortement le marché sharp : il a probablement tort
        if source_ref and source_ref != f.bookmaker_reference:
            note.append(f"référence : {source_ref}")
        if ref is None:
            note.append("sans référence sharp")
        ev = esperance(W, L, prix)
        candidats.append(
            Candidat(
                chasseur="B", ligue=ctx.ligue, dom=ctx.dom, ext=ctx.ext, debut=ctx.debut, selection=sel,
                p_gain=W, p_perte=L, cote_juste=cj, cote_min=cmin,
                cote_vue=cote_vue, bookmaker=f.bookmaker_cible if cote_vue is not None else None,
                cote_indicative=cote_ind if cote_vue is None else None,
                ev=ev, kelly=kelly_wl(W, L, prix),
                valide=sel.famille in f.familles_validees and ref is not None,
                suspect=ev > f.seuil_suspect, note=" · ".join(note),
            )
        )
    return candidats


def chasseur_incoherences(ctx: ContexteMatch, f: Filtre) -> list[Candidat]:
    """Chasseur A : marchés du bookmaker cible mal alignés sur ses propres 1X2 et plus/moins.

    Toujours « en observation » : ce chasseur ne peut pas être validé sur l'historique
    (il faut tous les marchés du bookmaker) ; ses résultats en direct décideront.
    """
    if not f.bookmaker_cible:
        return []
    cotes = _cotes_de(ctx, f.bookmaker_cible)
    g_book = grille_bookmaker(cotes)
    if g_book is None:
        return []
    ref, _ = grille_reference(ctx, f)
    base = {Selection("1x2", i) for i in ("1", "X", "2")} | {
        Selection("total", "plus", 2.5), Selection("total", "moins", 2.5)}
    candidats = []
    for sel, cote in cotes.items():
        if sel in base:
            continue
        W, L = gain_perte(g_book, sel)
        cmin = cote_minimale(W, L, f.valeur_min)
        if cmin is None or cote < cmin:
            continue
        if ref is not None and esperance(*gain_perte(ref, sel), cote) < 0:
            continue  # incohérent chez le bookmaker, mais pas une bonne affaire face au marché
        ev = esperance(W, L, cote)
        candidats.append(
            Candidat(
                chasseur="A", ligue=ctx.ligue, dom=ctx.dom, ext=ctx.ext, debut=ctx.debut, selection=sel,
                p_gain=W, p_perte=L, cote_juste=cote_juste(W, L), cote_min=cmin,
                cote_vue=cote, bookmaker=f.bookmaker_cible, ev=ev, kelly=kelly_wl(W, L, cote),
                valide=False, suspect=ev > f.seuil_suspect, note="incohérence interne",
            )
        )
    return candidats


@dataclass
class Surebet:
    ligue: str
    dom: str
    ext: str
    debut: datetime
    jambes: list[tuple[Selection, str, float, float]]  # sélection, bookmaker, cote, mise pour 100 $
    profit: float
    suspect: bool


COMBINAISONS = [
    [Selection("1x2", "1"), Selection("1x2", "X"), Selection("1x2", "2")],
    [Selection("1x2", "1"), Selection("dc", "X2")],
    [Selection("1x2", "2"), Selection("dc", "1X")],
    [Selection("1x2", "X"), Selection("dc", "12")],
    [Selection("btts", "oui"), Selection("btts", "non")],
]


def chasseur_surebet(ctx: ContexteMatch, f: Filtre, exclus: tuple[str, ...] = ()) -> list[Surebet]:
    """Chasseur L. `exclus` : pseudo-bookmakers où l'on ne peut pas miser (moyenne, max)."""
    meilleures: dict[Selection, tuple[float, str]] = {}
    for (bk, sel), c in ctx.cotes.items():
        if bk in exclus:
            continue
        if sel not in meilleures or c.cote > meilleures[sel][0]:
            meilleures[sel] = (c.cote, bk)
    combinaisons = list(COMBINAISONS)
    for sel in meilleures:
        if sel.ligne is not None and (sel.ligne * 2) % 1:
            continue  # lignes en quart : demi-gains croisés, la couverture n'est pas garantie
        if sel.marche == "total" and sel.issue == "plus":
            combinaisons.append([sel, Selection("total", "moins", sel.ligne)])
        if sel.marche == "ah" and sel.issue == "1":
            combinaisons.append([sel, Selection("ah", "2", -sel.ligne)])
    resultats = []
    for combi in combinaisons:
        if not all(s in meilleures for s in combi):
            continue
        s = surebet([meilleures[x][0] for x in combi], 100.0, f.seuil_suspect)
        if s.est_surebet and s.profit >= 0.005:  # sous 0,5 %, les arrondis de cote suffisent à l'annuler
            jambes = [(x, meilleures[x][1], meilleures[x][0], m) for x, m in zip(combi, s.mises)]
            resultats.append(Surebet(ctx.ligue, ctx.dom, ctx.ext, ctx.debut, jambes, s.profit, s.suspect))
    return resultats
