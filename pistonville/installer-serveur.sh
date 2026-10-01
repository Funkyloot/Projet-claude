#!/bin/bash
# installer-serveur.sh — installe (ou met à jour) Pistonville sur un serveur Linux
# (Debian / Ubuntu, par exemple une VM Proxmox) et le lance comme un service :
# il redémarre tout seul, même après un redémarrage du serveur.
#
#   bash /opt/pistonville/pistonville/installer-serveur.sh
#
# Le jeu est servi sur le port 8080 (PORT=9000 bash … pour en changer).
# Aucune installation nécessaire : seulement git et python3, déjà présents.

set -e
DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
BRANCHE="claude/kairosoft-hybrid-racing-game-5x34eg"
PORT="${PORT:-8080}"

# 1. Récupérer la dernière version (puis relancer ce script, à jour lui aussi).
if [ "$1" != "--deja-a-jour" ] && git -C "$DOSSIER" rev-parse >/dev/null 2>&1; then
  echo "→ Récupération de la dernière version…"
  git -C "$DOSSIER" fetch -q origin "$BRANCHE"
  git -C "$DOSSIER" checkout -q --detach FETCH_HEAD
  exec bash "$DOSSIER/pistonville/installer-serveur.sh" --deja-a-jour
fi

WEB="$DOSSIER/pistonville/dist/web"
if [ ! -f "$WEB/index.html" ]; then
  echo "Le jeu construit est introuvable dans $WEB" >&2
  exit 1
fi
command -v python3 >/dev/null || { echo "→ Installation de python3…"; apt-get update -q && apt-get install -y -q python3; }

# 2. Le service : un petit serveur web en lecture seule, sous un utilisateur jetable.
echo "→ Installation du service pistonville (port $PORT)…"
cat > /etc/systemd/system/pistonville.service <<EOF
[Unit]
Description=Pistonville (jeu)
After=network.target

[Service]
WorkingDirectory=$WEB
ExecStart=/usr/bin/python3 -m http.server $PORT --bind 0.0.0.0
Restart=always
DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q pistonville
systemctl restart pistonville
sleep 1
systemctl is-active --quiet pistonville && echo "✓ Pistonville tourne." || { echo "Le service n'a pas démarré :" >&2; journalctl -u pistonville -n 20 --no-pager; exit 1; }

# 3. Les adresses.
echo
echo "À la maison (même réseau) :"
for ip in $(hostname -I); do case "$ip" in *:*) ;; *) echo "   http://$ip:$PORT" ;; esac; done

echo
if command -v tailscale >/dev/null && tailscale status >/dev/null 2>&1; then
  echo "→ Partage via Tailscale…"
  # La première fois, Tailscale peut afficher un lien pour activer HTTPS : ouvre-le, puis relance ce script.
  timeout 30 tailscale serve --bg "$PORT" || echo "   (si un lien s'est affiché, ouvre-le puis relance ce script)"
  echo "Hors de la maison (Tailscale) :"
  tailscale serve status 2>/dev/null | grep -o 'https://[^ ]*' | head -1 | sed 's/^/   /'
else
  echo "Hors de la maison : installe Tailscale sur ce serveur, une seule fois :"
  echo "   curl -fsSL https://tailscale.com/install.sh | sh"
  echo "   tailscale up        (ouvre le lien affiché et connecte-toi)"
  echo "puis relance ce script. Installe aussi l'appli Tailscale sur ton téléphone (même compte)."
fi
echo
echo "Mise à jour plus tard : bash $DOSSIER/pistonville/installer-serveur.sh"
