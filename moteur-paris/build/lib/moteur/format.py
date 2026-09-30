"""Mise en forme française des nombres (virgule décimale)."""


def argent(x: float) -> str:
    return f"{x:,.2f}".replace(",", " ").replace(".", ",") + " $"


def cote(x: float | None) -> str:
    return "—" if x is None else f"{x:.2f}".replace(".", ",")


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x:+.1%}".replace(".", ",").replace("%", " %")
