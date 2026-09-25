from datetime import datetime, timezone

import httpx
import pytest

from moteur.donnees import football_data as fd
from moteur.donnees.cotes import cotes_depuis_ligne, plus_recentes
from moteur.donnees.equipes import Correspondance, normaliser
from moteur.donnees.odds_api import ClientOdds, parser
from moteur.marches import Selection

CSV_RECENT = """Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HY,AY,HC,AC,B365H,B365D,B365A,PSH,PSD,PSA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,B365>2.5,B365<2.5,P>2.5,P<2.5,Max>2.5,Max<2.5,Avg>2.5,Avg<2.5,AHh,B365AHH,B365AHA,PAHH,PAHA,MaxAHH,MaxAHA,AvgAHH,AvgAHA,PSCH,PSCD,PSCA,PC>2.5,PC<2.5,AHCh,PCAHH,PCAHA
E1,09/08/2024,20:00,Leeds,Hull,2,1,H,1,0,H,J Smith,2,3,6,4,1.80,3.60,4.50,1.85,3.70,4.60,1.90,3.80,4.80,1.82,3.60,4.40,1.90,1.95,1.93,1.97,1.98,2.00,1.91,1.92,-0.75,1.95,1.95,1.97,1.93,2.00,2.00,1.94,1.91,1.80,3.80,4.90,1.88,2.02,-0.75,1.93,1.97
E1,10/08/2024,15:00,Norwich,Hull,,,,,,,,,,,,1.0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
"""

CSV_ANCIEN = """Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,B365H,B365D,B365A,BbMxH,BbAvH,BbMxD,BbAvD,BbMxA,BbAvA,BbMx>2.5,BbAv>2.5,BbMx<2.5,BbAv<2.5,BbAHh,BbMxAHH,BbAvAHH,BbMxAHA,BbAvAHA
E1,13/08/05,Leeds,Millwall,2,1,H,1.8,3.3,4.5,1.9,1.82,3.5,3.3,4.8,4.4,2.1,2.0,1.9,1.8,-0.5,2.0,1.95,2.0,1.9
"""


def test_lecture_csv_recent():
    df = fd.lire_csv(CSV_RECENT, "E1", 2024)
    l = df.iloc[0]
    assert (l["dom"], l["ext"], l["bd"], l["be"]) == ("Leeds", "Hull", 2, 1)
    assert l["date"] == datetime(2024, 8, 9, 19, 0, tzinfo=timezone.utc)  # 20:00 à Londres, heure d'été
    assert (l["ref_1"], l["refc_1"], l["moy_plus"], l["ah_ligne"], l["refc_ah2"]) == (1.85, 1.80, 1.91, -0.75, 1.97)
    assert l["cartons"] == 5 and l["corners"] == 10 and l["arbitre"] == "J Smith"
    assert df.iloc[1]["b365_1"] != df.iloc[1]["b365_1"]  # cote 1.0 invalide → vide
    assert df.iloc[1]["bd"] != df.iloc[1]["bd"]  # match pas encore joué


def test_lecture_csv_ancien_format():
    df = fd.lire_csv(CSV_ANCIEN.encode("latin-1"), "E1", 2005)
    l = df.iloc[0]
    assert l["date"].year == 2005 and l["date"].hour == 14  # 15:00 par défaut à Londres
    assert (l["moy_1"], l["max_plus"], l["moy_ah2"], l["ah_ligne"]) == (1.82, 2.1, 1.9, -0.5)
    assert l["ref_1"] != l["ref_1"]  # pas de Pinnacle à l'époque


def test_saisons():
    assert fd.code_saison(2005) == "0506" and fd.code_saison(2099) == "9900"
    assert fd.saison_courante(datetime(2026, 9, 25)) == 2026
    assert fd.saison_courante(datetime(2027, 3, 1)) == 2026


def test_telechargement_et_chargement(tmp_path):
    appels = []

    def repondre(requete: httpx.Request) -> httpx.Response:
        appels.append(str(requete.url))
        if "E2" in requete.url.path:
            return httpx.Response(404)
        return httpx.Response(200, content=CSV_RECENT.encode())

    client = httpx.Client(transport=httpx.MockTransport(repondre))
    progres = []
    erreurs = fd.telecharger(["E1", "E2"], 2024, tmp_path, client, datetime(2025, 9, 1, tzinfo=timezone.utc),
                             pause_s=0, progression=lambda f, t: progres.append((f, t)))
    assert erreurs == [] and len(appels) == 4 and progres[-1] == (4, 4)
    # deuxième passage : seules les saisons en cours sont retéléchargées
    appels.clear()
    fd.telecharger(["E1", "E2"], 2024, tmp_path, client, datetime(2025, 9, 1, tzinfo=timezone.utc), pause_s=0)
    assert len(appels) == 3  # E1 2025 + E2 2024 et 2025 (404, jamais écrits)
    df = fd.charger(tmp_path, ["E1"])
    assert set(df["saison"]) == {2024, 2025} and len(df) == 4
    assert fd.etat_historique(tmp_path)["E1"]["saisons"] == 2


