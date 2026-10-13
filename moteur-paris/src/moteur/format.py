"""Mise en forme française des nombres (virgule décimale) et des messages affichés."""

import re

# Clés d'API dans une adresse (« apiKey=… ») et jeton Telegram (« /bot123:ABC… »).
_SECRETS = (
    (re.compile(r"(?i)\b((?:api_?key|access_?token|token)=)[^&\s'\"<>]+"), r"\1***"),
    (re.compile(r"(/bot)\d+:[\w-]+"), r"\1***"),
)


def masquer_secrets(texte: str) -> str:
    """Retire les clés et jetons d'un message (alertes, journaux, pages) : jamais affichés en clair."""
    for motif, remplacement in _SECRETS:
        texte = motif.sub(remplacement, texte)
    return texte


def argent(x: float) -> str:
    return f"{x:,.2f}".replace(",", " ").replace(".", ",") + " $"


def cote(x: float | None) -> str:
    return "—" if x is None else f"{x:.2f}".replace(".", ",")


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x:+.1%}".replace(".", ",").replace("%", " %")
