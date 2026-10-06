"""Cotes en direct via The Odds API (the-odds-api.com), source autorisée et documentée.

Chaque appel consomme des crédits (nombre de marchés × régions). Le client lit le
nombre de crédits restants dans les en-têtes de réponse, et le service ne dépasse pas
le budget quotidien fixé dans la configuration.

Les clés de championnat ci-dessous sont à vérifier avec `moteur sources` (liste /v4/sports) :
le fournisseur peut les renommer. Même chose pour la clé du bookmaker cible (22bet s'il est
couvert, sinon un bookmaker de la même plateforme comme indicateur).
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from ..marches import Selection
from .cotes import CoteBrute

log = logging.getLogger(__name__)

BASE = "https://api.the-odds-api.com/v4"

SPORTS: dict[str, str] = {
    "E0": "soccer_epl", "E1": "soccer_efl_champ", "E2": "soccer_england_league1",
    "E3": "soccer_england_league2", "SC0": "soccer_spl", "D1": "soccer_germany_bundesliga",
    "D2": "soccer_germany_bundesliga2", "I1": "soccer_italy_serie_a", "I2": "soccer_italy_serie_b",
    "SP1": "soccer_spain_la_liga", "SP2": "soccer_spain_segunda_division",
    "F1": "soccer_france_ligue_one", "F2": "soccer_france_ligue_two",
    "N1": "soccer_netherlands_eredivisie", "B1": "soccer_belgium_first_div",
    "P1": "soccer_portugal_primeira_liga", "T1": "soccer_turkey_super_league",
    "G1": "soccer_greece_super_league",
}

# Championnats dont The Odds API ne publie pas les scores (page « sports-apis » du fournisseur).
SANS_SCORES = {"F2"}


@dataclass
class EvenementCotes:
    ligue: str
    dom: str
    ext: str
    debut: datetime
    cotes: list[CoteBrute] = field(default_factory=list)


@dataclass
class Score:
    ligue: str
    dom: str
    ext: str
    debut: datetime
    bd: int
    be: int


def parser_scores(donnees: list[dict], ligue: str) -> list[Score]:
    """Matchs terminés avec leur score ; les matchs en cours ou à venir sont ignorés."""
    scores = []
    for ev in donnees:
        if not ev.get("completed"):
            continue
        buts = {x.get("name"): x.get("score") for x in ev.get("scores") or []}
        try:
            bd, be = int(buts[ev["home_team"]]), int(buts[ev["away_team"]])
        except (KeyError, TypeError, ValueError):
            continue
        scores.append(Score(ligue, ev["home_team"], ev["away_team"], _date(ev["commence_time"]), bd, be))
    return scores


def _date(texte: str) -> datetime:
    return datetime.fromisoformat(texte.replace("Z", "+00:00"))


def parser(donnees: list[dict], ligue: str) -> list[EvenementCotes]:
    evenements = []
    for ev in donnees:
        dom, ext = ev["home_team"], ev["away_team"]
        e = EvenementCotes(ligue, dom, ext, _date(ev["commence_time"]))
        for bk in ev.get("bookmakers", []):
            for marche in bk.get("markets", []):
                maj = _date(marche.get("last_update") or bk.get("last_update") or ev["commence_time"])
                for o in marche.get("outcomes", []):
                    sel = _selection(marche["key"], o, dom, ext)
                    if sel is not None and o.get("price", 0) > 1:
                        e.cotes.append(CoteBrute(bk["key"], sel, float(o["price"]), maj))
        evenements.append(e)
    return evenements


def _selection(marche: str, o: dict, dom: str, ext: str) -> Selection | None:
    nom, point = o.get("name"), o.get("point")
    try:
        if marche == "h2h":
            return Selection("1x2", {dom: "1", ext: "2", "Draw": "X"}[nom])
        if marche == "totals" and point is not None:
            return Selection("total", {"Over": "plus", "Under": "moins"}[nom], float(point))
        if marche == "spreads" and point is not None:
            return Selection("ah", {dom: "1", ext: "2"}[nom], float(point))
        if marche == "btts":
            return Selection("btts", {"Yes": "oui", "No": "non"}[nom])
        if marche == "draw_no_bet":
            return Selection("dnb", {dom: "1", ext: "2"}[nom])
    except (KeyError, ValueError):
        return None
    return None


class ClientOdds:
    def __init__(self, cle: str, client: httpx.Client | None = None):
        self.cle = cle
        self.http = client or httpx.Client(timeout=30)
        self.restant: int | None = None
        self.utilise: int | None = None

    def _get(self, chemin: str, **params) -> list[dict]:
        r = self.http.get(f"{BASE}{chemin}", params={"apiKey": self.cle, **params})
        for entete, attr in (("x-requests-remaining", "restant"), ("x-requests-used", "utilise")):
            if entete in r.headers:
                try:
                    setattr(self, attr, int(float(r.headers[entete])))
                except ValueError:
                    pass
        r.raise_for_status()
        return r.json()

    def sports(self) -> list[dict]:
        return self._get("/sports")

    def cotes(
        self,
        ligue: str,
        marches: str = "h2h,totals,spreads",
        regions: str = "eu",
        bookmakers: str = "",
    ) -> list[EvenementCotes]:
        sport = SPORTS.get(ligue)
        if sport is None:
            return []
        params = {"markets": marches, "oddsFormat": "decimal", "dateFormat": "iso"}
        params.update({"bookmakers": bookmakers} if bookmakers else {"regions": regions})
        return parser(self._get(f"/sports/{sport}/odds", **params), ligue)

    def evenements(self, ligue: str) -> list[tuple[str, str, datetime]]:
        """Matchs à venir (équipes, coup d'envoi). Gratuit : ne consomme aucun crédit."""
        sport = SPORTS.get(ligue)
        if sport is None:
            return []
        return [(e["home_team"], e["away_team"], _date(e["commence_time"]))
                for e in self._get(f"/sports/{sport}/events", dateFormat="iso")]

    def scores(self, ligue: str, jours: int = 3) -> list[Score]:
        """Scores des matchs terminés depuis `jours` jours (1 à 3). Coûte 2 crédits."""
        sport = SPORTS.get(ligue)
        if sport is None or ligue in SANS_SCORES:
            return []
        return parser_scores(self._get(f"/sports/{sport}/scores", daysFrom=max(1, min(jours, 3)),
                                       dateFormat="iso"), ligue)

    @staticmethod
    def credits_par_appel(marches: str, regions: str = "eu", bookmakers: str = "") -> int:
        nb_marches = len([m for m in marches.split(",") if m])
        nb_regions = max(1, -(-len([b for b in bookmakers.split(",") if b]) // 10)) if bookmakers else len(regions.split(","))
        return nb_marches * nb_regions
