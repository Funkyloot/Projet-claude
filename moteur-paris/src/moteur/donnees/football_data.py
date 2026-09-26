"""Historique et matchs à venir depuis football-data.co.uk (cahier des charges, section 6).

Fichiers CSV publics : un par championnat et par saison (résultats + cotes de nombreux
bookmakers, dont Pinnacle), et `fixtures.csv` pour les matchs à venir avec leurs cotes.
Les noms de colonnes ont changé au fil des saisons : on prend la première disponible.
"""

import io
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import httpx
import pandas as pd

log = logging.getLogger(__name__)

URL_SAISON = "https://www.football-data.co.uk/mmz4281/{saison}/{code}.csv"
URL_FIXTURES = "https://www.football-data.co.uk/fixtures.csv"
AGENT = "moteur-paris/0.2 (usage personnel)"

# code : (nom affiché, division supérieure pour les a priori promus / relégués)
LIGUES: dict[str, tuple[str, str | None]] = {
    "E0": ("Premier League", None),
    "E1": ("Championship", "E0"),
    "E2": ("League One", "E1"),
    "E3": ("League Two", "E2"),
    "SC0": ("Premiership écossaise", None),
    "SC1": ("Championship écossais", "SC0"),
    "D1": ("Bundesliga", None),
    "D2": ("2. Bundesliga", "D1"),
    "I1": ("Serie A", None),
    "I2": ("Serie B", "I1"),
    "SP1": ("Liga", None),
    "SP2": ("Segunda División", "SP1"),
    "F1": ("Ligue 1", None),
    "F2": ("Ligue 2", "F1"),
    "N1": ("Eredivisie", None),
    "B1": ("Pro League belge", None),
    "P1": ("Liga Portugal", None),
    "T1": ("Süper Lig", None),
    "G1": ("Super League grecque", None),
}

# Colonne normalisée → colonnes football-data possibles, par ordre de préférence.
# ref = Pinnacle avant match, refc = Pinnacle à la clôture, moy = moyenne du marché,
# max = meilleure cote du marché, b365 = un bookmaker « grand public » isolé.
COLONNES: dict[str, list[str]] = {
    "ref_1": ["PSH"], "ref_x": ["PSD"], "ref_2": ["PSA"],
    "refc_1": ["PSCH"], "refc_x": ["PSCD"], "refc_2": ["PSCA"],
    "moy_1": ["AvgH", "BbAvH"], "moy_x": ["AvgD", "BbAvD"], "moy_2": ["AvgA", "BbAvA"],
    "max_1": ["MaxH", "BbMxH"], "max_x": ["MaxD", "BbMxD"], "max_2": ["MaxA", "BbMxA"],
    "b365_1": ["B365H"], "b365_x": ["B365D"], "b365_2": ["B365A"],
    "ref_plus": ["P>2.5"], "ref_moins": ["P<2.5"],
    "refc_plus": ["PC>2.5"], "refc_moins": ["PC<2.5"],
    "moy_plus": ["Avg>2.5", "BbAv>2.5"], "moy_moins": ["Avg<2.5", "BbAv<2.5"],
    "max_plus": ["Max>2.5", "BbMx>2.5"], "max_moins": ["Max<2.5", "BbMx<2.5"],
    "b365_plus": ["B365>2.5"], "b365_moins": ["B365<2.5"],
    "ah_ligne": ["AHh", "BbAHh"],
    "ref_ah1": ["PAHH"], "ref_ah2": ["PAHA"],
    "moy_ah1": ["AvgAHH", "BbAvAHH"], "moy_ah2": ["AvgAHA", "BbAvAHA"],
    "max_ah1": ["MaxAHH", "BbMxAHH"], "max_ah2": ["MaxAHA", "BbMxAHA"],
    "b365_ah1": ["B365AHH"], "b365_ah2": ["B365AHA"],
    "ahc_ligne": ["AHCh"], "refc_ah1": ["PCAHH"], "refc_ah2": ["PCAHA"],
}
COTES = [c for c in COLONNES if c not in ("ah_ligne", "ahc_ligne")]
PRIX = ("moy", "max", "b365")


def code_saison(annee_debut: int) -> str:
    return f"{annee_debut % 100:02d}{(annee_debut + 1) % 100:02d}"


