/* mascotte.js — la mascotte grise.
 *
 * La silhouette est relevée pixel par pixel sur la mascotte de référence
 * (relevé fait à partir de la vidéo : corps de 18×12 px, dos incliné d'un
 * pixel par palier, deux fentes d'yeux de 3×2, quatre pattes de 2×4 posées
 * en deux paires décalées). Seule la palette change : du gris au lieu de
 * l'orange.
 *
 * Elle n'est pas dessinée comme une image figée mais comme un petit
 * squelette : corps, yeux, quatre pattes indépendantes, deux bras qui
 * pointent vers une cible. C'est ce qui lui permet de jouer de la guitare,
 * de taper au clavier ou de pousser un panier sans redessiner un sprite
 * par activité.
 */

import { rect, px, line, ellipse, clamp, lerp } from './pixel.js';

/* ---------- Palette ---------- */

export const GRIS = {
  clair: '#c9ccd2',
  base: '#a7abb2',
  moyen: '#8a8f97',
  fonce: '#6a6f77',
  profond: '#4b5057',
  encre: '#23262b',
};

export const DECOR = {
  murClair: '#3c3f46',
  murFonce: '#33363c',
  joint: '#2b2e33',
  sol: '#282b30',
  solClair: '#31343a',
  ombre: '#1e2126',
  metal: '#7e838b',
  metalClair: '#a9aeb6',
  bois: '#5b5f66',
  boisClair: '#767b83',
  ambre: '#e3b25c',
  ambreFonce: '#a97f34',
};

/* ---------- Géométrie relevée sur la référence ---------- */

export const CORPS_L = 18;   // largeur du corps
export const CORPS_H = 12;   // hauteur du corps, sans les pattes
export const PATTE_H = 4;
export const MASCOTTE_H = CORPS_H + PATTE_H;

