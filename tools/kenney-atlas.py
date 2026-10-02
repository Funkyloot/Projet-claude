#!/usr/bin/env python3
"""kenney-atlas.py — prépare les planches Kenney de Pistonville (CC0).

Prend les packs Kenney décompressés (Racing Pack, Roguelike Modern City,
Pixel Vehicle Pack) et
fabrique, à l'échelle du jeu (une case de 16 px ≈ 1 m, une voiture ≈ 28 px de
large ; les véhicules eux-mêmes viennent du Car Kit, voir tools/voitures-3d/) :
  - pistonville/assets/kenney/course.png + src/atlas-course.js : le décor de
    course (tribunes, tentes, pneus, cônes, barrières…),
    réduits proprement (Lanczos) puis détourés net ;
  - pistonville/assets/kenney/modern-city.png : la planche Roguelike Modern
    City telle quelle (tuiles de 16 px, 37 colonnes).

Usage : python3 tools/kenney-atlas.py <dossier des packs décompressés>
        (sous-dossiers racing/, roguelike-modern-city/ et pvp/)
"""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

SOURCE = Path(sys.argv[1])
RACINE = Path(__file__).resolve().parent.parent / 'pistonville'
ECHELLE = 28 / 71          # largeur d'une voiture Kenney → 28 px de jeu

PNG = SOURCE / 'racing' / 'PNG'
SPRITES = []
OBJETS = {
    'tribune': ('tribune_full', 1), 'tribuneVide': ('tribune_empty', 1),
    'auventRouge': ('tribune_overhang_red', 1), 'auventRaye': ('tribune_overhang_striped', 1),
    'tenteRouge': ('tent_red', 1), 'tenteBleue': ('tent_blue', 1),
    'pneusRouges': ('tires_red', 1), 'pneusBlancs': ('tires_white', 1),
    'cone': ('cone_straight', 1), 'barriereRouge': ('barrier_red_race', 1), 'barriereBlanche': ('barrier_white_race', 1),
    'feux': ('lights', 1), 'tonneauRouge': ('barrel_red', 1), 'tonneauBleu': ('barrel_blue', 1),
    'grandArbre': ('tree_large', 0.55), 'petitArbre': ('tree_small', 0.6), 'huile': ('oil', 1), 'rocher': ('rock1', 1),
}
for nom, (fichier, k) in OBJETS.items():
    SPRITES.append((nom, PNG / 'Objects' / f'{fichier}.png', ECHELLE * k))
# Panneaux du Pixel Vehicle Pack (déjà à l'échelle des pixels du jeu).
PVP = SOURCE / 'pvp' / 'PNG' / 'Props'
for nom, fichier in {'stop': 'sign_red', 'panneauBleu': 'sign_blue', 'plaqueRue': 'sign_street'}.items():
    SPRITES.append((nom, PVP / f'{fichier}.png', 1))


def reduire(chemin, echelle):
    im = Image.open(chemin).convert('RGBA')
    w, h = max(1, round(im.width * echelle)), max(1, round(im.height * echelle))
    petit = im.resize((w, h), Image.LANCZOS)
    # Bords nets, façon pixel art : on garde ou on jette chaque pixel.
    px = petit.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255 if a >= 110 else 0)
    return petit


images = [(nom, reduire(chemin, k)) for nom, chemin, k in SPRITES]
# Rangement en étagères de 512 px de large.
LARGEUR, x, y, haut = 512, 0, 0, 0
rects = {}
for nom, im in images:
    if x + im.width > LARGEUR:
        x, y, haut = 0, y + haut + 1, 0
    rects[nom] = [x, y, im.width, im.height]
    x += im.width + 1
    haut = max(haut, im.height)
planche = Image.new('RGBA', (LARGEUR, y + haut))
for nom, im in images:
    planche.paste(im, tuple(rects[nom][:2]))
planche.save(RACINE / 'assets' / 'kenney' / 'course.png', optimize=True)
(RACINE / 'src' / 'atlas-course.js').write_text(
    '/* atlas-course.js — généré par tools/kenney-atlas.py : où trouver chaque image\n'
    ' * de assets/kenney/course.png (Kenney Racing Pack, CC0), en [x, y, largeur, hauteur]. */\n\n'
    f'export const ATLAS_COURSE = {json.dumps(rects, indent=2)};\n')
shutil.copy(SOURCE / 'roguelike-modern-city' / 'Tilemap' / 'tilemap_packed.png', RACINE / 'assets' / 'kenney' / 'modern-city.png')
print('course.png', planche.size, len(rects), 'images')
