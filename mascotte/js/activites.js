/* activites.js — ce que la mascotte sait faire.
 *
 * Une activité = un décor + une pose. Chacune reçoit le même objet `env`
 * ({ ctx, l, h, sol, t }) et dessine la scène complète, mascotte comprise.
 * Rien n'est chargé depuis un fichier : tout est posé pixel par pixel.
 */

import { rect, px, line, ellipse, circle, clamp, lerp, ease, makeRng } from './pixel.js';
import { drawText } from './microfont.js';
import {
  GRIS, DECOR, dessinerMascotte, dessinerNote, CORPS_L, CORPS_H, PATTE_H, MASCOTTE_H,
} from './mascotte.js';

/* ---------- Briques de décor ---------- */

function mur(env, teinte = 0) {
  const { ctx, l, h } = env;
  rect(ctx, 0, 0, l, h, DECOR.joint);
  const T = 9;
  const rng = makeRng(1337);
  for (let y = -1; y < h; y += T) {
    for (let x = -1; x < l; x += T) {
      const v = rng();
      let c = v > 0.72 ? DECOR.murClair : v > 0.3 ? DECOR.murFonce : '#383b41';
      if (teinte) c = eclaircir(c, teinte);
      rect(ctx, x, y, T - 1, T - 1, c);
    }
  }
}

function sol(env, couleur = DECOR.sol) {
  const { ctx, l, h } = env;
  rect(ctx, 0, env.sol, l, h - env.sol, couleur);
  rect(ctx, 0, env.sol, l, 1, DECOR.solClair);
}

