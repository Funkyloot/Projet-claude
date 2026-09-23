"""Configuration du moteur, lue depuis les variables d'environnement (préfixe MOTEUR_) ou le fichier .env."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Reglages(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MOTEUR_", env_file=".env", extra="ignore")

    mode: Literal["simulation", "reel"] = "simulation"

    # Capital et règles de mise (cahier des charges, sections 2 et 9)
    capital_initial: float = Field(100.0, gt=0)
    seuil_arret: float = Field(60.0, ge=0)
    fraction_kelly: float = Field(0.25, gt=0, le=1)
    mise_max_pct: float = Field(0.03, gt=0, le=0.05)
    valeur_min: float = Field(0.03, ge=0)
    age_max_cote_s: int = Field(60, gt=0)

    database_url: str = "sqlite:///data/moteur.db"

    anthropic_api_key: str = ""
    odds_api_key: str = ""
    telegram_token: str = ""
    telegram_chat_id: str = ""

    @model_validator(mode="after")
    def _coherence(self) -> "Reglages":
        if self.seuil_arret >= self.capital_initial:
            raise ValueError("seuil_arret doit être inférieur à capital_initial")
        return self


@lru_cache
def reglages() -> Reglages:
    return Reglages()
