"""Application web locale : tout se règle ici, sans toucher au code ni au fichier .env.

Pages : tableau de bord, journal, fiche de match, outils de calcul, données (historique,
backtest), réglages (Telegram, API de cotes, championnats, capital, calendrier, alias),
bilan hebdomadaire. Protégée par un mot de passe créé à la première visite.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

from fastapi import FastAPI, Form, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError

from .. import __version__
from ..analyse import charger_parametres
from ..calcul import analyser_value, marge, mise_conseillee, surebet
from ..capital import solde
from ..config import SECRETS
from ..db import Pari
from ..donnees.football_data import LIGUES, etat_historique
from ..donnees.odds_api import SPORTS, ClientOdds
from ..format import argent, cote, pct
from ..journal import (
    alertes_depuis,
    changer_mode,
    conditions_reel,
    confirmer_pari,
    debut_du_jour,
    dimensionner,
    evaluer_cote,
    lire_etat,
    matchs_a_regler,
    bilan_predictions,
    predictions,
    mode_actuel,
    recommandations_ouvertes,
    recommandations_suspectes,
    regler_manuellement,
    stats_paris,
)
from ..marches import Selection
from ..promo import cashback, cote_boostee, pari_gratuit
from ..rapport import bilan_hebdo, nom_ligue, quand_local, rapport_quotidien
from ..taches import ACTIONS, demander, effectifs, enregistrer_reglages, etat_taches, surcharges
from ..telegram import Telegram
from . import securite

if TYPE_CHECKING:
    from ..service import Service

GABARITS = Path(__file__).parent / "gabarits"
STATIQUE = Path(__file__).parent / "statique"
LIBRES = {"/connexion", "/sante", "/manifest.webmanifest"}  # accessibles sans être connecté


@dataclass(frozen=True)
class Champ:
    nom: str
    libelle: str
    genre: str  # texte | secret | entier | decimal | pct | argent | heure | choix
    aide: str = ""
    choix: tuple[str, ...] = ()


SECTIONS: dict[str, tuple[str, list[Champ]]] = {
    "telegram": ("Telegram", [
        Champ("telegram_token", "Token du bot", "secret",
              "Créez un bot avec @BotFather sur Telegram, puis collez ici le token qu'il vous donne."),
    ]),
    "cotes": ("API de cotes (optionnel)", [
        Champ("odds_api_key", "Clé The Odds API", "secret",
              "Compte gratuit sur the-odds-api.com. Sans clé, le moteur utilise les cotes de football-data."),
        Champ("bookmaker_cible", "Bookmaker cible", "texte",
              "Clé du bookmaker où vous misez (22bet s'il est couvert). « Vérifier l'API » liste les clés possibles."),
        Champ("bookmaker_reference", "Bookmaker de référence", "texte", "Bookmaker « sharp » servant de prix juste."),
        Champ("odds_api_credits_jour", "Crédits par jour", "entier",
              "Budget quotidien de requêtes (offre gratuite : 500 par mois, soit environ 16 par jour)."),
        Champ("odds_api_credits_scores", "Dont crédits réservés aux scores", "entier",
              "Pour connaître les résultats quelques heures après les matchs (2 crédits par championnat)."),
        Champ("odds_api_regions", "Régions", "texte", "eu, uk, us… séparées par des virgules."),
        Champ("odds_api_marches", "Marchés", "texte", "h2h,totals,spreads"),
    ]),
    "mises": ("Capital et mises", [
        Champ("capital_initial", "Capital de départ", "argent"),
        Champ("seuil_arret", "Seuil d'arrêt automatique", "argent", "Sous ce capital réel, retour en simulation."),
        Champ("mise_max_pct", "Mise maximale par pari", "pct", "5 % au plus."),
        Champ("fraction_kelly", "Fraction de Kelly", "pct", "25 % conseillé."),
        Champ("exposition_jour_pct", "Mises maximales par jour", "pct"),
        Champ("exposition_match_pct", "Mises maximales par match", "pct"),
        Champ("valeur_min", "Value minimale", "pct", "Espérance minimale pour recommander un pari."),
        Champ("seuil_suspect", "Seuil « trop belle »", "pct", "Au-delà : risque d'annulation, pas recommandé."),
        Champ("seuil_desaccord", "Désaccord max modèle / référence", "pct"),
        Champ("jours_simulation_min", "Jours de simulation avant le réel", "entier"),
    ]),
    "modele": ("Modèle et données", [
        Champ("saison_depuis", "Historique depuis l'année", "entier", "2005 = 20 ans de données."),
        Champ("horizon_h", "Horizon d'analyse (heures)", "entier", "Matchs pris en compte à l'avance."),
        Champ("poids_modele", "Poids du modèle par défaut", "pct",
              "Utilisé tant que le backtest n'a pas choisi le poids de chaque championnat."),
        Champ("prix_backtest", "Cotes supposées au backtest", "choix", "", ("moy", "b365", "max")),
    ]),
    "calendrier": ("Calendrier", [
        Champ("fuseau", "Fuseau horaire", "texte", "Ex. Europe/Paris, Africa/Abidjan, Africa/Douala, America/Montreal."),
        Champ("heure_donnees", "Heure de mise à jour des données", "heure"),
        Champ("heure_rapport", "Heure du rapport quotidien", "heure"),
        Champ("intervalle_analyse_h", "Analyse toutes les (heures)", "entier"),
    ]),
}


def _valeur_affichee(champ: Champ, valeur) -> str:
    if champ.genre == "secret":
        return ""
    if champ.genre == "pct":
        return f"{valeur * 100:g}".replace(".", ",")
    if champ.genre in ("decimal", "argent"):
        return f"{valeur:g}".replace(".", ",")
    return str(valeur)


def _valeur_saisie(champ: Champ, texte: str):
    texte = texte.strip()
    if champ.genre == "pct":
        return float(texte.replace(",", ".").replace("%", "")) / 100
    if champ.genre in ("decimal", "argent"):
        return float(texte.replace(",", ".").replace("$", ""))
    if champ.genre in ("entier", "heure"):
        return int(texte)
    return texte


def _masque(valeur: str) -> str:
    return "non renseigné" if not valeur else f"enregistré (…{valeur[-4:]})"


def _erreurs(e: ValidationError) -> str:
    return " · ".join(f"{'.'.join(str(x) for x in err['loc']) or 'réglages'} : {err['msg']}" for err in e.errors())


def creer_app(service: Service) -> FastAPI:
    app = FastAPI(title="Moteur de paris", docs_url=None, redoc_url=None, openapi_url=None)
    gabarits = Jinja2Templates(directory=str(GABARITS))
    env = gabarits.env
    env.filters.update(argent=argent, cote=cote, pct=pct, ligue=nom_ligue,
                       local=lambda dt: quand_local(dt, service.r.fuseau) if dt else "—")

    def reglages_actuels():
        with service.sessions() as s:
            return effectifs(s, service.base)

    def page(request: Request, nom: str, **contexte) -> HTMLResponse:
        contexte.update(msg=request.query_params.get("msg"), erreur=request.query_params.get("erreur"),
                        page=nom, r=reglages_actuels(), maintenant=service.horloge(), version=__version__)
        return gabarits.TemplateResponse(request, f"{nom}.html", contexte)

    def retour(url: str, msg: str | None = None, erreur: str | None = None) -> RedirectResponse:
        suffixe = f"?msg={quote(msg)}" if msg else f"?erreur={quote(erreur)}" if erreur else ""
        return RedirectResponse(url + suffixe, status_code=303)

    @app.middleware("http")
    async def garde(request: Request, call_next):
        if request.url.path in LIBRES or request.url.path.startswith("/statique/"):
            return await call_next(request)
        with service.sessions() as s:
            ok = securite.session_valide(s, request.cookies.get(securite.COOKIE))
        if not ok:
            return RedirectResponse("/connexion", status_code=303)
        return await call_next(request)

    # --- connexion ------------------------------------------------------------------

    @app.get("/sante")
    def sante():
        return {"ok": True}

    @app.get("/manifest.webmanifest")
    def manifeste():
        # Permet « Sur l'écran d'accueil » sur iPhone / Android : icône et plein écran comme une app
        return JSONResponse({
            "name": "Moteur de paris", "short_name": "Paris", "start_url": "/", "display": "standalone",
            "background_color": "#F4F6F3", "theme_color": "#1E6B47", "lang": "fr",
            "icons": [{"src": f"/statique/icone-{t}.png", "sizes": f"{t}x{t}", "type": "image/png"} for t in (192, 512)],
        }, media_type="application/manifest+json")

    @app.get("/statique/{nom}")
    def statique(nom: str):
        chemin = (STATIQUE / nom).resolve()
        if chemin.parent != STATIQUE.resolve() or not chemin.is_file():
            return JSONResponse({"erreur": "introuvable"}, status_code=404)
        return FileResponse(chemin, headers={"Cache-Control": "public, max-age=86400"})

    @app.get("/connexion", response_class=HTMLResponse)
    def connexion(request: Request):
        with service.sessions() as s:
            premiere = not securite.mdp_defini(s)
        return page(request, "connexion", premiere=premiere)

    @app.post("/connexion")
    def se_connecter(mdp: str = Form(...), confirmation: str = Form(""), fuseau: str = Form("")):
        with service.sessions() as s:
            if not securite.mdp_defini(s):
                if mdp != confirmation:
                    return retour("/connexion", erreur="Les deux mots de passe sont différents.")
                try:
                    securite.definir_mdp(s, mdp)
                except ValueError as e:
                    return retour("/connexion", erreur=f"Mot de passe trop court : {e}.")
            elif not securite.mdp_correct(s, mdp):
                time.sleep(1)  # freine les essais au hasard
                return retour("/connexion", erreur="Mot de passe incorrect.")
            jeton = securite.ouvrir_session(s)
            if fuseau and service.base.fuseau == "UTC" and "fuseau" not in surcharges(s):
                try:  # fuseau jamais choisi : on prend celui de l'appareil qui se connecte
                    enregistrer_reglages(s, {"fuseau": fuseau}, service.base)
                except ValidationError:
                    pass
        reponse = RedirectResponse("/", status_code=303)
        reponse.set_cookie(securite.COOKIE, jeton, max_age=int(securite.DUREE_SESSION.total_seconds()),
                           httponly=True, samesite="strict")
        return reponse

    @app.post("/deconnexion")
    def deconnexion(request: Request):
        with service.sessions() as s:
            securite.fermer_session(s, request.cookies.get(securite.COOKIE))
        reponse = RedirectResponse("/connexion", status_code=303)
        reponse.delete_cookie(securite.COOKIE)
        return reponse

    # --- tableau de bord ---------------------------------------------------------------

    @app.get("/", response_class=HTMLResponse)
    def tableau(request: Request):
        r = reglages_actuels()
        quand = service.horloge()
        with service.sessions() as s:
            mode = mode_actuel(s, r)
            jour = debut_du_jour(quand, r.fuseau)
            recos = []
            for reco in recommandations_ouvertes(s, quand, valides=True):
                prix = reco.cote_retenue or reco.cote_min
                recos.append({
                    "reco": reco, "libelle": Selection.depuis_cle(reco.selection).libelle(
                        reco.match.domicile, reco.match.exterieur),
                    "mise": dimensionner(s, r, mode, reco.p_gain, reco.p_perte, prix, reco.match_id, quand),
                })
            contexte = dict(
                mode=mode, sim=solde(s, "simulation"), reel=solde(s, "reel"), obs=solde(s, "observation"),
                stats_obs=stats_paris(s, "observation"),
                stats={"7 jours": stats_paris(s, mode, jour - timedelta(days=7)),
                       "30 jours": stats_paris(s, mode, jour - timedelta(days=30)),
                       "depuis le début": stats_paris(s, mode)},
                recos=recos, nb_observation=len(recommandations_ouvertes(s, quand, valides=False)),
                suspects=[(x, Selection.depuis_cle(x.selection).libelle(x.match.domicile, x.match.exterieur))
                          for x in recommandations_suspectes(s, quand)],
                alertes=alertes_depuis(s, quand - timedelta(hours=24)),
                analyse=service.derniere_analyse or lire_etat(s, "derniere_analyse", {}),
                raisons_reel=conditions_reel(s, r, quand) if mode == "simulation" else [],
                battement=lire_etat(s, "service:battement"),
            )
        analyse = contexte["analyse"]
        contexte["analyse_quand"] = datetime.fromisoformat(analyse["quand"]) if analyse.get("quand") else None
        contexte["apercus"] = [dict(a, debut=datetime.fromisoformat(a["debut"])) for a in analyse.get("apercus", [])]
        programme = dict(analyse.get("programme") or {})
        for cle in ("prochain", "maj"):
            if programme.get(cle):
                programme[cle] = datetime.fromisoformat(programme[cle])
        contexte["programme"] = programme
        with service.sessions() as s:
            contexte["tache_analyse"] = etat_taches(s)["analyse"]
        contexte["service_actif"] = bool(contexte["battement"]) and (
            quand - datetime.fromisoformat(contexte["battement"]) < timedelta(minutes=3))
        contexte["parametres"] = bool(charger_parametres(r.dossier).get("ligues"))
        return page(request, "tableau", **contexte)

    @app.post("/action/{action}")
    def action(action: str, retour_vers: str = Form("/")):
        if action not in ACTIONS:
            return retour(retour_vers, erreur="Action inconnue.")
        with service.sessions() as s:
            demander(s, action)
        return retour(retour_vers, msg=f"{ACTIONS[action]} : demandé. Le service s'en charge dans quelques secondes.")

    @app.post("/signal/{reco_id}/cote")
    def verifier_cote(reco_id: int, cote_vue: str = Form(...)):
        try:
            valeur = float(cote_vue.replace(",", "."))
        except ValueError:
            return retour("/", erreur="Cote illisible.")
        with service.sessions() as s:
            texte = evaluer_cote(s, reglages_actuels(), reco_id, valeur, service.horloge())
        return retour("/", msg=texte)

    @app.post("/signal/{reco_id}/pari")
    def enregistrer_pari(reco_id: int, cote_prise: str = Form(...), mise: str = Form("")):
        try:
            valeur = float(cote_prise.replace(",", "."))
            montant = float(mise.replace(",", ".")) if mise.strip() else None
        except ValueError:
            return retour("/", erreur="Cote ou mise illisible.")
        with service.sessions() as s:
            pari, texte = confirmer_pari(s, reglages_actuels(), reco_id, valeur, montant, service.horloge())
        return retour("/", msg=texte) if pari else retour("/", erreur=texte)

    @app.post("/mode")
    def mode(nouveau: str = Form(...)):
        if nouveau not in ("simulation", "reel"):
            return retour("/", erreur="Mode inconnu.")
        with service.sessions() as s:
            texte = changer_mode(s, reglages_actuels(), nouveau, service.horloge())
        return retour("/", msg=texte) if "refusé" not in texte else retour("/", erreur=texte)

    # --- journal ------------------------------------------------------------------------

    @app.get("/journal", response_class=HTMLResponse)
    def journal(request: Request):
        from sqlalchemy import select

        with service.sessions() as s:
            paris = []
            for p in s.scalars(select(Pari).order_by(Pari.id.desc()).limit(100)):
                paris.append((p, Selection.depuis_cle(p.selection).libelle(p.match.domicile, p.match.exterieur)))
            a_regler = matchs_a_regler(s, service.horloge())
        return page(request, "journal", paris=paris, a_regler=a_regler)

    @app.post("/match/{match_id}/resultat")
    def resultat(match_id: int, score: str = Form(...)):
        morceaux = score.replace(":", "-").split("-")
        try:
            bd, be = int(morceaux[0]), int(morceaux[1])
        except (ValueError, IndexError):
            return retour("/journal", erreur="Score attendu sous la forme 2-1.")
        with service.sessions() as s:
            _, texte = regler_manuellement(s, match_id, bd, be, service.horloge())
        return retour("/journal", msg=texte)

    # --- fiche et outils --------------------------------------------------------------------

    @app.get("/fiche", response_class=HTMLResponse)
    def fiche(request: Request, dom: str = "", ext: str = ""):
        erreur, donnees = (None, {})
        if dom and ext:
            erreur, donnees = service.calculer_fiche(dom, ext)
        a_venir = sorted(service.matchs, key=lambda m: m.debut)[:40]
        return page(request, "fiche", dom=dom, ext=ext, fiche_erreur=erreur, f=donnees, a_venir=a_venir)

    @app.get("/outils", response_class=HTMLResponse)
    def outils(request: Request):
        return page(request, "outils", resultat=None)

    @app.post("/outils", response_class=HTMLResponse)
    def calculer(request: Request, outil: str = Form(...), proba: str = Form(""), cote_saisie: str = Form(""),
                 cotes: str = Form(""), montant: str = Form(""), taux: str = Form("50")):
        r = reglages_actuels()

        def nb(x: str) -> float:
            return float(x.replace(",", ".").replace("%", "").strip())

        try:
            if outil == "value":
                p = nb(proba) / 100 if nb(proba) > 1 else nb(proba)
                v = analyser_value(p, nb(cote_saisie), r.valeur_min, r.seuil_suspect)
                m = mise_conseillee(nb(montant) if montant else r.capital_initial, p, nb(cote_saisie),
                                    r.fraction_kelly, r.mise_max_pct)
                resultat = [f"Espérance : {pct(v.esperance)}",
                            f"Mise conseillée : {argent(m.montant)}" if v.est_value else "Pas de value : ne pas jouer."]
                if v.suspecte:
                    resultat.append("Cote trop belle : risque d'annulation par le bookmaker.")
            elif outil == "surebet":
                liste = [nb(x) for x in cotes.replace(";", " ").split()]
                sb = surebet(liste, nb(montant) if montant else 100)
                resultat = [f"Marge : {pct(marge(liste))}"]
                if sb.est_surebet:
                    resultat += [f"Cote {cote(c)} : miser {argent(m)}" for c, m in zip(liste, sb.mises)]
                    resultat.append(f"Retour garanti : {argent(sb.retour)} ({pct(sb.profit)})")
                else:
                    resultat.append(f"Pas de surebet : perte garantie de {pct(-sb.profit)}.")
            else:
                p = nb(proba) / 100 if nb(proba) > 1 else nb(proba)
                fonction = {"gratuit": lambda: pari_gratuit(p, nb(cote_saisie), nb(montant)),
                            "cashback": lambda: cashback(p, nb(cote_saisie), nb(montant), nb(taux) / 100),
                            "boost": lambda: cote_boostee(p, nb(cote_saisie), nb(montant))}[outil]
                v = fonction()
                resultat = [f"Valeur moyenne : {argent(v.esperance)} ({pct(v.taux)})"]
        except (ValueError, KeyError, ZeroDivisionError) as e:
            resultat = [f"Saisie incorrecte : {e}"]
        return page(request, "outils", resultat=resultat, outil=outil)

    # --- données -------------------------------------------------------------------------

    @app.get("/donnees", response_class=HTMLResponse)
    def donnees(request: Request):
        r = reglages_actuels()
        historique = etat_historique(r.dossier)
        dossier_bt = r.dossier / "backtest"
        rapports = sorted(dossier_bt.glob("backtest-*.md")) if dossier_bt.exists() else []
        parametres = charger_parametres(r.dossier)
        with service.sessions() as s:
            taches = etat_taches(s)
            budget = lire_etat(s, "odds_api:budget")
            restant = lire_etat(s, "odds_api:restant")
        return page(
            request, "donnees", historique=historique, ligues=LIGUES, suivies=r.liste_ligues,
            nb_matchs=len(service.hist), nb_fixtures=len(service.fixtures), taches=taches,
            dernier_backtest=rapports[-1].read_text(encoding="utf-8") if rapports else None,
            parametres=parametres.get("ligues", {}), genere_le=parametres.get("genere_le"),
            budget=budget, restant=restant,
        )

    # --- réglages ---------------------------------------------------------------------------

    @app.get("/reglages", response_class=HTMLResponse)
    def reglages_page(request: Request):
        r = reglages_actuels()
        alias_chemin = r.dossier / "alias_equipes.json"
        alias = json.loads(alias_chemin.read_text(encoding="utf-8")) if alias_chemin.exists() else {}
        valeurs = {c.nom: _valeur_affichee(c, getattr(r, c.nom)) for _, champs in SECTIONS.values() for c in champs}
        secrets_etat = {nom: _masque(getattr(r, nom, "")) for nom in SECRETS}
        with service.sessions() as s:
            mode = mode_actuel(s, r)
            modifies = sorted(surcharges(s))
        return page(
            request, "reglages", sections=SECTIONS, valeurs=valeurs, secrets_etat=secrets_etat,
            ligues=LIGUES, suivies=set(r.liste_ligues), sports=SPORTS, mode=mode, modifies=modifies,
            code=service.code_liaison() if r.telegram_token and not r.telegram_chat_id else None,
            alias="\n".join(f"{k} = {v}" for k, v in alias.items()),
        )

    @app.post("/reglages/{section}")
    async def enregistrer_section(section: str, request: Request):
        formulaire = await request.form()
        nouvelles: dict = {}
        if section == "ligues":
            choisies = [c for c in LIGUES if formulaire.get(f"ligue_{c}")]
            if not choisies:
                return retour("/reglages", erreur="Choisissez au moins un championnat.")
            nouvelles["ligues"] = ",".join(choisies)
        elif section in SECTIONS:
            for champ in SECTIONS[section][1]:
                texte = str(formulaire.get(champ.nom, ""))
                if champ.genre == "secret":
                    if formulaire.get(f"effacer_{champ.nom}"):
                        nouvelles[champ.nom] = ""
                    elif texte.strip():
                        nouvelles[champ.nom] = texte.strip()
                    continue
                try:
                    nouvelles[champ.nom] = _valeur_saisie(champ, texte)
                except ValueError:
                    return retour("/reglages", erreur=f"{champ.libelle} : valeur illisible « {texte} ».")
            if section == "telegram" and "telegram_token" in nouvelles:
                nouvelles["telegram_chat_id"] = ""  # nouveau bot : il faut le relier à nouveau
        else:
            return retour("/reglages", erreur="Section inconnue.")
        try:
            with service.sessions() as s:
                enregistrer_reglages(s, nouvelles, service.base)
        except ValidationError as e:
            return retour("/reglages", erreur=_erreurs(e))
        return retour("/reglages", msg="Réglages enregistrés. Le service les applique dans quelques secondes.")

    @app.post("/reglages-telegram/delier")
    def delier():
        with service.sessions() as s:
            enregistrer_reglages(s, {"telegram_chat_id": ""}, service.base)
        return retour("/reglages", msg="Bot délié. Renvoyez le code affiché pour le relier.")

    @app.post("/reglages-telegram/test")
    def tester_telegram():
        r = reglages_actuels()
        if not (r.telegram_token and r.telegram_chat_id):
            return retour("/reglages", erreur="Token ou liaison manquants.")
        try:
            Telegram(r.telegram_token, r.telegram_chat_id).envoyer("Message de test du moteur de paris : tout fonctionne.")
        except Exception as e:
            return retour("/reglages", erreur=f"Envoi impossible : {e}")
        return retour("/reglages", msg="Message de test envoyé sur Telegram.")

    @app.post("/reglages-cotes/verifier")
    def verifier_api():
        r = reglages_actuels()
        if not r.odds_api_key:
            return retour("/reglages", erreur="Aucune clé enregistrée.")
        try:
            client = ClientOdds(r.odds_api_key)
            disponibles = {x["key"] for x in client.sports()}
            absents = [c for c in r.liste_ligues if SPORTS.get(c) not in disponibles]
            ligue = next((c for c in r.liste_ligues if SPORTS.get(c) in disponibles), None)
            bookmakers = sorted({c.bookmaker for ev in client.cotes(ligue, "h2h", r.odds_api_regions)
                                 for c in ev.cotes}) if ligue else []
        except Exception as e:
            return retour("/reglages", erreur=f"API injoignable ou clé refusée : {e}")
        texte = (f"Clé valide · crédits restants : {client.restant} · bookmakers vus : {', '.join(bookmakers) or 'aucun'}"
                 + (f" · championnats non couverts : {', '.join(absents)}" if absents else ""))
        return retour("/reglages", msg=texte)

    @app.post("/reglages-alias")
    def enregistrer_alias(alias: str = Form("")):
        r = reglages_actuels()
        table = {}
        for ligne in alias.splitlines():
            if not ligne.strip():
                continue
            if "=" not in ligne:
                return retour("/reglages", erreur=f"Ligne sans « = » : {ligne}")
            gauche, droite = (x.strip() for x in ligne.split("=", 1))
            table[gauche] = droite
        r.dossier.mkdir(parents=True, exist_ok=True)
        (r.dossier / "alias_equipes.json").write_text(json.dumps(table, indent=2, ensure_ascii=False), encoding="utf-8")
        return retour("/reglages", msg=f"{len(table)} alias enregistré(s).")

    @app.post("/reglages-mdp")
    def changer_mdp(actuel: str = Form(...), nouveau: str = Form(...), confirmation: str = Form(...)):
        with service.sessions() as s:
            if not securite.mdp_correct(s, actuel):
                return retour("/reglages", erreur="Mot de passe actuel incorrect.")
            if nouveau != confirmation:
                return retour("/reglages", erreur="Les deux nouveaux mots de passe sont différents.")
            try:
                securite.definir_mdp(s, nouveau)
            except ValueError as e:
                return retour("/reglages", erreur=f"Nouveau mot de passe trop court : {e}.")
        return RedirectResponse("/connexion", status_code=303)

    # --- historique des prédictions -----------------------------------------------------

    @app.get("/historique", response_class=HTMLResponse)
    def historique(request: Request, jours: int = 4, voir: str = "resultats"):
        jours = max(1, min(jours, 90))
        voir = voir if voir in ("resultats", "attente", "avenir", "tout") else "resultats"
        quand = service.horloge()
        with service.sessions() as s:
            liste = predictions(s, quand - timedelta(days=jours))
            bilan = bilan_predictions(liste)
            groupes = {
                "resultats": [p for p in liste if p.fraction is not None],
                "attente": [p for p in liste if p.fraction is None and p.match.debut <= quand],
                "avenir": sorted((p for p in liste if p.match.debut > quand), key=lambda p: p.match.debut),
                "tout": liste,
            }
            nombres = {k: len(v) for k, v in groupes.items()}
            lignes = [(p, Selection.depuis_cle(p.selection).libelle(p.match.domicile, p.match.exterieur))
                      for p in groupes[voir]]
        return page(request, "historique", lignes=lignes, bilan=bilan, jours=jours, voir=voir, nombres=nombres)

    # --- bilan ----------------------------------------------------------------------------------

    @app.get("/rapport", response_class=HTMLResponse)
    def rapport(request: Request):
        r = reglages_actuels()
        with service.sessions() as s:
            analyse = service.derniere_analyse or lire_etat(s, "derniere_analyse", {})
            texte = rapport_quotidien(s, r, service.horloge(), analyse, service.parametres_presents())
        return page(request, "rapport", texte=texte,
                    telegram_relie=bool(r.telegram_token and r.telegram_chat_id))

    @app.get("/bilan", response_class=HTMLResponse)
    def bilan(request: Request):
        r = reglages_actuels()
        with service.sessions() as s:
            texte = bilan_hebdo(s, r, service.horloge(), charger_parametres(r.dossier))
        return page(request, "bilan", texte=texte)

    return app
