/* ville-campagne.js — la campagne autour de Pistonville.
 *
 * Comme sur une vraie carte, la campagne est faite de grandes parcelles
 * d'un seul tenant le long de quelques routes : champs découpés en
 * pièces de culture, fermes avec leurs bâtiments et leurs prés, un village
 * avec son église et sa place, des vergers, des prés à vaches et à moutons,
 * un parc éolien, un étang au milieu des arbres, une station-service au bord
 * de la nationale, et la forêt tout autour de la carte.
 *
 * Mêmes règles qu'en ville : rien sur la route, tout est solide sauf les
 * cultures et l'herbe (on peut rouler dans un champ, mais ça secoue).
 *
 * remplirParcelle(ville, parcelle, type, reseau) : la parcelle est un groupe
 * de pâtés (voir reseau.js) ; r est son rectangle, bords compris, et i son
 * intérieur (une case de marge). Tuiles : Kenney Tiny Farm et Tiny Town (CC0).
 */

import { tuileTiny, CONTOUR, dessinerPerso, tenue } from './tiny.js';
import { hash2, creerAlea } from './outils.js';
import {
  grange, silo, cloture, tracteur, auventStation, batimentModerne, hauteurBatiment, maisonModerne, eolienne, fleurs, banc, eglise,
} from './ville-dessins.js';

const T = 16;
export const CAMPAGNE = 'BFCPVHWES';
/** Couleur du sol de chaque type de parcelle (sous les dessins). */
export const COULEURS_SOL = { B: '#5fa65a', F: '#84c669', C: '#7fbf62', P: '#8fcf6f', V: '#86c86a', H: '#84c669', W: '#8fcf6f', E: '#7fc464', S: '#84c669' };

/** Cultures (Tiny Farm) : plantes mûres, et si on voit les sillons de terre. */
const CULTURES = [
  { nom: 'blé', tuiles: [66, 67], terre: true },
  { nom: 'maïs', tuiles: [30, 31], terre: true },
  { nom: 'tournesols', tuiles: [83], terre: false },
  { nom: 'choux', tuiles: [54, 56], terre: true },
  { nom: 'carottes', tuiles: [6, 5], terre: true },
  { nom: 'tomates', tuiles: [42, 41], terre: true },
  { nom: 'jachère', tuiles: [64, 65], terre: false },
];

export function remplirParcelle(v, p, type, reseau) {
  const r = reseau.rectParcelle(p);
  const i = { x: r.x + T, y: r.y + T, w: r.w - 2 * T, h: r.h - 2 * T };
  const cotes = { haut: reseau.coteParcelle(p, 'haut'), bas: reseau.coteParcelle(p, 'bas'), gauche: reseau.coteParcelle(p, 'gauche'), droite: reseau.coteParcelle(p, 'droite') };
  const g = p.x0 * 31 + p.y0 * 17;
  sol(v, p, reseau, COULEURS_SOL[type]);
  ({ B: foret, F: ferme, C: champs, P: pres, V: vergers, H: village, W: eoliennes, E: etang, S: station })[type](v, i, cotes, g, p, reseau);
}

/** Le sol de la parcelle, case par case (elle n'est pas toujours rectangulaire), et un peu d'herbe haute. */
function sol(v, p, reseau, couleur) {
  for (const [bx, by] of p.blocs) {
    const c = reseau.cellule(bx, by);
    // La cellule, plus les bandes de route absentes à droite et en bas (si elles appartiennent à la parcelle).
    const w = c.w + (bx + 1 < reseau.N && reseau.parcelleDe[by][bx + 1] === p ? reseau.L[bx + 1] : 0);
    const h = c.h + (by + 1 < reseau.N && reseau.parcelleDe[by + 1][bx] === p ? reseau.L[by + 1] : 0);
    const coin = bx + 1 < reseau.N && by + 1 < reseau.N && reseau.parcelleDe[by + 1][bx + 1] === p && !reseau.carrefour(bx + 1, by + 1);
    v.dessin(-3, (ctx) => {
      ctx.fillStyle = couleur;
      ctx.fillRect(c.x, c.y, w, c.h); ctx.fillRect(c.x, c.y, c.w, h);
      if (coin) ctx.fillRect(c.x, c.y, w, h);
      for (let k = 0; k < 6; k++) tuileTiny(ctx, v.tiny, 'town', k % 3 === 0 ? 2 : 1, c.x + 8 + hash2(bx, k, by) * (c.w - 24), c.y + 8 + hash2(k, by, bx) * (c.h - 24));
    }, { x0: c.x, y0: c.y, x1: c.x + w, y1: c.y + h });
  }
}

