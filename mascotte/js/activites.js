/* activites.js — ce que la mascotte sait faire.
 *
 * Une activité = un décor + une pose. Chacune reçoit le même objet `env`
 * ({ ctx, l, h, sol, t }) et dessine la scène complète, mascotte comprise.
 * Rien n'est chargé depuis un fichier : tout est posé pixel par pixel.
 *
 * Règle de composition : les bras ont une longueur fixe (voir PORTEE dans
 * mascotte.js). Aucune scène ne tire un bras vers un objet — chaque objet
 * qui se tient (guitare, tasse, poêle, livre, poignée de panier) est placé
 * à partir de la position de l'épaule, donc à portée de main. Les décors
 * fixes (bureau, plan de travail, chevalet) sont eux aussi calés sur
 * l'épaule, pas sur des fractions de l'écran.
 */

import { rect, px, line, ellipse, circle, clamp, lerp, ease, makeRng } from './pixel.js';
import { drawText } from './microfont.js';
import {
  GRIS, DECOR, dessinerMascotte, dessinerNote, epaule, PORTEE,
  CORPS_L, CORPS_H, PATTE_H, MASCOTTE_H,
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

/** Caisse en volume : face, liseré clair en haut, ombre en bas. */
function caisse(ctx, x, y, w, h, face = DECOR.bois, dessus = DECOR.boisClair) {
  rect(ctx, x, y, w, h, face);
  rect(ctx, x, y, w, 1, dessus);
  rect(ctx, x, y + h - 1, w, 1, '#26292e');
}

function trait2(ctx, x0, y0, x1, y1, c) {
  line(ctx, x0, y0, x1, y1, c);
  line(ctx, x0 + 1, y0, x1 + 1, y1, c);
}

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

/** Bulles / vapeur qui montent, réparties par une graine fixe. */
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
  const dy = Math.sin(t * 4.5) * 0.6;
  const E = epaule({ x: bx, sol: env.sol, pose: 'debout', sens: 1, dy });

  // Mains : la guitare se tient contre le corps, les deux mains restent
  // largement à portée (5 px et 7,6 px).
  const grattage = Math.sin(t * 9);
  const main = { x: E.x + 3, y: E.y + 4 + grattage * 1.2 };
  const manche = { x: E.x + 7, y: E.y - 3 };

  // Ampli et câble, derrière la mascotte.
  const ax = Math.round(l * 0.14), ay = env.sol - 16;
  caisse(ctx, ax, ay, 18, 16, '#3f434a', '#565b63');
  circle(ctx, ax + 9, ay + 9, 4, '#2a2d33');
  circle(ctx, ax + 9, ay + 9, 1, '#4a4e55');
  px(ctx, ax + 3, ay + 3, Math.sin(t * 6) > 0 ? DECOR.ambre : DECOR.ambreFonce);
  line(ctx, ax + 17, ay + 12, main.x - 3, main.y + 3, '#2e3137');

  dessinerMascotte(ctx, {
    x: bx, sol: env.sol, sens: 1, pose: 'debout',
    souffle: 1.4, dy, yeux: 'content',
    entre: (c) => caisseGuitare(c, main),
    bras: [main, manche],
  });

  // Manche par-dessus les bras, puis les mains redessinées dessus : c'est
  // l'ordre de la référence, où le manche noir passe entre les doigts.
  mancheGuitare(ctx, main, manche);

  // Notes : elles partent de la tête du manche.
  const tx = manche.x + 4, ty = manche.y - 7;
  for (let i = 0; i < 4; i++) {
    const p = ((t * 0.5 + i * 0.25) % 1);
    if (p < 0.9) dessinerNote(ctx, tx + 3 + p * 16, ty - 4 - p * 12 + Math.sin(p * 7 + i) * 2,
      p > 0.7 ? DECOR.ambreFonce : DECOR.ambre);
  }
}

/** Caisse : deux disques qui se recouvrent, sous la main qui gratte. */
function caisseGuitare(ctx, main) {
  const mx = Math.round(main.x), my = Math.round(main.y);
  ellipse(ctx, mx, my + 2, 5, 4, GRIS.encre);
  ellipse(ctx, mx + 1, my - 2, 4, 4, GRIS.encre);
  circle(ctx, mx, my, 1, GRIS.moyen);
}

