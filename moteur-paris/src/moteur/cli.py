"""Ligne de commande. `moteur --help` pour la liste, `moteur <commande> --help` pour le détail."""

import argparse
import logging
import signal
import sys
from datetime import datetime, timezone

from . import __version__
from .calcul import analyser_value, marge, mise_conseillee, surebet
from .capital import arret_atteint, depot_initial, solde
from .config import reglages
from .db import fabrique_sessions, initialiser, moteur_bdd

log = logging.getLogger("moteur")


def _sessions():
    r = reglages()
    engine = moteur_bdd(r.database_url)
    initialiser(engine)
    return fabrique_sessions(engine)


def _session():
    return _sessions()()


def _reglages():
    """Réglages effectifs : ceux de l'interface web par-dessus l'environnement."""
    from .taches import effectifs

    with _session() as s:
        return effectifs(s)


def _service(avec_reseau: bool = True):
    from .service import Service

    return Service(reglages(), _sessions(), reseau=avec_reseau, clients_auto=True)


def _pct(x: float) -> str:
    return f"{x:+.2%}".replace(".", ",")


def _nombre(texte: str) -> float:
    return float(texte.replace(",", "."))


def cmd_init(_args) -> int:
    r = _reglages()
    with _session() as s:
        capital = depot_initial(s, "simulation", r.capital_initial)
    log.info("Base prête. Capital de simulation : %.2f $.", capital)
    return 0


def cmd_etat(_args) -> int:
    from .analyse import charger_parametres
    from .journal import mode_actuel

    r = _reglages()
    with _session() as s:
        mode = mode_actuel(s, r)
        sim, reel = solde(s, "simulation"), solde(s, "reel")
        arret = arret_atteint(s, "reel", r.seuil_arret)
    params = charger_parametres(r.dossier).get("ligues", {})
    print(f"Moteur de paris v{__version__}")
    print(f"  Mode             : {mode}")
    print(f"  Capital simul.   : {'non initialisé' if sim is None else f'{sim:.2f} $'}")
    print(f"  Capital réel     : {'non démarré' if reel is None else f'{reel:.2f} $'}")
    print(f"  Seuil d'arrêt    : {r.seuil_arret:.2f} $" + ("  ⚠ ATTEINT" if arret else ""))
    print(f"  Mise max         : {r.mise_max_pct:.0%} du capital, Kelly x{r.fraction_kelly}")
    print(f"  Championnats     : {', '.join(r.liste_ligues)}")
    print("  Marchés validés  : " + (", ".join(f"{k}:{'/'.join(v.get('marches_valides', [])) or '-'}"
                                             for k, v in sorted(params.items())) or "aucun backtest"))
    print(f"  API de cotes     : {'ok' if r.odds_api_key else 'non configurée (fixtures football-data)'}")
    print(f"  Bookmaker cible  : {r.bookmaker_cible or 'non défini (cotes minimales à vérifier sur 22bet)'}")
    print(f"  Telegram         : {'ok' if r.telegram_token else 'non configuré'}")
    return 0


def cmd_value(args) -> int:
    r = _reglages()
    v = analyser_value(args.proba, args.cote, r.valeur_min, r.seuil_suspect)
    m = mise_conseillee(args.capital or r.capital_initial, args.proba, args.cote, r.fraction_kelly, r.mise_max_pct)
    print(f"Probabilité modèle : {v.proba_modele:.1%}   probabilité de la cote : {v.proba_cote:.1%}")
    print(f"Espérance          : {_pct(v.esperance)}")
    if not v.est_value:
        print(f"Pas de value (seuil {r.valeur_min:.0%}). Ne pas jouer.")
        return 0
    print(f"Mise conseillée    : {m.montant:.2f} $" + ("  (plafonnée)" if m.plafonnee else ""))
    if v.suspecte:
        print("⚠ Trop belle : probable erreur de cote, risque d'annulation par le bookmaker.")
    return 0


def cmd_surebet(args) -> int:
    r = _reglages()
    s = surebet(args.cotes, args.total, r.seuil_suspect)
    print(f"Somme des 1/cote : {s.somme_inverses:.4f}   marge : {_pct(marge(args.cotes))}")
    if not s.est_surebet:
        print(f"Pas de surebet (perte garantie de {-s.profit:.2%}).")
        return 0
    for cote, mise in zip(args.cotes, s.mises):
        print(f"  @ {cote:<6} → miser {mise:.2f} $")
    print(f"Retour garanti : {s.retour:.2f} $ ({_pct(s.profit)})")
    if s.suspect:
        print("⚠ Trop beau : probable erreur de cote, risque d'annulation par le bookmaker.")
    return 0


