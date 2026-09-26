"""Service qui tourne en continu : calendrier des tâches, Telegram, arrêt automatique.

Chaque jour (heure locale du fuseau configuré) :
- heure_donnees : mise à jour de l'historique et des matchs à venir, règlement des paris ;
- toutes les `intervalle_analyse_h` heures : analyse, nouveaux signaux, alertes ;
- heure_rapport : rapport quotidien (obligatoire, même sans pari) ;
- lundi : bilan hebdomadaire (fichier à coller dans Claude) ;
- dimanche 2 h : backtest complet en arrière-plan, qui met à jour les réglages validés.

Les réglages sont relus à chaque passage : ce qui est modifié dans l'interface web
s'applique sans redémarrage. Les boutons de l'interface déposent des demandes (taches.py)
que le service exécute ici.
"""

import logging
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

import pandas as pd

from . import commandes
from .analyse import (
    MatchAVenir,
    analyser,
    charger_parametres,
    fiche,
    fusionner_api,
    matchs_depuis_fixtures,
    params_ligue,
    reference_pour,
)
from .config import Reglages
from .db import Recommandation
from .donnees import football_data
from .donnees.equipes import Correspondance
from .donnees.odds_api import SPORTS, ClientOdds
from .format import cote, pct
from .journal import (
    ajouter_alerte,
    capital,
    controle_arret,
    ecrire_etat,
    enregistrer_candidats,
    lire_etat,
    regler_depuis_resultats,
)
from .modeles.ligue import ajuster_ligue
from .rapport import alerte, bilan_hebdo, quand_local, rapport_quotidien, texte_fiche
from .taches import effectifs, enregistrer_reglages, prendre_demandes, suivre
from .telegram import Telegram

log = logging.getLogger("moteur.service")


def maintenant_utc() -> datetime:
    return datetime.now(timezone.utc)


