"""Configuration du moteur.

Ordre de priorité : réglages saisis dans l'interface web (stockés en base) > variables
d'environnement MOTEUR_* > fichier .env > valeurs par défaut ci-dessous. L'utilisateur n'a
donc jamais besoin de modifier le code ni le fichier .env.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Football en priorité (cahier des charges, section 3) : deuxièmes divisions et championnats
# moyens, où les bookmakers soignent moins leurs prix que sur les grands championnats.
LIGUES_PAR_DEFAUT = "E1,E2,E3,SC0,SC1,D2,I2,SP2,F2,N1,B1,P1,T1,G1"


class Reglages(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MOTEUR_", env_file=".env", extra="ignore")

    mode: Literal["simulation", "reel"] = "simulation"

    # Capital et règles de mise (sections 2 et 9)
    capital_initial: float = Field(100.0, gt=0)
    seuil_arret: float = Field(60.0, ge=0)
    fraction_kelly: float = Field(0.25, gt=0, le=1)
    mise_max_pct: float = Field(0.03, gt=0, le=0.05)
    exposition_jour_pct: float = Field(0.15, gt=0, le=0.5)
    exposition_match_pct: float = Field(0.05, gt=0, le=0.2)
    valeur_min: float = Field(0.03, ge=0)
    age_max_cote_s: int = Field(60, gt=0)
    # Au-delà, une value ou un surebet est marqué « risque d'annulation » (section 8)
    seuil_suspect: float = Field(0.10, gt=0)
    # Écart maximal de probabilité entre le modèle et la référence avant de refuser un signal
    seuil_desaccord: float = Field(0.10, gt=0, le=1)
    jours_simulation_min: int = Field(14, ge=0)

    # Périmètre et modèles
    ligues: str = LIGUES_PAR_DEFAUT
    saison_depuis: int = Field(2005, ge=1993)
    horizon_h: int = Field(96, gt=0)  # 4 jours : le week-end est visible dès le jeudi
    poids_modele: float = Field(0.3, ge=0, le=1)
    prix_backtest: Literal["moy", "max", "b365"] = "moy"

    # Calendrier du service (heure locale du fuseau)
    fuseau: str = "UTC"
    heure_donnees: int = Field(6, ge=0, le=23)
    heure_rapport: int = Field(9, ge=0, le=23)
    intervalle_analyse_h: int = Field(4, ge=1, le=24)

    # Stockage
    database_url: str = "sqlite:///data/moteur.db"
    dossier_donnees: str = "data"

    # Cotes en direct (optionnel)
    odds_api_key: str = ""
    odds_api_credits_jour: int = Field(0, ge=0)  # 0 = automatique : crédits restants du mois / jours restants
    odds_api_credits_scores: int = Field(4, ge=0)  # part du budget réservée aux scores (règlement rapide)
    odds_api_marches: str = "h2h,totals"  # 2 crédits par relevé : plus de relevés avant match
    odds_api_regions: str = "eu"
    bookmaker_cible: str = "onexbet"  # 22bet n'est dans aucun flux officiel : 1xBet, même plateforme
    bookmaker_reference: str = "pinnacle"

    # Sorties
    telegram_token: str = ""
    telegram_chat_id: str = ""

    # Interface web (infrastructure, non modifiable depuis l'interface elle-même)
    port_web: int = Field(8080, gt=0, lt=65536)

    # Optionnel, non utilisé par défaut : le moteur fonctionne sans API Claude
    anthropic_api_key: str = ""

    @model_validator(mode="after")
    def _coherence(self) -> "Reglages":
        if self.seuil_arret >= self.capital_initial:
            raise ValueError("seuil_arret doit être inférieur à capital_initial")
        if self.mise_max_pct > self.exposition_match_pct:
            raise ValueError("mise_max_pct ne peut pas dépasser exposition_match_pct")
        try:
            ZoneInfo(self.fuseau)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"fuseau horaire inconnu : {self.fuseau} (ex. Europe/Paris, Africa/Abidjan)")
        return self

    @property
    def liste_ligues(self) -> list[str]:
        return [c.strip() for c in self.ligues.split(",") if c.strip()]

    @property
    def dossier(self) -> Path:
        return Path(self.dossier_donnees)


# Champs modifiables depuis l'interface. Base de données et dossier restent de l'infrastructure.
CHAMPS_MODIFIABLES = [
    "capital_initial", "seuil_arret", "fraction_kelly", "mise_max_pct", "exposition_jour_pct",
    "exposition_match_pct", "valeur_min", "seuil_suspect", "seuil_desaccord", "jours_simulation_min",
    "ligues", "saison_depuis", "horizon_h", "poids_modele", "prix_backtest",
    "fuseau", "heure_donnees", "heure_rapport", "intervalle_analyse_h",
    "odds_api_key", "odds_api_credits_jour", "odds_api_credits_scores", "odds_api_marches", "odds_api_regions",
    "bookmaker_cible", "bookmaker_reference", "telegram_token", "telegram_chat_id",
]
SECRETS = {"odds_api_key", "telegram_token", "anthropic_api_key"}


@lru_cache
def reglages() -> Reglages:
    """Réglages de base (environnement et .env), sans les surcharges de l'interface."""
    return Reglages()


def appliquer(base: Reglages, surcharges: dict) -> Reglages:
    """Réglages effectifs. Lève pydantic.ValidationError si une valeur est invalide."""
    valeurs = base.model_dump()
    valeurs.update({k: v for k, v in surcharges.items() if k in CHAMPS_MODIFIABLES})
    return Reglages(_env_file=None, **valeurs)
