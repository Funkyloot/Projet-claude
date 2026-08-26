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
 *
 * Perspective : la référence est vue de trois quarts, et tout le volume
 * tient dans une seule règle — ce qui s'éloigne est plus sombre. Le flanc
 * arrière du corps porte une bande de 2 px d'un gris plus sombre, les deux
 * pattes du fond sont entièrement dans ce gris et décalées vers l'arrière,
 * le bras du fond aussi. Le reste de la face est d'un seul aplat, sans
 * dégradé : c'est exactement ce que fait la référence.
 */

import { rect, px, line, ellipse, clamp } from './pixel.js';

/* ---------- Palette ---------- */

export const GRIS = {
  clair: '#c9ccd2',
  base: '#a7abb2',
  moyen: '#8a8f97',
  fonce: '#6a6f77',
  profond: '#4b5057',
  encre: '#23262b',
};

/* Le décor, lui, est en couleur.
 *
 * La mascotte est le seul élément gris de l'image : c'est ce qui la détache
 * sans effort et ce qui rend chaque objet identifiable au premier coup d'œil.
 * Tout griser reviendrait à demander au regard de trier lui-même le bois, le
 * métal et la mascotte — exactement ce qu'il ne faut pas.
 */
export const DECOR = {
  sol: '#2b2622',
  solClair: '#3a332c',
  ombre: '#1c1815',

  bois: '#8a5a3b',
  boisClair: '#a97244',
  boisFonce: '#5c3a26',

  metal: '#7e838b',
  metalClair: '#a9aeb6',
  metalFonce: '#565b63',

  rouge: '#c04a35',
  rougeFonce: '#8b3325',
  ambre: '#e3b25c',
  ambreFonce: '#b07f34',
  vert: '#5f9b52',
  vertFonce: '#3d6b38',
  bleu: '#4d7fb3',
  bleuFonce: '#2f5480',
  violet: '#7a5aa8',
  rose: '#d97a92',
  creme: '#e8e2d4',
  cremeFonce: '#c0b8a4',
  encre: '#1b2028',
};

/* Ambiances de mur : chaque scène a la sienne, toujours assez sombre pour
 * que le gris de la mascotte ressorte. [tuile claire, tuile sombre, tuile
 * moyenne, joint]. */
