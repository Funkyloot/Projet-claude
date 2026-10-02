/* ville-dessins.js — bâtiments, maisons et mobilier, en tuiles Kenney (CC0).
 *
 * Ville : Roguelike Modern City (toits, façades de brique, de pierre ou
 * beiges, fenêtres, vitrines, enseignes, auvents, portes, lampadaires, feux,
 * bancs, poubelles, caisses). Maisons, campagne : Tiny Town et Tiny Farm
 * (maisons, grange, mairie, puits, clôtures, pancartes). Panneau STOP :
 * Pixel Vehicle Pack. Vue 3/4 à l'échelle (1 case de 16 px ≈ 1 m) : un toit
 * de 2 cases, puis la façade, 2 cases par étage ; la porte est toujours sur la
 * façade visible (côté sud), qui donne sur un trottoir.
 */

import { tuileVille, pileVille, imageAtlas, tailleAtlas, tuileKenney } from './tiny.js';


/** Hauteur dessinée d'un bâtiment : toit (2 cases) + étages (2 cases chacun). */
export const hauteurBatiment = (etages) => 32 + etages * 32;

const teinteDe = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 25) return -1;   // gris
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
let graineMat = 0;
const MURS = { brique: 0, gris: 4, beige: 8 };
const TOITS = { rouge: 0, gris: 8, clair: 16, beige: 24 };

/**
 * Bâtiment de ville en tuiles Kenney Roguelike Modern City. (x, y) = coin
 * haut-gauche du toit ; w = largeur. Le toit fait 2 tuiles, chaque étage 2
 * tuiles : corniche, fenêtres, bandeaux, et au rez-de-chaussée une porte, une
 * vitrine avec enseigne, un auvent ou une porte de garage.
 * o : { facade, toit (couleurs : elles choisissent la brique et le toit Kenney),
 *       mur, toiture (ou directement), enseigne, nom, auvent, vitrine, garage }
 */
export function batimentModerne(c, x, y, w, etages, o) {
  const n = Math.max(3, Math.round(w / 16));
  const x0 = Math.round(x + (w - n * 16) / 2);
  const tf = teinteDe(o.facade || '#e6ebf2');
  const mur = MURS[o.mur] ?? (tf < 0 ? MURS.gris : tf < 40 || tf > 330 ? (graineMat++ % 2 ? MURS.brique : MURS.beige) : MURS.beige);
  const tt = teinteDe(o.toit || '#8b9bb4');
  const toit = TOITS[o.toiture] ?? (tt < 0 ? TOITS.gris : tt < 30 || tt > 330 ? TOITS.rouge : tt < 70 ? TOITS.beige : TOITS.clair);
  const t = (n2, i, j) => tuileVille(c, n2, x0 + i * 16, y + j * 16);
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x0 + 4, y + 32 + etages * 32 - 2, n * 16, 6);
  // Toit.
  for (let i = 0; i < n; i++) {
    t(toit + (i === 0 ? 0 : i === n - 1 ? 1 : 2), i, 0);
    t(toit + (i === 0 ? 37 : i === n - 1 ? 38 : 39), i, 1);
  }
  // Façade.
  const R = etages * 2;
  for (let r = 0; r < R; r++) {
    const base = (r === 0 ? 333 : r === R - 1 ? 296 : r % 2 === 0 ? 222 : 185) + mur;
    for (let i = 0; i < n; i++) t(base + (i === 0 ? 0 : i === n - 1 ? 3 : 1 + (i % 2)), i, 2 + r);
  }
  const fenetre = mur === MURS.brique ? 617 : mur === MURS.gris ? 728 : 580;
  for (let f = 0; f < etages - 1; f++) for (let i = 1; i < n - 1; i += 2) t(fenetre, i, 3 + 2 * f);
  // Rez-de-chaussée.
  const jb = 2 + R - 2;
  if (o.vitrine || o.enseigne) for (let i = 1; i < n - 1; i++) t(310, i, jb + 1);
  if (o.auvent) {
    const a = teinteDe(o.auvent) > 80 && teinteDe(o.auvent) < 200 ? 504 : 508;
    for (let i = 1; i < n - 1; i++) t(a + (i === 1 ? 0 : i === n - 2 ? 3 : 1 + (i % 2)), i, jb);
  } else if (o.enseigne) {
    const sb = teinteDe(o.enseigne) > 150 && teinteDe(o.enseigne) < 260 ? 197 : 160;
    for (let i = 1; i < n - 1; i++) t(sb + (i === 1 ? 0 : i === n - 2 ? 3 : 1 + (i % 2)), i, jb);
  }
  if (o.nom && (o.enseigne || o.auvent)) {
    c.fillStyle = 'rgba(20,16,34,0.72)'; c.fillRect(x0 + 18, y + jb * 16 + 3, n * 16 - 36, 10);
    texteEnseigne(c, o.nom, x0 + (n * 16) / 2, y + jb * 16 + 8, '#1f2a44');
  }
  if (o.garage) {
    // Porte de garage sous l'enseigne : deux battants sombres sur la rangée du bas.
    const gx = x0 + Math.round((n * 16) / 2) - 16;
    tuileVille(c, 878, gx, y + (jb + 1) * 16); tuileVille(c, 879, gx + 16, y + (jb + 1) * 16);
    if (!o.enseigne && !o.auvent) { tuileVille(c, 841, gx, y + jb * 16); tuileVille(c, 842, gx + 16, y + jb * 16); }
  } else {
    t(874, n - 2, jb); t(911, n - 2, jb + 1);
  }
}

