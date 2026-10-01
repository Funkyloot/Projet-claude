/* sprites.js — tout ce qui se dessine en pixels : tuiles Kenney et voitures.
 *
 * La planche Kenney RPG Urban (CC0) fait 27 tuiles de 16 px par ligne. Les
 * objets hauts (lampadaire, grand arbre) empilent deux tuiles, ancrées en bas.
 * Les voitures vues de dessus sont dessinées ici, pixel par pixel, pour
 * pouvoir tourner librement pendant la course.
 */

import { melangerCouleur } from './outils.js';

const COLONNES = 27;
export const T = 16;

/** Police des textes dessinés sur le canevas (Jersey 10, OFL), en pixels de jeu. */
export const police = (taille) => `${Math.round(taille * 1.5)}px "Jersey 10", monospace`;

export function tuile(ctx, planche, id, x, y) {
  ctx.drawImage(planche, (id % COLONNES) * T, Math.floor(id / COLONNES) * T, T, T, Math.round(x), Math.round(y), T, T);
}

/** Objets de décor : tuiles empilées de haut en bas, ancrées au pied. */
export const OBJETS = {
  lampadaire: [164, 191],
  lampadaireDouble: [165, 192],
  boiteAuxLettres: [305],
  borneIncendie: [251],
  poubelle: [252],
  poubelleGrise: [279],
  cone: [307],
  barriereChantier: [221],
  barriereRayee: [222],
  banc: [250],
  arbre: [259],
  arbreRond: [260],
  sapin: [265],
  arbreBoule: [292],
  buisson: [238],
  grosBuisson: [232],
  petitBuisson: [233],
  arbreAutomne: [340],
  buissonAutomne: [314],
  panneau: [166, 193],
  jardiniere: [277],
};

/**
 * Personnages Kenney (16 × 16) : 6 personnes, chacune sur 4 colonnes
 * (gauche, face, dos, droite) et 3 lignes (repos, pas 1, pas 2).
 */
export const PERSONNAGES = [23, 104, 185, 266, 347, 428];
export const DIRECTION = { gauche: 0, face: 1, dos: 2, droite: 3 };
export const idPersonnage = (base, direction = 1, pas = 0) => base + direction + pas * COLONNES;

/** Direction dans laquelle regarder un point (dx, dy). */
export function directionVers(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? DIRECTION.droite : DIRECTION.gauche;
  return dy > 0 ? DIRECTION.face : DIRECTION.dos;
}

export function objet(ctx, planche, nom, x, y) {
  const pile = OBJETS[nom];
  for (let i = 0; i < pile.length; i++) {
    tuile(ctx, planche, pile[i], x - T / 2, y - T * (pile.length - i));
  }
}

// --- Voitures vues de dessus ------------------------------------------------
// Avant en haut. o contour, b carrosserie, l reflet, d ombre, w pare-brise,
// W vitre arrière, k roue, h phare, t feu arrière, s bande de course.
const MOTIF_VOITURE = [
  '...oooooo...',
  '..ohbbbbho..',
  '.obbbbbbbbo.',
  'kobllllllbok',
  'kobbbbbbbbok',
  'kobwwwwwwbok',
  '.obwwwwwwbo.',
  '.obWwwwwWbo.',
  '.obbbbbbbbo.',
  '.obsbbbbsbo.',
  '.obsbbbbsbo.',
  '.obsbbbbsbo.',
  '.obbbbbbbbo.',
  '.obWWWWWWbo.',
  '.obbbbbbbbo.',
  'kobddddddbok',
  'kobbbbbbbbok',
  'kobbbbbbbbok',
  '.obbbbbbbbo.',
  '.otbbbbbbto.',
  '..oooooooo..',
];
export const VOITURE_L = MOTIF_VOITURE[0].length + 2;
export const VOITURE_H = MOTIF_VOITURE.length + 2;

const cacheVoitures = new Map();

/**
 * Voiture vue de dessus, avant en haut. `looks` : ce que les pièces montées
 * ajoutent à la carrosserie (becquet, aileron, pneus larges, nitro…).
 */
