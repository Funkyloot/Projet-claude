#!/usr/bin/env python3
"""serveur-pistonville.py — sert Pistonville et garde la sauvegarde sur le serveur.

Sans dépendance (Python 3 seul). Deux rôles :
  - servir les fichiers du jeu (dossier dist/web), en lecture seule ;
  - garder une copie de la partie : GET /api/sauvegarde la renvoie,
    PUT ou POST /api/sauvegarde la remplace. Ainsi la même partie suit le
    joueur sur toutes les adresses (maison, Tailscale) et survit si le
    téléphone ferme le jeu brutalement.

Pensé pour un réseau privé (maison, Tailscale) : un seul joueur, pas de compte.

Usage : python3 serveur-pistonville.py DOSSIER_WEB PORT [DOSSIER_SAUVEGARDE]
"""

import json
import os
import sys
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TAILLE_MAX = 2 * 1024 * 1024   # une sauvegarde fait quelques dizaines de ko


class Gestionnaire(SimpleHTTPRequestHandler):
    dossier_sauvegarde = '.'

    def fichier(self):
        return os.path.join(self.dossier_sauvegarde, 'sauvegarde.json')

    def end_headers(self):
        # Le jeu doit toujours voir la dernière version publiée.
        if not self.path.endswith('.png'):
            self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def repondre(self, code, corps=b'', type_='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', type_)
        self.send_header('Content-Length', str(len(corps)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(corps)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/sauvegarde':
            try:
                with open(self.fichier(), 'rb') as f:
                    self.repondre(200, f.read())
            except FileNotFoundError:
                self.repondre(404, b'{}')
            return
        super().do_GET()

    def enregistrer(self):
        if self.path.split('?')[0] != '/api/sauvegarde':
            self.repondre(404, b'{}')
            return
        taille = int(self.headers.get('Content-Length') or 0)
        if taille <= 0 or taille > TAILLE_MAX:
            self.repondre(413, b'{"erreur":"taille"}')
            return
        brut = self.rfile.read(taille)
        try:
            partie = json.loads(brut)
            assert isinstance(partie, dict) and isinstance(partie.get('garage'), list) and 'jour' in partie
        except (ValueError, AssertionError):
            self.repondre(400, b'{"erreur":"sauvegarde illisible"}')
            return
        # On ne remplace jamais une partie plus récente par une plus ancienne.
        try:
            with open(self.fichier(), 'rb') as f:
                actuelle = json.load(f)
            if (actuelle.get('horodatage') or 0) > (partie.get('horodatage') or 0):
                self.repondre(409, json.dumps({'horodatage': actuelle.get('horodatage')}).encode())
                return
        except (FileNotFoundError, ValueError):
            pass
        os.makedirs(self.dossier_sauvegarde, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.dossier_sauvegarde, suffix='.tmp')
        with os.fdopen(fd, 'wb') as f:
            f.write(brut)
        os.replace(tmp, self.fichier())   # écriture atomique : jamais de fichier à moitié écrit
        self.repondre(200, b'{"ok":true}')

    do_PUT = enregistrer
    do_POST = enregistrer

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


def main():
    web = sys.argv[1] if len(sys.argv) > 1 else '.'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
    Gestionnaire.dossier_sauvegarde = (sys.argv[3] if len(sys.argv) > 3
                                       else os.environ.get('STATE_DIRECTORY') or web)
    Gestionnaire.extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                                   '.webmanifest': 'application/manifest+json', '.js': 'text/javascript'}
    serveur = ThreadingHTTPServer(('0.0.0.0', port), partial(Gestionnaire, directory=web))
    print(f'Pistonville sur le port {port}, sauvegardes dans {Gestionnaire.dossier_sauvegarde}', flush=True)
    serveur.serve_forever()


if __name__ == '__main__':
    main()
