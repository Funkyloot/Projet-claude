"""Journal : recommandations, paris simulés et réels, mises, règlement, CLV, modes.

Applique les règles non négociables du cahier des charges (sections 2, 9 et 14) :
mise plafonnée, exposition par jour et par match, arrêt automatique, deux semaines de
simulation avant l'argent réel, aucun pari enregistré sous la cote minimale.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .calcul import arrondi_naturel, probas_justes
from .capital import depot_initial, enregistrer, solde
from .chasseurs import Candidat
from .config import Reglages
from .db import Etat, Match, Pari, Prediction, Recommandation
from .format import argent, cote as fcote, pct
from .marches import Selection, cote_juste, esperance, fraction_gagnee, gain_perte, kelly_wl
from .modeles.grille import grille_depuis_cotes

STATUTS = {1.0: "gagne", 0.5: "demi_gagne", 0.0: "rembourse", -0.5: "demi_perdu", -1.0: "perdu"}


# --- État persistant -------------------------------------------------------

def lire_etat(s: Session, cle: str, defaut=None):
    ligne = s.get(Etat, cle)
    return json.loads(ligne.valeur) if ligne else defaut


def ecrire_etat(s: Session, cle: str, valeur) -> None:
    ligne = s.get(Etat, cle)
    if ligne:
        ligne.valeur = json.dumps(valeur)
    else:
        s.add(Etat(cle=cle, valeur=json.dumps(valeur)))
    s.commit()


def ajouter_alerte(s: Session, texte: str, quand: datetime) -> None:
    alertes = lire_etat(s, "alertes", [])
    alertes.append([quand.isoformat(), texte])
    ecrire_etat(s, "alertes", alertes[-50:])


def alertes_depuis(s: Session, depuis: datetime) -> list[str]:
    return [t for q, t in lire_etat(s, "alertes", []) if datetime.fromisoformat(q) >= depuis]


def mode_actuel(s: Session, r: Reglages) -> str:
    return lire_etat(s, "mode", r.mode)


def debut_du_jour(quand: datetime, fuseau: str) -> datetime:
    local = quand.astimezone(ZoneInfo(fuseau))
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(quand.tzinfo)


# --- Matchs -----------------------------------------------------------------

def trouver_match(s: Session, ligue: str, dom: str, ext: str, debut: datetime, tolerance_h: int = 36) -> Match | None:
    return s.scalars(
        select(Match).where(
            Match.competition == ligue, Match.domicile == dom, Match.exterieur == ext,
            Match.debut.between(debut - timedelta(hours=tolerance_h), debut + timedelta(hours=tolerance_h)),
        )
    ).first()


def trouver_ou_creer_match(s: Session, ligue: str, dom: str, ext: str, debut: datetime) -> Match:
    m = trouver_match(s, ligue, dom, ext, debut)
    if m is None:
        m = Match(competition=ligue, domicile=dom, exterieur=ext, debut=debut)
        s.add(m)
        s.flush()
    elif m.debut != debut:
        m.debut = debut
    return m


# --- Mises ------------------------------------------------------------------

def _somme(s: Session, *conditions) -> float:
    return float(s.scalar(select(func.coalesce(func.sum(Pari.mise), 0.0)).where(*conditions)) or 0.0)


def capital(s: Session, r: Reglages, mode: str) -> float:
    actuel = solde(s, mode)
    return actuel if actuel is not None else depot_initial(s, mode, r.capital_initial)


def dimensionner(
    s: Session, r: Reglages, mode: str, W: float, L: float, cote: float, match_id: int | None, quand: datetime
) -> float:
    """Kelly fractionné, plafonné par pari, par jour, par match et par l'argent disponible."""
    cap = capital(s, mode=mode, r=r)
    en_cours = _somme(s, Pari.mode == mode, Pari.statut == "en_cours")
    jour = _somme(s, Pari.mode == mode, Pari.cree_le >= debut_du_jour(quand, r.fuseau))
    sur_match = _somme(s, Pari.mode == mode, Pari.match_id == match_id, Pari.statut == "en_cours") if match_id else 0.0
    montant = min(
        cap * kelly_wl(W, L, cote) * r.fraction_kelly,
        cap * r.mise_max_pct,
        cap * r.exposition_jour_pct - jour,
        cap * r.exposition_match_pct - sur_match,
        cap - en_cours,
    )
    return arrondi_naturel(max(0.0, montant))


# --- Recommandations --------------------------------------------------------

