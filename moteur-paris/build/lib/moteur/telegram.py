"""Client minimal de l'API Bot Telegram (cahier des charges, section 11).

Mode « long polling » : le programme va chercher les messages lui-même, donc aucun port
à ouvrir sur la box et pas besoin d'adresse IP fixe.
"""

from dataclasses import dataclass

import httpx

LONGUEUR_MAX = 4000


@dataclass
class Message:
    chat_id: str
    texte: str


def decouper(texte: str, taille: int = LONGUEUR_MAX) -> list[str]:
    """Coupe un long texte aux sauts de ligne pour respecter la limite de Telegram."""
    morceaux, courant = [], ""
    for ligne in texte.split("\n"):
        while len(ligne) > taille:
            if courant:
                morceaux.append(courant)
                courant = ""
            morceaux.append(ligne[:taille])
            ligne = ligne[taille:]
        if len(courant) + len(ligne) + 1 > taille:
            morceaux.append(courant)
            courant = ligne
        else:
            courant = f"{courant}\n{ligne}" if courant else ligne
    if courant:
        morceaux.append(courant)
    return morceaux or [""]


class Telegram:
    def __init__(self, token: str, chat_id: str = "", client: httpx.Client | None = None):
        self.base = f"https://api.telegram.org/bot{token}"
        self.chat_id = chat_id
        self.http = client or httpx.Client(timeout=httpx.Timeout(60, connect=15))
        self.decalage: int | None = None

    def envoyer(self, texte: str, chat_id: str | None = None) -> None:
        cible = chat_id or self.chat_id
        if not cible:
            return
        for morceau in decouper(texte):
            r = self.http.post(f"{self.base}/sendMessage",
                               json={"chat_id": cible, "text": morceau, "disable_web_page_preview": True})
            r.raise_for_status()

    def lire(self, attente: int = 20) -> list[Message]:
        params = {"timeout": attente, "allowed_updates": '["message"]'}
        if self.decalage is not None:
            params["offset"] = self.decalage
        r = self.http.get(f"{self.base}/getUpdates", params=params)
        r.raise_for_status()
        messages = []
        for maj in r.json().get("result", []):
            self.decalage = maj["update_id"] + 1
            msg = maj.get("message") or {}
            if "text" in msg:
                messages.append(Message(str(msg["chat"]["id"]), msg["text"]))
        return messages