function eclaircir(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v + k), 0, 255);
  return '#' + ((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}

/** Caisse en volume : face claire, côté sombre, liseré en haut. */
function caisse(ctx, x, y, w, h, face = DECOR.bois, dessus = DECOR.boisClair) {
  rect(ctx, x, y, w, h, face);
  rect(ctx, x, y, w, 1, dessus);
  rect(ctx, x, y + h - 1, w, 1, DECOR.ombre);
}

function trait2(ctx, x0, y0, x1, y1, c) {
  line(ctx, x0, y0, x1, y1, c);
  line(ctx, x0 + 1, y0, x1 + 1, y1, c);
}

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

/** Bulles / particules qui montent, réparties par une graine fixe. */
function particules(ctx, x, y, n, t, vitesse, hauteur, c, graine = 3) {
  const rng = makeRng(graine);
  for (let i = 0; i < n; i++) {
    const dx = Math.round((rng() - 0.5) * 8);
    const ph = rng();
    const p = (t * vitesse + ph) % 1;
    const py = Math.round(y - p * hauteur);
    const ondul = Math.round(Math.sin(p * 8 + i) * 1.5);
    if (p < 0.85) px(ctx, x + dx + ondul, py, c);
  }
}

/* ---------- 1. Guitare ---------- */

function guitare(env) {
  const { ctx, l, t } = env;
  mur(env);
  sol(env);

  const bx = Math.round(l / 2 - 16);
  const hautCorps = env.sol - MASCOTTE_H;

  // Ampli, avec sa diode qui bat la mesure.
  const ax = Math.round(l * 0.12), ay = env.sol - 16;
  caisse(ctx, ax, ay, 18, 16, '#3f434a', '#565b63');
  circle(ctx, ax + 9, ay + 9, 4, '#2a2d33');
  circle(ctx, ax + 9, ay + 9, 1, '#4a4e55');
  px(ctx, ax + 3, ay + 3, Math.sin(t * 6) > 0 ? DECOR.ambre : DECOR.ambreFonce);

  const gx = bx + 12, gy = hautCorps + 3;   // pivot : la caisse de la guitare
  line(ctx, ax + 17, ay + 12, gx + 2, gy + 8, '#2e3137');  // câble

  const grattage = Math.sin(t * 9);
  dessinerMascotte(ctx, {
    x: bx,
    sol: env.sol,
    sens: 1,
    pose: 'debout',
    souffle: 1.4,
    dy: Math.sin(t * 4.5) * 0.6,
    yeux: 'content',
    entre: (c) => dessinerGuitare(c, gx, gy),
    bras: [
      { x: gx + 5, y: gy + 6 + grattage * 1.5, epaule: 2 },
      { x: gx + 14, y: gy - 6 + Math.sin(t * 3), epaule: -2 },
    ],
  });

  // Notes qui s'échappent du manche.
  for (let i = 0; i < 4; i++) {
    const p = ((t * 0.5 + i * 0.25) % 1);
    const nx = gx + 18 + p * 18;
    const ny = gy - 12 - p * 14 + Math.sin(p * 7 + i) * 2;
    if (p < 0.9) dessinerNote(ctx, nx, ny, p > 0.7 ? DECOR.ambreFonce : DECOR.ambre);
  }
}

function dessinerGuitare(ctx, x, y) {
  x = Math.round(x); y = Math.round(y);
  // Caisse : deux disques qui se recouvrent, comme sur la référence.
  ellipse(ctx, x + 4, y + 8, 5, 4, GRIS.encre);
  ellipse(ctx, x + 6, y + 4, 4, 4, GRIS.encre);
  circle(ctx, x + 5, y + 6, 1, GRIS.moyen);
  // Manche en diagonale vers le haut-droite.
  trait2(ctx, x + 7, y + 3, x + 15, y - 6, '#33363c');
  line(ctx, x + 8, y + 2, x + 16, y - 7, GRIS.profond);
  // Tête et mécaniques.
  rect(ctx, x + 15, y - 10, 4, 3, GRIS.base);
  px(ctx, x + 15, y - 11, GRIS.encre);
  px(ctx, x + 17, y - 11, GRIS.encre);
  // Cordes.
  line(ctx, x + 5, y + 5, x + 14, y - 5, GRIS.clair);
}

/* ---------- 2. Clavier ---------- */

function clavier(env) {
  const { ctx, l, t } = env;
  mur(env);
  sol(env);

  const bx = Math.round(l * 0.14);
  const bureauY = env.sol - 9;
  const bux = bx + 20, buw = Math.min(46, l - bux - 4);

  // La mascotte est derrière le bureau : on la dessine d'abord.
  const frappe = Math.sin(t * 14);
  const frappe2 = Math.sin(t * 14 + 2.2);
  dessinerMascotte(ctx, {
    x: bx,
    sol: env.sol,
    sens: 1,
    pose: 'debout',
    souffle: 0.8,
    yeux: 'mi',
    dy: Math.sin(t * 3) * 0.4,
    bras: [
      { x: bux + 5, y: bureauY - 3 + (frappe > 0 ? 0 : 1), epaule: 2 },
      { x: bux + 10, y: bureauY - 3 + (frappe2 > 0 ? 0 : 1), epaule: 0 },
    ],
  });

  // Bureau
  caisse(ctx, bux, bureauY, buw, 2, DECOR.bois, DECOR.boisClair);
  rect(ctx, bux + 1, bureauY + 2, 2, env.sol - bureauY - 2, '#494d54');
  rect(ctx, bux + buw - 3, bureauY + 2, 2, env.sol - bureauY - 2, '#494d54');

  // Clavier : les touches s'allument au rythme de la frappe.
  const kx = bux + 2, ky = bureauY - 2;
  caisse(ctx, kx, ky, 14, 2, '#4d5259', '#666b73');
  for (let i = 0; i < 6; i++) {
    const actif = (Math.floor(t * 7) % 6) === i;
    px(ctx, kx + 2 + i * 2, ky, actif ? GRIS.clair : '#6e737b');
  }

  // Écran
  const ex = bux + 20, ey = bureauY - 19;
  rect(ctx, ex + 8, bureauY - 2, 4, 2, DECOR.metal);
  caisse(ctx, ex, ey, 20, 17, '#41454c', '#585d65');
  rect(ctx, ex + 2, ey + 2, 16, 13, '#1c2126');
  const rng = makeRng(99);
  const lignes = [];
  for (let i = 0; i < 24; i++) lignes.push({ indent: Math.floor(rng() * 3) * 2, w: 3 + Math.floor(rng() * 9) });
  const defile = Math.floor(t * 3) % lignes.length;
  for (let i = 0; i < 4; i++) {
    const ln = lignes[(defile + i) % lignes.length];
    const c = i % 3 === 0 ? DECOR.ambreFonce : GRIS.moyen;
    rect(ctx, ex + 3 + ln.indent, ey + 4 + i * 3, ln.w, 1, c);
  }
  if (Math.sin(t * 6) > 0) rect(ctx, ex + 3, ey + 16 - 1, 2, 1, GRIS.clair);
  rect(ctx, ex + 1, bureauY - 1, 18, 1, '#3d434b');   // lueur sur le bureau

  // Tasse fumante au bout du bureau
  tasse(ctx, bux + buw - 8, bureauY - 5, t, true);
}

/* ---------- 3. Magasinage ---------- */

function magasinage(env) {
  const { ctx, l, t } = env;
  mur(env, -6);
  const defile = (t * 14) % 48;

  // Rayons qui défilent en arrière-plan
  for (let i = -1; i < Math.ceil(l / 48) + 1; i++) {
    const x = Math.round(i * 48 - defile);
    rayon(ctx, x, env.sol - 34, i);
  }
  sol(env);

  const bx = Math.round(l * 0.42);
  const pas = t * 7;
  const hautCorps = env.sol - MASCOTTE_H;
  const px_ = bx + 22;

  dessinerMascotte(ctx, {
    x: bx,
    sol: env.sol,
    sens: 1,
    pose: 'marche',
    pas,
    souffle: 1,
    yeux: 'ouvert',
    dy: Math.abs(Math.sin(pas)) * -0.5,
    bras: [{ x: px_ - 2, y: hautCorps + 4, epaule: 0 }],
  });

  // Panier poussé devant elle
  panier(ctx, px_ - 2, env.sol, t);
}

function rayon(ctx, x, y, i) {
  const rng = makeRng(20 + i * 7);
  caisse(ctx, x, y, 40, 34, '#34373d', '#43474e');
  for (let e = 0; e < 3; e++) {
    const ey = y + 4 + e * 11;
    rect(ctx, x + 1, ey + 8, 38, 1, '#4a4e55');
    for (let k = 0; k < 7; k++) {
      const h = 3 + Math.floor(rng() * 5);
      const w = 2 + Math.floor(rng() * 3);
      const c = rng() > 0.8 ? DECOR.ambreFonce : rng() > 0.5 ? GRIS.moyen : GRIS.fonce;
      rect(ctx, x + 3 + k * 5, ey + 8 - h, w, h, c);
    }
  }
}

function panier(ctx, x, sol, t) {
  const y = sol - 14;
  // Corps du panier : grille
  rect(ctx, x, y, 16, 10, '#585d65');
  rect(ctx, x + 1, y + 1, 14, 8, '#3a3d43');
  for (let i = 0; i < 4; i++) rect(ctx, x + 2 + i * 4, y + 1, 1, 8, '#585d65');
  rect(ctx, x + 1, y + 5, 14, 1, '#585d65');
  // Poignée
  trait2(ctx, x - 1, y - 3, x + 1, y, DECOR.metal);
  rect(ctx, x - 3, y - 4, 3, 1, DECOR.metalClair);
  // Roues
  circle(ctx, x + 3, sol - 2, 2, '#2c2f35');
  circle(ctx, x + 13, sol - 2, 2, '#2c2f35');
  px(ctx, x + 3, sol - 2, GRIS.fonce);
  px(ctx, x + 13, sol - 2, GRIS.fonce);
  // Courses qui dépassent
  rect(ctx, x + 3, y - 3, 3, 4, GRIS.moyen);
  rect(ctx, x + 8, y - 5, 4, 6, DECOR.ambreFonce);
  rect(ctx, x + 9, y - 6, 2, 1, GRIS.base);
  // Un article tombe dans le panier toutes les 3 secondes.
  const p = (t % 3) / 3;
  if (p < 0.45) {
    const chute = ease(p / 0.45);
    rect(ctx, x + 5, Math.round(lerp(y - 28, y - 4, chute)), 3, 3, GRIS.clair);
  }
}

/* ---------- 4. Café ---------- */

function cafe(env) {
  const { ctx, l, t } = env;
  mur(env, 4);

  // Fenêtre : il pleut dehors.
  const fx = Math.round(l * 0.1), fy = 6;
  caisse(ctx, fx, fy, 30, 22, '#2c3037', '#464a51');
  rect(ctx, fx + 2, fy + 2, 26, 18, '#212831');
  rect(ctx, fx + 14, fy + 2, 1, 18, '#3c4048');
  const rng = makeRng(5);
  for (let i = 0; i < 24; i++) {
    const gx = fx + 3 + Math.floor(rng() * 24);
    const p = (t * 1.4 + rng()) % 1;
    rect(ctx, gx, fy + 2 + Math.round(p * 16), 1, 2, '#39414c');
  }
  sol(env);

  const bx = Math.round(l * 0.46);
  const assiseY = env.sol - 7;

  // Guéridon
  const tx = bx + 26;
  caisse(ctx, tx, env.sol - 15, 16, 2, DECOR.bois, DECOR.boisClair);
  rect(ctx, tx + 7, env.sol - 13, 2, 13, '#494d54');
  rect(ctx, tx + 4, env.sol - 1, 8, 1, '#3f434a');
  rect(ctx, tx + 9, env.sol - 18, 6, 3, GRIS.base);           // assiette
  rect(ctx, tx + 10, env.sol - 19, 4, 1, DECOR.ambreFonce);   // viennoiserie

  // La tasse monte jusqu'au museau toutes les 4 s.
  const cycle = (t % 4) / 4;
  const gorgee = cycle > 0.38 && cycle < 0.62;
  const monte = ease(clamp(cycle < 0.5 ? cycle / 0.35 : (0.85 - cycle) / 0.23, 0, 1));
  const hautCorps = assiseY - 1 - CORPS_H;
  const tasseX = Math.round(lerp(tx + 1, bx + 18, monte));
  const tasseY = Math.round(lerp(env.sol - 20, hautCorps + 4, monte));

  dessinerMascotte(ctx, {
    x: bx,
    sol: assiseY,
    sens: 1,
    pose: 'assis',
    souffle: 1.2,
    yeux: gorgee ? 'ferme' : 'content',
    bras: [{ x: tasseX - 1, y: tasseY + 3, epaule: 1 }],
  });

  // Tabouret : dessiné après la mascotte, l'assise arrive juste sous elle.
  caisse(ctx, bx - 1, assiseY, 20, 2, '#4e535a', '#666b73');
  rect(ctx, bx + 2, assiseY + 2, 2, env.sol - assiseY - 2, '#3f434a');
  rect(ctx, bx + 14, assiseY + 2, 2, env.sol - assiseY - 2, '#3f434a');

  tasse(ctx, tasseX, tasseY, t, !gorgee);
}

function tasse(ctx, x, y, t, fume) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y, 5, 5, GRIS.clair);
  rect(ctx, x + 1, y + 1, 3, 1, '#4a4e55');
  rect(ctx, x, y + 4, 5, 1, GRIS.moyen);
  px(ctx, x + 5, y + 1, GRIS.base);
  px(ctx, x + 5, y + 2, GRIS.base);
  if (fume) particules(ctx, x + 2, y - 1, 5, t, 0.4, 10, '#5d626a', 8);
}