def enregistrer_candidats(s: Session, r: Reglages, candidats: list[Candidat], quand: datetime) -> list[Recommandation]:
    """Enregistre les signaux ; renvoie les nouveaux signaux validés à envoyer en alerte.

    En plus, chaque nouveau signal validé devient un pari simulé : c'est ce qui alimente
    les deux semaines de simulation exigées avant l'argent réel.
    """
    nouvelles = []
    for c in candidats:
        if c.debut <= quand:
            continue
        m = trouver_ou_creer_match(s, c.ligue, c.dom, c.ext, c.debut)
        existante = s.scalars(
            select(Recommandation).where(
                Recommandation.match_id == m.id, Recommandation.chasseur == c.chasseur,
                Recommandation.selection == c.selection.cle, Recommandation.fraction.is_(None),
            )
        ).first()
        champs = dict(
            p_gain=c.p_gain, p_perte=c.p_perte, cote_juste=c.cote_juste, cote_min=c.cote_min,
            cote_vue=c.cote_vue, bookmaker=c.bookmaker, cote_indicative=c.cote_indicative, ev=c.ev,
            valide=c.valide, suspect=c.suspect, note=c.note, maj_le=quand,
        )
        if existante is not None:
            for k, v in champs.items():
                setattr(existante, k, v)
            continue
        reco = Recommandation(match_id=m.id, chasseur=c.chasseur, selection=c.selection.cle, cree_le=quand, **champs)
        s.add(reco)
        s.flush()
        if c.valide and not c.suspect:
            nouvelles.append(reco)
            prix = c.cote_retenue
            if prix is not None and prix >= c.cote_min:
                mise = dimensionner(s, r, "simulation", c.p_gain, c.p_perte, prix, m.id, quand)
                if mise >= 0.1:
                    s.add(Pari(
                        mode="simulation", recommandation_id=reco.id, match_id=m.id, selection=reco.selection,
                        cote_prise=prix, source_cote=c.bookmaker or "moyenne (indicative)",
                        p_gain=c.p_gain, p_perte=c.p_perte, chasseur=c.chasseur, mise=mise, cree_le=quand,
                    ))
    s.commit()
    return nouvelles


def enregistrer_predictions(s: Session, apercus: list, quand: datetime) -> int:
    """Une prédiction par match, mise à jour jusqu'au coup d'envoi, figée ensuite."""
    n = 0
    for a in apercus:
        if a.selection is None or a.debut <= quand:
            continue
        m = trouver_ou_creer_match(s, a.ligue, a.dom, a.ext, a.debut)
        p = s.scalars(select(Prediction).where(Prediction.match_id == m.id)).first()
        if p is None:
            p = Prediction(match_id=m.id, cree_le=quand)
            s.add(p)
        elif p.fraction is not None:
            continue
        p.selection, p.cote, p.source = a.selection.cle, a.cote, a.source
        p.cote_juste, p.cote_min, p.ev, p.statut, p.maj_le = a.cote_juste, a.cote_min, a.ev, a.statut, quand
        n += 1
    s.commit()
    return n


def predictions(s: Session, depuis: datetime) -> list[Prediction]:
    return list(s.scalars(select(Prediction).join(Match).where(Match.debut >= depuis)
                          .order_by(Match.debut.desc(), Prediction.id)))


def bilan_predictions(liste: list[Prediction]) -> dict:
    """Probabilité annoncée contre fréquence réelle, et ce qu'aurait donné 1 $ par prédiction."""
    reglees = [p for p in liste if p.fraction is not None]
    decisives = [p for p in reglees if p.fraction != 0]
    gagnees = [p for p in decisives if p.fraction > 0]
    clvs = [p.clv for p in reglees if p.clv is not None]
    return {
        "n": len(liste), "reglees": len(reglees), "en_attente": len(liste) - len(reglees),
        "gagnees": len(gagnees), "perdues": len(decisives) - len(gagnees),
        "annoncee": sum(1 / p.cote_juste for p in decisives) / len(decisives) if decisives else None,
        "reelle": len(gagnees) / len(decisives) if decisives else None,
        "roi": sum(p.fraction * (p.cote - 1) if p.fraction > 0 else p.fraction for p in reglees) / len(reglees)
        if reglees else None,
        "clv": sum(clvs) / len(clvs) if clvs else None,
    }


def recommandations_ouvertes(s: Session, quand: datetime, valides: bool = True) -> list[Recommandation]:
    return list(s.scalars(
        select(Recommandation).join(Match).where(
            Recommandation.valide.is_(valides), Recommandation.suspect.is_(False),
            Recommandation.fraction.is_(None), Match.debut > quand,
        ).order_by(Match.debut, Recommandation.id)
    ))