/** Arbre posé directement (avec sa propre boîte de dessin : la forêt en compte des milliers). */
function arbre(v, x, y, n) {
  v.ajouter({ type: 'cercle', x, y: y - 4, r: 6 });
  v.dessin(y, (c) => {
    c.fillStyle = 'rgba(38,24,46,0.22)'; c.fillRect(x - 6, y - 2, 12, 3);
    tuileTiny(c, v.tiny, 'town', n, x - 8, y - 15);
  }, { x0: x - 10, y0: y - 18, x1: x + 10, y1: y + 4 });
}

const surTerre = (reseau, p, x, y) => {
  const k = reseau.classer(Math.floor(x / T), Math.floor(y / T));
  return k && k.type === 'terre' && reseau.parcelleDe[k.by]?.[k.bx] === p;
};

// --- Forêt ------------------------------------------------------------------------------------

function foret(v, i, cotes, g, p, reseau) {
  const essences = [4, 16, 28, 4, 16, 28, 3, 27, 15];
  const a = creerAlea(g + 5);
  const r = reseau.rectParcelle(p);
  for (let y = r.y + 14; y < r.y + r.h; y += 20) {
    for (let x = r.x + 10; x < r.x + r.w; x += 22) {
      const h = a();
      if (h < 0.16) continue;
      const tx = x + (a() - 0.5) * 10, ty = y + (a() - 0.5) * 6;
      // Pas trop près des routes : on garde une case d'herbe le long du bas-côté.
      if (!surTerre(reseau, p, tx, ty) || !surTerre(reseau, p, tx, ty + 14) || !surTerre(reseau, p, tx - 10, ty) || !surTerre(reseau, p, tx + 10, ty)) continue;
      arbre(v, tx, ty, essences[Math.floor(h * essences.length)]);
    }
  }
}

// --- Champs -------------------------------------------------------------------------------------

/** Un champ de culture dans le rectangle z : sillons et rangées de plantes, un épouvantail parfois. */
function piece(v, z, culture, graine) {
  const rangs = Math.floor((z.h - 8) / 24), cols = Math.floor(z.w / 16);
  const x0 = z.x + Math.floor((z.w - cols * 16) / 2);
  v.dessin(-1, (c) => {
    c.fillStyle = culture.terre ? '#d99a62' : '#8cc96c';
    c.fillRect(z.x, z.y, z.w, z.h);
    if (!culture.terre) return;
    for (let r = 0; r < rangs; r++) {
      const y = z.y + 6 + r * 24;
      for (let k = 0; k < cols; k++) tuileTiny(c, v.tiny, 'farm', k === 0 ? 48 : k === cols - 1 ? 50 : 49, x0 + k * 16, y);
    }
  });
  for (let r = 0; r < rangs; r++) {
    const y = z.y + 6 + r * 24;
    v.dessin(y + 16, (c) => {
      for (let k = 0; k < cols; k++) tuileTiny(c, v.tiny, 'farm', culture.tuiles[(k + r) % culture.tuiles.length], x0 + k * 16, y - 4);
    });
  }
  v.champs.push(z);
  if (hash2(graine, z.x, 43) < 0.3 && z.w > 96 && z.h > 96) {
    const x = z.x + z.w / 2, y = z.y + z.h / 2 + 10;
    v.dessin(y, (c) => {
      c.fillStyle = CONTOUR; c.fillRect(x - 1, y - 22, 3, 22); c.fillRect(x - 10, y - 17, 21, 3);
      c.fillStyle = '#c98a55'; c.fillRect(x - 9, y - 16, 19, 1);
      dessinerPerso(c, { ...tenue(7), casque: '#d08a3e', haut: '#3fa34d' }, x, y - 6, 'face');
    });
  }
}