def saison_courante(date: datetime | None = None) -> int:
    """Année de début de la saison en cours (une saison commence en juillet)."""
    date = date or datetime.now(timezone.utc)
    return date.year if date.month >= 7 else date.year - 1


def _decoder(contenu: bytes) -> str:
    for encodage in ("utf-8-sig", "latin-1"):
        try:
            return contenu.decode(encodage)
        except UnicodeDecodeError:
            continue
    return contenu.decode("utf-8", errors="replace")


def normaliser(brut: pd.DataFrame, ligue: str | None = None, saison: int | None = None) -> pd.DataFrame:
    """Transforme un CSV football-data en tableau aux colonnes stables."""
    brut = brut.dropna(subset=[c for c in ("HomeTeam", "AwayTeam") if c in brut.columns], how="any")
    if "HomeTeam" not in brut.columns or brut.empty:
        return pd.DataFrame()
    jour = pd.to_datetime(brut["Date"].astype(str).str.strip(), dayfirst=True, errors="coerce", format="mixed")
    heure = brut["Time"].astype(str).str.strip() if "Time" in brut.columns else pd.Series("15:00", index=brut.index)
    heure = heure.where(heure.str.match(r"^\d{1,2}:\d{2}$"), "15:00")
    debut = pd.to_datetime(jour.dt.strftime("%Y-%m-%d") + " " + heure, errors="coerce")
    debut = debut.dt.tz_localize("Europe/London", ambiguous="NaT", nonexistent="shift_forward").dt.tz_convert("UTC")

    df = pd.DataFrame(
        {
            "ligue": brut["Div"].astype(str).str.strip() if "Div" in brut.columns else ligue,
            "saison": saison,
            "date": debut,
            "dom": brut["HomeTeam"].astype(str).str.strip(),
            "ext": brut["AwayTeam"].astype(str).str.strip(),
        }
    )
    if ligue is not None:
        df["ligue"] = ligue
    for cible, source in (("bd", "FTHG"), ("be", "FTAG"), ("bd_mt", "HTHG"), ("be_mt", "HTAG")):
        df[cible] = pd.to_numeric(brut[source], errors="coerce") if source in brut.columns else float("nan")
    df["arbitre"] = brut["Referee"].astype(str).str.strip() if "Referee" in brut.columns else None
    for cible, (a, b) in {"cartons": ("HY", "AY"), "corners": ("HC", "AC")}.items():
        if a in brut.columns and b in brut.columns:
            df[cible] = pd.to_numeric(brut[a], errors="coerce") + pd.to_numeric(brut[b], errors="coerce")
        else:
            df[cible] = float("nan")
    for cible, candidats in COLONNES.items():
        source = next((c for c in candidats if c in brut.columns), None)
        valeurs = pd.to_numeric(brut[source], errors="coerce") if source else pd.Series(float("nan"), index=brut.index)
        if cible in COTES:
            valeurs = valeurs.where(valeurs > 1.0)
        df[cible] = valeurs
    return df.dropna(subset=["date"]).reset_index(drop=True)


def lire_csv(source: str | bytes | Path, ligue: str | None = None, saison: int | None = None) -> pd.DataFrame:
    if isinstance(source, Path):
        source = source.read_bytes()
    texte = _decoder(source) if isinstance(source, bytes) else source
    brut = pd.read_csv(io.StringIO(texte), on_bad_lines="skip", low_memory=False)
    brut.columns = [str(c).strip().lstrip("﻿") for c in brut.columns]
    return normaliser(brut, ligue, saison)


def dossier_csv(dossier: str | Path) -> Path:
    return Path(dossier) / "football-data"