/* ---------- 5. Peinture ---------- */

function peinture(env) {
  const { ctx, l, t } = env;
  mur(env, 2);
  sol(env);

  const bx = Math.round(l * 0.34);
  const ex = bx + 18, ey = env.sol - 34;   // coin haut-gauche de la toile
  const hautCorps = env.sol - MASCOTTE_H;

  // Chevalet
  line(ctx, ex + 2, env.sol, ex + 6, ey + 2, '#5a5f66');
  line(ctx, ex + 15, env.sol, ex + 11, ey + 2, '#5a5f66');
  line(ctx, ex + 8, env.sol, ex + 8, ey + 18, '#4a4e55');
  caisse(ctx, ex, ey, 16, 18, '#c2c6cc', '#d8dbe0');
  rect(ctx, ex - 1, ey + 18, 18, 2, '#5a5f66');   // tasseau

  // La toile se remplit sur 7 s, puis on repart d'une toile blanche.
  const cycle = (t % 8) / 8;
  const avance = clamp(cycle / 0.82, 0, 1);
  const rng = makeRng(42);
  const coups = [];
  for (let i = 0; i < 70; i++) {
    coups.push({ x: 1 + Math.floor(rng() * 11), y: 1 + Math.floor(rng() * 14), w: 2 + Math.floor(rng() * 4), c: rng() });
  }
  const n = Math.floor(avance * coups.length);
  for (let i = 0; i < n; i++) {
    const c = coups[i];
    rect(ctx, ex + 2 + c.x, ey + 2 + c.y, c.w, 1, c.c > 0.85 ? DECOR.ambreFonce : c.c > 0.5 ? GRIS.moyen : GRIS.fonce);
  }

  // La main suit le prochain coup de pinceau.
  const cible = coups[Math.min(n, coups.length - 1)];
  const mx = ex + 2 + cible.x, my = ey + 2 + cible.y;

  dessinerMascotte(ctx, {
    x: bx,
    sol: env.sol,
    sens: 1,
    pose: 'debout',
    souffle: 1,
    yeux: 'mi',
    dy: Math.sin(t * 2) * 0.5,
    bras: [
      { x: mx - 5, y: my + 3, epaule: 0 },
      { x: bx + 20, y: hautCorps + 10, epaule: 3 },
    ],
  });

  // Pinceau
  trait2(ctx, mx - 6, my + 3, mx - 1, my, '#6d727a');
  px(ctx, mx, my, GRIS.clair);
  // Palette
  ellipse(ctx, bx + 22, hautCorps + 11, 4, 2, DECOR.bois);
  px(ctx, bx + 20, hautCorps + 10, GRIS.clair);
  px(ctx, bx + 23, hautCorps + 10, DECOR.ambre);
  px(ctx, bx + 25, hautCorps + 11, GRIS.fonce);
}