def recommandations_suspectes(s: Session, quand: datetime) -> list[Recommandation]:
    return list(s.scalars(
        select(Recommandation).join(Match).where(
            Recommandation.suspect.is_(True), Recommandation.fraction.is_(None), Match.debut > quand,
        ).order_by(Match.debut, Recommandation.id)
    ))


def evaluer_cote(s: Session, r: Reglages, reco_id: int, cote: float, quand: datetime) -> str:
    """Réponse à « 22bet affiche telle cote : je joue ? »."""
    reco = s.get(Recommandation, reco_id)
    if reco is None:
        return f"Recommandation #{reco_id} introuvable."
    ev = esperance(reco.p_gain, reco.p_perte, cote)
    sel = Selection.depuis_cle(reco.selection)
    entete = f"#{reco.id} {reco.match.libelle} · {sel.libelle(reco.match.domicile, reco.match.exterieur)}"
    if cote < reco.cote_min:
        return f"{entete}\nCote {fcote(cote)} < minimum {fcote(reco.cote_min)} (espérance {pct(ev)}). Ne pas jouer."
    mode = mode_actuel(s, r)
    mise = dimensionner(s, r, mode, reco.p_gain, reco.p_perte, cote, reco.match_id, quand)
    texte = (f"{entete}\nCote {fcote(cote)} ≥ minimum {fcote(reco.cote_min)} · espérance {pct(ev)}\n"
             f"Mise conseillée ({mode}) : {argent(mise)}")
    if ev > r.seuil_suspect:
        texte += "\nAttention : cote trop belle, probable erreur que le bookmaker peut annuler."
    return texte


def confirmer_pari(
    s: Session, r: Reglages, reco_id: int, cote: float, mise: float | None, quand: datetime
) -> tuple[Pari | None, str]:
    """Enregistre un pari réel pris sur 22bet. Refuse tout ce qui enfreint les règles."""
    reco = s.get(Recommandation, reco_id)
    if reco is None:
        return None, f"Recommandation #{reco_id} introuvable."
    if mode_actuel(s, r) != "reel":
        return None, "Mode simulation : aucun pari réel n'est enregistré. /reel quand les conditions sont remplies."
    if reco.match.debut <= quand:
        return None, "Le match a commencé : pari non enregistré."
    if cote < reco.cote_min:
        return None, f"Cote {fcote(cote)} sous le minimum {fcote(reco.cote_min)} : pas de value, pari non enregistré."
    conseil = dimensionner(s, r, "reel", reco.p_gain, reco.p_perte, cote, reco.match_id, quand)
    note = ""
    if mise is None:
        mise = conseil
    elif mise > conseil:
        note = f" (ramenée de {argent(mise)} aux plafonds)"
        mise = conseil
    if mise < 0.1:
        return None, "Plafonds atteints (par pari, par jour ou par match) : pari non enregistré."
    pari = Pari(
        mode="reel", recommandation_id=reco.id, match_id=reco.match_id, selection=reco.selection,
        cote_prise=cote, source_cote="22bet (confirmé)", p_gain=reco.p_gain, p_perte=reco.p_perte,
        chasseur=reco.chasseur, mise=mise, cree_le=quand,
    )
    s.add(pari)
    s.commit()
    return pari, f"Pari #{pari.id} enregistré : {argent(mise)} à {fcote(cote)}{note}."


# --- Règlement ----------------------------------------------------------------

def cote_cloture_juste(ligne: pd.Series | None, sel: Selection) -> float | None:
    """Prix juste à la clôture (référence Pinnacle ou Betfair, sans marge), pour mesurer la CLV."""
    if ligne is None:
        return None

    def val(c):
        v = ligne.get(c)
        return float(v) if v is not None and pd.notna(v) and float(v) > 1 else None

    c1x2 = [val("refc_1"), val("refc_x"), val("refc_2")]
    ctot = [val("refc_plus"), val("refc_moins")]
    if sel.marche == "1x2" and all(c1x2):
        return 1 / probas_justes(c1x2, "puissance")["1X2".index(sel.issue)]
    if sel.marche == "total" and sel.ligne == 2.5 and all(ctot):
        return 1 / probas_justes(ctot, "puissance")[0 if sel.issue == "plus" else 1]
    ahc = ligne.get("ahc_ligne")
    if sel.marche == "ah" and ahc is not None and pd.notna(ahc):
        c_ah = [val("refc_ah1"), val("refc_ah2")]
        ligne_sel = float(ahc) if sel.issue == "1" else -float(ahc)
        if all(c_ah) and abs(ligne_sel - sel.ligne) < 1e-9:
            return 1 / probas_justes(c_ah, "puissance")[0 if sel.issue == "1" else 1]
    if all(c1x2) or all(ctot):
        g = grille_depuis_cotes(tuple(c1x2) if all(c1x2) else None, tuple(ctot) if all(ctot) else None)
        return cote_juste(*gain_perte(g, sel)) if g is not None else None
    return None


