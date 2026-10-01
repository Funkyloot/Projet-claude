/* ville-campagne.js — la campagne autour de Pistonville.
 *
 * Trois couronnes de pâtés tout autour de la ville : champs cultivés,
 * fermes, prés avec des vaches et des moutons, vergers, bois, étangs, hameaux,
 * stations-service et éoliennes. Mêmes règles qu'en ville : rien sur la
 * route, tout est solide sauf les cultures (on peut rouler dans un champ,
 * mais ça secoue).
 *
 * Chaque fonction prend la ville (pour ajouter obstacles et dessins), le coin
 * haut-gauche du pâté (o) et ses indices (bx, by). Tuiles : Kenney Tiny Farm
 * et Tiny Town (CC0).
 */

import { tuileTiny, CONTOUR, dessinerPerso, tenue } from './tiny.js';
import { hash2 } from './outils.js';
import { grange, silo, cloture, auventStation, batimentModerne, hauteurBatiment, maisonModerne, eolienne, fleurs } from './ville-dessins.js';
import { CASES_ILOT } from './ville-vie.js';

const T = 16;
const TAILLE = CASES_ILOT * T;   // 160 px

/** Cultures : tuile de la plante mûre et de la jeune pousse (Tiny Farm). */
const CULTURES = [
  { nom: 'blé', murs: [66, 67], terre: true },
  { nom: 'maïs', murs: [30, 31], terre: true },
  { nom: 'tournesols', murs: [83], terre: false },
  { nom: 'choux', murs: [54, 56], terre: true },
  { nom: 'carottes', murs: [6, 5], terre: true },
  { nom: 'tomates', murs: [42, 41], terre: true },
];

function herbe(v, o, teinte = '#84c669') {
  v.dessin(-1, (c) => {
    c.fillStyle = teinte; c.fillRect(o.x, o.y, TAILLE, TAILLE);
    for (let i = 0; i < 7; i++) {
      const x = o.x + 6 + hash2(o.x, i, 13) * (TAILLE - 22), y = o.y + 6 + hash2(o.y, i, 17) * (TAILLE - 22);
      tuileTiny(c, v.tiny, 'town', i % 3 === 0 ? 2 : 1, x, y);
    }
  });
}

/** Champ cultivé : sillons de terre et rangées de plantes, un épouvantail parfois. */
export function ilotChamp(v, o, bx, by) {
  herbe(v, o, '#7fbf62');
  const cult = CULTURES[Math.floor(hash2(bx, by, 41) * CULTURES.length)];
  v.dessin(0, (c) => {
    // Lisière d'herbe, puis 6 sillons horizontaux de 9 cases.
    for (let r = 0; r < 6; r++) {
      const y = o.y + 10 + r * 24;
      for (let i = 0; i < 9; i++) {
        const x = o.x + 8 + i * 16;
        if (cult.terre) tuileTiny(c, v.tiny, 'farm', i === 0 ? 48 : i === 8 ? 50 : 49, x, y);
      }
    }
  });
  for (let r = 0; r < 6; r++) {
    const y = o.y + 10 + r * 24;
    v.dessin(y + 16, (c) => {
      for (let i = 0; i < 9; i++) {
        const n = cult.murs[(i + r) % cult.murs.length];
        tuileTiny(c, v.tiny, 'farm', n, o.x + 8 + i * 16, y - 4);
      }
    });
  }
  v.champs.push({ x: o.x, y: o.y, w: TAILLE, h: TAILLE });
  if (hash2(bx, by, 43) < 0.35) {
    // Un épouvantail au milieu.
    const x = o.x + 80, y = o.y + 82;
    v.dessin(y, (c) => {
      c.fillStyle = CONTOUR; c.fillRect(x - 1, y - 22, 3, 22); c.fillRect(x - 10, y - 17, 21, 3);
      c.fillStyle = '#c98a55'; c.fillRect(x - 9, y - 16, 19, 1);
      dessinerPerso(c, { ...tenue(7), casque: '#d08a3e', haut: '#3fa34d' }, x, y - 6, 'face');
    });
  }
}

