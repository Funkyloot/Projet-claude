"""Point d'entrée en ligne de commande : init, etat, value, surebet, veille."""

import argparse
import logging
import signal
import sys
import time

from . import __version__
from .calcul import analyser_value, marge, mise_conseillee, surebet
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


def _pct(x: float) -> str:
    return f"{x:+.2%}".replace(".", ",")


def cmd_value(args) -> int:
    r = reglages()
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
    r = reglages()
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
    value = sous.add_parser("value", help="évalue un pari : espérance et mise conseillée")
    value.add_argument("--proba", type=float, required=True, help="probabilité estimée, ex. 0.52")
    value.add_argument("--cote", type=float, required=True)
    value.add_argument("--capital", type=float, help="par défaut : capital initial")
    value.set_defaults(fn=cmd_value)
    sb = sous.add_parser("surebet", help="vérifie une combinaison complémentaire et répartit les mises")
    sb.add_argument("cotes", type=float, nargs="+", help="ex. 5.00 1.30")
    sb.add_argument("--total", type=float, default=100.0)
    sb.set_defaults(fn=cmd_surebet)
    veille = sous.add_parser("veille", help="lance le service en continu")
    veille.add_argument("--intervalle", type=int, default=60)
    veille.set_defaults(fn=cmd_veille)
    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
