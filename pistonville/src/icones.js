/* icones.js — les icônes pixel des pièces, façon Kairosoft.
 *
 * Chaque pièce a sa propre image de 20 × 20 pixels, dessinée ici point par
 * point (moteurs, pneus, boîtes, ailerons, bouteilles de nitro, châssis).
 * Les variantes d'une même famille changent de forme et de couleur, pour
 * qu'on reconnaisse une pièce d'un coup d'œil. Rendu en image (data URL)
 * pour les menus HTML, mis en cache.
 */

const N = 20;
const C = {
  o: '#1a1626', g: '#5c6278', G: '#9896ab', w: '#d9d6e6', W: '#ffffff',
  r: '#c2504d', R: '#e4432d', y: '#f2c14e', Y: '#ffe066', b: '#2f6fdb', B: '#7dd3fc',
  k: '#2a2838', K: '#3a3550', n: '#8a5a3b', v: '#3fa34d', V: '#9fe870', p: '#8a6ad6', O: '#f39c33', s: '#c9ccd4',
};

function nouveau() {
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d');
  const px = (x, y, w, h, coul) => { ctx.fillStyle = C[coul] || coul; ctx.fillRect(x, y, w, h); };
  return { c, ctx, px };
}

/** Rectangle avec contour sombre. */
function boite(px, x, y, w, h, coul, reflet = 'w') {
  px(x, y, w, h, 'o');
  px(x + 1, y + 1, w - 2, h - 2, coul);
  px(x + 1, y + 1, w - 2, 1, reflet);
}

// --- Familles ---------------------------------------------------------------------

function moteur(px, o) {
  // Bloc moteur, culasse, pipes ; options : cylindres, couleur du cache, turbo, rotor, batterie.
  boite(px, 3, 8, 14, 9, 'G');
  px(4, 15, 12, 1, 'g');
  if (o.rotor) {
    px(6, 2, 8, 8, 'o'); px(7, 3, 6, 6, o.cache); px(9, 4, 2, 4, 'o'); px(8, 5, 4, 2, 'o');
    px(8, 3, 1, 1, 'W');
  } else {
    boite(px, 4, 4, 12, 5, o.cache, 'W');
    for (let i = 0; i < o.cylindres; i++) px(5 + Math.round((i * 10) / o.cylindres), 6, 1, 1, 'o');
  }
  for (let i = 0; i < 4; i++) px(4 + i * 3, 11, 2, 2, 'g');
  if (o.turbo) { px(15, 9, 4, 5, 'o'); px(16, 10, 2, 3, 'O'); px(16, 10, 1, 1, 'Y'); }
  if (o.batterie) { px(0, 10, 4, 6, 'o'); px(1, 11, 2, 4, 'v'); px(1, 11, 1, 1, 'V'); }
  if (o.prise) { px(7, 1, 6, 3, 'o'); px(8, 2, 4, 1, 'K'); }
  px(2, 17, 16, 1, 'o');
}

function turbine(px) {
  px(2, 4, 16, 12, 'o');
  px(3, 5, 14, 10, 'G');
  px(3, 5, 14, 1, 'W');
  px(5, 6, 8, 8, 'o'); px(6, 7, 6, 6, 'K');
  for (let i = 0; i < 4; i++) { px(8 + (i % 2 ? 1 : -1), 9 + (i < 2 ? -1 : 1), 2, 1, 'Y'); }
  px(8, 9, 2, 2, 'O');
  px(14, 7, 3, 6, 'R'); px(15, 8, 2, 4, 'Y');
  px(1, 9, 2, 2, 'o');
}

function pneu(px, o) {
  // Roue vue de face : gomme, sculptures autour, jante, moyeu.
  const cx = 9.5, cy = 9.5, R = 9.4, rJante = o.large ? 4.2 : 5.2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - cx, y - cy);
    const a = Math.atan2(y - cy, x - cx);
    if (d > R) continue;
    let coul = 'k';
    if (d > R - 1) coul = 'o';
    else if (d < rJante) coul = d < 1.6 ? 'o' : d > rJante - 1 ? 'o' : (x + y) % 5 === 0 ? 'w' : 's';
    else if (o.liseret && Math.abs(d - (rJante + 1.2)) < 0.6) coul = o.liseret;
    else {
      const secteur = ((a + Math.PI) / (2 * Math.PI)) * o.crans;
      const f = secteur - Math.floor(secteur);
      if (o.motif === 'blocs' && d > R - 3 && f < 0.45) coul = 'g';
      if (o.motif === 'chevron' && d > R - 3 && Math.abs(f - (d - R + 3) / 3) < 0.18) coul = 'g';
      if (o.motif === 'rainures' && d > R - 3 && f < 0.15) coul = 'K';
      if (o.motif === 'clous' && d > R - 2.5 && f < 0.12) coul = 'W';
      if (o.motif === 'lisse' && d > R - 2.4 && d < R - 1.6 && a < -0.6 && a > -2.2) coul = 'G';
    }
    px(x, y, 1, 1, coul);
  }
  // Reflet sur la jante.
  px(7, 6, 2, 1, 'W');
}

