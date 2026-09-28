#!/usr/bin/env bash
# Installation du Moteur de paris sur Linux (Ubuntu, Debian, Mint…). À lancer une seule fois.
# Tout vient de sources officielles : paquets de la distribution (apt) et PyPI (pip).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOM="Moteur de paris"
# Connecté en root (serveur Debian), sudo n'existe pas forcément : on s'en passe.
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
echo "=== Installation : $NOM ==="
echo "Dossier : $DIR"

# 1. Python 3.10 ou plus récent, avec venv
if ! command -v python3 >/dev/null 2>&1; then
  echo "Installation de Python (mot de passe administrateur demandé)…"
  $SUDO apt-get update && $SUDO apt-get install -y python3 python3-venv
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "Python $(python3 -V) est trop ancien : il faut 3.10 ou plus (Ubuntu 22.04 ou plus récent)." >&2
  exit 1
fi
if ! python3 -c 'import venv, ensurepip' >/dev/null 2>&1; then
  echo "Installation de python3-venv (mot de passe administrateur demandé)…"
  $SUDO apt-get update && $SUDO apt-get install -y python3-venv
fi

# 2. Environnement isolé + dépendances (téléchargées depuis PyPI, le dépôt officiel de Python)
echo "Préparation de l'application (quelques minutes la première fois)…"
python3 -m venv "$DIR/environnement"
"$DIR/environnement/bin/pip" install --quiet --upgrade pip
"$DIR/environnement/bin/pip" install --quiet "$DIR"
mkdir -p "$DIR/data"
chmod +x "$DIR/lancer.sh" "$DIR/arreter.sh"

# 3. Service qui tourne en continu
if [ "$(id -u)" -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
  # Serveur : service système, démarre avec la machine, sans que personne ne soit connecté
  cat > /etc/systemd/system/moteur-de-paris.service <<UNIT
[Unit]
Description=$NOM
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$DIR
Environment=MOTEUR_DATABASE_URL=sqlite:///$DIR/data/moteur.db
Environment=MOTEUR_DOSSIER_DONNEES=$DIR/data
ExecStart=$DIR/environnement/bin/moteur veille
Restart=always
RestartSec=10
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable moteur-de-paris.service
  systemctl restart moteur-de-paris.service
  echo "Service système installé : il tourne jour et nuit et redémarre avec la machine."
elif command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/moteur-de-paris.service" <<UNIT
[Unit]
Description=$NOM
After=network-online.target

[Service]
WorkingDirectory=$DIR
Environment=MOTEUR_DATABASE_URL=sqlite:///$DIR/data/moteur.db
Environment=MOTEUR_DOSSIER_DONNEES=$DIR/data
ExecStart=$DIR/environnement/bin/moteur veille
Restart=always
RestartSec=10
TimeoutStopSec=15

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable moteur-de-paris.service
  systemctl --user restart moteur-de-paris.service
  # Pour qu'il tourne aussi quand personne n'est connecté (après un redémarrage du PC)
  $SUDO loginctl enable-linger "$USER" 2>/dev/null || echo "(Info : le service démarrera à l'ouverture de session.)"
  echo "Service installé : il tourne jour et nuit et redémarre tout seul."
else
  echo "(systemd absent : le service démarrera au premier lancement de lancer.sh.)"
fi

# 4. Icône sur le bureau et dans le menu (seulement s'il y a un bureau graphique)
if [ -n "${XDG_CURRENT_DESKTOP:-}${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] || command -v xdg-user-dir >/dev/null 2>&1; then
  BUREAU="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
  mkdir -p "$BUREAU" "$HOME/.local/share/applications"
  LANCEUR="[Desktop Entry]
Type=Application
Name=$NOM
Comment=Analyse des paris football et rapport du jour
Exec=\"$DIR/lancer.sh\"
Icon=$DIR/bureau/icone.svg
Terminal=false
Categories=Office;Finance;
StartupNotify=true"
  echo "$LANCEUR" > "$HOME/.local/share/applications/moteur-de-paris.desktop"
  echo "$LANCEUR" > "$BUREAU/moteur-de-paris.desktop"
  chmod +x "$BUREAU/moteur-de-paris.desktop" "$HOME/.local/share/applications/moteur-de-paris.desktop"
  gio set "$BUREAU/moteur-de-paris.desktop" metadata::trusted true 2>/dev/null || true
fi

ADRESSE="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "=== Terminé ==="
echo "Ouvrez l'application depuis un navigateur du même réseau : http://${ADRESSE:-adresse-du-serveur}:8080"
echo "(Sur ce PC, avec un bureau : double-clic sur l'icône « $NOM ».)"
