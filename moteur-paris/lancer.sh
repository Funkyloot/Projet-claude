#!/usr/bin/env bash
# Ouvre le Moteur de paris : démarre le service s'il ne tourne pas, puis ouvre l'interface.
DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PORT="${MOTEUR_PORT_WEB:-8080}"
URL="http://localhost:$PORT"
PY="$DIR/environnement/bin/python"

if [ ! -x "$PY" ]; then
  notify-send "Moteur de paris" "Pas encore installé : lancez installer.sh une fois." 2>/dev/null \
    || echo "Pas encore installé : lancez installer.sh une fois."
  exit 1
fi

repond() { "$PY" -c "import urllib.request; urllib.request.urlopen('$URL/sante', timeout=2)" >/dev/null 2>&1; }

if ! repond; then
  if systemctl --user cat moteur-de-paris.service >/dev/null 2>&1; then
    systemctl --user start moteur-de-paris.service
  else
    cd "$DIR" && MOTEUR_DATABASE_URL="sqlite:///$DIR/data/moteur.db" MOTEUR_DOSSIER_DONNEES="$DIR/data" \
      nohup "$DIR/environnement/bin/moteur" veille >> "$DIR/data/moteur.log" 2>&1 &
  fi
  notify-send "Moteur de paris" "Démarrage…" 2>/dev/null || true
  for _ in $(seq 60); do repond && break; sleep 1; done
fi

# Fenêtre d'application (sans barre d'adresse) si Chrome, Chromium, Brave ou Edge est installé
for navigateur in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
  if command -v "$navigateur" >/dev/null 2>&1; then
    exec "$navigateur" --app="$URL" --window-size=1200,850 >/dev/null 2>&1
  fi
done
exec xdg-open "$URL"