/** Ferme : grange, silo, ballots de paille, poules ; une porte où livrer. */
export function ilotFerme(v, o, bx, by) {
  herbe(v, o);
  v.dessin(0, (c) => {
    // Cour en terre battue devant la grange.
    c.fillStyle = '#eaa56c'; c.fillRect(o.x + 8, o.y + 108, 112, 44);
    c.fillStyle = '#d99158'; for (let i = 0; i < 8; i++) c.fillRect(o.x + 14 + hash2(bx, i, 3) * 100, o.y + 112 + hash2(by, i, 5) * 36, 4, 2);
  });
  const g = v.ajouter({ type: 'rect', x: o.x + 16, y: o.y + 28, w: 96, h: 80 });
  v.dessin(g.y + g.h, (c) => grange(c, g.x, g.y, g.w));
  v.ajouter({ type: 'rect', x: o.x + 126, y: o.y + 40, w: 26, h: 68 });
  v.dessin(o.y + 108, (c) => silo(c, o.x + 139, o.y + 108));
  for (const [dx, dy] of [[134, 126], [134, 144]]) {
    v.ajouter({ type: 'rect', x: o.x + dx - 8, y: o.y + dy - 12, w: 16, h: 12 });
    v.dessin(o.y + dy, (c) => tuileTiny(c, v.tiny, 'farm', 96, o.x + dx - 8, o.y + dy - 16));
  }
  v.arbre(o.x + 12, o.y + 20, 16);
  v.fermes.push({ x: o.x + 64, y: o.y + TAILLE + 8 });
  for (let i = 0; i < 4; i++) v.animaux.push({ x: o.x + 30 + i * 20, y: o.y + 126 + (i % 2) * 14, n: 122, phase: i * 1.7 });
  v.gens.push({ x: o.x + 100, y: o.y + 136, tenue: { ...tenue(bx + by), casque: '#d08a3e', haut: '#3fa34d' }, dir: 'face' });
}

/** Pré clôturé : vaches et moutons, un portail ouvert sur la route du bas. */
export function ilotPre(v, o, bx, by) {
  herbe(v, o, '#8fcf6f');
  const m = 6, l = TAILLE - 2 * m;
  const x0 = o.x + m, y0 = o.y + m + 8, y1 = o.y + TAILLE - m;
  // Clôtures (solides), portail de 40 px au milieu du bas.
  const porte = 40, demi = (l - porte) / 2;
  v.ajouter({ type: 'rect', x: x0, y: y0 - 4, w: l, h: 4 });
  v.ajouter({ type: 'rect', x: x0 - 2, y: y0, w: 4, h: y1 - y0 });
  v.ajouter({ type: 'rect', x: x0 + l - 2, y: y0, w: 4, h: y1 - y0 });
  v.ajouter({ type: 'rect', x: x0, y: y1 - 4, w: demi, h: 4 });
  v.ajouter({ type: 'rect', x: x0 + demi + porte, y: y1 - 4, w: demi, h: 4 });
  v.dessin(y0, (c) => cloture(c, x0, y0, l));
  v.dessin(y1 - 1, (c) => { cloture(c, x0, y0, y1 - y0, true); cloture(c, x0 + l, y0, y1 - y0, true); });
  v.dessin(y1, (c) => { cloture(c, x0, y1, demi); cloture(c, x0 + demi + porte, y1, demi); });
  // Abreuvoir.
  v.ajouter({ type: 'rect', x: o.x + 24, y: o.y + 40, w: 32, h: 12 });
  v.dessin(o.y + 52, (c) => { tuileTiny(c, v.tiny, 'farm', 110, o.x + 24, o.y + 38); tuileTiny(c, v.tiny, 'farm', 111, o.x + 40, o.y + 38); });
  const vaches = hash2(bx, by, 61) < 0.5;
  for (let i = 0; i < 6; i++) {
    const x = o.x + 30 + hash2(bx * 7 + i, by, 63) * 100, y = o.y + 64 + hash2(bx, by * 5 + i, 67) * 70;
    v.animaux.push({ x, y, n: vaches ? (i % 3 ? 121 : 120) : (i % 3 ? 120 : 121), phase: i * 2.3, solide: true });
    v.ajouter({ type: 'cercle', x, y: y - 4, r: 6 });
  }
}