export const MURS = {
  repet:   ['#4a3a63', '#3d3053', '#443659', '#2b2340'],   // salle de répète
  bureau:  ['#3b4657', '#323b49', '#374253', '#262d38'],
  magasin: ['#3f4a4a', '#36403f', '#3b4544', '#2a3231'],
  cafe:    ['#4a3a30', '#3f3129', '#45362d', '#2f251f'],
  atelier: ['#4c4536', '#413b2e', '#474032', '#302b21'],
  salon:   ['#39374f', '#312f45', '#35334a', '#262435'],
  cuisine: ['#3d4a44', '#34403b', '#394540', '#28322e'],
  jardin:  ['#3c4a38', '#334030', '#374534', '#273120'],
  chambre: ['#2f3348', '#282b3e', '#2c2f43', '#1f2233'],
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
    y: basCorps - CORPS_H + EPAULE_Y,
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

// Largeur, en pixels, de la bande sombre du flanc arrière.
const BANDE_ARRIERE = 2;

// Hauteur de l'épaule dans le corps. Bas placée exprès : sur la référence
// les bras partent du poitrail, pas du museau.
const EPAULE_Y = 8;

/** Patte de 2 px. Celles du fond sont d'un seul gris sombre ; celles de
 *  devant ont la face claire du corps et un pixel d'ombre côté arrière. */
function dessinerPatte(ctx, x, y, h, sens, loin) {
  if (h <= 0) return;
  if (loin) {
    rect(ctx, x, y, 2, h, GRIS.moyen);
  } else {
    rect(ctx, x, y, 2, h, GRIS.base);
    rect(ctx, x + (sens > 0 ? 0 : 1), y, 1, h, GRIS.moyen);
  }
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
    // Les pattes du fond sont décalées d'un cran vers l'arrière : c'est ce
    // décalage, plus leur gris plus sombre, qui donne la profondeur.
    const pattesLoin = [
      { x: 1, ph: pas + Math.PI },
      { x: 9, ph: pas + Math.PI / 2 },
    ];
    for (const p of pattesLoin) {
      const px_ = x + miroir(p.x, sens);
      const l = leve(p.ph);
      // Un pixel plus courtes : le sol du fond est plus haut, c'est ce qui
      // sépare les deux paires au lieu d'un peigne de quatre pattes.
      dessinerPatte(ctx, px_ + Math.round(avance(p.ph)), basCorps, Math.round(hautPattes - l) - 1, sens, true);
    }
  }

  // --- Corps : un aplat, plus la bande sombre du flanc arrière ---
  for (let j = 0; j < CORPS_H; j++) {
    const g = sens > 0 ? RETRAIT_G[j] : RETRAIT_D[j];
    const d = sens > 0 ? RETRAIT_D[j] : RETRAIT_G[j];
    const w = CORPS_L - g - d;
    rect(ctx, x + g, hautCorps + j, w, 1, GRIS.base);
    const bande = Math.min(BANDE_ARRIERE, w);
    rect(ctx, x + (sens > 0 ? g : CORPS_L - d - bande), hautCorps + j, bande, 1, GRIS.moyen);
  }

  // --- Yeux ---
  const ferme = etat.clignement > 0 || o.yeux === 'ferme';
  for (const ox of OEIL_X) {
    const ex = x + miroir(ox, sens, 3);
    const ey = hautCorps + OEIL_Y;
    if (ferme) {
      rect(ctx, ex, ey + 1, 3, 1, GRIS.encre);
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
      { x: 5, ph: pas },
      { x: 13, ph: pas + (3 * Math.PI) / 2 },
    ];
    for (const p of pattesPres) {
      if (o.bras && p.x === 13) continue; // la patte avant sert de bras
      const px_ = x + miroir(p.x, sens);
      const l = leve(p.ph);
      dessinerPatte(ctx, px_ + Math.round(avance(p.ph)), basCorps, Math.round(hautPattes - l), sens, false);
    }
  } else if (pose === 'assis') {
    // Assise : les pattes avant restent visibles, repliées.
    rect(ctx, x + miroir(13, sens), basCorps, 2, 1, GRIS.base);
    rect(ctx, x + miroir(5, sens), basCorps, 2, 1, GRIS.moyen);
  }

  // Crochet : ce qui doit passer devant le corps mais derrière les bras
  // (la guitare, un livre, une tasse).
  if (o.entre) o.entre(ctx, { x, hautCorps, basCorps, sens });

  // --- Bras ---
  // Le second bras est celui du fond : épaule reculée d'un cran, un gris
  // plus sombre, et tracé en premier pour passer derrière l'autre.
  if (o.bras) {
    const epauleX = x + miroir(14, sens, 2);
    const epauleY = hautCorps + EPAULE_Y;
    for (let i = o.bras.length - 1; i >= 0; i--) {
      const main = o.bras[i];
      if (!main) continue;
      const loin = i > 0;
      dessinerBras(
        ctx,
        epauleX - (loin ? sens * 2 : 0),
        epauleY + (main.epaule ?? 0) - (loin ? 1 : 0),
        main.x, main.y, loin,
      );
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
function dessinerBras(ctx, sx, sy, mx, my, loin = false) {
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

  // Le bras fait 2 px et reprend la couleur du corps, exactement comme la
  // référence : celui du fond simplement d'un gris plus sombre.
  const face = loin ? GRIS.moyen : GRIS.base;
  segment(ctx, sx, sy, cx, cy, face);
  segment(ctx, cx, cy, hx, hy, face);
  rect(ctx, hx - 1, hy - 1, 2, 2, face);
  if (!loin) px(ctx, hx, hy - 1, GRIS.clair);
}

/** Membre de 2 px : l'épaisseur est prise sur l'axe le moins parcouru. */
function segment(ctx, x0, y0, x1, y1, face) {
  const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const ox = horiz ? 0 : 1;
  const oy = horiz ? 1 : 0;
  line(ctx, x0, y0, x1, y1, face);
  line(ctx, x0 + ox, y0 + oy, x1 + ox, y1 + oy, face);
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
