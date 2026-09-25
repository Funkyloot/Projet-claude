"""Textes envoyés à l'utilisateur : rapport quotidien, alertes, fiche de match, bilan hebdomadaire.

Aucune IA n'est nécessaire : ce sont des modèles de texte remplis par le programme
(décision « sans API Claude »). Le bilan hebdomadaire est fait pour être collé dans Claude.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from .capital import solde
from .config import Reglages
from .db import Pari, Recommandation
from .donnees.football_data import LIGUES
from .format import argent, cote, pct
from .journal import (
    alertes_depuis,
    debut_du_jour,
    derniers_paris,
    dimensionner,
    mode_actuel,
    recommandations_ouvertes,
    recommandations_suspectes,
    stats_paris,
    stats_signaux,
)
from .marches import Selection

JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
CHASSEURS = {"A": "incohérences", "B": "value", "L": "surebet"}


def quand_local(dt: datetime, fuseau: str) -> str:
    local = dt.astimezone(ZoneInfo(fuseau))
    return f"{JOURS[local.weekday()]} {local:%d/%m %H:%M}"


def nom_ligue(code: str) -> str:
    return LIGUES.get(code, (code,))[0]


def _libelle(reco: Recommandation) -> str:
    return Selection.depuis_cle(reco.selection).libelle(reco.match.domicile, reco.match.exterieur)


def bloc_reco(s: Session, r: Reglages, reco: Recommandation, quand: datetime) -> str:
    mode = mode_actuel(s, r)
    prix = reco.cote_retenue or reco.cote_min
    mise = dimensionner(s, r, mode, reco.p_gain, reco.p_perte, prix, reco.match_id, quand)
    lignes = [
        f"#{reco.id} · {nom_ligue(reco.match.competition)} · {quand_local(reco.match.debut, r.fuseau)}",
        f"  {reco.match.libelle} · {_libelle(reco)}",
    ]
    if reco.cote_vue is not None:
        lignes.append(f"  Cote {reco.bookmaker} {cote(reco.cote_vue)} · prix juste {cote(reco.cote_juste)} · "
                      f"espérance {pct(reco.ev)} · mise {argent(mise)}")
    else:
        lignes.append(f"  Prix juste {cote(reco.cote_juste)} · jouer si 22bet ≥ {cote(reco.cote_min)} · "
                      f"mise {argent(mise)}")
        if reco.cote_indicative:
            lignes.append(f"  (moyenne des bookmakers : {cote(reco.cote_indicative)})")
    if reco.note:
        lignes.append(f"  {reco.note}")
    return "\n".join(lignes)


def alerte(s: Session, r: Reglages, reco: Recommandation, quand: datetime) -> str:
    return (f"Nouveau signal ({CHASSEURS.get(reco.chasseur, reco.chasseur)})\n{bloc_reco(s, r, reco, quand)}\n"
            f"Cote 22bet à vérifier : /cote {reco.id} <cote>. Pari pris : /pari {reco.id} <cote> [mise].")


def _ligne_stats(titre: str, st) -> str:
    if not st.n:
        return f"{titre} : aucun pari réglé"
    texte = f"{titre} : {st.n} pari(s) · {st.gagnes} gagné(s) · {argent(st.profit)} · ROI {pct(st.roi)}"
    if st.clv_moy is not None:
        texte += f" · CLV {pct(st.clv_moy)}"
    return texte


def texte_capital(s: Session, r: Reglages) -> str:
    lignes = [f"Mode : {mode_actuel(s, r).upper()}"]
    for mode in ("simulation", "reel"):
        val = solde(s, mode)
        nom = "Capital simulation" if mode == "simulation" else "Capital réel"
        if val is None:
            lignes.append(f"{nom} : non démarré")
        else:
            lignes.append(f"{nom} : {argent(val)} ({pct(val / r.capital_initial - 1)} depuis le départ)")
    lignes.append(f"Seuil d'arrêt : {argent(r.seuil_arret)} · mise max {r.mise_max_pct:.0%} du capital")
    return "\n".join(lignes)


def rapport_quotidien(s: Session, r: Reglages, quand: datetime, derniere_analyse: dict | None = None,
                      parametres_presents: bool = True) -> str:
    local = quand.astimezone(ZoneInfo(r.fuseau))
    mode = mode_actuel(s, r)
    aujourdhui = debut_du_jour(quand, r.fuseau)
    lignes = [f"Rapport du {JOURS_LONGS[local.weekday()]} {local:%d/%m/%Y} · mode {mode.upper()}", "",
              texte_capital(s, r), ""]
    lignes.append(_ligne_stats("Hier", stats_paris(s, mode, aujourdhui - timedelta(days=1), aujourdhui)))
    lignes.append(_ligne_stats("7 jours", stats_paris(s, mode, aujourdhui - timedelta(days=7))))
    lignes.append(_ligne_stats("30 jours", stats_paris(s, mode, aujourdhui - timedelta(days=30))))
    lignes.append("")

    recos = recommandations_ouvertes(s, quand, valides=True)
    observation = recommandations_ouvertes(s, quand, valides=False)
    if recos:
        lignes.append(f"Paris recommandés ({len(recos)}) :")
        lignes += [bloc_reco(s, r, reco, quand) for reco in recos[:12]]
        if len(recos) > 12:
            lignes.append(f"… et {len(recos) - 12} autre(s) : /jour pour tout voir.")
    else:
        info = derniere_analyse or {}
        n, nl = info.get("nb_matchs", 0), len(info.get("ligues", []))
        raison = (f"{n} match(s) analysé(s) dans {nl} championnat(s), aucune cote au-dessus du prix juste "
                  f"+ {r.valeur_min:.0%} dans un marché validé.") if n else "aucun match à venir dans les sources."
        lignes.append(f"Rien de bon aujourd'hui : {raison}")
    if observation:
        lignes.append(f"En observation : {len(observation)} signal(aux) dans des marchés pas encore validés.")
    suspects = recommandations_suspectes(s, quand)
    if suspects:
        lignes.append(f"Cotes trop belles, risque d'annulation par le bookmaker ({len(suspects)}) :")
        lignes += [f"  #{x.id} {x.match.libelle} · {_libelle(x)} @ {cote(x.cote_retenue)} "
                   f"(juste {cote(x.cote_juste)})" for x in suspects[:5]]
    surebets = (derniere_analyse or {}).get("surebets", [])
    if surebets:
        lignes.append(f"Surebets entre bookmakers ({len(surebets)}, il faut un compte chez chacun) :")
        lignes += [f"  {x}" for x in surebets[:5]]
    if not parametres_presents:
        lignes.append("Backtest pas encore fait : aucun marché n'est validé. Il se lance automatiquement "
                      "(ou `moteur backtest --activer`).")

    alertes = alertes_depuis(s, quand - timedelta(hours=24))
    lignes += ["", "Alertes : " + ("aucune." if not alertes else "")]
    lignes += [f"- {a}" for a in alertes[-8:]]
    return "\n".join(lignes)


def texte_fiche(lignes, dom: str, ext: str, ligue: str, avec_reference: bool, valeur_min: float) -> str:
    source = "modèle + référence Pinnacle" if avec_reference else "modèle seul (pas de cote de référence)"
    texte = [f"Fiche {dom} – {ext} ({nom_ligue(ligue)}) · {source}",
             f"Prix juste · cote minimale pour +{valeur_min:.0%} de value", ""]
    for l in lignes:
        texte.append(f"{l.libelle} : {l.proba:.0%} · juste {cote(l.cote_juste)} · min {cote(l.cote_min)}")
    texte.append("")
    texte.append("Si 22bet affiche au moins la cote « min », le pari a de la valeur selon le moteur.")
    return "\n".join(texte)


def texte_journal(paris: list[Pari], fuseau: str) -> str:
    if not paris:
        return "Aucun pari dans le journal."
    lignes = []
    for p in paris:
        sel = Selection.depuis_cle(p.selection)
        resultat = "en cours" if p.statut == "en_cours" else f"{p.statut.replace('_', ' ')} {argent(p.gain_net or 0)}"
        lignes.append(f"#{p.id} {quand_local(p.match.debut, fuseau)} {p.match.libelle} · "
                      f"{sel.libelle(p.match.domicile, p.match.exterieur)} @ {cote(p.cote_prise)} · "
                      f"{argent(p.mise)} · {resultat}")
    return "\n".join(lignes)


def journal(s: Session, r: Reglages) -> str:
    mode = mode_actuel(s, r)
    return f"Journal ({mode}) :\n" + texte_journal(derniers_paris(s, mode), r.fuseau)


def bilan_hebdo(s: Session, r: Reglages, quand: datetime, parametres: dict) -> str:
    """Résumé compact à coller dans une conversation Claude (abonnement, pas d'API)."""
    debut = quand - timedelta(days=7)
    lignes = [
        f"# Bilan hebdomadaire du moteur de paris ({debut:%d/%m} → {quand:%d/%m/%Y})",
        "",
        "Contexte : moteur Dixon-Coles + Pinnacle, football (2es divisions), 22bet, mises Kelly × "
        f"{r.fraction_kelly} plafonnées à {r.mise_max_pct:.0%}, value min {r.valeur_min:.0%}.",
        "Cahier des charges : moteur-paris/CAHIER_DES_CHARGES.md.",
        "",
        "## Capital",
        texte_capital(s, r),
        "",
        "## Paris de la semaine",
        _ligne_stats("Simulation", stats_paris(s, "simulation", debut)),
        _ligne_stats("Réel", stats_paris(s, "reel", debut)),
        _ligne_stats("Simulation depuis le début", stats_paris(s, "simulation")),
        "",
        "## Signaux réglés (1 unité), par chasseur / championnat / marché",
        "| Chasseur | Ligue | Marché | Validé | N | ROI | CLV |",
        "|---|---|---|---|---|---|---|",
    ]
    for g in stats_signaux(s, debut):
        lignes.append(f"| {g['chasseur']} | {g['ligue']} | {g['famille']} | {'oui' if g['valide'] else 'non'} | "
                      f"{g['n']} | {pct(g['roi'])} | {pct(g['clv'])} |")
    lignes += ["", "## Marchés validés par le dernier backtest"]
    ligues = parametres.get("ligues", {})
    if not ligues:
        lignes.append("Aucun backtest enregistré.")
    for code, info in sorted(ligues.items()):
        lignes.append(f"- {code} : {', '.join(info.get('marches_valides', [])) or 'rien'} "
                      f"(poids modèle {info.get('poids_modele')}, ξ {info.get('xi')})")
    alertes = alertes_depuis(s, debut)
    lignes += ["", f"## Alertes de la semaine ({len(alertes)})"] + [f"- {a}" for a in alertes[-10:]]
    lignes += ["", "Question : au vu de ces chiffres, quels réglages ajuster (championnats, seuils, marchés) ?"]
    return "\n".join(lignes)