function boiteVitesses(px, o) {
  boite(px, 3, 9, 14, 8, o.couleur);
  px(4, 15, 12, 1, 'g');
  // Grille et levier.
  px(9, 3, 2, 7, 'o'); px(9, 3, 2, 1, 'G');
  px(7, 1, 6, 4, 'o'); px(8, 2, 4, 2, o.pommeau); px(8, 2, 1, 1, 'W');
  const grille = o.vitesses;
  for (let i = 0; i < grille; i++) px(5 + i * Math.floor(10 / grille), 12, 1, 2, 'o');
  if (o.seq) { px(13, 10, 3, 3, 'o'); px(14, 11, 1, 1, 'R'); }
  px(2, 17, 16, 1, 'o');
}

function aileron(px, o) {
  px(1, o.haut, 18, o.epais + 2, 'o');
  px(2, o.haut + 1, 16, o.epais, o.couleur);
  px(2, o.haut + 1, 16, 1, 'W');
  if (o.pieds) {
    px(5, o.haut + o.epais + 2, 2, 8 - o.haut / 2, 'o'); px(13, o.haut + o.epais + 2, 2, 8 - o.haut / 2, 'o');
  }
  if (o.derive) { px(0, o.haut - 2, 2, o.epais + 6, 'o'); px(18, o.haut - 2, 2, o.epais + 6, 'o'); px(0, o.haut - 1, 1, o.epais + 4, o.couleur); px(19, o.haut - 1, 1, o.epais + 4, o.couleur); }
  // Bout de carrosserie en dessous.
  px(2, 15, 16, 3, 'o'); px(3, 15, 14, 2, 'r'); px(3, 15, 14, 1, 'R');
}

function nitro(px, o) {
  const bouteille = (x, coul) => {
    px(x, 4, 6, 14, 'o'); px(x + 1, 5, 4, 12, coul); px(x + 1, 5, 1, 12, 'W');
    px(x + 2, 1, 2, 4, 'o'); px(x + 2, 2, 2, 1, 's');
    px(x + 1, 9, 4, 3, 'W'); px(x + 2, 10, 2, 1, 'o');
  };
  if (o.double) { bouteille(3, o.couleur); bouteille(11, o.couleur); px(9, 8, 2, 2, 'o'); }
  else bouteille(7, o.couleur);
  if (o.flamme) { px(1, 15, 3, 3, 'O'); px(2, 14, 1, 2, 'Y'); px(16, 15, 3, 3, 'O'); px(17, 14, 1, 2, 'Y'); }
}

function chassis(px, o) {
  if (o.arceau) {
    px(3, 3, 14, 2, 'o'); px(3, 3, 2, 14, 'o'); px(15, 3, 2, 14, 'o');
    px(4, 4, 12, 1, 'R'); px(4, 4, 1, 12, 'R'); px(15, 4, 1, 12, 'R');
    for (let i = 0; i < 10; i++) px(5 + i, 5 + i, 1, 1, 'o');
    px(1, 16, 18, 2, 'o');
  } else if (o.carbone) {
    px(2, 4, 16, 12, 'o');
    for (let y = 5; y < 15; y++) for (let x = 3; x < 17; x++) px(x, y, 1, 1, (x + y) % 4 < 2 ? 'k' : 'K');
    px(3, 5, 14, 1, 'G');
    px(5, 8, 10, 4, 'o'); px(6, 9, 8, 2, 'b');
  } else {
    // Renforts : poutrelles croisées et rivets.
    px(2, 6, 16, 8, 'o'); px(3, 7, 14, 6, 'G'); px(3, 7, 14, 1, 'W');
    for (let x = 4; x < 16; x += 4) { px(x, 8, 1, 1, 'o'); px(x + 1, 11, 1, 1, 'o'); }
    px(3, 10, 14, 1, 'g');
  }
}