/* ---------- 6. Lecture ---------- */

function lecture(env) {
  const { ctx, l, t } = env;
  mur(env, -4);
  sol(env);

  const bx = Math.round(l * 0.44);
  const assiseY = env.sol - 8;

  // Lampe sur pied
  const lx = Math.round(l * 0.18);
  rect(ctx, lx - 4, env.sol - 1, 9, 1, '#3f434a');
  rect(ctx, lx, env.sol - 28, 1, 27, '#5a5f66');
  rect(ctx, lx - 5, env.sol - 34, 11, 6, '#4e535a');
  rect(ctx, lx - 4, env.sol - 29, 9, 1, DECOR.ambre);
  // Cône de lumière tramé
  // Trame de Bayer : dense près de l'abat-jour, clairsemée en bas.
  for (let j2 = 1; j2 < 16; j2++) {
    const w = 6 + j2;
    const seuil = 9 - Math.floor(j2 / 2.5);
    for (let i2 = 0; i2 < w; i2++) {
      const gx = lx - Math.floor(w / 2) + i2;
      const gy = env.sol - 28 + j2;
      if (BAYER[gy & 3][gx & 3] < seuil) px(ctx, gx, gy, '#4d4a3f');
    }
  }

  // Dossier du fauteuil (derrière la mascotte)
  caisse(ctx, bx - 8, assiseY - 20, 7, 22, '#4a4e55', '#5c616a');

  const hautCorps = assiseY - 1 - CORPS_H;
  const page = (t % 5) / 5;
  const tourne = page > 0.88;

  dessinerMascotte(ctx, {
    x: bx,
    sol: assiseY,
    sens: 1,
    pose: 'assis',
    souffle: 1.1,
    yeux: 'mi',
    entre: (c) => livre(c, bx + 16, hautCorps + 5, tourne),
    bras: [
      { x: bx + 16, y: hautCorps + 15, epaule: 3 },
      { x: bx + 27, y: hautCorps + (tourne ? 11 : 15), epaule: 1 },
    ],
  });

  // Assise, accoudoir avant et pieds : devant la mascotte.
  caisse(ctx, bx - 8, assiseY, 26, 3, '#525760', '#666b73');
  rect(ctx, bx - 6, assiseY + 3, 3, env.sol - assiseY - 3, '#3a3d43');
  rect(ctx, bx + 13, assiseY + 3, 3, env.sol - assiseY - 3, '#3a3d43');
}

