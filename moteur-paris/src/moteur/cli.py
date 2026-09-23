"""Point d'entrée en ligne de commande : `moteur init`, `moteur etat`, `moteur veille`."""

import argparse
import logging
import signal
import sys
import time

from . import __version__
from .capital import arret_atteint, depot_initial, solde
from .config import reglages
from .db import fabrique_sessions, initialiser, moteur_bdd

log = logging.getLogger("moteur")


def _session():
    r = reglages()
    engine = moteur_bdd(r.database_url)
    initialiser(engine)
    return fabrique_sessions(engine)()


def cmd_init(_args) -> int:
    r = reglages()
    with _session() as s:
        capital = depot_initial(s, r.mode, r.capital_initial)
    log.info("Base prête. Mode %s, capital %.2f $.", r.mode, capital)
    return 0


def cmd_etat(_args) -> int:
    r = reglages()
    with _session() as s:
        actuel = solde(s, r.mode)
        arret = arret_atteint(s, r.mode, r.seuil_arret)
    print(f"Moteur de paris v{__version__}")
    print(f"  Mode             : {r.mode}")
    print(f"  Capital          : {'non initialisé' if actuel is None else f'{actuel:.2f} $'}")
    print(f"  Seuil d'arrêt    : {r.seuil_arret:.2f} $" + ("  ⚠ ATTEINT" if arret else ""))
    print(f"  Mise max         : {r.mise_max_pct:.0%} du capital, Kelly x{r.fraction_kelly}")
    print(f"  Clé Anthropic    : {'ok' if r.anthropic_api_key else 'manquante'}")
    print(f"  Clé API de cotes : {'ok' if r.odds_api_key else 'manquante'}")
    print(f"  Telegram         : {'ok' if r.telegram_token else 'non configuré'}")
    return 0


def cmd_veille(args) -> int:
    """Boucle principale du service. Les modules (collecte, modèles, chasseurs) s'y brancheront."""
    cmd_init(args)
    arreter = False

    def _stop(*_):
        nonlocal arreter
        arreter = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    log.info("Service démarré, intervalle %ss.", args.intervalle)
    while not arreter:
        log.info("Battement : aucun module actif pour l'instant (étape 0).")
        for _ in range(args.intervalle):
            if arreter:
                break
            time.sleep(1)
    log.info("Service arrêté proprement.")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="moteur", description="Moteur d'analyse de paris sportifs")
    sous = parser.add_subparsers(dest="commande", required=True)
    sous.add_parser("init", help="crée la base et le dépôt initial").set_defaults(fn=cmd_init)
    sous.add_parser("etat", help="affiche le capital et la configuration").set_defaults(fn=cmd_etat)
    veille = sous.add_parser("veille", help="lance le service en continu")
    veille.add_argument("--intervalle", type=int, default=60)
    veille.set_defaults(fn=cmd_veille)
    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