/** Manche, tête et cordes : de la caisse à la main qui tient les frettes,
 *  puis la tête au-delà. Les deux mains sont reposées par-dessus. */
function mancheGuitare(ctx, main, manche) {
  const mx = Math.round(main.x), my = Math.round(main.y);
  const vx = manche.x - mx, vy = manche.y - my;
  const n = Math.max(1, Math.hypot(vx, vy));
  const tx = Math.round(manche.x + (vx / n) * 4), ty = Math.round(manche.y + (vy / n) * 4);
  trait2(ctx, mx + 1, my - 2, tx, ty, '#2f3238');
  line(ctx, mx + 2, my - 3, tx + 1, ty - 1, GRIS.profond);
  rect(ctx, tx, ty - 3, 4, 3, GRIS.base);
  px(ctx, tx, ty - 4, GRIS.encre);
  px(ctx, tx + 2, ty - 4, GRIS.encre);
  line(ctx, mx, my - 1, tx, ty, GRIS.clair);                       // cordes
  rect(ctx, Math.round(manche.x) - 1, Math.round(manche.y) - 1, 2, 2, GRIS.moyen);
  rect(ctx, mx - 1, my - 1, 2, 2, GRIS.clair);
}

/* ---------- 2. Clavier ---------- */

function clavier(env) {
  const { ctx, l, t } = env;
  mur(env);
  sol(env);

  const bx = Math.round(l * 0.18);
  const assiseY = env.sol - 10;                     // hauteur du tabouret
  const E = epaule({ x: bx, sol: assiseY, pose: 'assis', sens: 1 });

  // Le clavier vient sous les mains (3 et 7 px de l'épaule) ; le plateau du
  // bureau est calé dessus, et non l'inverse.
  const gauche = { x: E.x + 1, y: E.y + 1 };
  const droite = { x: E.x + 6, y: E.y + 1 };
  const kx = E.x - 1, ky = E.y + 2;
  const plateauY = ky + 2;
  const bux = kx - 3, buw = Math.min(50, l - bux - 4);

  const frappe = Math.sin(t * 14) > 0 ? 0 : 1;
  const frappe2 = Math.sin(t * 14 + 2.2) > 0 ? 0 : 1;

  dessinerMascotte(ctx, {
    x: bx, sol: assiseY, sens: 1, pose: 'assis',
    souffle: 0.8, yeux: 'mi',
    bras: [
      { x: gauche.x, y: gauche.y + frappe },
      { x: droite.x, y: droite.y + frappe2 },
    ],
  });

  // Tabouret : dessiné après, l'assise arrive juste sous le corps.
  caisse(ctx, bx - 1, assiseY, 20, 3, '#4e535a', '#666b73');
  rect(ctx, bx + 2, assiseY + 3, 2, env.sol - assiseY - 3, '#3f434a');
  rect(ctx, bx + 14, assiseY + 3, 2, env.sol - assiseY - 3, '#3f434a');

  // Bureau
  caisse(ctx, bux, plateauY, buw, 2, DECOR.bois, DECOR.boisClair);
  rect(ctx, bux + 1, plateauY + 2, 2, env.sol - plateauY - 2, '#494d54');
  rect(ctx, bux + buw - 3, plateauY + 2, 2, env.sol - plateauY - 2, '#494d54');

  // Clavier : les touches s'allument au rythme de la frappe.
  caisse(ctx, kx, ky, 13, 2, '#4d5259', '#666b73');
  for (let i = 0; i < 6; i++) {
    px(ctx, kx + 1 + i * 2, ky, (Math.floor(t * 7) % 6) === i ? GRIS.clair : '#6e737b');
  }

  // Écran, posé plus loin sur le bureau
  const ex = kx + 18, ey = plateauY - 19;
  rect(ctx, ex + 8, plateauY - 2, 4, 2, DECOR.metal);
  caisse(ctx, ex, ey, 20, 17, '#41454c', '#585d65');
  rect(ctx, ex + 2, ey + 2, 16, 13, '#1c2126');
  const rng = makeRng(99);
  const lignes = [];
  for (let i = 0; i < 24; i++) lignes.push({ indent: Math.floor(rng() * 3) * 2, w: 3 + Math.floor(rng() * 9) });
  const defile = Math.floor(t * 3) % lignes.length;
  for (let i = 0; i < 4; i++) {
    const ln = lignes[(defile + i) % lignes.length];
    rect(ctx, ex + 3 + ln.indent, ey + 4 + i * 3, ln.w, 1, i % 3 === 0 ? DECOR.ambreFonce : GRIS.moyen);
  }
  if (Math.sin(t * 6) > 0) rect(ctx, ex + 3, ey + 15, 2, 1, GRIS.clair);
  rect(ctx, ex + 1, plateauY - 1, 18, 1, '#3d434b');

  tasse(ctx, ex + 24, plateauY - 5, t, true);
}

