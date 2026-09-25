"""Schéma de la base et accès. SQLite en local, PostgreSQL sous Docker : même code.

Toutes les dates sont stockées en UTC.
"""

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    TypeDecorator,
    create_engine,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def maintenant() -> datetime:
    return datetime.now(timezone.utc)


class DateUTC(TypeDecorator):
    """Date stockée en UTC sans fuseau, relue avec le fuseau UTC (identique en SQLite et PostgreSQL)."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, valeur, dialect):
        if valeur is not None and valeur.tzinfo is not None:
            valeur = valeur.astimezone(timezone.utc).replace(tzinfo=None)
        return valeur

    def process_result_value(self, valeur, dialect):
        if valeur is not None and valeur.tzinfo is None:
            valeur = valeur.replace(tzinfo=timezone.utc)
        return valeur


class Base(DeclarativeBase):
    pass


class Match(Base):
    """Un match, avec les noms d'équipes football-data (ceux des modèles)."""

    __tablename__ = "matchs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sport: Mapped[str] = mapped_column(String(32), default="football")
    competition: Mapped[str] = mapped_column(String(16), index=True)  # code de ligue, ex. "E1"
    domicile: Mapped[str] = mapped_column(String(128))
    exterieur: Mapped[str] = mapped_column(String(128))
    debut: Mapped[datetime] = mapped_column(DateUTC)
    buts_domicile: Mapped[int | None] = mapped_column(Integer)
    buts_exterieur: Mapped[int | None] = mapped_column(Integer)

    cotes: Mapped[list["Cote"]] = relationship(back_populates="match")

    @property
    def libelle(self) -> str:
        return f"{self.domicile} – {self.exterieur}"

    @property
    def score(self) -> str | None:
        if self.buts_domicile is None:
            return None
        return f"{self.buts_domicile}-{self.buts_exterieur}"


class Cote(Base):
    """Une cote relevée à un instant donné. L'horodatage sert à juger sa fraîcheur."""

    __tablename__ = "cotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matchs.id"), index=True)
    bookmaker: Mapped[str] = mapped_column(String(64))
    marche: Mapped[str] = mapped_column(String(64))
    issue: Mapped[str] = mapped_column(String(64))
    valeur: Mapped[float] = mapped_column(Float)
    releve_le: Mapped[datetime] = mapped_column(DateUTC, default=maintenant)

    match: Mapped[Match] = relationship(back_populates="cotes")


class Recommandation(Base):
    """Un signal d'un chasseur. Réglé après le match (1 unité fictive) pour mesurer chaque chasseur."""

    __tablename__ = "recommandations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cree_le: Mapped[datetime] = mapped_column(DateUTC, default=maintenant)
    maj_le: Mapped[datetime] = mapped_column(DateUTC, default=maintenant)
    match_id: Mapped[int] = mapped_column(ForeignKey("matchs.id"), index=True)
    chasseur: Mapped[str] = mapped_column(String(8))
    selection: Mapped[str] = mapped_column(String(32))  # clé, ex. "total:plus:2.5"
    p_gain: Mapped[float] = mapped_column(Float)
    p_perte: Mapped[float] = mapped_column(Float)
    cote_juste: Mapped[float] = mapped_column(Float)
    cote_min: Mapped[float] = mapped_column(Float)
    cote_vue: Mapped[float | None] = mapped_column(Float)
    bookmaker: Mapped[str | None] = mapped_column(String(64))
    cote_indicative: Mapped[float | None] = mapped_column(Float)
    ev: Mapped[float] = mapped_column(Float)
    valide: Mapped[bool] = mapped_column(Boolean, default=False)
    suspect: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(Text, default="")
    fraction: Mapped[float | None] = mapped_column(Float)  # règlement : 1, 0.5, 0, -0.5, -1
    clv: Mapped[float | None] = mapped_column(Float)

    match: Mapped[Match] = relationship()

    @property
    def cote_retenue(self) -> float | None:
        return self.cote_vue or self.cote_indicative


class Pari(Base):
    """Journal des paris simulés ou réels (cahier des charges, section 12)."""

    __tablename__ = "paris"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cree_le: Mapped[datetime] = mapped_column(DateUTC, default=maintenant)
    mode: Mapped[str] = mapped_column(String(16), index=True)  # simulation | reel
    recommandation_id: Mapped[int | None] = mapped_column(ForeignKey("recommandations.id"))
    match_id: Mapped[int] = mapped_column(ForeignKey("matchs.id"))
    selection: Mapped[str] = mapped_column(String(32))
    cote_prise: Mapped[float] = mapped_column(Float)
    source_cote: Mapped[str] = mapped_column(String(64), default="")
    p_gain: Mapped[float] = mapped_column(Float)
    p_perte: Mapped[float] = mapped_column(Float)
    chasseur: Mapped[str] = mapped_column(String(8))
    mise: Mapped[float] = mapped_column(Float)
    statut: Mapped[str] = mapped_column(String(16), default="en_cours")
    gain_net: Mapped[float | None] = mapped_column(Float)
    cote_cloture_juste: Mapped[float | None] = mapped_column(Float)
    clv: Mapped[float | None] = mapped_column(Float)
    regle_le: Mapped[datetime | None] = mapped_column(DateUTC)

    match: Mapped[Match] = relationship()


class MouvementCapital(Base):
    """Chaque variation du capital, pour reconstruire la courbe et appliquer l'arrêt automatique."""

    __tablename__ = "capital"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    le: Mapped[datetime] = mapped_column(DateUTC, default=maintenant)
    mode: Mapped[str] = mapped_column(String(16))
    montant: Mapped[float] = mapped_column(Float)
    solde: Mapped[float] = mapped_column(Float)
    motif: Mapped[str] = mapped_column(String(128))


class Etat(Base):
    """Petites valeurs persistantes : mode choisi, dernières exécutions, alertes."""

    __tablename__ = "etat"

    cle: Mapped[str] = mapped_column(String(64), primary_key=True)
    valeur: Mapped[str] = mapped_column(Text)


def moteur_bdd(url: str) -> Engine:
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        # le service et l'interface web tournent dans deux fils d'exécution
        return create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})
    return create_engine(url, pool_pre_ping=True)


def initialiser(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def fabrique_sessions(engine: Engine) -> sessionmaker:
    return sessionmaker(engine, expire_on_commit=False)
