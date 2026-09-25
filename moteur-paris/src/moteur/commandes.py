"""Commandes du bot Telegram (mêmes actions que la ligne de commande)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .journal import changer_mode, confirmer_pari, evaluer_cote, regler_manuellement
from .rapport import journal, rapport_quotidien, texte_capital

if TYPE_CHECKING:
    from .service import Service

AIDE = """Commandes :
/jour — rapport du jour et paris recommandés
/capital — capital et mode
/fiche Équipe A - Équipe B — prix justes de tous les marchés
/cote 12 1,95 — 22bet affiche 1,95 pour le signal #12 : je joue ?
/pari 12 1,95 [mise] — enregistrer un pari réel pris sur 22bet
/resultat 34 2-1 — saisir le score du match #34
/journal — derniers paris
/analyse — relancer l'analyse maintenant
/bilan — bilan de la semaine (à coller dans Claude)
/simulation ou /stop — repasser en simulation
/reel — passer en argent réel (si les conditions sont remplies)"""


def _nombre(texte: str) -> float:
    return float(texte.replace(",", "."))


def executer(texte: str, service: Service) -> str:
    texte = texte.strip()
    if not texte.startswith("/"):
        return "Commande inconnue. /aide pour la liste."
    commande, _, reste = texte.partition(" ")
    commande = commande.split("@")[0].lower()
    args = reste.split()
    quand = service.horloge()
    r = service.r
    try:
        with service.sessions() as s:
            if commande in ("/start", "/aide", "/help"):
                return AIDE
            if commande == "/capital":
                return texte_capital(s, r)
            if commande == "/jour":
                return rapport_quotidien(s, r, quand, service.derniere_analyse, service.parametres_presents())
            if commande == "/journal":
                return journal(s, r)
            if commande in ("/simulation", "/stop"):
                return changer_mode(s, r, "simulation", quand)
            if commande == "/reel":
                return changer_mode(s, r, "reel", quand)
            if commande == "/cote":
                if len(args) != 2:
                    return "Usage : /cote <numéro du signal> <cote>, ex. /cote 12 1,95"
                return evaluer_cote(s, r, int(args[0].lstrip("#")), _nombre(args[1]), quand)
            if commande == "/pari":
                if len(args) not in (2, 3):
                    return "Usage : /pari <numéro du signal> <cote> [mise], ex. /pari 12 1,95 2"
                mise = _nombre(args[2]) if len(args) == 3 else None
                return confirmer_pari(s, r, int(args[0].lstrip("#")), _nombre(args[1]), mise, quand)[1]
            if commande == "/resultat":
                score = re.fullmatch(r"(\d+)\s*[-:]\s*(\d+)", " ".join(args[1:])) if len(args) >= 2 else None
                if score is None:
                    return "Usage : /resultat <numéro du match> <score>, ex. /resultat 34 2-1"
                return regler_manuellement(s, int(args[0].lstrip("#")), int(score[1]), int(score[2]), quand)[1]
        if commande == "/fiche":
            if " - " not in reste:
                return "Usage : /fiche Équipe A - Équipe B"
            dom, ext = (x.strip() for x in reste.split(" - ", 1))
            return service.fiche(dom, ext)
        if commande == "/analyse":
            nouvelles = service.analyser(quand)
            return f"Analyse terminée : {service.derniere_analyse.get('nb_matchs', 0)} match(s), {len(nouvelles)} nouveau(x) signal(aux) validé(s)."
        if commande == "/bilan":
            return service.bilan(quand, envoyer=False)
    except ValueError as e:
        return f"Valeur incorrecte : {e}"
    return "Commande inconnue. /aide pour la liste."