/** Plans de chaque pièce du pack de base. Une pièce inconnue prend l'icône de son emplacement. */
const PLANS = {
  'moteur-4cyl': (p) => moteur(p, { cylindres: 4, cache: 'r' }),
  'moteur-v6': (p) => moteur(p, { cylindres: 6, cache: 'b', prise: true }),
  'moteur-rotatif': (p) => moteur(p, { rotor: true, cache: 'O' }),
  'moteur-hybride': (p) => moteur(p, { cylindres: 4, cache: 'v', batterie: true }),
  turbine: (p) => turbine(p),
  'pneus-route': (p) => pneu(p, { motif: 'rainures', crans: 14 }),
  'pneus-tt': (p) => pneu(p, { motif: 'blocs', crans: 10, large: true, liseret: 'n' }),
  'pneus-pluie': (p) => pneu(p, { motif: 'chevron', crans: 12, liseret: 'B' }),
  'pneus-neige': (p) => pneu(p, { motif: 'clous', crans: 12, liseret: 'W' }),
  'pneus-slicks': (p) => pneu(p, { motif: 'lisse', crans: 1, large: true, liseret: 'y' }),
  'boite-5': (p) => boiteVitesses(p, { couleur: 'G', pommeau: 'k', vitesses: 5 }),
  'boite-courte': (p) => boiteVitesses(p, { couleur: 'O', pommeau: 'R', vitesses: 4 }),
  'boite-longue': (p) => boiteVitesses(p, { couleur: 'b', pommeau: 'B', vitesses: 6 }),
  'boite-seq': (p) => boiteVitesses(p, { couleur: 'K', pommeau: 'y', vitesses: 6, seq: true }),
  becquet: (p) => aileron(p, { haut: 10, epais: 2, couleur: 'G' }),
  'aileron-sport': (p) => aileron(p, { haut: 5, epais: 2, couleur: 'b', pieds: true }),
  'aileron-gt': (p) => aileron(p, { haut: 3, epais: 3, couleur: 'k', pieds: true, derive: true }),
  'nitro-simple': (p) => nitro(p, { couleur: 'b' }),
  'nitro-double': (p) => nitro(p, { couleur: 'b', double: true }),
  'nitro-course': (p) => nitro(p, { couleur: 'R', double: true, flamme: true }),
  renforts: (p) => chassis(p, {}),
  arceau: (p) => chassis(p, { arceau: true }),
  'coque-carbone': (p) => chassis(p, { carbone: true }),
};
const PAR_EMPLACEMENT = {
  moteur: (p) => moteur(p, { cylindres: 4, cache: 'G' }),
  pneus: (p) => pneu(p, { motif: 'rainures', crans: 14 }),
  boite: (p) => boiteVitesses(p, { couleur: 'G', pommeau: 'k', vitesses: 5 }),
  aileron: (p) => aileron(p, { haut: 8, epais: 2, couleur: 'G' }),
  nitro: (p) => nitro(p, { couleur: 'G' }),
  chassis: (p) => chassis(p, {}),
};

/** Les pièces des packs décrivent leur image (`icone: { famille, …options }`). */
const FAMILLES = { moteur, pneu, boite: boiteVitesses, aileron, nitro, chassis, turbine: (p) => turbine(p) };

const cache = new Map();

/** URL de l'icône d'une pièce (objet pièce) ou d'un emplacement (chaîne). */
export function iconePiece(pc) {
  const cle = typeof pc === 'string' ? `@${pc}` : pc.id;
  if (cache.has(cle)) return cache.get(cle);
  const { c, px } = nouveau();
  const decrite = typeof pc !== 'string' && pc.icone && FAMILLES[pc.icone.famille];
  const plan = typeof pc === 'string' ? PAR_EMPLACEMENT[pc] : PLANS[pc.id] || (decrite && ((p) => decrite(p, pc.icone))) || PAR_EMPLACEMENT[pc.emplacement];
  plan(px);
  const url = c.toDataURL();
  cache.set(cle, url);
  return url;
}

/** Balise <img> prête à poser dans un menu (taille et cadre réglés en CSS). */
export function imgPiece(pc, classe = '') {
  return `<img class="icone-piece ${classe}" src="${iconePiece(pc)}" alt="">`;
}