function livre(ctx, x, y, tourne) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y, 13, 10, '#3f434a');            // couverture
  rect(ctx, x + 1, y + 1, 5, 8, '#d3d6db');      // page gauche
  rect(ctx, x + 7, y + 1, 5, 8, '#c3c7cd');      // page droite
  rect(ctx, x + 6, y, 1, 10, '#2f3238');         // reliure
  rect(ctx, x + 2, y + 3, 3, 1, GRIS.moyen);
  rect(ctx, x + 2, y + 6, 3, 1, GRIS.moyen);
  rect(ctx, x + 8, y + 3, 3, 1, GRIS.moyen);
  rect(ctx, x + 8, y + 6, 3, 1, GRIS.moyen);
  if (tourne) rect(ctx, x + 7, y, 3, 10, '#e6e8ec');
}

/* ---------- 7. Cuisine ---------- */

function cuisine(env) {
  const { ctx, l, t } = env;
  mur(env, 2);
  sol(env);

  const bx = Math.round(l * 0.24);
  const px0 = bx + 24;
  const planY = env.sol - 12;
  const hautCorps = env.sol - MASCOTTE_H;

  // Plan de travail + gazinière
  const planL = Math.min(46, l - px0 - 4);
  caisse(ctx, px0, planY, planL, 3, '#5a5f66', '#767b83');
  rect(ctx, px0 + 2, planY + 3, planL - 4, env.sol - planY - 3, '#3e424a');
  for (let i = 0; i * 12 + 10 < planL; i++) rect(ctx, px0 + 4 + i * 12, planY + 7, 8, 1, '#585d65');
  // Flamme
  const flamme = Math.sin(t * 12) > 0 ? 2 : 1;
  rect(ctx, px0 + 6, planY - flamme, 4, flamme, DECOR.ambreFonce);

  // Étagère à bocaux, pour habiller le mur.
  const ey2 = planY - 24;
  rect(ctx, px0 + 6, ey2 + 5, 26, 1, '#565b63');
  for (let i = 0; i < 4; i++) {
    const h = 3 + (i % 3);
    rect(ctx, px0 + 9 + i * 6, ey2 + 5 - h, 4, h, i === 1 ? DECOR.ambreFonce : GRIS.fonce);
    rect(ctx, px0 + 9 + i * 6, ey2 + 4 - h, 4, 1, GRIS.moyen);
  }

  // Poêle tenue par la mascotte : la crêpe saute toutes les 2,5 s.
  const cycle = (t % 2.5) / 2.5;
  const saut = cycle < 0.5 ? Math.sin(cycle * Math.PI * 2) : 0;
  const poeleY = planY - 4 - Math.max(0, saut) * 3;
  const poeleX = px0 + 3;

  dessinerMascotte(ctx, {
    x: bx,
    sol: env.sol,
    sens: 1,
    pose: 'debout',
    souffle: 1.2,
    yeux: 'content',
    dy: Math.max(0, saut) * -1,
    bras: [{ x: poeleX - 3, y: poeleY + 1, epaule: 1 }],
  });

  // Poêle
  rect(ctx, poeleX - 8, poeleY + 1, 6, 1, '#4e535a');
  rect(ctx, poeleX - 2, poeleY, 14, 3, '#3a3d43');
  rect(ctx, poeleX - 2, poeleY, 14, 1, '#565b63');
  // Crêpe
  const hSaut = cycle < 0.5 ? Math.sin(cycle * Math.PI * 2) * 16 : 0;
  ellipse(ctx, poeleX + 5, poeleY - 1 - hSaut, 4, hSaut > 4 ? 1 : 2, DECOR.ambreFonce);

  // Casserole qui bout au bout du plan
  const cx = px0 + planL - 12;
  rect(ctx, cx, planY - 6, 10, 6, '#4a4e55');
  rect(ctx, cx - 1, planY - 7, 12, 1, '#6b7078');
  particules(ctx, cx + 5, planY - 8, 7, t, 0.5, 14, '#5d626a', 17);
}

