"""Réglages saisis dans l'interface, demandes d'actions et suivi des tâches longues.

L'interface web ne lance jamais elle-même un travail long : elle dépose une demande que
le service exécute à son prochain passage, et affiche l'avancement enregistré ici.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .config import Reglages, appliquer, reglages
from .journal import ecrire_etat, lire_etat

ACTIONS = {
    "historique": "Téléchargement de l'historique",
    "analyse": "Analyse des matchs à venir",
    "backtest": "Backtest",
    "rapport": "Envoi du rapport",
    "bilan": "Bilan de la semaine",
}


def surcharges(s: Session) -> dict:
    return lire_etat(s, "reglages", {})


def effectifs(s: Session, base: Reglages | None = None) -> Reglages:
    return appliquer(base or reglages(), surcharges(s))


def enregistrer_reglages(s: Session, nouvelles: dict, base: Reglages | None = None) -> Reglages:
    """Valide puis enregistre. Lève pydantic.ValidationError sans rien enregistrer si c'est invalide."""
    fusion = {**surcharges(s), **nouvelles}
    r = appliquer(base or reglages(), fusion)
    ecrire_etat(s, "reglages", fusion)
    return r


def demander(s: Session, action: str) -> None:
    if action not in ACTIONS:
        raise ValueError(f"action inconnue : {action}")
    demandes = lire_etat(s, "demandes", [])
    if action not in demandes:
        demandes.append(action)
        ecrire_etat(s, "demandes", demandes)
    suivre(s, action, "en_attente", "Demandé, démarrage au prochain passage du service.")


def prendre_demandes(s: Session) -> list[str]:
    demandes = lire_etat(s, "demandes", [])
    if demandes:
        ecrire_etat(s, "demandes", [])
    return demandes


def suivre(s: Session, action: str, etat: str, message: str = "", fait: int | None = None,
           total: int | None = None) -> None:
    ecrire_etat(s, f"tache:{action}", {
        "etat": etat, "message": message, "fait": fait, "total": total,
        "maj": datetime.now(timezone.utc).isoformat(),
    })


def etat_taches(s: Session) -> dict[str, dict]:
    return {a: lire_etat(s, f"tache:{a}", {}) | {"nom": nom} for a, nom in ACTIONS.items()}
