#!/usr/bin/env python3
"""musique-wav.py — rend un air du jeu (src/musique.js) en fichier WAV, pour la bande-annonce.

Même recette que le séquenceur du jeu (son.js) : mélodie en signal carré,
basse en triangle, grosse caisse, caisse claire et charleston en bruit filtré.

Usage : python3 tools/android/musique-wav.py <air> <durée en s> <sortie.wav>
"""
import re
import sys
import wave
from pathlib import Path
import numpy as np

AIR, DUREE, SORTIE = sys.argv[1], float(sys.argv[2]), sys.argv[3]
SRC = (Path(__file__).resolve().parents[2] / 'pistonville' / 'src' / 'musique.js').read_text()
bloc = SRC[SRC.index(f'  {AIR}: {{'):]
bloc = bloc[:bloc.index('\n  },') + 4]
tempo = int(re.search(r'tempo: (\d+)', bloc).group(1))
melodie = re.search(r'air\(`(.*?)`\)', bloc, re.S).group(1).split()
accords = re.findall(r"'([A-G][b#]?\d)'", re.search(r'accords: \[(.*?)\]', bloc).group(1))
basse = [float(x) for x in re.search(r'basse: \[(.*?)\]', bloc).group(1).split(',')]
batterie = re.findall(r"'(\w)'", re.search(r'batterie: \[(.*?)\]', bloc).group(1))

NOTES = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
def freq(n):
    m = re.match(r'([A-G][#b]?)(\d)', n)
    return 440 * 2 ** ((NOTES[m.group(1)] + (int(m.group(2)) + 1) * 12 - 69) / 12)

SR = 44100
croche = 30 / tempo
son = np.zeros(int(SR * (DUREE + 1)))
rng = np.random.default_rng(1)

def enveloppe(n, attaque=0.01):
    e = np.ones(n)
    a = max(1, int(attaque * SR))
    e[:a] = np.linspace(0, 1, a)
    e[int(n * 0.6):] *= np.exp(-np.linspace(0, 6, n - int(n * 0.6)))
    return e

def ajouter(debut, signal):
    i = int(debut * SR)
    if i >= len(son): return
    fin = min(len(son), i + len(signal))
    son[i:fin] += signal[:fin - i]

def voix(f, t, d, forme, vol):
    n = int(d * SR); x = np.arange(n) / SR
    ph = (x * f) % 1
    s = np.sign(np.sin(2 * np.pi * f * x)) if forme == 'carre' else 4 * np.abs(ph - 0.5) - 1
    ajouter(t, s * enveloppe(n) * vol)

def souffle(t, d, vol, coupure):
    n = int(d * SR)
    b = rng.uniform(-1, 1, n)
    if coupure == 'aigu': b = np.diff(b, prepend=0)
    ajouter(t, b * np.exp(-np.linspace(0, 5, n)) * vol)

def grosse_caisse(t):
    n = int(0.15 * SR); x = np.arange(n) / SR
    f = 140 * (45 / 140) ** (x / 0.12)
    ajouter(t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.05) * 0.22)

pas, t = 0, 0.0
while t < DUREE:
    n = melodie[pas]
    if n not in '.-':
        d = 1
        while melodie[(pas + d) % len(melodie)] == '-': d += 1
        voix(freq(n), t, d * croche * 0.92, 'carre', 0.055)
    b = basse[pas % 8]
    if b: voix(freq(accords[(pas // 8) % len(accords)]) * b, t, croche * 0.8, 'triangle', 0.13)
    c = batterie[pas % len(batterie)]
    if c in 'kK': grosse_caisse(t)
    if c == 's': souffle(t, 0.12, 0.09, 'grave'); voix(190, t, 0.07, 'triangle', 0.06)
    if c in 'hK': souffle(t, 0.035, 0.025, 'aigu')
    pas = (pas + 1) % len(melodie)
    t += croche

son = son[: int(SR * DUREE)]
# Fondu de fin, et volume normalisé.
f = int(SR * 1.5)
son[-f:] *= np.linspace(1, 0, f)
son = son / (np.abs(son).max() + 1e-9) * 0.8
with wave.open(SORTIE, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((son * 32767).astype(np.int16).tobytes())
print(SORTIE, f'{DUREE:.1f} s, {tempo} bpm')