/* ---------- 3. Magasinage ---------- */

function magasinage(env) {
  const { ctx, l, t } = env;
  mur(env, -6);
  const defile = (t * 14) % 48;
  for (let i = -1; i < Math.ceil(l / 48) + 1; i++) {
    rayon(ctx, Math.round(i * 48 - defile), env.sol - 34, i);
  }
  sol(env);

  const bx = Math.round(l * 0.4);
  const pas = t * 7;
  const dy = Math.abs(Math.sin(pas)) * -0.5;
  const E = epaule({ x: bx, sol: env.sol, pose: 'marche', sens: 1, dy });

  // La poignée du panier arrive dans la main (6,4 px de l'épaule) ; c'est le
  // panier qui est posé là, pas le bras qui va le chercher.
  const poignee = { x: E.x + 4, y: E.y - 5 };

  dessinerMascotte(ctx, {
    x: bx, sol: env.sol, sens: 1, pose: 'marche', pas,
    souffle: 1, yeux: 'ouvert', dy,
    bras: [poignee],
  });

  panier(ctx, poignee.x + 2, env.sol, t);
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

/** Panier accroché à la poignée : (px, py) est le point tenu par la main. */
function panier(ctx, px_, sol, t) {
  const x = Math.round(px_) + 1;
  const y = sol - 15;
  rect(ctx, x, y, 15, 9, '#585d65');
  rect(ctx, x + 1, y + 1, 13, 7, '#3a3d43');
  for (let i = 0; i < 3; i++) rect(ctx, x + 4 + i * 4, y + 1, 1, 7, '#585d65');
  rect(ctx, x + 1, y + 4, 13, 1, '#585d65');
  // Poignée : elle remonte jusqu'à la main.
  trait2(ctx, x - 3, y - 1, x - 1, y + 1, DECOR.metal);
  rect(ctx, x - 4, y - 2, 3, 1, DECOR.metalClair);
  circle(ctx, x + 3, sol - 2, 2, '#2c2f35');
  circle(ctx, x + 12, sol - 2, 2, '#2c2f35');
  px(ctx, x + 3, sol - 2, GRIS.fonce);
  px(ctx, x + 12, sol - 2, GRIS.fonce);
  rect(ctx, x + 3, y - 3, 3, 4, GRIS.moyen);
  rect(ctx, x + 8, y - 5, 4, 6, DECOR.ambreFonce);
  rect(ctx, x + 9, y - 6, 2, 1, GRIS.base);
  // Un article tombe dans le panier toutes les 3 s.
  const p = (t % 3) / 3;
  if (p < 0.45) rect(ctx, x + 5, Math.round(lerp(y - 28, y - 4, ease(p / 0.45))), 3, 3, GRIS.clair);
}

/* ---------- 4. Café ---------- */

function cafe(env) {
  const { ctx, l, t } = env;
  mur(env, 4);

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
  const E = epaule({ x: bx, sol: assiseY, pose: 'assis', sens: 1 });

  // Le guéridon est calé sur l'épaule : la tasse au repos est déjà à
  // portée (5,4 px), inutile de tendre le bras pour l'attraper.
  const repos = { x: E.x + 5, y: E.y };
  const bouche = { x: E.x + 3, y: E.y - 3 };
  const tableY = repos.y + 5;

  const cycle = (t % 4) / 4;
  const gorgee = cycle > 0.38 && cycle < 0.62;
  const monte = ease(clamp(cycle < 0.5 ? cycle / 0.35 : (0.85 - cycle) / 0.23, 0, 1));
  const tasseX = Math.round(lerp(repos.x, bouche.x, monte));
  const tasseY = Math.round(lerp(repos.y, bouche.y, monte));

  // Guéridon (derrière la tasse, devant le mur)
  caisse(ctx, repos.x - 2, tableY, 16, 2, DECOR.bois, DECOR.boisClair);
  rect(ctx, repos.x + 5, tableY + 2, 2, env.sol - tableY - 2, '#494d54');
  rect(ctx, repos.x + 2, env.sol - 1, 8, 1, '#3f434a');
  rect(ctx, repos.x + 8, tableY - 3, 6, 3, GRIS.base);
  rect(ctx, repos.x + 9, tableY - 4, 4, 1, DECOR.ambreFonce);

  dessinerMascotte(ctx, {
    x: bx, sol: assiseY, sens: 1, pose: 'assis',
    souffle: 1.2, yeux: gorgee ? 'ferme' : 'content',
    bras: [{ x: tasseX - 1, y: tasseY + 2 }],
  });

  // Tabouret : dessiné après, l'assise arrive juste sous le corps.
  caisse(ctx, bx - 1, assiseY, 20, 3, '#4e535a', '#666b73');
  rect(ctx, bx + 2, assiseY + 3, 2, env.sol - assiseY - 3, '#3f434a');
  rect(ctx, bx + 14, assiseY + 3, 2, env.sol - assiseY - 3, '#3f434a');

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
  const E = epaule({ x: bx, sol: env.sol, pose: 'debout', sens: 1 });

  // Toile format carnet, posée juste devant la mascotte : le coin le plus
  // éloigné reste à portée de pinceau (bras + 4 px de manche).
  // Toile posée à 6 px du corps : avec le bras (PORTEE) plus les 6 px de
  // manche du pinceau, chaque coin reste atteignable sans tendre l'épaule.
  const tx = E.x + 6, ty = E.y - 6, tw = 8, th = 11;

  line(ctx, tx + 1, env.sol, tx + 3, ty + 2, '#5a5f66');
  line(ctx, tx + 8, env.sol, tx + 6, ty + 2, '#5a5f66');
  line(ctx, tx + 4, env.sol, tx + 4, ty + th, '#4a4e55');
  caisse(ctx, tx, ty, tw, th, '#c2c6cc', '#d8dbe0');
  rect(ctx, tx - 1, ty + th, tw + 2, 2, '#5a5f66');

  const cycle = (t % 8) / 8;
  const avance = clamp(cycle / 0.82, 0, 1);
  const rng = makeRng(42);
  const coups = [];
  for (let i = 0; i < 60; i++) {
    coups.push({ x: 1 + Math.floor(rng() * (tw - 3)), y: 1 + Math.floor(rng() * (th - 2)), w: 1 + Math.floor(rng() * 3), c: rng() });
  }
  const n = Math.floor(avance * coups.length);
  for (let i = 0; i < n; i++) {
    const c = coups[i];
    rect(ctx, tx + 1 + c.x, ty + 1 + c.y, c.w, 1, c.c > 0.85 ? DECOR.ambreFonce : c.c > 0.5 ? GRIS.moyen : GRIS.fonce);
  }

  // Le pinceau fait 6 px de manche : la main s'arrête à 6 px du point peint,
  // ce qui met toute la toile à portée sans allonger le bras.
  const cible = coups[Math.min(n, coups.length - 1)];
  const bout = { x: tx + 1 + cible.x, y: ty + 1 + cible.y };
  const vx = bout.x - E.x, vy = bout.y - E.y;
  const d = Math.max(1, Math.hypot(vx, vy));
  const main = { x: bout.x - (vx / d) * 6, y: bout.y - (vy / d) * 6 };
  // Sécurité : si un coin sort de la portée, c'est la main qui s'arrête sur
  // le cercle de portée — le bras garde sa longueur.
  const dm = Math.hypot(main.x - E.x, main.y - E.y);
  if (dm > PORTEE) {
    main.x = E.x + ((main.x - E.x) / dm) * PORTEE;
    main.y = E.y + ((main.y - E.y) / dm) * PORTEE;
  }
  const palette = { x: E.x + 2, y: E.y + 5 };

  dessinerMascotte(ctx, {
    x: bx, sol: env.sol, sens: 1, pose: 'debout',
    souffle: 1, yeux: 'mi',
    bras: [main, palette],
  });

  trait2(ctx, main.x, main.y, bout.x - 1, bout.y, '#6d727a');
  px(ctx, bout.x, bout.y, GRIS.clair);
  ellipse(ctx, palette.x + 2, palette.y + 1, 4, 2, DECOR.bois);
  px(ctx, palette.x, palette.y, GRIS.clair);
  px(ctx, palette.x + 3, palette.y, DECOR.ambre);
  px(ctx, palette.x + 5, palette.y + 1, GRIS.fonce);
}

/* ---------- 6. Lecture ---------- */

function lecture(env) {
  const { ctx, l, t } = env;
  mur(env, -4);
  sol(env);

  const bx = Math.round(l * 0.44);
  const assiseY = env.sol - 8;
  const E = epaule({ x: bx, sol: assiseY, pose: 'assis', sens: 1 });

  // Lampe sur pied
  const lx = Math.round(l * 0.18);
  rect(ctx, lx - 4, env.sol - 1, 9, 1, '#3f434a');
  rect(ctx, lx, env.sol - 28, 1, 27, '#5a5f66');
  rect(ctx, lx - 5, env.sol - 34, 11, 6, '#4e535a');
  rect(ctx, lx - 4, env.sol - 29, 9, 1, DECOR.ambre);
  for (let j = 1; j < 16; j++) {
    const w = 6 + j;
    const seuil = 9 - Math.floor(j / 2.5);
    for (let i = 0; i < w; i++) {
      const gx = lx - Math.floor(w / 2) + i, gy = env.sol - 28 + j;
      if (BAYER[gy & 3][gx & 3] < seuil) px(ctx, gx, gy, '#4d4a3f');
    }
  }

  caisse(ctx, bx - 8, assiseY - 20, 7, 22, '#4a4e55', '#5c616a');   // dossier

  // Livre de poche : les deux mains tiennent les coins bas, à 4 et 7 px.
  const gauche = { x: E.x + 1, y: E.y + 4 };
  const droite = { x: E.x + 6, y: E.y + 4 };
  const page = (t % 5) / 5;
  const tourne = page > 0.88;

  dessinerMascotte(ctx, {
    x: bx, sol: assiseY, sens: 1, pose: 'assis',
    souffle: 1.1, yeux: 'mi',
    entre: (c) => livre(c, gauche.x + 1, gauche.y - 5, tourne),
    bras: [gauche, { x: droite.x, y: droite.y - (tourne ? 4 : 0) }],
  });

  caisse(ctx, bx - 8, assiseY, 26, 3, '#525760', '#666b73');
  rect(ctx, bx - 6, assiseY + 3, 3, env.sol - assiseY - 3, '#3a3d43');
  rect(ctx, bx + 13, assiseY + 3, 3, env.sol - assiseY - 3, '#3a3d43');
}

function livre(ctx, x, y, tourne) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y, 9, 8, '#3f434a');
  rect(ctx, x + 1, y + 1, 3, 6, '#d3d6db');
  rect(ctx, x + 5, y + 1, 3, 6, '#c3c7cd');
  rect(ctx, x + 4, y, 1, 8, '#2f3238');
  rect(ctx, x + 2, y + 2, 2, 1, GRIS.moyen);
  rect(ctx, x + 2, y + 4, 2, 1, GRIS.moyen);
  rect(ctx, x + 6, y + 2, 2, 1, GRIS.moyen);
  rect(ctx, x + 6, y + 4, 2, 1, GRIS.moyen);
  if (tourne) rect(ctx, x + 5, y, 2, 8, '#e6e8ec');
}