class Service:
    def __init__(
        self,
        r: Reglages,
        sessions,
        telegram: Telegram | None = None,
        odds: ClientOdds | None = None,
        horloge: Callable[[], datetime] = maintenant_utc,
        reseau: bool = True,
        clients_auto: bool = False,
    ):
        """`r` : réglages de base ; les surcharges saisies dans l'interface s'y ajoutent.

        `clients_auto` : crée et recrée Telegram et l'API de cotes d'après les réglages
        (en production). Les tests passent leurs propres clients.
        """
        self.base = r
        self.r = r
        self.sessions = sessions
        self.telegram = telegram
        self.odds = odds
        self.clients_auto = clients_auto
        self.horloge = horloge
        self.reseau = reseau
        self.hist = pd.DataFrame()
        self.fixtures = pd.DataFrame()
        self.matchs: list[MatchAVenir] = []
        self.modeles: dict = {}
        self.derniere_analyse: dict = {}
        self.correspondance = Correspondance(self.fichier_alias)
        self._alias_mtime = self._mtime(self.fichier_alias)
        self.backtest: subprocess.Popen | None = None
        self._tentative_donnees: datetime | None = None
        self.recharger()

    # --- réglages ----------------------------------------------------------------

    @property
    def fichier_alias(self) -> Path:
        return self.r.dossier / "alias_equipes.json"

    @staticmethod
    def _mtime(chemin: Path) -> float | None:
        return chemin.stat().st_mtime if chemin.exists() else None

    def recharger(self) -> None:
        """Relit les réglages de l'interface et recrée les clients si leurs clés ont changé."""
        with self.sessions() as s:
            nouveau = effectifs(s, self.base)
        ancien, self.r = self.r, nouveau
        if self.clients_auto:
            if self.telegram is None or nouveau.telegram_token != ancien.telegram_token:
                self.telegram = Telegram(nouveau.telegram_token, nouveau.telegram_chat_id) if nouveau.telegram_token else None
            elif self.telegram is not None:
                self.telegram.chat_id = nouveau.telegram_chat_id
            if (self.odds is None and nouveau.odds_api_key) or nouveau.odds_api_key != ancien.odds_api_key:
                self.odds = ClientOdds(nouveau.odds_api_key) if nouveau.odds_api_key and self.reseau else None
        mtime = self._mtime(self.fichier_alias)
        if mtime != getattr(self, "_alias_mtime", None):
            self.correspondance = Correspondance(self.fichier_alias)
            self._alias_mtime = mtime

    # --- utilitaires ---------------------------------------------------------

    @property
    def ligues_historique(self) -> list[str]:
        """Ligues suivies + divisions supérieures (utiles pour les a priori promus / relégués)."""
        sup = [football_data.LIGUES.get(c, ("", None))[1] for c in self.r.liste_ligues]
        return sorted(set(self.r.liste_ligues) | {c for c in sup if c})

    def parametres_presents(self) -> bool:
        return bool(charger_parametres(self.r.dossier).get("ligues"))

    def _alerte(self, texte: str, quand: datetime) -> None:
        log.warning(texte)
        with self.sessions() as s:
            ajouter_alerte(s, texte, quand)

    def _envoyer(self, texte: str) -> None:
        if self.telegram is None:
            return
        try:
            self.telegram.envoyer(texte)
        except Exception as e:  # le réseau ne doit jamais arrêter le service
            log.warning("Envoi Telegram impossible : %s", e)

    # --- tâches ----------------------------------------------------------------

    def charger_donnees(self) -> None:
        self.hist = football_data.charger(self.r.dossier, self.ligues_historique)
        self.fixtures = football_data.charger_fixtures(self.r.dossier)

    def maj_donnees(self, quand: datetime) -> int:
        """Télécharge ce qui manque, recharge l'historique, règle les paris terminés."""
        if self.reseau:
            def progression(fait: int, total: int) -> None:
                if fait == total or fait % 5 == 0:
                    with self.sessions() as s:
                        suivre(s, "historique", "en_cours", f"{fait} fichier(s) sur {total}", fait, total)

            erreurs = football_data.telecharger(self.ligues_historique, self.r.saison_depuis, self.r.dossier,
                                                maintenant=quand, progression=progression)
            erreur_fixtures = football_data.telecharger_fixtures(self.r.dossier)
            erreurs += [erreur_fixtures] if erreur_fixtures else []
            if erreurs:
                self._alerte(f"Téléchargement : {len(erreurs)} erreur(s), ex. {erreurs[0]}", quand)
        self.charger_donnees()
        with self.sessions() as s:
            regles = regler_depuis_resultats(s, self.hist, quand)
            message = controle_arret(s, self.r)
            suivre(s, "historique", "termine", f"{len(self.hist)} matchs en base, {len(regles)} pari(s) réglé(s).")
        if message:
            self._alerte(message, quand)
            self._envoyer(message)
        return len(regles)

    def _cotes_api(self, matchs: list[MatchAVenir], quand: datetime) -> list:
        if self.odds is None or not self.reseau:
            return []
        prochains: dict[str, datetime] = {}
        for m in matchs:
            prochains[m.ligue] = min(prochains.get(m.ligue, m.debut), m.debut)
        ligues = sorted((c for c in self.r.liste_ligues if c in SPORTS),
                        key=lambda c: prochains.get(c, quand + timedelta(days=30)))
        cout = ClientOdds.credits_par_appel(self.r.odds_api_marches, self.r.odds_api_regions)
        jour = quand.astimezone(ZoneInfo(self.r.fuseau)).date().isoformat()
        with self.sessions() as s:
            budget = lire_etat(s, "odds_api:budget", {"jour": jour, "credits": 0})
        if budget["jour"] != jour:
            budget = {"jour": jour, "credits": 0}
        evenements = []
        for ligue in ligues:
            if budget["credits"] + cout > self.r.odds_api_credits_jour:
                break
            try:
                evenements += self.odds.cotes(ligue, self.r.odds_api_marches, self.r.odds_api_regions)
            except Exception as e:
                self._alerte(f"API de cotes ({ligue}) : {e}", quand)
                break
            budget["credits"] += cout
        with self.sessions() as s:
            ecrire_etat(s, "odds_api:budget", budget)
            if self.odds.restant is not None:
                ecrire_etat(s, "odds_api:restant", self.odds.restant)
        return evenements

    def analyser(self, quand: datetime) -> list[Recommandation]:
        if self.hist.empty:
            self.charger_donnees()
        maj = datetime.fromtimestamp(
            (football_data.dossier_csv(self.r.dossier) / "fixtures.csv").stat().st_mtime, timezone.utc
        ) if (football_data.dossier_csv(self.r.dossier) / "fixtures.csv").exists() else quand
        matchs = matchs_depuis_fixtures(self.fixtures, self.r.liste_ligues, quand, self.r.horizon_h, maj)
        evenements = self._cotes_api(matchs, quand)
        if evenements:
            recents = self.hist[self.hist["date"] >= pd.Timestamp(quand) - pd.Timedelta(days=500)]
            equipes: dict[str, set[str]] = {}
            for df in (recents, self.fixtures):
                if not df.empty:
                    for ligue, g in df.groupby("ligue"):
                        equipes.setdefault(ligue, set()).update(g["dom"], g["ext"])
            matchs, alertes = fusionner_api(matchs, evenements, equipes, self.correspondance)
            for a in sorted(set(alertes)):
                self._alerte(a, quand)
        res = analyser(matchs, self.hist, self.r, quand)
        self.matchs, self.modeles = matchs, res.modeles
        for a in res.alertes:
            self._alerte(a, quand)
        self.derniere_analyse = {
            "quand": quand.isoformat(), "nb_matchs": res.nb_matchs, "ligues": res.ligues,
            "nb_signaux": len(res.candidats), "nb_valides": sum(c.valide for c in res.candidats),
            "surebets": [
                f"{sb.dom} – {sb.ext} : {pct(sb.profit)} ("
                + ", ".join(f"{sel.libelle(sb.dom, sb.ext)} @ {cote(c)} chez {bk}" for sel, bk, c, _ in sb.jambes) + ")"
                for sb in res.surebets
            ],
        }
        with self.sessions() as s:
            capital(s, self.r, "simulation")
            nouvelles = enregistrer_candidats(s, self.r, res.candidats, quand)
            ecrire_etat(s, "derniere_analyse", self.derniere_analyse)
            textes = [alerte(s, self.r, reco, quand) for reco in nouvelles]
        for texte in textes:
            self._envoyer(texte)
        return nouvelles

    def rapport(self, quand: datetime, envoyer: bool = True) -> str:
        with self.sessions() as s:
            texte = rapport_quotidien(s, self.r, quand, self.derniere_analyse, self.parametres_presents())
        dossier = self.r.dossier / "rapports"
        dossier.mkdir(parents=True, exist_ok=True)
        (dossier / f"rapport-{quand.astimezone(ZoneInfo(self.r.fuseau)):%Y-%m-%d}.txt").write_text(texte, encoding="utf-8")
        if envoyer:
            self._envoyer(texte)
        return texte

    def bilan(self, quand: datetime, envoyer: bool = True) -> str:
        with self.sessions() as s:
            texte = bilan_hebdo(s, self.r, quand, charger_parametres(self.r.dossier))
        dossier = self.r.dossier / "rapports"
        dossier.mkdir(parents=True, exist_ok=True)
        chemin = dossier / f"bilan-{quand:%Y-%m-%d}.md"
        chemin.write_text(texte, encoding="utf-8")
        if envoyer:
            self._envoyer(f"Bilan de la semaine prêt : {chemin}. À coller dans une conversation Claude.\n\n{texte}")
        return texte

    def lancer_backtest(self, quand: datetime) -> bool:
        if self.backtest is not None and self.backtest.poll() is None:
            return False
        journal = self.r.dossier / "backtest" / "dernier.log"
        journal.parent.mkdir(parents=True, exist_ok=True)
        with open(journal, "w", encoding="utf-8") as sortie:
            # Priorité basse : le PC reste fluide, le backtest passe après tout le reste.
            if sys.platform == "win32":
                options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.BELOW_NORMAL_PRIORITY_CLASS}
            else:
                options = {"preexec_fn": lambda: os.nice(10)}
            self.backtest = subprocess.Popen([sys.executable, "-m", "moteur", "backtest", "--activer"],
                                             stdout=sortie, stderr=subprocess.STDOUT, **options)
        with self.sessions() as s:
            ecrire_etat(s, "job:backtest", quand.isoformat())
        self._envoyer("Backtest lancé en arrière-plan (plusieurs minutes à quelques heures).")
        return True

    def calculer_fiche(self, dom_saisi: str, ext_saisi: str) -> tuple[str | None, dict]:
        """Prix justes d'un match. Renvoie (message d'erreur, données)."""
        quand = self.horloge()
        if self.hist.empty:
            self.charger_donnees()
        if self.hist.empty:
            return "Pas d'historique : lancer le téléchargement (page Données).", {}
        recents = self.hist[self.hist["date"] >= pd.Timestamp(quand) - pd.Timedelta(days=400)]
        for ligue, g in recents.groupby("ligue"):
            equipes = set(g["dom"]) | set(g["ext"])
            dom = self.correspondance.trouver(dom_saisi, equipes)
            ext = self.correspondance.trouver(ext_saisi, equipes)
            if dom and ext:
                break
        else:
            return f"Équipes introuvables ensemble dans un championnat suivi : « {dom_saisi} », « {ext_saisi} ».", {}
        params, _ = params_ligue(charger_parametres(self.r.dossier), ligue, self.r)
        modele = self.modeles.get(ligue)
        if modele is None or not (modele.connait(dom) and modele.connait(ext)):
            sup = football_data.LIGUES.get(ligue, ("", None))[1]
            modele = ajuster_ligue(self.hist[self.hist["ligue"] == ligue], pd.Timestamp(quand), params,
                                   {dom, ext}, self.hist[self.hist["ligue"] == sup] if sup else None)
        if modele is None:
            return f"Pas assez d'historique pour {ligue}.", {}
        match = next((m for m in self.matchs if m.ligue == ligue and m.dom == dom and m.ext == ext), None)
        ref = reference_pour(match.cotes, self.r) if match else None
        return None, {
            "ligue": ligue, "dom": dom, "ext": ext, "debut": match.debut if match else None,
            "avec_reference": ref is not None,
            "lignes": fiche(modele, dom, ext, ref, params.poids_modele, self.r.valeur_min),
        }

    def fiche(self, dom_saisi: str, ext_saisi: str) -> str:
        erreur, f = self.calculer_fiche(dom_saisi, ext_saisi)
        if erreur:
            return erreur
        texte = texte_fiche(f["lignes"], f["dom"], f["ext"], f["ligue"], f["avec_reference"], self.r.valeur_min)
        if f["debut"]:
            texte = f"{quand_local(f['debut'], self.r.fuseau)}\n" + texte
        return texte

    # --- calendrier ---------------------------------------------------------------

    def _du(self, cle: str, heure: int, quand: datetime) -> bool:
        local = quand.astimezone(ZoneInfo(self.r.fuseau))
        with self.sessions() as s:
            return local.hour >= heure and lire_etat(s, f"job:{cle}") != local.date().isoformat()

    def _fait(self, cle: str, quand: datetime) -> None:
        with self.sessions() as s:
            ecrire_etat(s, f"job:{cle}", quand.astimezone(ZoneInfo(self.r.fuseau)).date().isoformat())

    def traiter_demandes(self, quand: datetime) -> list[str]:
        """Exécute les actions demandées depuis l'interface web."""
        with self.sessions() as s:
            demandes = prendre_demandes(s)
        faites = []
        for action in demandes:
            with self.sessions() as s:
                suivre(s, action, "en_cours", "En cours…")
            try:
                if action == "historique":
                    n = self.maj_donnees(quand)
                    message = f"{len(self.hist)} matchs en base, {n} pari(s) réglé(s)."
                elif action == "analyse":
                    nouvelles = self.analyser(quand)
                    message = (f"{self.derniere_analyse.get('nb_matchs', 0)} match(s), "
                               f"{len(nouvelles)} nouveau(x) signal(aux) validé(s).")
                elif action == "backtest":
                    lance = self.lancer_backtest(quand)
                    message = "Lancé en arrière-plan." if lance else "Un backtest tourne déjà."
                elif action == "rapport":
                    self.rapport(quand)
                    message = "Rapport envoyé." if self.telegram else "Rapport généré (Telegram non configuré)."
                else:
                    self.bilan(quand)
                    message = "Bilan écrit dans data/rapports."
                etat = "en_cours" if action == "backtest" and self.backtest is not None and self.backtest.poll() is None else "termine"
                with self.sessions() as s:
                    suivre(s, action, etat, message)
            except Exception as e:
                log.exception("Action %s", action)
                with self.sessions() as s:
                    suivre(s, action, "erreur", str(e))
            faites.append(action)
        return faites

    def _suivre_backtest(self) -> None:
        if self.backtest is None or self.backtest.poll() is None:
            return
        code, self.backtest = self.backtest.returncode, None
        with self.sessions() as s:
            if code == 0:
                suivre(s, "backtest", "termine", "Terminé : réglages validés mis à jour.")
            else:
                suivre(s, "backtest", "erreur", f"Échec (code {code}), voir data/backtest/dernier.log.")
        self._envoyer("Backtest terminé." if code == 0 else "Le backtest a échoué : voir data/backtest/dernier.log.")

    def tick(self) -> list[str]:
        """Exécute les tâches dues. Renvoie leurs noms (utile pour les tests et les journaux)."""
        self.recharger()
        quand = self.horloge()
        local = quand.astimezone(ZoneInfo(self.r.fuseau))
        with self.sessions() as s:
            ecrire_etat(s, "service:battement", quand.isoformat())
        faites = self.traiter_demandes(quand)
        self._suivre_backtest()
        premiere = self.hist.empty and (
            self._tentative_donnees is None or quand - self._tentative_donnees > timedelta(hours=1))
        if premiere or self._du("donnees", self.r.heure_donnees, quand):
            self._tentative_donnees = quand
            self.maj_donnees(quand)
            self._fait("donnees", quand)
            faites.append("donnees")
        with self.sessions() as s:
            derniere = lire_etat(s, "job:analyse")
        if derniere is None or quand - datetime.fromisoformat(derniere) >= timedelta(hours=self.r.intervalle_analyse_h):
            self.analyser(quand)
            with self.sessions() as s:
                ecrire_etat(s, "job:analyse", quand.isoformat())
            faites.append("analyse")
        if self._du("rapport", self.r.heure_rapport, quand):
            self.rapport(quand)
            self._fait("rapport", quand)
            faites.append("rapport")
        if local.weekday() == 0 and self._du("bilan", self.r.heure_rapport, quand):
            self.bilan(quand)
            self._fait("bilan", quand)
            faites.append("bilan")
        with self.sessions() as s:
            dernier_bt = lire_etat(s, "job:backtest")
        premier = dernier_bt is None and not self.parametres_presents() and not self.hist.empty
        hebdo = local.weekday() == 6 and local.hour >= 2 and (
            dernier_bt is None or quand - datetime.fromisoformat(dernier_bt) > timedelta(days=6))
        if (premier or hebdo) and self.reseau and self.lancer_backtest(quand):
            faites.append("backtest")
        with self.sessions() as s:
            message = controle_arret(s, self.r)
        if message:
            self._alerte(message, quand)
            self._envoyer(message)
        return faites

    def code_liaison(self) -> str:
        """Code à envoyer au bot pour le relier à ce programme (affiché dans l'interface)."""
        with self.sessions() as s:
            code = lire_etat(s, "telegram:code")
            if code is None:
                code = f"{random.SystemRandom().randint(0, 999999):06d}"
                ecrire_etat(s, "telegram:code", code)
        return code

    def traiter_messages(self, attente: int = 20) -> None:
        for msg in self.telegram.lire(attente):
            if not self.r.telegram_chat_id:
                code = self.code_liaison()
                if msg.texte.replace("/start", "").strip() == code:
                    with self.sessions() as s:
                        self.r = enregistrer_reglages(s, {"telegram_chat_id": msg.chat_id}, self.base)
                    self.telegram.chat_id = msg.chat_id
                    self.telegram.envoyer("Bot relié au moteur de paris. /aide pour les commandes.", msg.chat_id)
                else:
                    self.telegram.envoyer("Envoyez le code affiché dans l'interface (Réglages › Telegram).", msg.chat_id)
                continue
            if msg.chat_id != str(self.r.telegram_chat_id):
                continue  # on ignore tout autre expéditeur
            self.telegram.envoyer(commandes.executer(msg.texte, self))

    def boucle(self, arreter: Callable[[], bool]) -> None:
        log.info("Service démarré (ligues : %s).", ", ".join(self.r.liste_ligues))
        while not arreter():
            try:
                self.tick()
            except Exception as e:
                log.exception("Erreur pendant les tâches")
                self._alerte(f"Erreur interne : {e}", self.horloge())
            if self.telegram is not None:
                try:
                    self.traiter_messages(attente=5)
                except Exception as e:
                    log.warning("Telegram indisponible : %s", e)
                    self._pause(15, arreter)
            else:
                self._pause(20, arreter)
        log.info("Service arrêté proprement.")

    def _pause(self, secondes: int, arreter: Callable[[], bool]) -> None:
        """Attente interrompue dès qu'une action est demandée depuis l'interface."""
        for k in range(secondes):
            if arreter():
                return
            if k % 2 == 0:
                with self.sessions() as s:
                    if lire_etat(s, "demandes", []):
                        return
            time.sleep(1)
