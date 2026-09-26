@echo off
chcp 65001 >nul
title Installation du Moteur de paris
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\installer.ps1"
echo.
pause
