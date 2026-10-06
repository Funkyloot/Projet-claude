"""Analyse des matchs à venir : sources de cotes → modèles → chasseurs.

Fonctions pures autant que possible : le service (service.py) s'occupe du réseau et du calendrier.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from .chasseurs import (
    Candidat,
    ContexteMatch,
    Filtre,
    Surebet,
    chasseur_incoherences,
    chasseur_sharp,
    chasseur_surebet,
    proba_sharp,
    chasseur_value,
    grille_reference,
    meilleure_option,
)
from .config import Reglages
from .donnees.cotes import MAXIMUM, MOYENNE, CoteBrute, cotes_depuis_ligne, plus_recentes
from .donnees.equipes import Correspondance
from .donnees.football_data import LIGUES
from .donnees.odds_api import EvenementCotes
from .marches import cote_juste, cote_minimale, gain_perte, proba_effective, selections_fiche
from .modeles.dixon_coles import ModeleDC
from .modeles.grille import melanger
from .modeles.ligue import ParamsLigue, ajuster_ligue

log = logging.getLogger(__name__)

FICHIER_PARAMETRES = "parametres.json"


@dataclass
class MatchAVenir:
    ligue: str
    dom: str
    ext: str
    debut: datetime
    cotes: list[CoteBrute] = field(default_factory=list)


@dataclass
class ResultatAnalyse:
    candidats: list[Candidat]
    surebets: list[Surebet]
    nb_matchs: int
    ligues: list[str]
    alertes: list[str]
    modeles: dict[str, ModeleDC]
    apercus: list = field(default_factory=list)


def charger_parametres(dossier: Path) -> dict:
    chemin = Path(dossier) / FICHIER_PARAMETRES
    if not chemin.exists():
        return {}
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def params_ligue(parametres: dict, ligue: str, r: Reglages) -> tuple[ParamsLigue, frozenset[str]]:
    info = parametres.get("ligues", {}).get(ligue)
    if not info:
        return ParamsLigue(poids_modele=r.poids_modele), frozenset()
    return ParamsLigue.depuis_dict(info), frozenset(info.get("marches_valides", []))


def matchs_depuis_fixtures(
    fixtures: pd.DataFrame, ligues: list[str], maintenant: datetime, horizon_h: int, maj: datetime
) -> list[MatchAVenir]:
    if fixtures.empty:
        return []
    fin = maintenant + timedelta(hours=horizon_h)
    f = fixtures[fixtures["ligue"].isin(ligues) & (fixtures["date"] > maintenant) & (fixtures["date"] <= fin)]
    return [
        MatchAVenir(ligne["ligue"], ligne["dom"], ligne["ext"], ligne["date"].to_pydatetime(),
                    cotes_depuis_ligne(ligne, maj))
        for _, ligne in f.iterrows()
    ]


def fusionner_api(
    matchs: list[MatchAVenir],
    evenements: list[EvenementCotes],
    equipes_par_ligue: dict[str, set[str]],
    correspondance: Correspondance,
) -> tuple[list[MatchAVenir], list[str]]:
    """Ajoute les cotes de l'API aux matchs connus (noms football-data) ; renvoie les alertes."""
    alertes = []
    for ev in evenements:
        candidats = equipes_par_ligue.get(ev.ligue, set())
        dom = correspondance.trouver(ev.dom, candidats)
        ext = correspondance.trouver(ev.ext, candidats)
        if dom is None or ext is None:
            inconnu = ev.dom if dom is None else ev.ext
            alertes.append(f"Équipe non reconnue ({ev.ligue}) : « {inconnu} ». Ajoute un alias dans Réglages → Noms d'équipes.")
            continue
        existant = next(
            (m for m in matchs if m.ligue == ev.ligue and m.dom == dom and m.ext == ext
             and abs((m.debut - ev.debut).total_seconds()) < 36 * 3600),
            None,
        )
        if existant is None:
            matchs.append(MatchAVenir(ev.ligue, dom, ext, ev.debut, list(ev.cotes)))
        else:
            existant.cotes.extend(ev.cotes)
            existant.debut = ev.debut  # l'heure de l'API est plus fiable que l'heure britannique du CSV
    return matchs, alertes


def ajuster_modeles(
    hist: pd.DataFrame, matchs: list[MatchAVenir], maintenant: datetime, parametres: dict, r: Reglages
) -> dict[str, ModeleDC]:
    modeles = {}
    date = pd.Timestamp(maintenant)
    for ligue in sorted({m.ligue for m in matchs}):
        h = hist[hist["ligue"] == ligue]
        sup_code = LIGUES.get(ligue, ("", None))[1]
        sup = hist[hist["ligue"] == sup_code] if sup_code else None
        a_predire = {e for m in matchs if m.ligue == ligue for e in (m.dom, m.ext)}
        params, _ = params_ligue(parametres, ligue, r)
        modele = ajuster_ligue(h, date, params, a_predire, sup)
        if modele is not None:
            modeles[ligue] = modele
    return modeles