/* ---------- 8. Planche à roulettes ---------- */

function skate(env) {
  const { ctx, l, h, t } = env;
  // Ciel de fin de journée, en gris.
  rect(ctx, 0, 0, l, h, '#2f333a');
  rect(ctx, 0, 0, l, Math.round(h * 0.45), '#383d45');
  circle(ctx, Math.round(l * 0.75), Math.round(h * 0.22), 6, '#585e67');

  // Immeubles en parallaxe : deux plans à des vitesses différentes.
  plan(ctx, env, 40, 8, '#33373e', 26, 3);
  plan(ctx, env, 26, 18, '#2b2f35', 34, 11);
  sol(env, '#242730');
  // Bitume qui défile
  const defile = (t * 34) % 12;
  for (let x = -12; x < l + 12; x += 12) {
    rect(ctx, Math.round(x - defile), env.sol + 4, 6, 1, '#33373e');
  }

  const bx = Math.round(l * 0.4);
  // Un ollie toutes les 3 s.
  const cycle = (t % 3) / 3;
  const ollie = cycle < 0.25 ? Math.sin(cycle * 4 * Math.PI) : 0;
  const hauteur = Math.max(0, ollie) * 10;
  const solLocal = env.sol - hauteur;

  dessinerMascotte(ctx, {
    x: bx,
    sol: solLocal - 2,
    sens: 1,
    pose: 'debout',
    souffle: 0.8,
    yeux: hauteur > 2 ? 'content' : 'ouvert',
    ombre: false,
    bras: [
      { x: bx + 24, y: solLocal - 18 - hauteur * 0.2, epaule: -1 },
      { x: bx + 20, y: solLocal - 10, epaule: 4 },
    ],
  });

  // Ombre au sol, qui rétrécit quand elle saute
  ellipse(ctx, bx + CORPS_L / 2, env.sol + 1, 9 - hauteur * 0.3, 1.5, DECOR.ombre);
  // Planche
  const px_ = bx - 2;
  rect(ctx, px_, solLocal - 1, 22, 2, '#4a4e55');
  rect(ctx, px_, solLocal - 2, 3, 1, '#5c616a');
  rect(ctx, px_ + 19, solLocal - 2, 3, 1, '#5c616a');
  circle(ctx, px_ + 4, solLocal + 2, 1, GRIS.fonce);
  circle(ctx, px_ + 17, solLocal + 2, 1, GRIS.fonce);
  // Traînées de vitesse
  for (let i = 0; i < 3; i++) {
    const p = (t * 2 + i * 0.33) % 1;
    rect(ctx, Math.round(bx - 8 - p * 26), solLocal - 6 - i * 4, Math.round(6 - p * 4), 1, '#4a4e55');
  }
}