/** Découpe un rectangle en pièces de culture séparées par des chemins de terre. */
function champs(v, i, cotes, g) {
  const largeur = 176, hauteur = 152, chemin = 16;
  const nx = Math.max(1, Math.round((i.w + chemin) / (largeur + chemin)));
  const ny = Math.max(1, Math.round((i.h + chemin) / (hauteur + chemin)));
  const w = (i.w - (nx - 1) * chemin) / nx, h = (i.h - (ny - 1) * chemin) / ny;
  v.dessin(-2, (c) => { c.fillStyle = '#e3b37e'; c.fillRect(i.x, i.y, i.w, i.h); });
  for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
    const z = { x: Math.round(i.x + a * (w + chemin)), y: Math.round(i.y + b * (h + chemin)), w: Math.floor(w), h: Math.floor(h) };
    const culture = CULTURES[Math.floor(hash2(g + a, b, 41) * CULTURES.length)];
    piece(v, z, culture, g + a * 7 + b);
  }
  // Un tracteur garé au bout d'un chemin.
  if (nx > 1) {
    const x = i.x + w + chemin / 2, y = i.y + 30;
    v.ajouter({ type: 'rect', x: x - 11, y: y - 18, w: 22, h: 36 });
    v.dessin(y + 18, (c) => tracteur(c, x, y, Math.PI / 2));
  }
}

// --- Ferme -------------------------------------------------------------------------------------

/**
 * La ferme : maison, grange, silo, cour, poules, du côté de la route ; le reste
 * en champs et en pré.
 */
function ferme(v, i, cotes, g, p, reseau) {
  const bas = cotes.bas || !cotes.haut;
  const hauteurCour = 200;
  const cour = { x: i.x, y: bas ? i.y + i.h - hauteurCour : i.y, w: Math.min(i.w, 336), h: hauteurCour };
  v.dessin(-1, (c) => {
    c.fillStyle = '#eaa56c'; c.fillRect(cour.x + 8, cour.y + 112, cour.w - 16, 80);
    c.fillStyle = '#d99158'; for (let k = 0; k < 16; k++) c.fillRect(cour.x + 14 + hash2(g, k, 3) * (cour.w - 30), cour.y + 118 + hash2(k, g, 5) * 66, 4, 2);
  });
  // Maison de la ferme, grange, silo, ballots.
  const m = v.ajouter({ type: 'rect', x: cour.x + 12, y: cour.y + 44, w: 72, h: 64 });
  v.dessin(m.y + m.h, (c) => maisonModerne(c, m.x, m.y, m.w, '#c2504d', '#f4e6c8'));
  const gr = v.ajouter({ type: 'rect', x: cour.x + 104, y: cour.y + 28, w: 112, h: 80 });
  v.dessin(gr.y + gr.h, (c) => grange(c, gr.x, gr.y, gr.w));
  v.ajouter({ type: 'rect', x: cour.x + 230, y: cour.y + 40, w: 26, h: 68 });
  v.dessin(cour.y + 108, (c) => silo(c, cour.x + 243, cour.y + 108));
  for (const [dx, dy] of [[280, 130], [298, 130], [280, 150]]) {
    v.ajouter({ type: 'rect', x: cour.x + dx - 8, y: cour.y + dy - 12, w: 16, h: 12 });
    v.dessin(cour.y + dy, (c) => tuileTiny(c, v.tiny, 'farm', 96, cour.x + dx - 8, cour.y + dy - 16));
  }
  v.dessin(cour.y + 160, (c) => tracteur(c, cour.x + 170, cour.y + 150, 0));
  v.ajouter({ type: 'rect', x: cour.x + 152, y: cour.y + 139, w: 36, h: 22 });
  for (let k = 0; k < 5; k++) v.animaux.push({ x: cour.x + 30 + k * 18, y: cour.y + 150 + (k % 2) * 14, n: 122, phase: k * 1.7 });
  v.gens.push({ x: cour.x + 120, y: cour.y + 170, tenue: { ...tenue(g), casque: '#d08a3e', haut: '#3fa34d' }, dir: 'face' });
  // On livre devant la maison, sur le bas-côté.
  v.fermes.push({ x: cour.x + 48, y: bas ? i.y + i.h + 8 : i.y - 8 });
  // Le reste : un pré à côté de la cour, des champs derrière.
  const reste = { x: i.x, y: bas ? i.y : i.y + hauteurCour + 16, w: i.w, h: i.h - hauteurCour - 16 };
  if (i.w - cour.w > 120) pre(v, { x: cour.x + cour.w + 16, y: cour.y + 8, w: i.w - cour.w - 16, h: hauteurCour - 8 }, g + 3, bas ? 'bas' : 'haut');
  if (reste.h > 100) champs(v, reste, cotes, g + 11);
}

