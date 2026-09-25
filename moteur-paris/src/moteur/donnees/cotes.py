"""Représentation commune d'une cote, quelle que soit sa source."""

from dataclasses import dataclass
from datetime import datetime

import pandas as pd

from ..marches import Selection

# Pseudo-bookmakers tirés des fichiers football-data
PINNACLE = "pinnacle"
MOYENNE = "moyenne"
MAXIMUM = "max"
BET365 = "bet365"


@dataclass(frozen=True)
class CoteBrute:
    bookmaker: str
    selection: Selection
    cote: float
    maj: datetime


def cotes_depuis_ligne(ligne: pd.Series, maj: datetime) -> list[CoteBrute]:
    """Cotes avant match d'une ligne football-data (historique ou fixtures)."""
    sources = {"ref": PINNACLE, "moy": MOYENNE, "max": MAXIMUM, "b365": BET365}
    cotes: list[CoteBrute] = []

    def ajouter(bookmaker: str, sel: Selection, valeur) -> None:
        if valeur is not None and pd.notna(valeur) and float(valeur) > 1:
            cotes.append(CoteBrute(bookmaker, sel, float(valeur), maj))

    for prefixe, bookmaker in sources.items():
        for issue, suffixe in (("1", "1"), ("X", "x"), ("2", "2")):
            ajouter(bookmaker, Selection("1x2", issue), ligne.get(f"{prefixe}_{suffixe}"))
        ajouter(bookmaker, Selection("total", "plus", 2.5), ligne.get(f"{prefixe}_plus"))
        ajouter(bookmaker, Selection("total", "moins", 2.5), ligne.get(f"{prefixe}_moins"))
        ah = ligne.get("ah_ligne")
        if ah is not None and pd.notna(ah) and abs(ah * 4 - round(ah * 4)) < 1e-9:
            ajouter(bookmaker, Selection("ah", "1", float(ah)), ligne.get(f"{prefixe}_ah1"))
            ajouter(bookmaker, Selection("ah", "2", -float(ah)), ligne.get(f"{prefixe}_ah2"))
    return cotes


def plus_recentes(cotes: list[CoteBrute]) -> dict[tuple[str, Selection], CoteBrute]:
    """Garde la cote la plus récente par (bookmaker, sélection)."""
    res: dict[tuple[str, Selection], CoteBrute] = {}
    for c in cotes:
        cle = (c.bookmaker, c.selection)
        if cle not in res or c.maj > res[cle].maj:
            res[cle] = c
    return res