function plan(ctx, env, hMax, hMin, couleur, largeur, graine) {
  const { l, t } = env;
  const vitesse = graine * 1.4;
  const defile = (t * vitesse) % largeur;
  const rng = makeRng(graine);
  for (let i = -1; i < Math.ceil(l / largeur) + 2; i++) {
    const x = Math.round(i * largeur - defile);
    const hh = Math.round(hMin + rng() * (hMax - hMin));
    rect(ctx, x, env.sol - hh, largeur - 2, hh, couleur);
    for (let j = 3; j < hh - 2; j += 5) {
      for (let k = 2; k < largeur - 5; k += 4) {
        px(ctx, x + k, env.sol - hh + j, rng() > 0.6 ? DECOR.ambreFonce : '#3f444c');
      }
    }
  }
}

/* ---------- 9. Jardinage ---------- */

function jardinage(env) {
  const { ctx, l, t } = env;
  mur(env, 6);
  sol(env, '#2b2e33');

  const bx = Math.round(l * 0.32);
  const potX = bx + 24;
  const hautCorps = env.sol - MASCOTTE_H;

  // Pot et terre
  const potY = env.sol - 9;
  caisse(ctx, potX, potY, 16, 9, '#5a5f66', '#767b83');
  rect(ctx, potX + 1, potY + 1, 14, 2, '#3a3d43');

  // La fleur pousse en 7 s, puis on recommence.
  const cycle = (t % 7) / 7;
  const pousse = ease(clamp(cycle / 0.7, 0, 1));
  const tige = Math.round(pousse * 20);
  const fx = potX + 8;
  for (let j = 0; j < tige; j++) {
    px(ctx, fx + Math.round(Math.sin(j * 0.4) * 1.5), potY - j, '#6f7a68');
  }
  if (tige > 8) {
    rect(ctx, fx + 2, potY - 8, 3, 1, '#7d8875');
    rect(ctx, fx - 4, potY - 12, 3, 1, '#7d8875');
  }
  if (pousse > 0.75) {
    const ouv = ease(clamp((pousse - 0.75) / 0.25, 0, 1));
    const fy = potY - tige - 2;
    const r = 1 + ouv * 3;
    ellipse(ctx, fx, fy, r, r, GRIS.clair);
    circle(ctx, fx, fy, Math.max(1, r - 2), DECOR.ambre);
  }

  // Arrosoir : il s'incline pendant la première moitié du cycle.
  const arrose = cycle < 0.6;
  const inclinaison = arrose ? 1 : 0;
  const ax = bx + 16, ay = potY - 20;

  dessinerMascotte(ctx, {
    x: bx,
    sol: env.sol,
    sens: 1,
    pose: 'debout',
    souffle: 1.1,
    yeux: 'content',
    dy: Math.sin(t * 2.2) * 0.5,
    bras: [{ x: ax + 1, y: ay + 6, epaule: 0 }],
  });

  arrosoir(ctx, ax, ay, inclinaison);
  if (arrose) {
    for (let i = 0; i < 8; i++) {
      const p = ((t * 1.6 + i * 0.12) % 1);
      const gx = ax + 11 + Math.round(p * 6);
      const gy = ay + 3 + Math.round(p * p * 20);
      if (gy < potY + 1) px(ctx, gx, gy, '#9fb0bd');
    }
  }
}