/* ---------- 7. Cuisine ---------- */

function cuisine(env) {
  const { ctx, l, t } = env;
  mur(env, 2);
  sol(env);

  const bx = Math.round(l * 0.24);
  const E = epaule({ x: bx, sol: env.sol, pose: 'debout', sens: 1 });

  // La poêle est tenue à 4 px de l'épaule ; le plan de travail et le feu
  // sont ensuite placés sous elle.
  const cycle = (t % 2.5) / 2.5;
  const saut = cycle < 0.5 ? Math.sin(cycle * Math.PI * 2) : 0;
  const main = { x: E.x + 4, y: E.y - 2 - Math.max(0, saut) * 2 };
  const planY = E.y + 1;
  const planX = main.x + 4;
  const planL = Math.min(46, l - planX - 4);

  caisse(ctx, planX, planY, planL, 3, '#5a5f66', '#767b83');
  rect(ctx, planX + 2, planY + 3, planL - 4, env.sol - planY - 3, '#3e424a');
  for (let i = 0; i * 12 + 10 < planL; i++) rect(ctx, planX + 4 + i * 12, planY + 7, 8, 1, '#585d65');

  const flamme = Math.sin(t * 12) > 0 ? 2 : 1;
  rect(ctx, planX + 3, planY - flamme, 4, flamme, DECOR.ambreFonce);

  // Étagère à bocaux, pour habiller le mur.
  const ey = planY - 24;
  rect(ctx, planX + 4, ey + 5, 26, 1, '#565b63');
  for (let i = 0; i < 4; i++) {
    const hh = 3 + (i % 3);
    rect(ctx, planX + 7 + i * 6, ey + 5 - hh, 4, hh, i === 1 ? DECOR.ambreFonce : GRIS.fonce);
    rect(ctx, planX + 7 + i * 6, ey + 4 - hh, 4, 1, GRIS.moyen);
  }

  const cx = planX + planL - 12;
  rect(ctx, cx, planY - 6, 10, 6, '#4a4e55');
  rect(ctx, cx - 1, planY - 7, 12, 1, '#6b7078');
  particules(ctx, cx + 5, planY - 8, 7, t, 0.5, 14, '#5d626a', 17);

  dessinerMascotte(ctx, {
    x: bx, sol: env.sol, sens: 1, pose: 'debout',
    souffle: 1.2, yeux: 'content',
    dy: Math.max(0, saut) * -1,
    bras: [main],
  });

  // Poêle : le manche part de la main, la poêle est juste au-dessus du feu.
  const py = Math.round(main.y);
  rect(ctx, Math.round(main.x), py + 1, 4, 1, '#5c616a');
  rect(ctx, Math.round(main.x) + 4, py, 12, 3, '#43474e');
  rect(ctx, Math.round(main.x) + 4, py, 12, 1, '#6b7078');
  const hSaut = cycle < 0.5 ? Math.sin(cycle * Math.PI * 2) * 14 : 0;
  ellipse(ctx, Math.round(main.x) + 10, py - 1 - hSaut, 4, hSaut > 4 ? 1 : 2, DECOR.ambreFonce);
}