def _regler_match(s: Session, m: Match, ligne: pd.Series | None, quand: datetime) -> list[Pari]:
    regles = []
    for reco in s.scalars(select(Recommandation).where(Recommandation.match_id == m.id,
                                                       Recommandation.fraction.is_(None))):
        sel = Selection.depuis_cle(reco.selection)
        reco.fraction = fraction_gagnee(sel, m.buts_domicile, m.buts_exterieur)
        cc = cote_cloture_juste(ligne, sel)
        if cc and reco.cote_retenue:
            reco.clv = reco.cote_retenue / cc - 1
    for pred in s.scalars(select(Prediction).where(Prediction.match_id == m.id, Prediction.fraction.is_(None))):
        sel = Selection.depuis_cle(pred.selection)
        pred.fraction = fraction_gagnee(sel, m.buts_domicile, m.buts_exterieur)
        cc = cote_cloture_juste(ligne, sel)
        if cc:
            pred.clv = pred.cote / cc - 1
    for p in s.scalars(select(Pari).where(Pari.match_id == m.id, Pari.statut == "en_cours")):
        sel = Selection.depuis_cle(p.selection)
        g = fraction_gagnee(sel, m.buts_domicile, m.buts_exterieur)
        p.gain_net = round(p.mise * g * (p.cote_prise - 1) if g > 0 else p.mise * g, 2)
        p.statut = STATUTS[g]
        p.regle_le = quand
        cc = cote_cloture_juste(ligne, sel)
        if cc:
            p.cote_cloture_juste = cc
            p.clv = p.cote_prise / cc - 1
        s.flush()
        enregistrer(s, p.mode, p.gain_net, f"pari #{p.id} {p.statut}")
        regles.append(p)
    s.commit()
    return regles


def matchs_a_regler(s: Session, quand: datetime) -> list[Match]:
    """Matchs terminés (début il y a plus de 2 h) sans score, qui ont un pari ou un signal ouvert."""
    ouverts = select(Pari.match_id).where(Pari.statut == "en_cours").union(
        select(Recommandation.match_id).where(Recommandation.fraction.is_(None)),
        select(Prediction.match_id).where(Prediction.fraction.is_(None)))
    return list(s.scalars(select(Match).where(
        Match.id.in_(ouverts), Match.buts_domicile.is_(None), Match.debut < quand - timedelta(hours=2))))


def regler_depuis_resultats(s: Session, resultats: pd.DataFrame, quand: datetime) -> list[Pari]:
    regles = []
    joues = resultats[resultats["bd"].notna() & resultats["be"].notna()] if not resultats.empty else resultats
    for m in matchs_a_regler(s, quand):
        cand = joues[(joues["ligue"] == m.competition) & (joues["dom"] == m.domicile) & (joues["ext"] == m.exterieur)]
        if cand.empty:
            continue
        ecart = (cand["date"] - pd.Timestamp(m.debut)).abs()
        if ecart.min() > pd.Timedelta(hours=36):
            continue
        ligne = cand.loc[ecart.idxmin()]
        m.buts_domicile, m.buts_exterieur = int(ligne["bd"]), int(ligne["be"])
        regles += _regler_match(s, m, ligne, quand)
    return regles


def regler_manuellement(s: Session, match_id: int, bd: int, be: int, quand: datetime) -> tuple[list[Pari], str]:
    m = s.get(Match, match_id)
    if m is None:
        return [], f"Match #{match_id} introuvable."
    if m.buts_domicile is not None:
        return [], f"Match #{match_id} déjà réglé ({m.score})."
    m.buts_domicile, m.buts_exterieur = bd, be
    regles = _regler_match(s, m, None, quand)
    return regles, f"{m.libelle} {bd}-{be} : {len(regles)} pari(s) réglé(s)."


# --- Statistiques -------------------------------------------------------------

@dataclass
class Stats:
    n: int = 0
    gagnes: int = 0
    mise: float = 0.0
    profit: float = 0.0
    clv_moy: float | None = None
    n_clv: int = 0

    @property
    def roi(self) -> float | None:
        return self.profit / self.mise if self.mise else None