// --- Prés --------------------------------------------------------------------------------------

/** Un pré clôturé (solide) avec un portail du côté de la route, des bêtes et un abreuvoir. */
function pre(v, z, g, cotePortail = 'bas', moutons = null) {
  const x0 = z.x + 4, y0 = z.y + 12, x1 = z.x + z.w - 4, y1 = z.y + z.h - 4;
  const l = x1 - x0, porte = 40, demi = (l - porte) / 2;
  v.ajouter({ type: 'rect', x: x0 - 2, y: y0, w: 4, h: y1 - y0 });
  v.ajouter({ type: 'rect', x: x1 - 2, y: y0, w: 4, h: y1 - y0 });
  for (const [y, ouvert] of [[y0, cotePortail === 'haut'], [y1, cotePortail === 'bas']]) {
    if (ouvert) {
      v.ajouter({ type: 'rect', x: x0, y: y - 4, w: demi, h: 4 });
      v.ajouter({ type: 'rect', x: x0 + demi + porte, y: y - 4, w: demi, h: 4 });
      v.dessin(y, (c) => { cloture(c, x0, y, demi); cloture(c, x0 + demi + porte, y, demi); });
    } else {
      v.ajouter({ type: 'rect', x: x0, y: y - 4, w: l, h: 4 });
      v.dessin(y, (c) => cloture(c, x0, y, l));
    }
  }
  v.dessin(y1 - 1, (c) => { cloture(c, x0, y0, y1 - y0, true); cloture(c, x1, y0, y1 - y0, true); });
  v.ajouter({ type: 'rect', x: x0 + 18, y: y0 + 26, w: 32, h: 12 });
  v.dessin(y0 + 38, (c) => { tuileTiny(c, v.tiny, 'farm', 110, x0 + 18, y0 + 24); tuileTiny(c, v.tiny, 'farm', 111, x0 + 34, y0 + 24); });
  const vaches = moutons === null ? hash2(g, 1, 61) < 0.5 : !moutons;
  const n = Math.max(3, Math.round((l * (y1 - y0)) / 7000));
  for (let k = 0; k < n; k++) {
    const x = x0 + 24 + hash2(g * 7 + k, 3, 63) * (l - 48), y = y0 + 52 + hash2(g, k * 5, 67) * (y1 - y0 - 70);
    v.animaux.push({ x, y, n: vaches ? (k % 3 ? 121 : 120) : (k % 4 ? 120 : 121), phase: k * 2.3 });
    v.ajouter({ type: 'cercle', x, y: y - 4, r: 6 });
  }
}