function texteEnseigne(c, nom, x, y, fond) {
  c.save();
  c.font = '10px "Jersey 10", monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const clair = (parseInt(fond.slice(1, 3), 16) * 0.3 + parseInt(fond.slice(3, 5), 16) * 0.59 + parseInt(fond.slice(5, 7), 16) * 0.11) > 150;
  c.fillStyle = clair ? '#1f2a44' : '#ffffff';
  c.fillText(nom, Math.round(x), Math.round(y) + 1);
  c.restore();
}

/** Maison en tuiles Kenney Tiny Town (4 × 4 tuiles) : toit rouge ou gris, mur de bois ou de pierre. */
export function maisonModerne(c, x, y, w, toit, facade) {
  const rouge = (() => { const h = teinteDe(toit); return h >= 0 && (h < 50 || h > 320); })();
  const pierre = teinteDe(facade) < 0 || teinteDe(facade) > 180;
  const r0 = rouge ? [52, 53, 53, 54] : [48, 49, 49, 50];
  const r1 = rouge ? [64, 65, 65, 66] : [60, 61, 61, 62];
  const m = pierre ? [76, 77, 77, 79] : [72, 73, 73, 75];
  const fen = pierre ? 88 : 84, porte = pierre ? 89 : 85;
  const lignes = [r0, r1, [m[0], fen, m[1], m[3]], [m[0], porte, fen, m[3]]];
  const x0 = Math.round(x + (w - 64) / 2);
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x0 + 4, y + 62, 64, 6);
  lignes.forEach((l, j) => l.forEach((n, i) => tuileKenney(c, 'town', n, x0 + i * 16, y + j * 16)));
}


// Mobilier urbain : tuiles Kenney Roguelike Modern City, posées au pied (x, y).

/** Lampadaire (3 tuiles de haut). */
export function lampadaire(c, x, y) { pileVille(c, [594, 631, 668], x, y + 1); }

/** Banc de bois. */
export function banc(c, x, y) { tuileVille(c, 572, x - 8, y - 14); }

/** Poubelle. */
export function poubelle(c, x, y) { tuileVille(c, 530, x - 8, y - 15); }

/** Borne d'incendie. */
export function borne(c, x, y) { tuileVille(c, 533, x - 8, y - 15); }

/** Boîte aux lettres. */
export function boiteAuxLettres(c, x, y) { pileVille(c, [567, 604], x, y + 1); }

/** Feu tricolore Kenney sur son poteau ; la lampe allumée est soulignée selon l'état. */
export function feuTricolore(c, x, y, etat) {
  pileVille(c, [520, 640], x, y + 1);
  // Les trois lampes de la tuile 520 : en haut rouge, au milieu orange, en bas vert.
  const k = { rouge: 0, orange: 1, vert: 2 }[etat];
  if (k === undefined) return;
  c.fillStyle = ['#ff4a3a', '#ffb02e', '#5af07a'][k];
  c.fillRect(Math.round(x) - 1, Math.round(y) - 26 + k * 3, 3, 2);
}

/** Panneau STOP (Kenney Pixel Vehicle Pack). */
export function panneauStop(c, x, y) {
  const [, h] = tailleAtlas('stop');
  imageAtlas(c, 'stop', x, y - h / 2);
}

/** Fleurs (tuile Kenney Tiny Town). */
export function fleurs(c, x, y) { tuileKenney(c, 'town', 2, x, y); }

// --- Campagne (tuiles Kenney Tiny Farm et Tiny Town) -------------------------------------

const pose = (c, pack, lignes, x, y) => lignes.forEach((l, j) => l.forEach((n, i) => { if (n !== null) tuileKenney(c, pack, n, x + i * 16, y + j * 16); }));

/** Grange Tiny Farm : toit vert à pignon, murs rouges, portes à croix (64 × 80, x, y = coin haut-gauche). */
export const LARGEUR_GRANGE = 64, HAUTEUR_GRANGE = 80;
export function grange(c, x, y) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 4, y + 78, 64, 6);
  pose(c, 'farm', [[93, 94, 94, 95], [105, 106, 106, 107], [117, 118, 118, 119], [102, 103, 103, 104], [126, 127, 127, 128]], x, y);
}

/** Maison de pierre Tiny Town à toit d'ardoise (mairie du village ; 64 × 64). */
export function mairie(c, x, y) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 4, y + 62, 64, 6);
  pose(c, 'town', [[48, 49, 49, 50], [60, 61, 61, 62], [96, 97, 97, 98], [108, 109, 103, 110]], x, y);
}

/** Puits Tiny Town (pieds en x, y). */
export function puits(c, x, y) { pose(c, 'town', [[92], [104]], x - 8, y - 32); }

/** Panneau de bois Tiny Town (pieds en x, y). */
export function pancarte(c, x, y) { tuileKenney(c, 'town', 83, x - 8, y - 16); }

/** Clôture de bois Tiny Town, horizontale ou verticale, de longueur l (x, y = début, au sol). */
export function cloture(c, x, y, l, verticale = false) {
  const n = Math.max(1, Math.round(l / 16));
  if (!verticale) for (let i = 0; i < n; i++) tuileKenney(c, 'town', n === 1 ? 47 : i === 0 ? 44 : i === n - 1 ? 46 : 45, x + i * 16, y - 14);
  else for (let i = 0; i < n; i++) tuileKenney(c, 'town', 59, x - 8, y + i * 16 - 8);
}

/** Caisses et palettes Kenney Modern City (zone d'activités) : une pile 2 × 2 (x, y = coin haut-gauche). */
export function caisses(c, x, y, k = 0) {
  const t = [[568, 569, 605, 606], [642, 643, 679, 680], [570, 571, 607, 608]][k % 3];
  tuileVille(c, t[0], x, y); tuileVille(c, t[1], x + 16, y); tuileVille(c, t[2], x, y + 16); tuileVille(c, t[3], x + 16, y + 16);
}
