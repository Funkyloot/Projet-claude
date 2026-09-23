"""Schéma de la base et accès. SQLite en local, PostgreSQL sous Docker : même code."""

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def maintenant() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Match(Base):
    """Un événement sportif, identifié de façon unique quelle que soit la source."""

    __tablename__ = "matchs"
    __table_args__ = (UniqueConstraint("sport", "domicile", "exterieur", "debut"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sport: Mapped[str] = mapped_column(String(32))
    competition: Mapped[str] = mapped_column(String(128))
    domicile: Mapped[str] = mapped_column(String(128))
    exterieur: Mapped[str] = mapped_column(String(128))
    debut: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    buts_domicile: Mapped[int | None] = mapped_column(Integer)
    buts_exterieur: Mapped[int | None] = mapped_column(Integer)

    cotes: Mapped[list["Cote"]] = relationship(back_populates="match")


class Cote(Base):
    """Une cote relevée à un instant donné. L'horodatage sert à juger sa fraîcheur."""

    __tablename__ = "cotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matchs.id"), index=True)
    bookmaker: Mapped[str] = mapped_column(String(64))
    marche: Mapped[str] = mapped_column(String(64))  # ex. "1X2", "total_2.5", "double_chance"
    issue: Mapped[str] = mapped_column(String(64))  # ex. "1", "X2", "plus"
    valeur: Mapped[float] = mapped_column(Float)
    releve_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=maintenant)

    match: Mapped[Match] = relationship(back_populates="cotes")


class Pari(Base):
    """Journal des paris recommandés, simulés ou réels (cahier des charges, section 12)."""

    __tablename__ = "paris"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=maintenant)
    mode: Mapped[str] = mapped_column(String(16))  # simulation | reel
    match_id: Mapped[int] = mapped_column(ForeignKey("matchs.id"))
    marche: Mapped[str] = mapped_column(String(64))
    issue: Mapped[str] = mapped_column(String(64))
    cote_prise: Mapped[float] = mapped_column(Float)
    cote_cloture: Mapped[float | None] = mapped_column(Float)
    proba_modele: Mapped[float] = mapped_column(Float)
    chasseur: Mapped[str] = mapped_column(String(32))  # module d'origine (A à L)
    mise: Mapped[float] = mapped_column(Float)
    statut: Mapped[str] = mapped_column(String(16), default="en_cours")  # en_cours | gagne | perdu | annule
    gain_net: Mapped[float | None] = mapped_column(Float)


class MouvementCapital(Base):
    """Chaque variation du capital, pour reconstruire la courbe et appliquer l'arrêt automatique."""

    __tablename__ = "capital"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=maintenant)
    mode: Mapped[str] = mapped_column(String(16))
    montant: Mapped[float] = mapped_column(Float)
    solde: Mapped[float] = mapped_column(Float)
    motif: Mapped[str] = mapped_column(String(128))


def moteur_bdd(url: str) -> Engine:
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url)


def initialiser(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def fabrique_sessions(engine: Engine) -> sessionmaker:
    return sessionmaker(engine, expire_on_commit=False)