function pres(v, i, cotes, g) {
  // Deux ou trois prés côte à côte (ou l'un au-dessus de l'autre), portail côté route.
  const vertical = i.h > i.w;
  const n = Math.max(1, Math.round((vertical ? i.h : i.w) / 230));
  for (let k = 0; k < n; k++) {
    const z = vertical
      ? { x: i.x, y: i.y + (k * i.h) / n, w: i.w, h: i.h / n - 12 }
      : { x: i.x + (k * i.w) / n, y: i.y, w: i.w / n - 12, h: i.h };
    pre(v, z, g + k * 13, cotes.bas ? 'bas' : 'haut', k % 2 === 1);
  }
  // Un abri de bois au coin.
  const ax = i.x + i.w - 60, ay = i.y + 40;
  v.ajouter({ type: 'rect', x: ax, y: ay - 26, w: 40, h: 26 });
  v.dessin(ay, (c) => {
    c.fillStyle = CONTOUR; c.fillRect(ax, ay - 30, 40, 30);
    c.fillStyle = '#8a5a3b'; c.fillRect(ax + 1, ay - 29, 38, 10);
    c.fillStyle = '#c98a55'; c.fillRect(ax + 1, ay - 19, 38, 18);
    c.fillStyle = '#2a2838'; c.fillRect(ax + 12, ay - 15, 16, 14);
  });
}

// --- Vergers -----------------------------------------------------------------------------------

function vergers(v, i, cotes, g) {
  for (let y = i.y + 30; y < i.y + i.h - 6; y += 36) {
    for (let x = i.x + 20; x < i.x + i.w - 14; x += 38) {
      const dx = ((y - i.y) / 36) % 2 ? 10 : 0;
      if (hash2(x, y, g) < 0.08) continue;
      const pomme = hash2(Math.floor((x - i.x) / 152), Math.floor((y - i.y) / 144), g) < 0.6;
      v.ajouter({ type: 'cercle', x: x + dx, y: y - 4, r: 6 });
      v.dessin(y, (c) => {
        c.fillStyle = 'rgba(38,24,46,0.22)'; c.fillRect(x + dx - 6, y - 2, 12, 3);
        if (pomme) tuileTiny(c, v.tiny, 'farm', 78, x + dx - 8, y - 15); else tuileTiny(c, v.tiny, 'town', 15, x + dx - 8, y - 15);
      });
    }
  }
  // Ruches et caisses de fruits au bord.
  v.dessin(i.y + i.h, (c) => {
    for (let k = 0; k < 3; k++) tuileTiny(c, v.tiny, 'town', 94, i.x + 6 + k * 18, i.y + i.h - 18);
    tuileTiny(c, v.tiny, 'farm', 75, i.x + i.w - 40, i.y + i.h - 18); tuileTiny(c, v.tiny, 'farm', 74, i.x + i.w - 22, i.y + i.h - 18);
  });
}

// --- Village -------------------------------------------------------------------------------------

/**
 * Le village : des rangées de maisons avec leur jardin, séparées par des
 * ruelles de gravier (on peut y passer) ; la première rangée donne sur la
 * route du bas. Au milieu, la place pavée avec l'église, la fontaine et le marché.
 */