/** Verger : trois rangées de pommiers et d'orangers. */
export function ilotVerger(v, o, bx, by) {
  herbe(v, o, '#86c86a');
  for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
    const x = o.x + 22 + i * 38 + (r % 2) * 10, y = o.y + 30 + r * 36;
    if (hash2(bx * 9 + i, by * 9 + r, 71) < 0.12) continue;
    v.ajouter({ type: 'cercle', x, y: y - 4, r: 6 });
    const pomme = hash2(bx, r, 73) < 0.6;
    v.dessin(y, (c) => {
      c.fillStyle = 'rgba(38,24,46,0.22)'; c.fillRect(x - 6, y - 2, 12, 3);
      if (pomme) tuileTiny(c, v.tiny, 'farm', 78, x - 8, y - 15); else tuileTiny(c, v.tiny, 'town', 15, x - 8, y - 15);
    });
  }
  v.dessin(o.y + 150, (c) => { tuileTiny(c, v.tiny, 'farm', 75, o.x + 136, o.y + 136); tuileTiny(c, v.tiny, 'farm', 74, o.x + 118, o.y + 138); });
}

/** Bois : des sapins serrés, quelques arbres d'automne et des champignons. */
export function ilotBois(v, o, bx, by) {
  herbe(v, o, '#5fa65a');
  const essences = [4, 16, 28, 4, 16, 28, 3, 27];
  for (let r = 0; r < 7; r++) for (let i = 0; i < 7; i++) {
    const h = hash2(bx * 13 + i, by * 13 + r, 81);
    if (h < 0.18) continue;
    const x = o.x + 12 + i * 22 + (h - 0.5) * 10, y = o.y + 20 + r * 21 + hash2(i, r, bx + by) * 6;
    v.arbre(x, y, essences[Math.floor(h * essences.length)]);
  }
  v.dessin(o.y + 2, (c) => {
    for (let i = 0; i < 3; i++) tuileTiny(c, v.tiny, 'town', 29, o.x + 20 + hash2(bx, i, 83) * 110, o.y + 20 + hash2(by, i, 85) * 110);
  });
}

/** Étang : l'eau occupe le pâté et son bord ; les routes qui le traversent sont des ponts. */
export function ilotEtang(v, o, bx, by) {
  const x = o.x - T, y = o.y - T, w = TAILLE + 2 * T, h = TAILLE + 2 * T;
  v.ajouter({ type: 'rect', x, y, w, h, eau: true });
  v.dessin(-2, (c) => {
    c.fillStyle = '#75e3ff'; c.fillRect(x, y, w, h);
    c.fillStyle = '#5fd0f0';
    for (let i = 0; i < 10; i++) c.fillRect(x + 10 + hash2(bx, i, 91) * (w - 30), y + 10 + hash2(by, i, 93) * (h - 20), 10, 2);
    c.fillStyle = '#d9f7ff';
    for (let i = 0; i < 8; i++) c.fillRect(x + 14 + hash2(bx + 3, i, 95) * (w - 30), y + 14 + hash2(by + 5, i, 97) * (h - 24), 6, 1);
    // Nénuphars.
    for (let i = 0; i < 4; i++) {
      const nx = x + 20 + hash2(bx, i, 99) * (w - 40), ny = y + 20 + hash2(by, i, 101) * (h - 40);
      c.fillStyle = CONTOUR; c.fillRect(nx - 5, ny - 3, 10, 7);
      c.fillStyle = '#3fa34d'; c.fillRect(nx - 4, ny - 2, 8, 5);
      if (i % 2) { c.fillStyle = '#e86ca6'; c.fillRect(nx - 1, ny - 1, 2, 2); }
    }
  });
  v.eaux.push({ bx, by });
  if (hash2(bx, by, 103) < 0.4) v.canards.push({ x: o.x + 40 + hash2(bx, by, 105) * 80, y: o.y + 50 + hash2(by, bx, 107) * 60, phase: bx + by });
}

