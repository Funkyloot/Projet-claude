#!/usr/bin/env python3
"""icones.py — icônes de l'application Android et de la fiche Google Play.

Une voiture de course du Car Kit Kenney (vue de trois quarts, tirée de
voitures-3d.png), agrandie au pixel près sur le bleu nuit du jeu, au-dessus
d'un damier d'arrivée. Produit :
  - android/app/src/main/res/mipmap-*/ic_launcher*.png (icônes classiques et
    premier plan des icônes adaptatives) ;
  - store/icone-512.png (fiche Google Play).

Usage : python3 tools/android/icones.py
"""
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parents[2]
PV = RACINE / 'pistonville'
FOND = (31, 42, 68, 255)
MODELE, VUE = 'race', 28    # formule de course rouge, vue de trois quarts arrière (l'icône choisie)
NUIT = (20, 16, 34, 255)


def voiture(modele='race-future', vue=12, couleur=None):
    """Une vue de la planche voitures-3d (12 = trois quarts avant)."""
    atlas = re.search(r'ATLAS_VOITURES = (\{.*\});', (PV / 'src' / 'atlas-voitures.js').read_text()).group(1)
    y, w, h, _ = json.loads(atlas)[modele]
    planche = Image.open(PV / 'assets' / 'kenney' / 'voitures-3d.png').convert('RGBA')
    return planche.crop((vue * w, y, vue * w + w, y + h))


def damier(d, x0, y0, x1, case):
    for i, x in enumerate(range(x0, x1, case)):
        for j in range(2):
            c = (244, 241, 232, 255) if (i + j) % 2 == 0 else (38, 40, 56, 255)
            d.rectangle([x, y0 + j * case, x + case - 1, y0 + (j + 1) * case - 1], fill=c)


def dessin(taille, marge=0.0, fond=True, modele=MODELE, vue=VUE):
    """Image carrée : la voiture occupe la zone centrale (marge = part laissée de chaque côté)."""
    S = 512
    im = Image.new('RGBA', (S, S), FOND if fond else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    interieur = int(S * (1 - 2 * marge))
    o = (S - interieur) // 2
    if fond:
        # Halo plus clair derrière la voiture, damier en bas.
        for r in range(220, 0, -20):
            t = r / 220
            col = tuple(int(FOND[k] * t + (60, 82, 128)[k] * (1 - t)) for k in range(3)) + (255,)
            d.ellipse([S // 2 - r, S // 2 - 30 - r * 0.8, S // 2 + r, S // 2 - 30 + r * 0.8], fill=col)
        damier(d, 0, int(S * 0.80), S, S // 16)
    v = voiture(modele, vue)
    k = max(1, int(interieur * 0.9 / max(v.width, v.height)))
    grande = v.resize((v.width * k, v.height * k), Image.NEAREST)
    im.alpha_composite(grande, (o + (interieur - grande.width) // 2, o + (interieur - grande.height) // 2 - int(interieur * 0.04)))
    return im.resize((taille, taille), Image.NEAREST if taille % 512 == 0 or 512 % taille == 0 else Image.LANCZOS)



def main():
    RES = RACINE / 'android' / 'app' / 'src' / 'main' / 'res'
    DENSITES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for nom, k in DENSITES.items():
        dossier = RES / f'mipmap-{nom}'
        dossier.mkdir(parents=True, exist_ok=True)
        classique = dessin(int(48 * k), marge=0.06)
        classique.save(dossier / 'ic_launcher.png')
        # Ronde : la même, découpée en disque.
        masque = Image.new('L', classique.size, 0)
        ImageDraw.Draw(masque).ellipse([0, 0, classique.width - 1, classique.height - 1], fill=255)
        ronde = Image.new('RGBA', classique.size)
        ronde.paste(classique, (0, 0), masque)
        ronde.save(dossier / 'ic_launcher_round.png')
        # Premier plan adaptatif (108 dp, contenu dans le cercle central de 66 dp).
        dessin(int(108 * k), marge=0.2, fond=False).save(dossier / 'ic_launcher_foreground.png')
        dessin(int(108 * k), marge=0.0, fond=True).save(dossier / 'ic_launcher_background.png')

    STORE = RACINE / 'store'
    STORE.mkdir(exist_ok=True)
    dessin(512, marge=0.06).convert('RGB').save(STORE / 'icone-512.png')
    print('icônes écrites')


if __name__ == '__main__':
    main()
