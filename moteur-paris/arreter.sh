#!/usr/bin/env bash
# Arrête le Moteur de paris (il redémarrera à la prochaine session ou au prochain double-clic).
systemctl stop moteur-de-paris.service 2>/dev/null
systemctl --user stop moteur-de-paris.service 2>/dev/null
if pkill -f "environnement/bin/moteur veille" 2>/dev/null; then
  for _ in $(seq 10); do pgrep -f "environnement/bin/moteur veille" >/dev/null || break; sleep 1; done
  pkill -9 -f "environnement/bin/moteur veille" 2>/dev/null  # arrêt forcé si un téléchargement traîne
fi
echo "Moteur de paris arrêté."
