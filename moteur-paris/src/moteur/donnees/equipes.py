"""Correspondance des noms d'équipes entre sources (cahier des charges, section 6).

Le nom de référence est celui de football-data, puisque les modèles sont entraînés dessus.
Ordre : alias connus → nom normalisé identique → ressemblance forte et sans ambiguïté.
Une erreur ici crée de faux signaux, donc en cas de doute on renvoie None (et on le signale).
"""

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

MOTS_VIDES = {"fc", "afc", "cf", "sc", "ac", "as", "ssc", "us", "rc", "cd", "ud", "sd", "sv", "vfb",
              "vfl", "tsg", "fk", "sk", "club", "calcio", "de", "the", "1", "1."}

# nom vu ailleurs → nom football-data
ALIAS_BRUTS: dict[str, str] = {
    "Manchester United": "Man United", "Manchester City": "Man City",
    "Nottingham Forest": "Nott'm Forest", "Wolverhampton Wanderers": "Wolves",
    "Sheffield Wednesday": "Sheffield Weds", "Queens Park Rangers": "QPR",
    "West Bromwich Albion": "West Brom", "Brighton and Hove Albion": "Brighton",
    "Tottenham Hotspur": "Tottenham", "Newcastle United": "Newcastle", "Leeds United": "Leeds",
    "Leicester City": "Leicester", "Norwich City": "Norwich", "Stoke City": "Stoke",
    "Hull City": "Hull", "Cardiff City": "Cardiff", "Swansea City": "Swansea",
    "Coventry City": "Coventry", "Preston North End": "Preston", "Blackburn Rovers": "Blackburn",
    "Plymouth Argyle": "Plymouth", "Oxford United": "Oxford", "Derby County": "Derby",
    "Luton Town": "Luton", "Ipswich Town": "Ipswich", "Huddersfield Town": "Huddersfield",
    "Birmingham City": "Birmingham", "Peterborough United": "Peterboro",
    "Bolton Wanderers": "Bolton", "Wycombe Wanderers": "Wycombe", "Charlton Athletic": "Charlton",
    "Rotherham United": "Rotherham", "Cambridge United": "Cambridge", "Exeter City": "Exeter",
    "Lincoln City": "Lincoln", "Shrewsbury Town": "Shrewsbury", "Northampton Town": "Northampton",
    "Stevenage Borough": "Stevenage", "Bristol Rovers": "Bristol Rvs", "Wigan Athletic": "Wigan",
    "Burton Albion": "Burton", "Crawley Town": "Crawley Town", "Mansfield Town": "Mansfield",
    "Doncaster Rovers": "Doncaster", "Tranmere Rovers": "Tranmere", "Forest Green Rovers": "Forest Green",
    "Accrington Stanley": "Accrington", "Harrogate Town": "Harrogate", "Grimsby Town": "Grimsby",
    "Swindon Town": "Swindon", "Colchester United": "Colchester", "Newport County": "Newport County",
    "Milton Keynes Dons": "Milton Keynes Dons", "MK Dons": "Milton Keynes Dons",
    "Bayern Munich": "Bayern Munich", "Borussia Dortmund": "Dortmund",
    "Borussia Monchengladbach": "M'gladbach", "Bayer Leverkusen": "Leverkusen",
    "Eintracht Frankfurt": "Ein Frankfurt", "1. FC Köln": "FC Koln", "FC Cologne": "FC Koln",
    "Hertha Berlin": "Hertha", "Fortuna Düsseldorf": "Fortuna Dusseldorf",
    "Hamburger SV": "Hamburg", "Schalke 04": "Schalke 04", "SC Paderborn": "Paderborn",
    "1. FC Nürnberg": "Nurnberg", "Greuther Fürth": "Greuther Furth", "Karlsruher SC": "Karlsruhe",
    "1. FC Kaiserslautern": "Kaiserslautern", "SV Darmstadt 98": "Darmstadt",
    "Inter Milan": "Inter", "AC Milan": "Milan", "AS Roma": "Roma", "SSC Napoli": "Napoli",
    "Paris Saint Germain": "Paris SG", "Paris Saint-Germain": "Paris SG", "Saint Etienne": "St Etienne",
    "Athletic Bilbao": "Ath Bilbao", "Atletico Madrid": "Ath Madrid", "Real Sociedad": "Sociedad",
    "Celta Vigo": "Celta", "Celta Fortuna": "Celta B", "Celta Vigo B": "Celta B",
    "Real Sociedad B": "Sociedad B", "Sanse": "Sociedad B", "Rayo Vallecano": "Vallecano", "Real Betis": "Betis",
    "Deportivo La Coruna": "La Coruna", "Sporting Gijon": "Sp Gijon", "Real Zaragoza": "Zaragoza",
    "Sporting Lisbon": "Sp Lisbon", "Sporting CP": "Sp Lisbon", "Vitoria Guimaraes": "Guimaraes",
    "SC Braga": "Sp Braga", "FC Porto": "Porto", "PSV Eindhoven": "PSV Eindhoven",
    "AZ Alkmaar": "AZ Alkmaar", "Club Brugge": "Club Brugge", "Standard Liege": "Standard",
    "Olympiacos": "Olympiakos", "Olympiacos Piraeus": "Olympiakos", "PAOK Thessaloniki": "PAOK",
    "Galatasaray": "Galatasaray", "Fenerbahce": "Fenerbahce", "Besiktas JK": "Besiktas",
    "Glasgow Rangers": "Rangers", "Heart of Midlothian": "Hearts", "Hibernian": "Hibernian",
}


def normaliser(nom: str) -> str:
    texte = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    texte = texte.lower().replace("&", " and ").replace("'", "")
    texte = re.sub(r"[^a-z0-9 ]+", " ", texte)
    mots = [m for m in texte.split() if m not in MOTS_VIDES]
    return " ".join(mots) or texte.strip()


class Correspondance:
    def __init__(self, alias_fichier: str | Path | None = None):
        self.alias = {normaliser(k): v for k, v in ALIAS_BRUTS.items()}
        if alias_fichier and Path(alias_fichier).exists():
            # Fichier modifiable à la main : {"nom vu ailleurs": "nom football-data"}
            for k, v in json.loads(Path(alias_fichier).read_text(encoding="utf-8")).items():
                self.alias[normaliser(k)] = v

    def trouver(self, nom: str, candidats: set[str] | list[str]) -> str | None:
        """Nom football-data correspondant à `nom` parmi les équipes du championnat, ou None."""
        candidats = list(candidats)
        if nom in candidats:
            return nom
        par_norme = {normaliser(c): c for c in candidats}
        n = normaliser(nom)
        alias = self.alias.get(n)
        if alias is not None and alias in candidats:
            return alias
        if n in par_norme:
            return par_norme[n]
        notes = []
        for cn, c in par_norme.items():
            note = SequenceMatcher(None, n, cn).ratio()
            if cn and (cn in n.split() or n in cn.split() or set(cn.split()) <= set(n.split())):
                note = max(note, 0.9)
            notes.append((note, c))
        notes.sort(reverse=True)
        if not notes or notes[0][0] < 0.8:
            return None
        if len(notes) > 1 and notes[1][0] > notes[0][0] - 0.08:
            return None  # ambigu : mieux vaut ne rien conclure
        return notes[0][1]