/* ---------- 8. Planche à roulettes ---------- */

function skate(env) {
  const { ctx, l, h, t } = env;
  rect(ctx, 0, 0, l, h, '#2f333a');
  rect(ctx, 0, 0, l, Math.round(h * 0.45), '#383d45');
  circle(ctx, Math.round(l * 0.75), Math.round(h * 0.22), 6, '#585e67');

  plan(ctx, env, 40, 8, '#33373e', 26, 3);
  plan(ctx, env, 26, 18, '#2b2f35', 34, 11);
  sol(env, '#242730');
  const defile = (t * 34) % 12;
  for (let x = -12; x < l + 12; x += 12) rect(ctx, Math.round(x - defile), env.sol + 4, 6, 1, '#33373e');

  const bx = Math.round(l * 0.4);
  const cycle = (t % 3) / 3;
  const ollie = cycle < 0.25 ? Math.sin(cycle * 4 * Math.PI) : 0;
  const hauteur = Math.max(0, ollie) * 10;
  const solLocal = env.sol - hauteur;
  const E = epaule({ x: bx, sol: solLocal - 2, pose: 'debout', sens: 1 });

  dessinerMascotte(ctx, {
    x: bx, sol: solLocal - 2, sens: 1, pose: 'debout',
    souffle: 0.8, yeux: hauteur > 2 ? 'content' : 'ouvert', ombre: false,
    // Bras d'équilibre : deux cibles proches, aucun étirement.
    bras: [{ x: E.x + 6, y: E.y - 4 }, { x: E.x + 3, y: E.y + 4 }],
  });

  ellipse(ctx, bx + CORPS_L / 2, env.sol + 1, 9 - hauteur * 0.3, 1.5, 'rgba(10,12,16,0.4)');
  const px_ = bx - 2;
  rect(ctx, px_, solLocal - 1, 22, 2, '#4a4e55');
  rect(ctx, px_, solLocal - 2, 3, 1, '#5c616a');
  rect(ctx, px_ + 19, solLocal - 2, 3, 1, '#5c616a');
  circle(ctx, px_ + 4, solLocal + 2, 1, GRIS.fonce);
  circle(ctx, px_ + 17, solLocal + 2, 1, GRIS.fonce);
  for (let i = 0; i < 3; i++) {
    const p = (t * 2 + i * 0.33) % 1;
    rect(ctx, Math.round(bx - 8 - p * 26), solLocal - 6 - i * 4, Math.round(6 - p * 4), 1, '#4a4e55');
  }
}