def cmd_historique(args) -> int:
    from .donnees import football_data

    r = _reglages()
    service = _service()
    ligues = args.ligues or service.ligues_historique
    print(f"Téléchargement de {len(ligues)} championnat(s) depuis {args.depuis or r.saison_depuis}…")
    erreurs = football_data.telecharger(ligues, args.depuis or r.saison_depuis, r.dossier)
    erreur = football_data.telecharger_fixtures(r.dossier)
    hist = football_data.charger(r.dossier, ligues)
    print(f"{len(hist)} matchs en base, de {hist['date'].min():%Y} à {hist['date'].max():%Y}." if len(hist) else "Aucun match.")
    for e in erreurs + ([erreur] if erreur else []):
        print(f"  erreur : {e}")
    return 1 if not len(hist) else 0


def cmd_backtest(args) -> int:
    from .backtest import OptionsBacktest, executer
    from .donnees import football_data
    from .donnees.football_data import LIGUES

    r = _reglages()
    ligues = args.ligues or r.liste_ligues
    service = _service(avec_reseau=False)
    hist = football_data.charger(r.dossier, sorted(set(ligues) | set(service.ligues_historique)))
    if hist.empty:
        print("Pas d'historique : lancer d'abord `moteur historique`.")
        return 1
    o = OptionsBacktest(
        valeur_min=r.valeur_min, seuil_suspect=r.seuil_suspect, seuil_desaccord=r.seuil_desaccord,
        prix=args.prix or r.prix_backtest, capital=r.capital_initial, fraction_kelly=r.fraction_kelly,
        mise_max_pct=r.mise_max_pct,
        grille_xi=tuple(_nombre(x) for x in args.xi.split(",")) if args.xi else OptionsBacktest.grille_xi,
    )
    from .taches import suivre

    def progression(fait: int, total: int, ligue: str) -> None:
        texte = f"{fait} championnat(s) sur {total} (dernier : {LIGUES.get(ligue, (ligue,))[0]})"
        print(texte, flush=True)
        with _session() as s:
            suivre(s, "backtest", "en_cours", texte, fait, total)

    print(f"Backtest de {len(ligues)} championnat(s)…", flush=True)
    _, rapport = executer(hist, ligues, o, r.dossier, args.activer, args.travailleurs, progression)
    print(rapport.read_text(encoding="utf-8"))
    print(f"\nRapport : {rapport}" + ("\nRéglages activés : data/parametres.json" if args.activer else ""))
    return 0


def cmd_analyser(args) -> int:
    service = _service(avec_reseau=not args.hors_ligne)
    quand = datetime.now(timezone.utc)
    if not args.hors_ligne:
        service.maj_donnees(quand)
    else:
        service.charger_donnees()
    nouvelles = service.analyser(quand)
    print(f"{service.derniere_analyse.get('nb_matchs', 0)} match(s) analysé(s), "
          f"{service.derniere_analyse.get('nb_signaux', 0)} signal(aux), {len(nouvelles)} nouveau(x) validé(s).")
    for sb in service.derniere_analyse.get("surebets", []):
        print(f"Surebet : {sb}")
    print()
    print(service.rapport(quand, envoyer=False))
    return 0


def cmd_fiche(args) -> int:
    print(_service(avec_reseau=False).fiche(args.domicile, args.exterieur))
    return 0


def cmd_rapport(args) -> int:
    service = _service(avec_reseau=False)
    print(service.rapport(datetime.now(timezone.utc), envoyer=args.envoyer))
    return 0


def cmd_bilan(args) -> int:
    service = _service(avec_reseau=False)
    print(service.bilan(datetime.now(timezone.utc), envoyer=args.envoyer))
    return 0


def _commande_bot(texte: str) -> int:
    from . import commandes

    print(commandes.executer(texte, _service(avec_reseau=False)))
    return 0


def cmd_cote(args) -> int:
    return _commande_bot(f"/cote {args.signal} {args.cote}")


def cmd_pari(args) -> int:
    return _commande_bot(f"/pari {args.signal} {args.cote}" + (f" {args.mise}" if args.mise else ""))


def cmd_resultat(args) -> int:
    return _commande_bot(f"/resultat {args.match} {args.score}")


