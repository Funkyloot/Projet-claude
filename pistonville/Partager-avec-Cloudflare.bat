@echo off
REM Donne une adresse https publique et temporaire vers le serveur (Cloudflare).
REM Lance d abord Lancer-serveur.bat, puis ce fichier. Il faut cloudflared installe.
title Pistonville - acces hors de la maison (Cloudflare)
cloudflared tunnel --url http://localhost:8080
pause
