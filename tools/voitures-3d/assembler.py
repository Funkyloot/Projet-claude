#!/usr/bin/env python3
"""assembler.py — range les rendus du Car Kit Kenney en une planche de jeu.

Entrée : un dossier de rendus (<modele>_NN.png et <modele>-m_NN.png, 32 angles,
produits par rendre.mjs). Sortie :
  - pistonville/assets/kenney/voitures-3d.png : une ligne par modèle, 32 vues ;
  - pistonville/assets/kenney/voitures-3d-masque.png : la carrosserie en blanc
    (pour repeindre une voiture à la couleur du joueur) ;
  - pistonville/src/atlas-voitures.js : position et taille de chaque ligne.

Usage : python3 tools/voitures-3d/assembler.py <dossier des rendus>
"""
import json
import sys
from pathlib import Path
from PIL import Image

SOURCE = Path(sys.argv[1])
RACINE = Path(__file__).resolve().parent.parent.parent / 'pistonville'
N = 32
CONTOUR = (34, 28, 48, 255)
# Ces modèles du Car Kit regardent dans l'autre sens que les autres (nez vers -Z) :
# on décale leurs vues d'un demi-tour pour que le nez suive le cap de la voiture.
INVERSES = {'race', 'race-future'}
MODELES = ['race', 'race-future', 'sedan-sports', 'hatchback-sports', 'kart-oodi',
           'sedan', 'suv', 'suv-luxury', 'taxi', 'police', 'van', 'truck', 'truck-flat',
           'tractor', 'delivery', 'ambulance', 'firetruck', 'garbage-truck']


def net(im):
    """Bords nets, façon pixel art, puis un contour sombre d'un pixel."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    plein = [[px[x, y][3] >= 128 for x in range(w)] for y in range(h)]
    out = Image.new('RGBA', (w, h))
    po = out.load()
    for y in range(h):
        for x in range(w):
            if plein[y][x]:
                r, g, b, _ = px[x, y]
                po[x, y] = (r, g, b, 255)
            elif any(0 <= x + dx < w and 0 <= y + dy < h and plein[y + dy][x + dx]
                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                po[x, y] = CONTOUR
    return out


lignes, atlas, y = [], {}, 0
for m in MODELES:
    k = N // 2 if m in INVERSES else 0
    vues = [net(Image.open(SOURCE / f'{m}_{(i + k) % N:02d}.png')) for i in range(N)]
    masques = [Image.open(SOURCE / f'{m}-m_{(i + k) % N:02d}.png').convert('L') for i in range(N)]
    boite = None
    for v in vues:
        b = v.getbbox()
        boite = b if boite is None else (min(boite[0], b[0]), min(boite[1], b[1]), max(boite[2], b[2]), max(boite[3], b[3]))
    # Boîte symétrique autour du centre du rendu : le centre du sprite reste le centre de la voiture.
    cx = vues[0].width / 2
    demi = max(cx - boite[0], boite[2] - cx)
    x0, x1 = int(cx - demi), int(cx + demi)
    y0, y1 = boite[1], boite[3]
    w, h = x1 - x0, y1 - y0
    atlas[m] = [y, w, h, round(vues[0].height / 2 - y0)]
    lignes.append((vues, masques, (x0, y0, x1, y1)))
    y += h

largeur = max(l[2][2] - l[2][0] for l in lignes) * N
planche = Image.new('RGBA', (largeur, y))
masque = Image.new('L', (largeur, y))
for (vues, masques, b), m in zip(lignes, MODELES):
    oy, w = atlas[m][0], atlas[m][1]
    for i in range(N):
        planche.alpha_composite(vues[i].crop(b), (i * w, oy))
        mk = masques[i].crop(b).point(lambda v: 255 if v >= 128 else 0)
        alpha = vues[i].crop(b).getchannel('A')
        masque.paste(mk, (i * w, oy), alpha)

# 256 couleurs suffisent (le Car Kit n'a qu'une petite palette) : la planche pèse dix fois moins.
planche.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(RACINE / 'assets' / 'kenney' / 'voitures-3d.png', optimize=True)
masque.save(RACINE / 'assets' / 'kenney' / 'voitures-3d-masque.png', optimize=True)
(RACINE / 'src' / 'atlas-voitures.js').write_text(
    '/* atlas-voitures.js — généré par tools/voitures-3d/assembler.py (Kenney Car Kit, CC0).\n'
    ' * Pour chaque modèle : [y de la ligne, largeur et hauteur d\'une vue, hauteur du centre].\n'
    f' * {N} vues par ligne ; la vue i regarde vers l\'angle i × 2π / {N} (0 = est, sens horaire). */\n'
    f'export const VUES = {N};\n'
    f'export const ATLAS_VOITURES = {json.dumps(atlas)};\n')
print(largeur, y, atlas)