def analyser(
    matchs: list[MatchAVenir],
    hist: pd.DataFrame,
    r: Reglages,
    maintenant: datetime,
    parametres: dict | None = None,
) -> ResultatAnalyse:
    parametres = parametres if parametres is not None else charger_parametres(r.dossier)
    alertes = []
    modeles = ajuster_modeles(hist, matchs, maintenant, parametres, r)
    for ligue in sorted({m.ligue for m in matchs} - set(modeles)):
        alertes.append(f"{ligue} : pas assez d'historique pour le modèle (télécharger l'historique).")
    candidats: list[Candidat] = []
    surebets: list[Surebet] = []
    apercus = []
    for m in matchs:
        params, familles = params_ligue(parametres, m.ligue, r)
        f = Filtre(
            valeur_min=r.valeur_min, ecart_min_sharp=r.ecart_min_sharp, seuil_suspect=r.seuil_suspect,
            seuil_desaccord=r.seuil_desaccord,
            poids_modele=params.poids_modele, bookmaker_cible=r.bookmaker_cible,
            bookmaker_reference=r.bookmaker_reference, familles_validees=familles,
        )
        modele = modeles.get(m.ligue)
        ctx = ContexteMatch(
            m.ligue, m.dom, m.ext, m.debut,
            modele.grille(m.dom, m.ext) if modele is not None else None,
            plus_recentes(m.cotes),
            quand=maintenant,
        )
        sharp = chasseur_sharp(ctx, f)
        noter_mouvement(sharp, m.cotes)
        couverts = {c.selection for c in sharp}
        # un même pari n'est signalé qu'une fois : le signal « sharp » prime sur celui du modèle
        candidats += sharp + [c for c in chasseur_value(ctx, f) if c.selection not in couverts]
        candidats += chasseur_incoherences(ctx, f)
        apercu = meilleure_option(ctx, f)
        if apercu is not None:
            apercus.append(apercu)
        surebets += chasseur_surebet(ctx, f, exclus=(MOYENNE, MAXIMUM))
    candidats.sort(key=lambda c: (not c.valide, -c.ev))
    apercus.sort(key=lambda a: a.debut)
    return ResultatAnalyse(candidats, surebets, len(matchs), sorted({m.ligue for m in matchs}), alertes, modeles,
                           apercus)


def noter_mouvement(candidats: list[Candidat], cotes: list[CoteBrute]) -> None:
    """Ajoute au signal le mouvement de Pinnacle depuis son premier relevé : c'est quand le
    marché sharp bouge que les bookmakers grand public prennent du retard (RECHERCHE.md)."""
    if not candidats:
        return
    anciennes: dict = {}
    for c in sorted(cotes, key=lambda c: c.maj):
        anciennes.setdefault((c.bookmaker, c.selection), c)
    depart = ContexteMatch("", "", "", datetime.min, None, anciennes)
    for c in candidats:
        avant = proba_sharp(depart, c.selection, age_max=None)
        if avant is None:
            continue
        p0, apres = avant[0], c.p_gain / (c.p_gain + c.p_perte)
        ecart = apres - p0
        if ecart >= 0.005:
            c.note += (f" Ses chances ont monté depuis le premier relevé ({p0:.0%} → {apres:.0%}) mais 1xBet n'a pas "
                       "suivi : 22bet est souvent en retard aussi.")
        elif ecart <= -0.005:
            c.note += f" Ses chances ont un peu baissé depuis le premier relevé ({p0:.0%} → {apres:.0%})."


@dataclass
class LigneFiche:
    libelle: str
    proba: float
    cote_juste: float | None
    cote_min: float | None


def fiche(
    modele: ModeleDC, dom: str, ext: str, grille_ref: np.ndarray | None, poids_modele: float, valeur_min: float
) -> list[LigneFiche]:
    """Prix justes de tous les marchés pour un match : à comparer aux cotes de 22bet."""
    grille = melanger(modele.grille(dom, ext), grille_ref, poids_modele)
    lignes = []
    for sel in selections_fiche():
        W, L = gain_perte(grille, sel)
        cj = cote_juste(W, L)
        lignes.append(LigneFiche(sel.libelle(dom, ext), proba_effective(W, L), cj, cote_minimale(W, L, valeur_min)))
    return lignes


def reference_pour(cotes: list[CoteBrute], r: Reglages) -> np.ndarray | None:
    ctx = ContexteMatch("", "", "", datetime.min, None, plus_recentes(cotes))
    return grille_reference(ctx, Filtre(bookmaker_reference=r.bookmaker_reference))[0]