def cmd_journal(_args) -> int:
    return _commande_bot("/journal")


def cmd_mode(args) -> int:
    return _commande_bot(f"/{args.mode}")


def cmd_promo(args) -> int:
    from .promo import cashback, cote_boostee, pari_gratuit

    if args.type == "gratuit":
        v = pari_gratuit(args.proba, args.cote, args.montant)
        print(f"Pari gratuit de {args.montant:.2f} $ : vaut {v.esperance:.2f} $ en moyenne ({v.taux:.0%} du montant).")
    elif args.type == "cashback":
        v = cashback(args.proba, args.cote, args.montant, args.taux)
        print(f"Espérance avec remboursement à {args.taux:.0%} : {v.esperance:+.2f} $ ({v.taux:+.1%}).")
    else:
        v = cote_boostee(args.proba, args.cote, args.montant)
        print(f"Cote boostée : espérance {v.esperance:+.2f} $ ({v.taux:+.1%})." + ("" if v.esperance > 0 else " Ne pas jouer."))
    return 0


def cmd_sources(_args) -> int:
    from .donnees.odds_api import SPORTS, ClientOdds

    r = _reglages()
    if not r.odds_api_key:
        print("MOTEUR_ODDS_API_KEY absente : rien à vérifier.")
        return 1
    client = ClientOdds(r.odds_api_key)
    disponibles = {s["key"] for s in client.sports()}
    for code, cle in SPORTS.items():
        print(f"  {code:<4} {cle:<38} {'ok' if cle in disponibles else 'ABSENT'}")
    print(f"Crédits restants : {client.restant}")
    ligue = next((c for c in r.liste_ligues if SPORTS.get(c) in disponibles), None)
    if ligue:
        bookmakers = sorted({c.bookmaker for ev in client.cotes(ligue, "h2h", r.odds_api_regions) for c in ev.cotes})
        print(f"Bookmakers vus sur {ligue} : {', '.join(bookmakers)}")
        print("Mettre la clé de 22bet (ou d'un bookmaker de la même plateforme) dans MOTEUR_BOOKMAKER_CIBLE.")
    return 0


def cmd_veille(args) -> int:
    """Service + interface web. Lancé par Docker et redémarré automatiquement."""
    import threading

    import uvicorn

    from .web.app import creer_app

    from .verrou import VerrouOccupe, verrou_exclusif

    try:
        verrou = verrou_exclusif(reglages().dossier / "moteur.verrou")
    except VerrouOccupe:
        log.info("Le moteur tourne déjà : cette deuxième copie s'arrête.")
        return 0
    service = _service()
    service.nettoyer_taches()
    service.appliquer_migrations()
    arreter = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: arreter.set())
    signal.signal(signal.SIGINT, lambda *_: arreter.set())
    with service.sessions() as s:
        depot_initial(s, "simulation", service.r.capital_initial)
    if not args.sans_web:
        serveur = uvicorn.Server(uvicorn.Config(creer_app(service), host="0.0.0.0", port=service.r.port_web,
                                                log_level="warning"))
        threading.Thread(target=serveur.run, name="web", daemon=True).start()
        log.info("Interface web : http://<adresse-du-serveur>:%s", service.r.port_web)
    service.boucle(arreter.is_set)
    verrou.close()
    return 0


def cmd_web(_args) -> int:
    """Interface web seule (sans le service), pour consulter ou régler."""
    import uvicorn

    from .web.app import creer_app

    service = _service(avec_reseau=False)
    service.charger_donnees()
    uvicorn.run(creer_app(service), host="0.0.0.0", port=service.r.port_web, log_level="info")
    return 0