def telecharger(
    ligues: list[str],
    depuis: int,
    dossier: str | Path,
    client: httpx.Client | None = None,
    maintenant: datetime | None = None,
    pause_s: float = 0.4,
    progression: Callable[[int, int], None] | None = None,
) -> list[str]:
    """Télécharge les saisons manquantes et rafraîchit la saison en cours. Renvoie les erreurs.

    `progression(fait, total)` est appelée après chaque fichier (pour l'interface).
    """
    base = dossier_csv(dossier)
    courante = saison_courante(maintenant)
    a_faire = []
    for code in ligues:
        for annee in range(depuis, courante + 1):
            chemin = base / code / f"{code_saison(annee)}.csv"
            if annee == courante or not chemin.exists() or chemin.stat().st_size == 0:
                a_faire.append((code, annee, chemin))
    erreurs: list[str] = []
    propre = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": AGENT}, follow_redirects=True)
    try:
        for fait, (code, annee, chemin) in enumerate(a_faire, start=1):
            try:
                r = client.get(URL_SAISON.format(saison=code_saison(annee), code=code))
                if r.status_code != 404:  # 404 : championnat pas encore couvert cette saison-là
                    r.raise_for_status()
                    chemin.parent.mkdir(parents=True, exist_ok=True)
                    chemin.write_bytes(r.content)
            except httpx.HTTPError as e:
                erreurs.append(f"{code} {code_saison(annee)} : {e}")
            if progression:
                progression(fait, len(a_faire))
            if pause_s and fait < len(a_faire):
                time.sleep(pause_s)
    finally:
        if propre:
            client.close()
    return erreurs


def etat_historique(dossier: str | Path) -> dict[str, dict]:
    """Par championnat : nombre de saisons et dernier fichier (pour l'interface)."""
    base = dossier_csv(dossier)
    etat = {}
    if base.exists():
        for rep in sorted(p for p in base.iterdir() if p.is_dir()):
            fichiers = sorted(rep.glob("*.csv"))
            if fichiers:
                etat[rep.name] = {
                    "saisons": len(fichiers),
                    "premiere": fichiers[0].stem, "derniere": fichiers[-1].stem,
                    "maj": datetime.fromtimestamp(max(f.stat().st_mtime for f in fichiers), timezone.utc),
                }
    return etat


def telecharger_fixtures(dossier: str | Path, client: httpx.Client | None = None) -> str | None:
    """Télécharge les matchs à venir. Renvoie un message d'erreur ou None."""
    chemin = dossier_csv(dossier) / "fixtures.csv"
    propre = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": AGENT}, follow_redirects=True)
    try:
        r = client.get(URL_FIXTURES)
        r.raise_for_status()
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_bytes(r.content)
        return None
    except httpx.HTTPError as e:
        return f"fixtures : {e}"
    finally:
        if propre:
            client.close()


def _lire_fichier_en_cache(chemin: Path, code: str, annee: int | None) -> pd.DataFrame:
    """Lecture d'un CSV, mise en cache tant que le fichier ne change pas (lecture ~20 fois plus rapide)."""
    cache = chemin.with_suffix(".pkl")
    if cache.exists() and cache.stat().st_mtime >= chemin.stat().st_mtime:
        try:
            return pd.read_pickle(cache)
        except Exception:
            pass
    df = lire_csv(chemin, code, annee)
    try:
        df.to_pickle(cache)
    except OSError:
        pass
    return df


def charger(dossier: str | Path, ligues: list[str] | None = None) -> pd.DataFrame:
    """Tout l'historique en un tableau trié par date."""
    base = dossier_csv(dossier)
    morceaux = []
    if ligues is None:
        ligues = sorted(p.name for p in base.iterdir() if p.is_dir()) if base.exists() else []
    for code in ligues:
        for chemin in sorted((base / code).glob("*.csv")):
            annee = 2000 + int(chemin.stem[:2]) if chemin.stem[:2].isdigit() else None
            if annee is not None and annee > 2090:
                annee -= 100
            try:
                df = _lire_fichier_en_cache(chemin, code, annee)
            except Exception as e:  # un fichier corrompu ne doit pas tout bloquer
                log.warning("Lecture impossible %s : %s", chemin, e)
                continue
            if not df.empty:
                morceaux.append(df)
    if not morceaux:
        return pd.DataFrame(columns=["ligue", "saison", "date", "dom", "ext", "bd", "be", *COLONNES])
    return pd.concat(morceaux, ignore_index=True).sort_values("date", kind="stable").reset_index(drop=True)


def charger_fixtures(dossier: str | Path) -> pd.DataFrame:
    chemin = dossier_csv(dossier) / "fixtures.csv"
    if not chemin.exists():
        return pd.DataFrame()
    return lire_csv(chemin)