function village(v, i, cotes, g) {
  const toits = ['#c2504d', '#8a5a3b', '#d08a3e', '#6a7690', '#4f7ddb'];
  const facades = ['#f4e6c8', '#f2d7c4', '#e9e2cf', '#e6ebf2'];
  const place = { x: Math.round(i.x + i.w / 2 - 128), y: i.y + 40, w: 256, h: i.h - 40 };
  // Ruelles : une tous les 128 px, et la place qui descend jusqu'à la route.
  v.dessin(-1, (c) => {
    c.fillStyle = '#e3cfa0';
    for (let y = i.y + i.h - 128 - 24; y > i.y + 60; y -= 128) c.fillRect(i.x, y, i.w, 20);
    c.fillStyle = '#c9c1ad'; c.fillRect(place.x, place.y, place.w, place.h + T);
    c.fillStyle = '#b6ad97';
    for (let y = place.y; y < place.y + place.h; y += 8) for (let x = place.x + ((y / 8) % 2) * 4; x < place.x + place.w; x += 8) c.fillRect(x, y, 1, 1);
  });
  let k = 0;
  for (let rang = 0, yb = i.y + i.h - 72; yb > i.y + 40; rang++, yb -= 128) {
    for (let x = i.x + 10; x + 64 <= i.x + i.w - 6; x += 88) {
      if (x + 64 > place.x - 6 && x < place.x + place.w + 6) continue;
      k++;
      const toit = toits[Math.floor(hash2(g, k, 1) * toits.length)], facade = facades[Math.floor(hash2(k, g, 2) * facades.length)];
      const m = v.ajouter({ type: 'rect', x, y: yb, w: 64, h: 64 });
      v.dessin(m.y + m.h, (c) => maisonModerne(c, m.x, m.y, m.w, toit, facade));
      if (rang === 0) v.maisons.push({ x: x + 32, y: i.y + i.h + 8 });
      // Jardin derrière : potager ou arbre fruitier, et une haie basse.
      if (hash2(k, rang, g) < 0.5) v.dessin(yb - 30, (c) => { for (let n = 0; n < 4; n++) tuileTiny(c, v.tiny, 'farm', n % 2 ? 53 : 17, x + n * 16, yb - 32); });
      else arbre(v, x + 50, yb - 12, 15);
      v.dessin(yb - 4, (c) => fleurs(c, x + 4, yb - 16, k));
    }
  }
  // La place : église au fond, fontaine, étals, bancs.
  const e = v.ajouter({ type: 'rect', x: place.x + 16, y: place.y + 8, w: 96, h: 112 });
  v.dessin(e.y + e.h, (c) => eglise(c, e.x, e.y));
  const fx = place.x + place.w / 2 + 30, fy = place.y + place.h / 2 + 20;
  v.ajouter({ type: 'cercle', x: fx, y: fy - 6, r: 14 });
  v.dessin(fy + 8, (c) => {
    c.fillStyle = CONTOUR; c.fillRect(fx - 15, fy - 14, 30, 22);
    c.fillStyle = '#c0cbdc'; c.fillRect(fx - 14, fy - 13, 28, 20);
    c.fillStyle = '#75e3ff'; c.fillRect(fx - 11, fy - 10, 22, 14);
    c.fillStyle = '#d9f7ff'; c.fillRect(fx - 1, fy - 22, 3, 14);
  });
  for (const [dx, coul] of [[150, '#e4432d'], [196, '#3fa34d']]) {
    const sx = place.x + dx, sy = place.y + 60;
    v.ajouter({ type: 'rect', x: sx - 14, y: sy - 12, w: 28, h: 12 });
    v.dessin(sy, (c) => {
      c.fillStyle = CONTOUR; c.fillRect(sx - 15, sy - 24, 30, 24);
      for (let n = 0; n < 28; n += 7) { c.fillStyle = n % 14 ? '#f4f6fb' : coul; c.fillRect(sx - 14 + n, sy - 23, 7, 8); }
      c.fillStyle = '#c98a55'; c.fillRect(sx - 14, sy - 14, 28, 13);
      tuileTiny(c, v.tiny, 'farm', 11, sx - 12, sy - 18); tuileTiny(c, v.tiny, 'farm', 23, sx - 2, sy - 18);
    });
  }
  for (const dx of [-60, 60]) {
    v.ajouter({ type: 'cercle', x: fx + dx, y: fy + 35, r: 6 });
    v.dessin(fy + 40, (c) => banc(c, fx + dx, fy + 40));
  }
  for (const [dy, coul] of [[-90, 4], [110, 16]]) arbre(v, place.x + 12, fy + dy, coul);
  v.gens.push({ x: fx - 30, y: fy - 20, tenue: tenue(g), dir: 'face' }, { x: place.x + 170, y: place.y + 84, tenue: tenue(g + 9), dir: 'gauche' }, { x: fx + 40, y: fy + 60, tenue: tenue(g + 4), dir: 'droite' });
  v.lampes.push({ x: fx + 30, y: fy - 40 }, { x: fx - 70, y: fy + 80 });
}