def stats_paris(s: Session, mode: str, depuis: datetime | None = None, jusqua: datetime | None = None) -> Stats:
    q = select(Pari).where(Pari.mode == mode, Pari.statut != "en_cours")
    if depuis:
        q = q.where(Pari.regle_le >= depuis)
    if jusqua:
        q = q.where(Pari.regle_le < jusqua)
    paris = list(s.scalars(q))
    clvs = [p.clv for p in paris if p.clv is not None]
    return Stats(
        n=len(paris), gagnes=sum(p.statut in ("gagne", "demi_gagne") for p in paris),
        mise=sum(p.mise for p in paris), profit=sum(p.gain_net or 0 for p in paris),
        clv_moy=sum(clvs) / len(clvs) if clvs else None, n_clv=len(clvs),
    )


def stats_signaux(s: Session, depuis: datetime) -> list[dict]:
    """Performance à 1 unité par chasseur, championnat et famille de marché (bilan hebdomadaire)."""
    groupes: dict[tuple, dict] = {}
    for reco in s.scalars(select(Recommandation).where(Recommandation.fraction.is_not(None),
                                                       Recommandation.maj_le >= depuis)):
        prix = reco.cote_retenue
        if prix is None:
            continue
        cle = (reco.chasseur, reco.match.competition, Selection.depuis_cle(reco.selection).famille, reco.valide)
        g = groupes.setdefault(cle, {"n": 0, "profit": 0.0, "clv": []})
        g["n"] += 1
        g["profit"] += reco.fraction * (prix - 1) if reco.fraction > 0 else reco.fraction
        if reco.clv is not None:
            g["clv"].append(reco.clv)
    return [
        {"chasseur": k[0], "ligue": k[1], "famille": k[2], "valide": k[3], "n": v["n"],
         "roi": v["profit"] / v["n"], "clv": sum(v["clv"]) / len(v["clv"]) if v["clv"] else None}
        for k, v in sorted(groupes.items())
    ]


def derniers_paris(s: Session, mode: str, n: int = 10) -> list[Pari]:
    return list(s.scalars(select(Pari).where(Pari.mode == mode).order_by(Pari.id.desc()).limit(n)))


# --- Modes et arrêt automatique -------------------------------------------------

def conditions_reel(s: Session, r: Reglages, quand: datetime) -> list[str]:
    """Raisons qui empêchent de passer en argent réel (vide = autorisé)."""
    raisons = []
    premier = s.scalar(select(func.min(Pari.cree_le)).where(Pari.mode == "simulation"))
    if premier is None:
        raisons.append("aucun pari simulé pour l'instant")
    elif quand - premier < timedelta(days=r.jours_simulation_min):
        jours = (quand - premier).days
        raisons.append(f"{jours} jour(s) de simulation sur {r.jours_simulation_min} exigés")
    st = stats_paris(s, "simulation")
    if st.n and st.profit < 0:
        raisons.append(f"profit simulé négatif ({argent(st.profit)})")
    if st.n_clv >= 10 and (st.clv_moy or 0) < 0:
        raisons.append(f"CLV moyenne négative ({pct(st.clv_moy)})")
    reel = solde(s, "reel")
    if reel is not None and reel < r.seuil_arret:
        raisons.append(f"capital réel sous le seuil d'arrêt ({argent(reel)})")
    return raisons


def changer_mode(s: Session, r: Reglages, mode: str, quand: datetime) -> str:
    if mode == "simulation":
        ecrire_etat(s, "mode", "simulation")
        return "Mode simulation activé : aucun pari réel ne sera proposé."
    raisons = conditions_reel(s, r, quand)
    if raisons:
        return "Passage en réel refusé :\n- " + "\n- ".join(raisons)
    capital(s, r, "reel")
    ecrire_etat(s, "mode", "reel")
    return f"Mode réel activé. Capital réel : {argent(solde(s, 'reel'))}. Seuil d'arrêt : {argent(r.seuil_arret)}."


def controle_arret(s: Session, r: Reglages) -> str | None:
    """Arrêt automatique : sous le seuil, retour forcé en simulation."""
    reel = solde(s, "reel")
    if mode_actuel(s, r) == "reel" and reel is not None and reel < r.seuil_arret:
        ecrire_etat(s, "mode", "simulation")
        return (f"ARRÊT AUTOMATIQUE : capital réel {argent(reel)} sous le seuil de {argent(r.seuil_arret)}. "
                "Retour en simulation.")
    return None
