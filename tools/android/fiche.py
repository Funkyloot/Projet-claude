#!/usr/bin/env python3
"""fiche.py — visuels de la fiche Google Play.

  - store/captures/NN-*.png : captures 1080 × 1920 légendées (bandeau en haut,
    capture du jeu dessous), à partir des captures brutes du jeu ;
  - store/banniere-1024x500.png : l'image de présentation.

Usage : python3 tools/android/fiche.py <dossier des captures brutes> <police .ttf>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BRUT, POLICE = Path(sys.argv[1]), sys.argv[2]
RACINE = Path(__file__).resolve().parents[2]
SORTIE = RACINE / 'store'
NUIT, JAUNE, CREME = (20, 16, 34), (242, 193, 78), (244, 241, 232)

CAPTURES = [
    ('1-garage', 'Construis ton garage', 'et embauche ton équipe'),
    ('3-course', 'Des courses à une main', 'gauche, droite, nitro !'),
    ('4-ville', 'Une grande ville vivante', 'à explorer chaque soir'),
    ('9-a-pied', 'Descends de voiture', 'et entre dans les boutiques'),
    ('2-depart', '55 Grands Prix', '141 circuits à gagner'),
    ('5-mes-voitures', '45 voitures', 'à construire et améliorer'),
    ('7-briefing', 'Deux pilotes par course', 'choisis ta stratégie'),
    ('8-resultats', 'Monte en rang', 'et deviens une légende'),
]


def police(taille):
    return ImageFont.truetype(POLICE, taille)


def centre(d, y, texte, taille, couleur, largeur=1080):
    f = police(taille)
    w = d.textlength(texte, font=f)
    x = (largeur - w) / 2
    # Contour sombre, comme dans le jeu.
    for dx in (-4, 0, 4):
        for dy in (-4, 0, 4):
            d.text((x + dx, y + dy), texte, font=f, fill=NUIT)
    d.text((x, y), texte, font=f, fill=couleur)


def capture(n, nom, titre, sous):
    im = Image.new('RGB', (1080, 1920), (31, 42, 68))
    d = ImageDraw.Draw(im)
    # Damier en haut, puis les deux lignes de légende.
    for i in range(0, 1080, 40):
        for j in range(2):
            d.rectangle([i, j * 40, i + 39, j * 40 + 39], fill=CREME if (i // 40 + j) % 2 == 0 else (38, 40, 56))
    centre(d, 120, titre, 104, JAUNE)
    centre(d, 240, sous, 76, CREME)
    jeu = Image.open(BRUT / f'brut-{nom}.png').convert('RGB')
    h = 1920 - 380
    w = round(jeu.width * h / jeu.height)
    jeu = jeu.resize((w, h), Image.LANCZOS)
    x = (1080 - w) // 2
    d.rectangle([x - 8, 372, x + w + 7, 1920], fill=NUIT)
    im.paste(jeu, (x, 380))
    im.save(SORTIE / 'captures' / f'{n:02d}-{nom.split("-", 1)[1]}.png')


def banniere():
    """1024 × 500 : le titre du jeu sur une course, comme l'écran titre."""
    fond = Image.open(BRUT / 'brut-3-course.png').convert('RGB')
    fond = fond.crop((0, 300, 1080, 300 + 527)).resize((1024, 500), Image.LANCZOS)
    voile = Image.new('RGB', fond.size, NUIT)
    im = Image.blend(fond, voile, 0.45)
    d = ImageDraw.Draw(im)
    for i in range(0, 1024, 32):
        for j in range(2):
            d.rectangle([i, 436 + j * 32, i + 31, 436 + j * 32 + 31], fill=CREME if (i // 32 + j) % 2 == 0 else (38, 40, 56))
    centre(d, 70, 'PISTON', 150, JAUNE, 1024)
    centre(d, 200, 'VILLE', 150, CREME, 1024)
    centre(d, 345, 'Ton garage, ton équipe, tes Grands Prix', 52, CREME, 1024)
    im.save(SORTIE / 'banniere-1024x500.png')


(SORTIE / 'captures').mkdir(parents=True, exist_ok=True)
for i, (nom, titre, sous) in enumerate(CAPTURES, 1):
    capture(i, nom, titre, sous)
banniere()
print('fiche écrite')