// --- Éoliennes -----------------------------------------------------------------------------------

function eoliennes(v, i, cotes, g) {
  const nx = Math.max(1, Math.floor(i.w / 240)), ny = Math.max(1, Math.floor(i.h / 300));
  for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
    const x = i.x + (a + 0.5) * (i.w / nx) + (b % 2 ? 24 : -24), y = i.y + (b + 0.5) * (i.h / ny) + 50;
    v.ajouter({ type: 'cercle', x, y: y - 3, r: 5 });
    v.dessin(y, (c) => eolienne(c, x, y));
    v.eoliennes.push({ x, y: y - 98, phase: hash2(a, b, g) * 6 });
  }
  for (let k = 0; k < 12; k++) {
    const x = i.x + 20 + hash2(g, k, 5) * (i.w - 40), y = i.y + 30 + hash2(k, g, 7) * (i.h - 40);
    v.animaux.push({ x, y, n: 120, phase: k * 1.3 });
  }
}

// --- Étang ---------------------------------------------------------------------------------------

function etang(v, i, cotes, g) {
  const cx = i.x + i.w / 2, cy = i.y + i.h / 2;
  const rx = i.w / 2 - 70, ry = i.h / 2 - 70;
  const bandes = [];
  for (let y = -ry; y < ry; y += 8) {
    const t = (y + 4) / ry;
    const demi = Math.round((rx * Math.sqrt(Math.max(0, 1 - t * t)) * (0.9 + 0.1 * Math.sin(y * 0.05))) / 8) * 8;
    if (demi > 0) bandes.push({ y: cy + y, demi });
  }
  v.dessin(-1, (c) => {
    for (const b of bandes) { c.fillStyle = '#6aa85a'; c.fillRect(cx - b.demi - 10, b.y - 2, (b.demi + 10) * 2, 12); }
    for (const b of bandes) { c.fillStyle = '#5fd0f0'; c.fillRect(cx - b.demi, b.y, b.demi * 2, 8); }
    for (const b of bandes) { c.fillStyle = '#75e3ff'; c.fillRect(cx - b.demi + 6, b.y, b.demi * 2 - 12, 8); }
    c.fillStyle = '#d9f7ff';
    for (let k = 0; k < 8; k++) c.fillRect(cx - rx * 0.5 + hash2(k, g, 3) * rx, cy - ry * 0.5 + hash2(g, k, 5) * ry, 6, 1);
    // Roseaux sur la rive.
    for (let k = 0; k < 10; k++) tuileTiny(c, v.tiny, 'farm', 80, cx - rx + hash2(k, 1, g) * rx * 2 - 8, cy + ry * (k % 2 ? 0.8 : -0.9) - 8);
  });
  for (const b of bandes) v.ajouter({ type: 'rect', x: cx - b.demi, y: b.y, w: b.demi * 2, h: 8, eau: true });
  v.canards.push({ x: cx, y: cy, phase: g });
  // Ponton de pêche et un pêcheur.
  const px = cx + rx - 30, py = cy + 10;
  v.dessin(py + 12, (c) => {
    c.fillStyle = CONTOUR; c.fillRect(px, py - 7, 44, 14);
    c.fillStyle = '#c98a55'; c.fillRect(px + 1, py - 6, 42, 12);
    dessinerPerso(c, { ...tenue(g + 2), casque: '#3fa34d' }, px + 10, py, 'gauche');
    c.fillStyle = CONTOUR; c.fillRect(px - 16, py - 18, 22, 1); c.fillRect(px - 16, py - 18, 1, 14);
  });
  // Arbres autour, tables de pique-nique.
  const a = creerAlea(g + 77);
  for (let k = 0; k < 40; k++) {
    const x = i.x + 12 + a() * (i.w - 24), y = i.y + 18 + a() * (i.h - 26);
    const dx = (x - cx) / (rx + 34), dy = (y - cy) / (ry + 34);
    if (dx * dx + dy * dy < 1) continue;
    arbre(v, x, y, [4, 16, 28, 3, 27][Math.floor(a() * 5)]);
  }
}

