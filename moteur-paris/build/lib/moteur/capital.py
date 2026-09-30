"""Suivi du capital et arrêt automatique (cahier des charges, section 9)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import MouvementCapital


def solde(session: Session, mode: str) -> float | None:
    dernier = session.scalars(
        select(MouvementCapital)
        .where(MouvementCapital.mode == mode)
        .order_by(MouvementCapital.id.desc())
        .limit(1)
    ).first()
    return dernier.solde if dernier else None


def enregistrer(session: Session, mode: str, montant: float, motif: str) -> float:
    nouveau = (solde(session, mode) or 0.0) + montant
    session.add(MouvementCapital(mode=mode, montant=montant, solde=round(nouveau, 2), motif=motif))
    session.commit()
    return nouveau


def depot_initial(session: Session, mode: str, capital: float) -> float:
    """Crée le dépôt de départ une seule fois par mode."""
    actuel = solde(session, mode)
    if actuel is not None:
        return actuel
    return enregistrer(session, mode, capital, "dépôt initial")


def arret_atteint(session: Session, mode: str, seuil: float) -> bool:
    actuel = solde(session, mode)
    return actuel is not None and actuel < seuil