def _sorties_utf8() -> None:
    """Windows écrit par défaut en cp1252 : les symboles (ξ, →, −) feraient planter l'affichage."""
    for flux in (sys.stdout, sys.stderr):
        if flux is not None and hasattr(flux, "reconfigure"):
            try:
                flux.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def main(argv: list[str] | None = None) -> int:
    _sorties_utf8()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # une ligne par fichier téléchargé, c'est trop
    parser = argparse.ArgumentParser(prog="moteur", description="Moteur d'analyse de paris sportifs")
    parser.add_argument("--version", action="version", version=f"moteur {__version__}")
    sous = parser.add_subparsers(dest="commande", required=True)

    sous.add_parser("init", help="crée la base et le capital de simulation").set_defaults(fn=cmd_init)
    sous.add_parser("etat", help="mode, capital, réglages, marchés validés").set_defaults(fn=cmd_etat)

    p = sous.add_parser("value", help="espérance et mise conseillée pour un pari")
    p.add_argument("--proba", type=float, required=True, help="probabilité estimée, ex. 0.52")
    p.add_argument("--cote", type=float, required=True)
    p.add_argument("--capital", type=float, help="par défaut : capital initial")
    p.set_defaults(fn=cmd_value)

    p = sous.add_parser("surebet", help="vérifie une combinaison complémentaire et répartit les mises")
    p.add_argument("cotes", type=float, nargs="+", help="ex. 5.00 1.30")
    p.add_argument("--total", type=float, default=100.0)
    p.set_defaults(fn=cmd_surebet)

    p = sous.add_parser("historique", help="télécharge l'historique football (20 ans) et les matchs à venir")
    p.add_argument("--ligues", nargs="+")
    p.add_argument("--depuis", type=int, help="année de début, ex. 2005")
    p.set_defaults(fn=cmd_historique)

    p = sous.add_parser("backtest", help="test chronologique + coffre-fort, choisit et valide les réglages")
    p.add_argument("--ligues", nargs="+")
    p.add_argument("--activer", action="store_true", help="écrit data/parametres.json (utilisé en direct)")
    p.add_argument("--prix", choices=["moy", "max", "b365"], help="cotes supposées obtenues")
    p.add_argument("--xi", help="valeurs de ξ à tester, ex. 0.001,0.002")
    p.add_argument("--travailleurs", type=int, help="nombre de cœurs (défaut : tous)")
    p.set_defaults(fn=cmd_backtest)

    p = sous.add_parser("analyser", help="met à jour les données, analyse les matchs à venir, affiche le rapport")
    p.add_argument("--hors-ligne", action="store_true", help="n'utilise que les fichiers déjà téléchargés")
    p.set_defaults(fn=cmd_analyser)

    p = sous.add_parser("fiche", help="prix justes de tous les marchés d'un match")
    p.add_argument("domicile")
    p.add_argument("exterieur")
    p.set_defaults(fn=cmd_fiche)

    p = sous.add_parser("rapport", help="rapport du jour")
    p.add_argument("--envoyer", action="store_true", help="l'envoie aussi sur Telegram")
    p.set_defaults(fn=cmd_rapport)

    p = sous.add_parser("bilan", help="bilan de la semaine (à coller dans Claude)")
    p.add_argument("--envoyer", action="store_true")
    p.set_defaults(fn=cmd_bilan)

    p = sous.add_parser("cote", help="22bet affiche cette cote pour un signal : je joue ?")
    p.add_argument("signal", type=int)
    p.add_argument("cote")
    p.set_defaults(fn=cmd_cote)

    p = sous.add_parser("pari", help="enregistre un pari réel pris sur 22bet")
    p.add_argument("signal", type=int)
    p.add_argument("cote")
    p.add_argument("--mise")
    p.set_defaults(fn=cmd_pari)

    p = sous.add_parser("resultat", help="saisit un score à la main")
    p.add_argument("match", type=int)
    p.add_argument("score", help="ex. 2-1")
    p.set_defaults(fn=cmd_resultat)

    sous.add_parser("journal", help="derniers paris").set_defaults(fn=cmd_journal)

    p = sous.add_parser("mode", help="passe en simulation ou en réel (conditions vérifiées)")
    p.add_argument("mode", choices=["simulation", "reel"])
    p.set_defaults(fn=cmd_mode)

    p = sous.add_parser("promo", help="valeur d'une promotion 22bet")
    p.add_argument("type", choices=["gratuit", "cashback", "boost"])
    p.add_argument("--proba", type=float, required=True, help="probabilité juste (voir `moteur fiche`)")
    p.add_argument("--cote", type=float, required=True)
    p.add_argument("--montant", type=float, required=True, help="montant du pari gratuit ou mise")
    p.add_argument("--taux", type=float, default=0.5, help="part remboursée (cashback)")
    p.set_defaults(fn=cmd_promo)

    sous.add_parser("sources", help="vérifie l'API de cotes : championnats et bookmakers couverts").set_defaults(fn=cmd_sources)
    p = sous.add_parser("veille", help="lance le service en continu et l'interface web")
    p.add_argument("--sans-web", action="store_true")
    p.set_defaults(fn=cmd_veille)
    sous.add_parser("web", help="interface web seule").set_defaults(fn=cmd_web)

    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