// --- Station-service -------------------------------------------------------------------------------

/** Au bord de la nationale : boutique, auvent et pompes, parking ; le reste en champs. */
function station(v, i, cotes, g) {
  const w = 220;
  const droite = cotes.droite || !cotes.gauche;
  const z = { x: droite ? i.x + i.w - w : i.x, y: i.y + i.h - 200, w, h: 200 };
  v.dessin(-1, (c) => {
    // L'aire bitumée va jusqu'à la route (par-dessus le bas-côté).
    c.fillStyle = '#9aa1b5'; c.fillRect(droite ? z.x : z.x - T, z.y + 70, z.w + T, z.h - 70);
    c.fillStyle = '#e8e4d6'; for (let k = 0; k < 5; k++) c.fillRect(z.x + 12 + k * 40, z.y + z.h - 14, 20, 2);
  });
  const h = hauteurBatiment(1);
  const b = v.ajouter({ type: 'rect', x: z.x + 8, y: z.y + 6, w: 96, h });
  v.dessin(b.y + b.h, (c) => batimentModerne(c, b.x, b.y, b.w, 1, { facade: '#f4f6fb', toit: '#e4432d', vitrine: '#cfe8ff', enseigne: '#e4432d', nom: 'STATION' }));
  const ax = z.x + 120, ay = z.y + 70, aw = 80;
  for (const px of [ax + 12, ax + aw - 12]) v.ajouter({ type: 'cercle', x: px, y: ay + 52, r: 4 });
  for (const px of [ax + aw / 2 - 16, ax + aw / 2 + 16]) v.ajouter({ type: 'rect', x: px - 6, y: ay + 44, w: 12, h: 10 });
  v.dessin(ay + 56, (c) => auventStation(c, ax, ay, aw));
  const tx = droite ? z.x + z.w - 24 : z.x + 8;
  v.ajouter({ type: 'rect', x: tx, y: z.y + 34, w: 16, h: 20 });
  v.dessin(z.y + 60, (c) => {
    c.fillStyle = CONTOUR; c.fillRect(tx, z.y + 4, 16, 30); c.fillRect(tx + 7, z.y + 34, 3, 20);
    c.fillStyle = '#e4432d'; c.fillRect(tx + 1, z.y + 5, 14, 8);
    c.fillStyle = '#f4f6fb'; c.fillRect(tx + 1, z.y + 14, 14, 19);
    c.fillStyle = CONTOUR; c.fillRect(tx + 3, z.y + 17, 10, 2); c.fillRect(tx + 3, z.y + 23, 10, 2); c.fillRect(tx + 3, z.y + 29, 7, 2);
  });
  const reste = droite ? { x: i.x, y: i.y, w: i.w - w - 16, h: i.h } : { x: i.x + w + 16, y: i.y, w: i.w - w - 16, h: i.h };
  champs(v, reste, cotes, g + 3);
  champs(v, { x: z.x, y: i.y, w, h: i.h - 216 }, cotes, g + 9);
}
