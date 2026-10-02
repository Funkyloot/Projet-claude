#!/bin/bash
# installer-serveur.sh — installe (ou met à jour) Pistonville sur un serveur Linux
# (Debian / Ubuntu, par exemple une VM Proxmox) et le lance comme un service :
# il redémarre tout seul, même après un redémarrage du serveur.
#
#   bash /opt/pistonville/pistonville/installer-serveur.sh
#
# Une fois installé, le jeu se met à jour tout seul : toutes les 10 minutes,
# le serveur regarde s'il y a une nouvelle version et l'installe. Depuis le
# téléphone, le bouton « Mettre à jour le jeu » (écran titre) le fait tout de
# suite. On peut aussi relancer cette commande à la main.
#
# Le jeu est servi sur le port 8090 (PORT=9000 bash … pour en changer) ; si ce
# port est déjà pris par une autre application, le script en choisit un libre.
# Aucune installation nécessaire : seulement git et python3, déjà présents.
# Le serveur garde aussi une copie de la partie : la même sauvegarde sur toutes
# les adresses (maison, Tailscale), même si le téléphone ferme le jeu d'un coup.

set -e
DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
BRANCHE="claude/kairosoft-hybrid-racing-game-5x34eg"
# Le port choisi à la première installation est gardé pour les mises à jour.
PORT="${PORT:-$(cat /etc/pistonville.port 2>/dev/null || echo 8090)}"
AUTO=""
case " $* " in *" --auto "*) AUTO=1 ;; esac

# 1. Récupérer la dernière version (puis relancer ce script, à jour lui aussi).
#    En mode --auto (mise à jour automatique), on s'arrête là si rien n'a changé.
if [ "$1" != "--deja-a-jour" ] && git -C "$DOSSIER" rev-parse >/dev/null 2>&1; then
  [ -z "$AUTO" ] && echo "→ Récupération de la dernière version…"
  git -C "$DOSSIER" fetch -q origin "$BRANCHE"
  if [ -n "$AUTO" ] && [ "$(git -C "$DOSSIER" rev-parse HEAD)" = "$(git -C "$DOSSIER" rev-parse FETCH_HEAD)" ] \
     && systemctl is-active --quiet pistonville; then
    exit 0
  fi
  git -C "$DOSSIER" checkout -q --detach FETCH_HEAD
  exec bash "$DOSSIER/pistonville/installer-serveur.sh" --deja-a-jour ${AUTO:+--auto}
fi

WEB="$DOSSIER/pistonville/dist/web"
if [ ! -f "$WEB/index.html" ]; then
  echo "Le jeu construit est introuvable dans $WEB" >&2
  exit 1
fi
command -v python3 >/dev/null || { echo "→ Installation de python3…"; apt-get update -q && apt-get install -y -q python3; }

# Un port déjà utilisé par une autre application (hors Pistonville) ? On prend le suivant libre.
systemctl stop pistonville 2>/dev/null || true
port_pris() {
  python3 -c "import socket,sys; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try: s.bind(('0.0.0.0', $1))
except OSError: sys.exit(0)
sys.exit(1)"
}
while port_pris "$PORT"; do
  echo "   Le port $PORT est déjà utilisé par une autre application, j'essaie $((PORT + 1))."
  PORT=$((PORT + 1))
done

# 2. Le service : le jeu en lecture seule + la copie de la sauvegarde (dans
#    /var/lib/pistonville), sous un utilisateur jetable.
echo "→ Installation du service pistonville (port $PORT)…"
cat > /etc/systemd/system/pistonville.service <<EOF
[Unit]
Description=Pistonville (jeu)
After=network.target

[Service]
WorkingDirectory=$WEB
ExecStart=/usr/bin/python3 $DOSSIER/tools/serveur-pistonville.py $WEB $PORT
StateDirectory=pistonville
Restart=always
DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
# 3. La mise à jour automatique : toutes les 10 minutes, et tout de suite quand
#    le téléphone la demande (le jeu dépose un fichier « maj-demandee »).
cat > /etc/systemd/system/pistonville-maj.service <<EOF
[Unit]
Description=Pistonville : mise à jour
After=network-online.target

[Service]
Type=oneshot
ExecStartPre=/bin/sh -c 'rm -f /var/lib/private/pistonville/maj-demandee; echo en-cours > /var/lib/private/pistonville/maj-etat'
ExecStart=/bin/bash $DOSSIER/pistonville/installer-serveur.sh --auto
ExecStopPost=/bin/sh -c 'echo fini > /var/lib/private/pistonville/maj-etat'
EOF
cat > /etc/systemd/system/pistonville-maj.timer <<EOF
[Unit]
Description=Pistonville : chercher une nouvelle version toutes les 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/pistonville-maj.path <<EOF
[Unit]
Description=Pistonville : mise à jour demandée depuis le jeu

[Path]
PathExists=/var/lib/private/pistonville/maj-demandee
Unit=pistonville-maj.service

[Install]
WantedBy=multi-user.target
EOF
echo "$PORT" > /etc/pistonville.port
systemctl daemon-reload
systemctl enable -q pistonville
systemctl restart pistonville
systemctl enable -q --now pistonville-maj.timer pistonville-maj.path 2>/dev/null || true
sleep 2
# On vérifie que c'est bien le jeu qui répond sur ce port.
if systemctl is-active --quiet pistonville && python3 -c "import urllib.request,sys; sys.exit(0 if b'Pistonville' in urllib.request.urlopen('http://127.0.0.1:$PORT/', timeout=5).read() else 1)" 2>/dev/null; then
  echo "✓ Pistonville tourne sur le port $PORT."
else
  echo "Le service n'a pas démarré correctement :" >&2
  journalctl -u pistonville -n 20 --no-pager
  exit 1
fi

[ -n "$AUTO" ] && { echo "Pistonville mis à jour : $(cat "$WEB/version.txt" 2>/dev/null)"; exit 0; }

# 4. Les adresses.
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
echo "Mises à jour : automatiques (toutes les 10 min, ou bouton « Mettre à jour le jeu » sur l'écran titre)."
echo "À la main : bash $DOSSIER/pistonville/installer-serveur.sh"