// Retrait du bord gauche, ligne par ligne : c'est le dos arrondi.
const RETRAIT_G = [2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
const RETRAIT_D = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

// Bras : deux segments de longueur FIXE. Le bras ne s'étire jamais pour
// atteindre un objet — c'est l'objet qui doit être posé à portée. `PORTEE`
// est la distance maximale entre l'épaule et la main, bras tendu.
export const BRAS_HAUT = 5;    // épaule -> coude
export const BRAS_AVANT = 4;   // coude -> main
export const PORTEE = BRAS_HAUT + BRAS_AVANT - 1;

// Yeux : deux fentes de 3×2, sur la sixième ligne du corps.
const OEIL_Y = 3;
const OEIL_X = [5, 14];

/**
 * Position de l'épaule pour une pose donnée. Les activités s'en servent pour
 * placer leurs accessoires : la guitare, le clavier, la tasse et le reste
 * sont posés à moins de PORTEE de ce point.
 */
export function epaule(o) {
  const sens = o.sens ?? 1;
  const hautPattes = o.pose === 'assis' ? 1 : o.pose === 'couche' ? 0 : PATTE_H;
  const basCorps = Math.round(o.sol - hautPattes + (o.dy ?? 0));
  return {
    x: Math.round(o.x) + (sens > 0 ? 14 : CORPS_L - 16),
    y: basCorps - CORPS_H + 6,
  };
}

/* ---------- État interne (clignement, respiration) ---------- */

const etat = { t: 0, clignement: 0, prochainClignement: 2.5, phase: 0 };

export function majMascotte(dt) {
  etat.t += dt;
  etat.phase += dt;
  etat.prochainClignement -= dt;
  if (etat.prochainClignement <= 0) {
    etat.clignement = 0.12;
    etat.prochainClignement = 1.8 + Math.random() * 3.5;
  }
  if (etat.clignement > 0) etat.clignement -= dt;
}

/* ---------- Dessin ---------- */

function couleurLigne(j, h) {
  // Volume : lumière en haut, ombre sous le ventre.
  if (j === 0) return GRIS.clair;
  if (j <= 2) return GRIS.clair;
  if (j <= h - 4) return GRIS.base;
  if (j <= h - 2) return GRIS.moyen;
  return GRIS.fonce;
}

function dessinerPatte(ctx, x, y, h, couleur, sabot) {
  rect(ctx, x, y, 2, h, couleur);
  rect(ctx, x, y + h - 1, 2, 1, sabot);
}

/**
 * @param {object} o
 *   x, sol      position : x = bord gauche du corps, sol = ligne des pieds
 *   sens        1 = tournée vers la droite, -1 vers la gauche
 *   pose        'debout' | 'marche' | 'assis' | 'couche'
 *   pas         phase de marche (radians)
 *   souffle     amplitude de la respiration en pixels
 *   bras        [{x,y}, {x,y}] cibles des mains, en coordonnées écran
 *   yeux        'ouvert' | 'ferme' | 'content' | 'mi'
 *   ombre       ombre portée au sol
 */
export function dessinerMascotte(ctx, o) {
  const sens = o.sens ?? 1;
  const pose = o.pose ?? 'debout';
  const souffle = o.souffle ?? 1;
  const respire = Math.sin(etat.t * 2.1) * 0.5 * souffle;

  let hautPattes = PATTE_H;
  if (pose === 'assis') hautPattes = 1;
  if (pose === 'couche') hautPattes = 0;

  const x = Math.round(o.x);
  const basCorps = Math.round(o.sol - hautPattes + (o.dy ?? 0) + (pose === 'debout' || pose === 'marche' ? respire : 0));
  const hautCorps = basCorps - CORPS_H;

  if (o.ombre !== false && (pose === 'debout' || pose === 'marche')) {
    ellipse(ctx, x + CORPS_L / 2, o.sol + 1, CORPS_L / 2 - 2, 1, 'rgba(10,12,16,0.32)');
  }

  // --- Pattes arrière (les deux « lointaines », plus sombres) ---
  const pas = o.pas ?? 0;
  const marche = pose === 'marche';
  const leve = (ph) => (marche ? Math.max(0, Math.sin(ph)) * 2 : 0);
  const avance = (ph) => (marche ? Math.cos(ph) * 1.5 : 0);

  if (hautPattes > 0) {
    const pattesLoin = [
      { x: 5, ph: pas + Math.PI },
      { x: 11, ph: pas + Math.PI / 2 },
    ];
    for (const p of pattesLoin) {
      const px_ = x + miroir(p.x, sens);
      const l = leve(p.ph);
      dessinerPatte(ctx, px_ + Math.round(avance(p.ph)), basCorps, Math.round(hautPattes - l), GRIS.fonce, GRIS.profond);
    }
  }

  // --- Corps ---
  for (let j = 0; j < CORPS_H; j++) {
    const g = sens > 0 ? RETRAIT_G[j] : RETRAIT_D[j];
    const d = sens > 0 ? RETRAIT_D[j] : RETRAIT_G[j];
    rect(ctx, x + g, hautCorps + j, CORPS_L - g - d, 1, couleurLigne(j, CORPS_H));
  }
  // Liseré d'ombre sous le ventre, comme sur la référence.
  rect(ctx, x + 1, basCorps - 1, CORPS_L - 2, 1, GRIS.profond);

  // --- Yeux ---
  const ferme = etat.clignement > 0 || o.yeux === 'ferme';
  for (const ox of OEIL_X) {
    const ex = x + miroir(ox, sens, 3);
    const ey = hautCorps + OEIL_Y;
    if (ferme) {
      rect(ctx, ex, ey + 1, 3, 1, GRIS.profond);
    } else if (o.yeux === 'content') {
      rect(ctx, ex, ey + 1, 3, 1, GRIS.encre);
      px(ctx, ex, ey, GRIS.encre);
      px(ctx, ex + 2, ey, GRIS.encre);
    } else if (o.yeux === 'mi') {
      rect(ctx, ex, ey + 1, 3, 1, GRIS.encre);
    } else {
      rect(ctx, ex, ey, 3, 2, GRIS.encre);
    }
  }

  // --- Pattes avant (les deux « proches ») ---
  if (hautPattes > 0) {
    const pattesPres = [
      { x: 1, ph: pas },
      { x: 15, ph: pas + (3 * Math.PI) / 2 },
    ];
    for (const p of pattesPres) {
      if (o.bras && p.x === 15) continue; // la patte avant sert de bras
      const px_ = x + miroir(p.x, sens);
      const l = leve(p.ph);
      dessinerPatte(ctx, px_ + Math.round(avance(p.ph)), basCorps, Math.round(hautPattes - l), GRIS.moyen, GRIS.fonce);
    }
  } else if (pose === 'assis') {
    // Assise : les pattes avant restent visibles, repliées.
    rect(ctx, x + miroir(15, sens), basCorps, 2, 1, GRIS.moyen);
    rect(ctx, x + miroir(1, sens), basCorps, 2, 1, GRIS.fonce);
  }

  // Crochet : ce qui doit passer devant le corps mais derrière les bras
  // (la guitare, un livre, une tasse).
  if (o.entre) o.entre(ctx, { x, hautCorps, basCorps, sens });

  // --- Bras ---
  if (o.bras) {
    const epauleX = x + miroir(14, sens, 2);
    const epauleY = hautCorps + 6;
    for (const main of o.bras) {
      if (!main) continue;
      dessinerBras(ctx, epauleX, epauleY + (main.epaule ?? 0), main.x, main.y);
    }
  }
}

/**
 * Bras en deux segments de longueur constante. Le coude est placé par
 * intersection de deux cercles (cinématique inverse à deux os) et pointe
 * toujours vers le bas. Si la cible est hors de portée, c'est la main qui
 * s'arrête sur le cercle de portée : les segments, eux, ne s'allongent
 * jamais.
 */
function dessinerBras(ctx, sx, sy, mx, my) {
  sx = Math.round(sx); sy = Math.round(sy);
  let dx = mx - sx, dy = my - sy;
  let d = Math.hypot(dx, dy);
  const max = BRAS_HAUT + BRAS_AVANT - 0.5;
  if (d > max) { const k = max / d; dx *= k; dy *= k; d = max; }
  d = Math.max(1.5, d);
  const ux = dx / d, uy = dy / d;

  // Distance épaule -> projection du coude, et hauteur du coude.
  const a = (d * d + BRAS_HAUT * BRAS_HAUT - BRAS_AVANT * BRAS_AVANT) / (2 * d);
  const h = Math.sqrt(Math.max(0, BRAS_HAUT * BRAS_HAUT - a * a));
  const s = ux >= 0 ? 1 : -1;            // le coude tombe vers le bas
  const cx = Math.round(sx + ux * a - s * uy * h);
  const cy = Math.round(sy + uy * a + s * ux * h);
  const hx = Math.round(sx + dx), hy = Math.round(sy + dy);

  epais(ctx, sx, sy, cx, cy, GRIS.fonce);
  line(ctx, cx, cy, hx, hy, GRIS.moyen);
  line(ctx, cx, cy + 1, hx, hy + 1, GRIS.moyen);
  rect(ctx, hx - 1, hy - 1, 2, 2, GRIS.clair);
}

function epais(ctx, x0, y0, x1, y1, c) {
  line(ctx, x0, y0, x1, y1, c);
  line(ctx, x0, y0 + 1, x1, y1 + 1, c);
}

/** Miroir horizontal d'une coordonnée locale dans le corps. */
function miroir(lx, sens, largeur = 2) {
  return sens > 0 ? lx : CORPS_L - lx - largeur;
}

/** Petit cœur / note : utilisé par plusieurs activités. */
export function dessinerNote(ctx, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x + 1, y, 3, 1, c);
  rect(ctx, x + 3, y + 1, 1, 3, c);
  rect(ctx, x + 1, y + 3, 2, 2, c);
}

export const tempsMascotte = () => etat.t;
export { clamp };