function plan(ctx, env, hMax, hMin, couleur, largeur, graine) {
  const { l, t } = env;
  const defile = (t * graine * 1.4) % largeur;
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

  const bx = Math.round(l * 0.3);
  const dy = Math.sin(t * 2.2) * 0.5;
  const E = epaule({ x: bx, sol: env.sol, pose: 'debout', sens: 1, dy });

  const cycle = (t % 7) / 7;
  const arrose = cycle < 0.6;
  const incline = arrose ? 1 : 0;

  // Arrosoir tenu à 4 px de l'épaule ; le pot est placé sous le jet.
  const main = { x: E.x + 4, y: E.y };
  const bec = { x: main.x + 9, y: main.y - 2 - incline * 2 };
  const potX = Math.round(bec.x + 3), potY = env.sol - 9;

  caisse(ctx, potX, potY, 16, 9, '#5a5f66', '#767b83');
  rect(ctx, potX + 1, potY + 1, 14, 2, '#3a3d43');

  // La fleur pousse en 5 s, puis on recommence.
  const pousse = ease(clamp(cycle / 0.7, 0, 1));
  const tige = Math.round(pousse * 20);
  const fx = potX + 8;
  for (let j = 0; j < tige; j++) px(ctx, fx + Math.round(Math.sin(j * 0.4) * 1.5), potY - j, '#6f7a68');
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

  dessinerMascotte(ctx, {
    x: bx, sol: env.sol, sens: 1, pose: 'debout',
    souffle: 1.1, yeux: 'content', dy,
    bras: [main],
  });

  arrosoir(ctx, main.x, main.y, incline);
  if (arrose) {
    for (let i = 0; i < 8; i++) {
      const p = ((t * 1.6 + i * 0.12) % 1);
      const gx = Math.round(bec.x + 1 + p * 4);
      const gy = Math.round(bec.y + 2 + p * p * 22);
      if (gy < potY + 1) px(ctx, gx, gy, '#9fb0bd');
    }
  }
}