/** Hameau : deux maisons de campagne, potager, clôture basse. */
export function ilotHameau(v, o, bx, by) {
  herbe(v, o);
  for (let i = 0; i < 2; i++) {
    const r = hash2(bx * 3 + i, by, 111);
    const toit = ['#c2504d', '#8a5a3b', '#d08a3e', '#6a7690'][Math.floor(r * 4)];
    const facade = ['#f4e6c8', '#f2d7c4', '#e9e2cf'][Math.floor(hash2(i, by, 113) * 3)];
    const x = o.x + 8 + i * 80, y = o.y + TAILLE - 6 - 64;
    const m = v.ajouter({ type: 'rect', x, y, w: 64, h: 64 });
    v.dessin(m.y + m.h, (c) => maisonModerne(c, m.x, m.y, m.w, toit, facade));
    v.maisons.push({ x: x + 32, y: o.y + TAILLE + 8 });
  }
  v.dessin(o.y + 40, (c) => {
    // Potager.
    for (let i = 0; i < 5; i++) tuileTiny(c, v.tiny, 'farm', i % 2 ? 53 : 17, o.x + 20 + i * 16, o.y + 20);
    fleurs(c, o.x + 110, o.y + 18, bx);
  });
  v.dessin(o.y + 36, (c) => cloture(c, o.x + 12, o.y + 36, 96));
  v.ajouter({ type: 'rect', x: o.x + 12, y: o.y + 32, w: 96, h: 4 });
  v.arbre(o.x + 140, o.y + 34, 15);
  v.gens.push({ x: o.x + 60, y: o.y + 52, tenue: tenue(bx * 5 + by), dir: 'face' });
}

/** Station-service : auvent, pompes, petite boutique. */
export function ilotStation(v, o, bx, by) {
  herbe(v, o);
  v.dessin(-1, (c) => {
    c.fillStyle = '#9aa1b5'; c.fillRect(o.x, o.y + 70, TAILLE, TAILLE - 70);
    c.fillStyle = '#e8e4d6'; for (let i = 0; i < 4; i++) c.fillRect(o.x + 12 + i * 40, o.y + 150, 20, 2);
  });
  const h = hauteurBatiment(1);
  const b = v.ajouter({ type: 'rect', x: o.x + 8, y: o.y + 6, w: 72, h });
  v.dessin(b.y + b.h, (c) => batimentModerne(c, b.x, b.y, b.w, 1, { facade: '#f4f6fb', toit: '#e4432d', vitrine: '#cfe8ff', enseigne: '#e4432d', nom: 'STATION' }));
  // Auvent : seuls les piliers et les pompes sont solides, on passe dessous.
  const ax = o.x + 88, ay = o.y + 40, aw = 64;
  for (const px of [ax + 12, ax + aw - 12]) v.ajouter({ type: 'cercle', x: px, y: ay + 52, r: 4 });
  for (const px of [ax + aw / 2 - 16, ax + aw / 2 + 16]) v.ajouter({ type: 'rect', x: px - 6, y: ay + 44, w: 12, h: 10 });
  v.dessin(ay + 56, (c) => auventStation(c, ax, ay, aw));
  v.dessin(o.y + 60, (c) => {
    // Totem des prix.
    c.fillStyle = CONTOUR; c.fillRect(o.x + 140, o.y + 4, 16, 30); c.fillRect(o.x + 147, o.y + 34, 3, 20);
    c.fillStyle = '#e4432d'; c.fillRect(o.x + 141, o.y + 5, 14, 8);
    c.fillStyle = '#f4f6fb'; c.fillRect(o.x + 141, o.y + 14, 14, 19);
    c.fillStyle = CONTOUR; c.fillRect(o.x + 143, o.y + 17, 10, 2); c.fillRect(o.x + 143, o.y + 23, 10, 2); c.fillRect(o.x + 143, o.y + 29, 7, 2);
  });
  v.ajouter({ type: 'rect', x: o.x + 140, y: o.y + 34, w: 16, h: 20 });
}

/** Parc éolien : deux grandes éoliennes dans un pré (les pales tournent). */
export function ilotEoliennes(v, o, bx, by) {
  herbe(v, o, '#8fcf6f');
  for (const [dx, dy] of [[48, 130], [118, 70]]) {
    const x = o.x + dx, y = o.y + dy;
    v.ajouter({ type: 'cercle', x, y: y - 3, r: 5 });
    v.dessin(y, (c) => eolienne(c, x, y));
    v.eoliennes.push({ x, y: y - 98, phase: hash2(bx, dy, by) * 6 });
  }
  for (let i = 0; i < 4; i++) v.dessin(o.y + 10, (c) => tuileTiny(c, v.tiny, 'farm', 64, o.x + 10 + hash2(bx, i, 121) * 130, o.y + 8 + hash2(by, i, 123) * 140));
}