def test_cotes_depuis_ligne():
    ligne = fd.lire_csv(CSV_RECENT, "E1", 2024).iloc[0]
    cotes = cotes_depuis_ligne(ligne, datetime(2024, 8, 1, tzinfo=timezone.utc))
    par_bk = plus_recentes(cotes)
    assert par_bk[("pinnacle", Selection("1x2", "1"))].cote == 1.85
    assert par_bk[("moyenne", Selection("ah", "2", 0.75))].cote == 1.91
    assert ("bet365", Selection("total", "moins", 2.5)) in par_bk


@pytest.mark.parametrize("vu,attendu", [
    ("Manchester United", "Man United"), ("Nottingham Forest", "Nott'm Forest"), ("Leeds United", "Leeds"),
    ("Hull City AFC", "Hull"), ("Sheffield Wednesday", "Sheffield Weds"), ("West Bromwich Albion", "West Brom"),
    ("Paris Saint-Germain", "Paris SG"), ("FC Porto", "Porto"),
])
def test_correspondance_equipes(vu, attendu):
    candidats = {"Man United", "Man City", "Nott'm Forest", "Leeds", "Hull", "Sheffield Weds", "Sheffield United",
                 "West Brom", "Paris SG", "Porto"}
    assert Correspondance().trouver(vu, candidats) == attendu


def test_correspondance_prudente(tmp_path):
    c = Correspondance()
    assert c.trouver("Sheffield", {"Sheffield Weds", "Sheffield United"}) is None  # ambigu
    assert c.trouver("Équipe totalement inconnue", {"Leeds", "Hull"}) is None
    (tmp_path / "alias.json").write_text('{"Les Paons": "Leeds"}', encoding="utf-8")
    assert Correspondance(tmp_path / "alias.json").trouver("Les Paons", {"Leeds", "Hull"}) == "Leeds"
    assert normaliser("1. FC Köln") == "koln"


JSON_API = [{
    "id": "x", "sport_key": "soccer_efl_champ", "commence_time": "2026-09-27T14:00:00Z",
    "home_team": "Leeds United", "away_team": "Hull City",
    "bookmakers": [
        {"key": "pinnacle", "last_update": "2026-09-26T10:00:00Z", "markets": [
            {"key": "h2h", "outcomes": [{"name": "Leeds United", "price": 1.8}, {"name": "Hull City", "price": 4.6},
                                        {"name": "Draw", "price": 3.7}]},
            {"key": "totals", "outcomes": [{"name": "Over", "price": 1.95, "point": 2.5},
                                           {"name": "Under", "price": 1.9, "point": 2.5}]},
            {"key": "spreads", "outcomes": [{"name": "Leeds United", "price": 1.97, "point": -0.75},
                                            {"name": "Hull City", "price": 1.93, "point": 0.75}]}]},
    ],
}]


def test_parser_odds_api():
    ev = parser(JSON_API, "E1")[0]
    assert (ev.dom, ev.ext, ev.debut.hour) == ("Leeds United", "Hull City", 14)
    sels = {c.selection: c.cote for c in ev.cotes}
    assert sels[Selection("1x2", "X")] == 3.7
    assert sels[Selection("total", "plus", 2.5)] == 1.95
    assert sels[Selection("ah", "2", 0.75)] == 1.93


def test_client_odds_lit_les_credits():
    def repondre(requete):
        assert requete.url.params["apiKey"] == "cle" and requete.url.params["regions"] == "eu"
        return httpx.Response(200, json=JSON_API, headers={"x-requests-remaining": "497", "x-requests-used": "3"})

    client = ClientOdds("cle", httpx.Client(transport=httpx.MockTransport(repondre)))
    assert len(client.cotes("E1")) == 1 and client.restant == 497 and client.utilise == 3
    assert client.cotes("XX") == []  # championnat non couvert : aucun appel
    assert ClientOdds.credits_par_appel("h2h,totals,spreads", "eu") == 3
    assert ClientOdds.credits_par_appel("h2h", bookmakers="pinnacle,onexbet") == 1
