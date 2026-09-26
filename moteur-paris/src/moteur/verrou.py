"""Verrou de fichier : une seule copie du service à la fois (Windows et Linux).

Sans lui, un double-clic pendant un calcul lourd pouvait démarrer une deuxième copie du
moteur, et les deux se gênaient (base de données verrouillée, téléchargements en double).
Le verrou est libéré automatiquement par le système si le programme s'arrête.
"""

import os
from pathlib import Path


class VerrouOccupe(Exception):
    pass


def verrou_exclusif(chemin: Path):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    fichier = open(chemin, "a+")
    try:
        if os.name == "nt":
            import msvcrt

            fichier.seek(0)
            msvcrt.locking(fichier.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(fichier.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fichier.close()
        raise VerrouOccupe(str(chemin))
    return fichier