/** L'arrosoir est accroché à la main : (x, y) est le point tenu. */
function arrosoir(ctx, x, y, incline) {
  x = Math.round(x) - 1; y = Math.round(y) - 3 + incline;
  rect(ctx, x, y + 2, 9, 7, '#666b73');
  rect(ctx, x, y + 2, 9, 1, '#878c94');
  rect(ctx, x + 2, y, 4, 2, '#565b63');
  trait2(ctx, x + 9, y + 3 - incline, x + 12, y + 1 - incline * 2, '#666b73');
  rect(ctx, x + 11, y - incline * 2, 3, 2, '#878c94');
  line(ctx, x + 1, y + 2, x + 4, y - 1, '#565b63');
}

/* ---------- 10. Sieste ---------- */

function sieste(env) {
  const { ctx, l, t } = env;
  mur(env, -10);
  sol(env, '#232529');

  const bx = Math.round(l * 0.4);
  const litY = env.sol - 6;

  caisse(ctx, bx - 8, litY, 40, 4, '#4a4e55', '#5c616a');
  rect(ctx, bx - 8, litY + 4, 40, 2, '#35383e');
  rect(ctx, bx - 10, litY - 8, 3, 12, '#5c616a');
  rect(ctx, bx + 32, litY - 5, 3, 9, '#5c616a');
  rect(ctx, bx - 6, litY - 4, 10, 4, '#c9ccd2');

  dessinerMascotte(ctx, {
    x: bx, sol: litY, sens: 1, pose: 'couche',
    souffle: 2.2, yeux: 'ferme', dy: Math.sin(t * 1.2) * 0.8, ombre: false,
  });

  rect(ctx, bx + 2, litY - 7, 22, 7, '#585f68');
  rect(ctx, bx + 2, litY - 7, 22, 1, '#6c737d');

  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.4 + i * 0.33) % 1);
    drawText(ctx, 'Z', bx + 20 + Math.round(p * 14), Math.round(litY - 16 - p * 22),
      p > 0.7 ? '#4a4e55' : GRIS.moyen);
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