export function spriteVoiture(couleur, bande = '#f4f1e8', looks = []) {
  const cle = couleur + bande + looks.join(',');
  if (cacheVoitures.has(cle)) return cacheVoitures.get(cle);
  const c = document.createElement('canvas');
  c.width = VOITURE_L;
  c.height = VOITURE_H;
  const ctx = c.getContext('2d');
  const sombre = melangerCouleur(couleur, '#000000', 0.3);
  const teintes = {
    o: '#2a2838', b: couleur, l: melangerCouleur(couleur, '#ffffff', 0.35), d: sombre,
    w: '#9fd3ff', W: '#5d7fa6', k: '#1c1b24', h: '#fff4b8', t: '#e4432d', s: bande,
  };
  const px = (x, y, couleurPixel) => { ctx.fillStyle = couleurPixel; ctx.fillRect(x + 1, y + 1, 1, 1); };
  const a = new Set(looks);
  if (a.has('larges')) {
    // Pneus larges : une colonne de gomme en plus de chaque côté.
    for (const y of [3, 4, 5, 15, 16, 17]) { px(-1, y, '#1c1b24'); px(12, y, '#1c1b24'); }
  }
  MOTIF_VOITURE.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      const tt = teintes[ligne[x]];
      if (tt) px(x, y, tt);
    }
  });
  if (a.has('carbone')) {
    for (let y = 2; y <= 4; y++) for (let x = 3; x <= 8; x++) px(x, y, (x + y) % 2 ? '#3a3a46' : '#24242e');
    for (let y = 8; y <= 12; y++) for (let x = 3; x <= 8; x++) if (x !== 3 && x !== 8) px(x, y, (x + y) % 2 ? '#3a3a46' : '#24242e');
  }
  if (a.has('prise')) { for (let x = 4; x <= 7; x++) { px(x, 3, '#2a2838'); px(x, 4, '#5c6278'); } }
  if (a.has('turbine')) {
    for (const [x, y] of [[4, 2], [5, 2], [6, 2], [7, 2], [4, 3], [7, 3], [4, 4], [5, 4], [6, 4], [7, 4]]) px(x, y, '#2a2838');
    px(5, 3, '#f39c33'); px(6, 3, '#ffe066');
  }
  if (a.has('arceau')) { for (let y = 8; y <= 12; y++) { px(2, y, '#2a2838'); px(9, y, '#2a2838'); } }
  if (a.has('nitro1') || a.has('nitro2')) {
    const colonnes = a.has('nitro2') ? [3, 7] : [5];
    for (const x of colonnes) { for (let y = 14; y <= 17; y++) { px(x, y, '#2a7fd6'); px(x + 1, y, '#7fd0ff'); } px(x, 13, '#2a2838'); px(x + 1, 13, '#2a2838'); }
  }
  if (a.has('becquet')) { for (let x = 2; x <= 9; x++) px(x, 20, '#2a2838'); }
  if (a.has('aileron') || a.has('aileronGT')) {
    const gt = a.has('aileronGT');
    for (let x = -1; x <= 12; x++) { px(x, 20, '#2a2838'); px(x, 21, gt ? bande : sombre); }
    if (gt) for (let x = -1; x <= 12; x++) px(x, 22 - 1, bande);
    px(3, 19, '#2a2838'); px(8, 19, '#2a2838');
  }
  cacheVoitures.set(cle, c);
  return c;
}

/** Bulle d'émotion au-dessus d'un personnage (signature Kairosoft). */
export function bulle(ctx, x, y, texte, couleurTexte = '#c2504d') {
  ctx.font = police(8);
  const w = Math.ceil(ctx.measureText(texte).width) + 6;
  const bx = Math.round(x - w / 2), by = Math.round(y - 12);
  ctx.fillStyle = '#2a2838';
  ctx.fillRect(bx - 1, by - 1, w + 2, 12);
  ctx.fillRect(Math.round(x) - 2, by + 11, 4, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, w, 10);
  ctx.fillRect(Math.round(x) - 1, by + 10, 2, 2);
  ctx.fillStyle = couleurTexte;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(texte, Math.round(x), by + 5.5);
}
