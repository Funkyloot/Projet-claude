#!/usr/bin/env bash
# Met le Moteur de paris à jour depuis GitHub (données conservées), puis le redémarre.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
git -C "$DIR" pull --ff-only
"$DIR/environnement/bin/pip" install --quiet --disable-pip-version-check "$DIR"
if systemctl cat moteur-de-paris.service >/dev/null 2>&1; then
  systemctl restart moteur-de-paris.service
elif systemctl --user cat moteur-de-paris.service >/dev/null 2>&1; then
  systemctl --user restart moteur-de-paris.service
fi
echo "Mis à jour : version $("$DIR/environnement/bin/python" -c 'import moteur; print(moteur.__version__)')."
