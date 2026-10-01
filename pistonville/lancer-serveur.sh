#!/bin/sh
# Lance le serveur de Pistonville (Mac / Linux). Il faut Node.js.
cd "$(dirname "$0")/.." && node tools/serveur-pistonville.mjs "${1:-8080}"