function arrosoir(ctx, x, y, incline) {
  x = Math.round(x); y = Math.round(y + incline * 2);
  rect(ctx, x, y + 2, 9, 7, '#666b73');
  rect(ctx, x, y + 2, 9, 1, '#878c94');
  rect(ctx, x + 2, y, 4, 2, '#565b63');                                        // goulot
  trait2(ctx, x + 9, y + 3 - incline, x + 12, y + 1 - incline * 2, '#666b73'); // bec
  rect(ctx, x + 11, y - incline * 2, 3, 2, '#878c94');
  line(ctx, x + 1, y + 2, x + 4, y - 1, '#565b63');                            // anse
}

/* ---------- 10. Sieste ---------- */

function sieste(env) {
  const { ctx, l, t } = env;
  mur(env, -10);
  sol(env, '#232529');

  const bx = Math.round(l * 0.4);
  const litY = env.sol - 6;

  // Lit
  caisse(ctx, bx - 8, litY, 40, 4, '#4a4e55', '#5c616a');
  rect(ctx, bx - 8, litY + 4, 40, 2, '#35383e');
  rect(ctx, bx - 10, litY - 8, 3, 12, '#5c616a');
  rect(ctx, bx + 32, litY - 5, 3, 9, '#5c616a');
  rect(ctx, bx - 6, litY - 4, 10, 4, '#c9ccd2'); // oreiller

  dessinerMascotte(ctx, {
    x: bx,
    sol: litY,
    sens: 1,
    pose: 'couche',
    souffle: 2.2,
    yeux: 'ferme',
    dy: Math.sin(t * 1.2) * 0.8,
    ombre: false,
  });

  // Couverture par-dessus le bas du corps
  rect(ctx, bx + 2, litY - 7, 22, 7, '#585f68');
  rect(ctx, bx + 2, litY - 7, 22, 1, '#6c737d');

  // Z Z Z
  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.4 + i * 0.33) % 1);
    const zx = bx + 20 + Math.round(p * 14);
    const zy = Math.round(litY - 16 - p * 22);
    const c = p > 0.7 ? '#4a4e55' : GRIS.moyen;
    drawText(ctx, 'Z', zx, zy, c);
  }
}

/* ---------- Catalogue ---------- */

export const ACTIVITES = [
  { id: 'guitare', nom: 'Guitare', indice: 'Elle gratte, l’ampli répond.', dessiner: guitare },
  { id: 'clavier', nom: 'Clavier', indice: 'Du code, une tasse, et ça tape.', dessiner: clavier },
  { id: 'magasinage', nom: 'Magasinage', indice: 'Un panier, des rayons qui défilent.', dessiner: magasinage },
  { id: 'cafe', nom: 'Café', indice: 'Une gorgée toutes les quatre secondes.', dessiner: cafe },
  { id: 'peinture', nom: 'Peinture', indice: 'La toile se remplit, puis on efface.', dessiner: peinture },
  { id: 'lecture', nom: 'Lecture', indice: 'Une page toutes les cinq secondes.', dessiner: lecture },
  { id: 'cuisine', nom: 'Cuisine', indice: 'La crêpe finit toujours par retomber.', dessiner: cuisine },
  { id: 'skate', nom: 'Planche', indice: 'Un ollie toutes les trois secondes.', dessiner: skate },
  { id: 'jardinage', nom: 'Jardinage', indice: 'Arroser, attendre, refleurir.', dessiner: jardinage },
  { id: 'sieste', nom: 'Sieste', indice: 'Elle a bien travaillé.', dessiner: sieste },
];
