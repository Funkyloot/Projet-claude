#!/usr/bin/env bash
# Met le Moteur de paris à jour depuis GitHub (données conservées), puis le redémarre.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Tout est dans une fonction : bash lit le script en entier avant de l'exécuter, même si
# « git pull » remplace ce fichier pendant la mise à jour.
principal() {
  cd "$DIR"
  # Sauvegarde de la base avant toute mise à jour (copie cohérente même si le service tourne) ;
  # les 10 plus récentes sont gardées dans data/sauvegardes.
  if [ -f "$DIR/data/moteur.db" ]; then
    mkdir -p "$DIR/data/sauvegardes"
    COPIE="$DIR/data/sauvegardes/moteur-$(date +%Y%m%d-%H%M%S).db"
    "$DIR/environnement/bin/python" -c 'import sqlite3, sys; sqlite3.connect(sys.argv[1]).backup(sqlite3.connect(sys.argv[2]))' \
      "$DIR/data/moteur.db" "$COPIE"
    ls -1t "$DIR"/data/sauvegardes/moteur-*.db | tail -n +11 | xargs -r rm -f
    echo "Base sauvegardée : $COPIE"
  fi
  git -C "$DIR" pull --ff-only
  "$DIR/environnement/bin/pip" install --quiet --disable-pip-version-check "$DIR"
  if systemctl cat moteur-de-paris.service >/dev/null 2>&1; then
    systemctl restart moteur-de-paris.service
  elif systemctl --user cat moteur-de-paris.service >/dev/null 2>&1; then
    systemctl --user restart moteur-de-paris.service
  fi
  echo "Mis à jour : version $("$DIR/environnement/bin/python" -c 'import moteur; print(moteur.__version__)')."
}
principal "$@"
