@echo off
REM Lance le serveur de Pistonville : double-clic sur ce fichier.
REM Il faut Node.js (https://nodejs.org, version LTS).
title Pistonville - serveur
node "%~dp0..\tools\serveur-pistonville.mjs" 8080
pause
