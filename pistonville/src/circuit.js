/* circuit.js — génération des circuits et géométrie de la piste.
 *
 * Un circuit naît d'une graine (section 5.2 du cahier des charges) :
 *   1. des points au hasard et leur enveloppe convexe : les longues arêtes
 *      donnent des lignes droites ; des creux et des bosses au milieu des
 *      arêtes varient la forme sans jamais croiser le tracé ;
 *   2. une courbe fluide relie les points (Catmull-Rom fermée),
 *      rééchantillonnée tous les PAS pixels et mise à la longueur voulue ;
 *   3. on vérifie les règles de logique (rayon minimum, deux portions de
 *      piste jamais collées, une vraie ligne droite pour le départ) ; sinon
 *      on adoucit seulement les points trop serrés, puis on passe à l'essai
 *      suivant.
 * La même graine redonne toujours le même circuit.
 */

import { creerAlea, entre } from './outils.js';

export const LARGEUR = 96;              // largeur de piste : 6 cases, plus de trois voitures de front
export const DEMI = LARGEUR / 2;
export const VIBREUR = 8;               // bande de vibreurs au bord
export const BARRIERE = DEMI + 40;      // distance centre → barrière
export const PUBLIC_DEBUT = BARRIERE + 6;
export const PUBLIC_FIN = BARRIERE + 76;
export const MARGE = 340;               // décor autour du circuit

const PAS = 6;                          // espacement des points du tracé
const SEPARATION = 196;                 // écart mini entre deux portions (barrières jamais collées)
const CELLULE = 64;                     // grille d'accélération
const PORTEE = 230;                     // distance utile autour de la piste

function catmullRom(ctrl, parSegment) {
  const n = ctrl.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < parSegment; j++) {
      const t = j / parSegment, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

function longueurBoucle(poly) {
  let L = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
}

function reechantillonner(poly, pas) {
  const n = poly.length;
  const cumul = [0];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    cumul.push(cumul[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const L = cumul[n];
  const nb = Math.max(16, Math.round(L / pas));
  const out = [];
  let seg = 0;
  for (let k = 0; k < nb; k++) {
    const s = (k / nb) * L;
    while (cumul[seg + 1] < s) seg++;
    const a = poly[seg], b = poly[(seg + 1) % n];
    const t = (s - cumul[seg]) / (cumul[seg + 1] - cumul[seg] || 1);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Tangentes, courbure signée (k > 0 : la piste tourne vers la normale n) et abscisse. */
function analyser(points) {
  const n = points.length;
  const L = longueurBoucle(points);
  const pas = L / n;
  const m = Math.max(2, Math.round(24 / pas));
  const brut = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[(i - m + n) % n], b = points[i], c = points[(i + m) % n];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    brut[i] = d / (m * pas);
  }
  for (let i = 0; i < n; i++) {
    const p = points[(i - 1 + n) % n], q = points[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const pt = points[i];
    pt.tx = (q.x - p.x) / len;
    pt.ty = (q.y - p.y) / len;
    pt.s = i * pas;
    let somme = 0;
    for (let j = -2; j <= 2; j++) somme += brut[(i + j + n) % n];
    pt.k = somme / 5;
  }
  return { L, pas };
}

/** Plus longue suite de points presque droits ; renvoie [début, longueur en points]. */
function plusLongueDroite(points) {
  const n = points.length;
  let meilleur = [0, 0];
  let debut = -1;
  for (let i = 0; i < n * 2; i++) {
    const droit = Math.abs(points[i % n].k) < 1 / 450;
    if (droit && debut < 0) debut = i;
    if ((!droit || i === n * 2 - 1) && debut >= 0) {
      const lg = Math.min(i - debut, n);
      if (lg > meilleur[1]) meilleur = [debut % n, lg];
      debut = -1;
    }
  }
  return meilleur;
}

function valider(points, pas, rayonMin) {
  const n = points.length;
  for (const p of points) if (Math.abs(p.k) > 1 / rayonMin) return 'rayon';
  // Deux portions éloignées le long de la piste ne doivent jamais se frôler.
  const grille = new Map();
  const cle = (x, y) => `${Math.floor(x / SEPARATION)},${Math.floor(y / SEPARATION)}`;
  points.forEach((p, i) => {
    const k = cle(p.x, p.y);
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(i);
  });
  const ecartIndice = Math.ceil((SEPARATION * 1.7) / pas);
  for (let i = 0; i < n; i += 2) {
    const p = points[i];
    const cx = Math.floor(p.x / SEPARATION), cy = Math.floor(p.y / SEPARATION);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grille.get(`${cx + dx},${cy + dy}`) || []) {
        const di = Math.abs(i - j);
        if (Math.min(di, n - di) < ecartIndice) continue;
        if (Math.hypot(points[j].x - p.x, points[j].y - p.y) < SEPARATION) return 'proximite';
      }
    }
  }
  if (plusLongueDroite(points)[1] * pas < 150) return 'droite';
  return null;
}

/** Enveloppe convexe (chaîne monotone d'Andrew). */
function enveloppe(points) {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const croix = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const bas = [], haut = [];
  for (const q of p) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop();
    bas.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop();
    haut.push(q);
  }
  return bas.slice(0, -1).concat(haut.slice(0, -1));
}

/** Rayon du cercle passant par trois points (Infinity s'ils sont alignés). */
function rayonTrois(a, b, c) {
  const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
  const aire2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return aire2 < 1e-6 ? Infinity : (ab * bc * ca) / (2 * aire2);
}

/**
 * Un essai de tracé : des points au hasard, leur enveloppe (les longues
 * arêtes deviennent des lignes droites), puis des creux et des bosses au
 * milieu des arêtes pour varier les formes.
 */
function essayer(alea, def, rayonMin) {
  const cote = def.longueur / 3.3;
  const nb = 12 + Math.floor(alea() * 10);
  const nuage = [];
  for (let i = 0; i < nb; i++) nuage.push({ x: alea() * cote, y: alea() * cote * 1.35 });
  const coque = enveloppe(nuage);
  let ctrl = [];
  for (let i = 0; i < coque.length; i++) {
    const a = coque[i], b = coque[(i + 1) % coque.length];
    ctrl.push({ x: a.x, y: a.y });
    const lg = Math.hypot(b.x - a.x, b.y - a.y);
    if (lg > cote * 0.26 && alea() < 0.85) {
      // Creux (vers l'intérieur) ou bosse (vers l'extérieur) au milieu de l'arête.
      const amplitude = entre(alea, -0.46, 0.2) * lg;
      const nx = (b.y - a.y) / lg, ny = -(b.x - a.x) / lg;
      ctrl.push({ x: (a.x + b.x) / 2 + nx * amplitude, y: (a.y + b.y) / 2 + ny * amplitude });
    }
  }
  // Écarte les points trop proches.
  const ecartMin = cote * 0.14;
  for (let passe = 0; passe < 4; passe++) {
    ctrl = ctrl.filter((p, i) => {
      const q = ctrl[(i + 1) % ctrl.length];
      return Math.hypot(q.x - p.x, q.y - p.y) > ecartMin * 0.6;
    });
  }
  if (ctrl.length < 5) return null;

  for (let reglage = 0; reglage < 14; reglage++) {
    let pts = reechantillonner(catmullRom(ctrl, 18), PAS);
    const f = def.longueur / longueurBoucle(pts);
    ctrl = ctrl.map((p) => ({ x: p.x * f, y: p.y * f }));
    pts = reechantillonner(catmullRom(ctrl, 18), PAS);
    const { pas } = analyser(pts);
    const probleme = valider(pts, pas, rayonMin);
    if (!probleme) return pts;
    if (probleme === 'proximite' && reglage > 6) return null;
    // On n'adoucit que les points de contrôle trop serrés : le reste garde sa forme.
    const n = ctrl.length;
    const serres = new Set();
    ctrl.forEach((p, i) => {
      if (probleme === 'proximite' || rayonTrois(ctrl[(i - 1 + n) % n], p, ctrl[(i + 1) % n]) < rayonMin * 2.2) serres.add(i);
    });
    if (probleme === 'rayon') {
      // Et toujours le point de contrôle le plus proche du virage le plus serré.
      let pire = pts[0];
      for (const q of pts) if (Math.abs(q.k) > Math.abs(pire.k)) pire = q;
      let proche = 0, dMin = Infinity;
      ctrl.forEach((p, i) => {
        const d = Math.hypot(p.x - pire.x, p.y - pire.y);
        if (d < dMin) { dMin = d; proche = i; }
      });
      serres.add(proche);
      serres.add((proche + 1) % n);
      serres.add((proche - 1 + n) % n);
    }
    ctrl = ctrl.map((p, i) => {
      const a = ctrl[(i - 1 + n) % n], b = ctrl[(i + 1) % n];
      const t = serres.has(i) ? 0.3 : 0;
      return { x: p.x * (1 - t) + (a.x + b.x) * t / 2, y: p.y * (1 - t) + (a.y + b.y) * t / 2 };
    });
  }
  return null;
}

/**
 * Crée un circuit complet à partir de sa description (contenu/grands-prix).
 * `rayonMin` : 3 cases de rayon de plus que la demi-largeur au début du jeu.
 */
export function genererCircuit(def, rayonMin = 100) {
  let points = null;
  for (let essai = 0; essai < 60 && !points; essai++) {
    points = essayer(creerAlea(def.graine * 7919 + essai * 104729), def, rayonMin);
  }
  const secours = !points;
  if (!points) {
    // Filet de sécurité : un ovale, toujours valide.
    const ctrl = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctrl.push({ x: Math.cos(a) * 320, y: Math.sin(a) * 460 });
    }
    points = reechantillonner(catmullRom(ctrl, 18), PAS);
    const f = def.longueur / longueurBoucle(points);
    points = points.map((p) => ({ x: p.x * f, y: p.y * f }));
  }
  const alea = creerAlea(def.graine);
  if (alea() < 0.5) points.reverse();

  let { pas } = analyser(points);
  // Le départ se place aux trois quarts de la plus longue ligne droite :
  // la grille tient derrière, sur du droit.
  const [debut, lg] = plusLongueDroite(points);
  const depart = (debut + Math.floor(lg * 0.75)) % points.length;
  points = points.slice(depart).concat(points.slice(0, depart));
  const { L } = analyser(points);
  pas = L / points.length;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  for (const p of points) { p.x += MARGE - minX; p.y += MARGE - minY; }
  const largeur = Math.ceil(maxX - minX + MARGE * 2);
  const hauteur = Math.ceil(maxY - minY + MARGE * 2);

  const circuit = { def, points, longueur: L, pas, largeur, hauteur, grille: new Map(), ligneDroite: lg * pas, secours };
  circuit.interieur = coteInterieur(points);
  indexer(circuit);
  return circuit;
}

function dansPolygone(points, x, y) {
  let dedans = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** +1 si l'intérieur de la boucle est du côté de la normale n = (-ty, tx), sinon -1. */
function coteInterieur(points) {
  let vote = 0;
  for (let i = 0; i < points.length; i += Math.floor(points.length / 12)) {
    const p = points[i];
    vote += dansPolygone(points, p.x - p.ty * 20, p.y + p.tx * 20) ? 1 : -1;
  }
  return vote >= 0 ? 1 : -1;
}

function indexer(circuit) {
  const { points, grille } = circuit;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const x0 = Math.floor((Math.min(a.x, b.x) - PORTEE) / CELLULE);
    const x1 = Math.floor((Math.max(a.x, b.x) + PORTEE) / CELLULE);
    const y0 = Math.floor((Math.min(a.y, b.y) - PORTEE) / CELLULE);
    const y1 = Math.floor((Math.max(a.y, b.y) + PORTEE) / CELLULE);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = cx * 100000 + cy;
      let liste = grille.get(k);
      if (!liste) grille.set(k, (liste = []));
      liste.push(i);
    }
  }
}

/** Segments proches d'une position (liste vide = loin de la piste). */
export function segmentsProches(circuit, x, y) {
  return circuit.grille.get(Math.floor(x / CELLULE) * 100000 + Math.floor(y / CELLULE)) || [];
}

/**
 * Où se trouve un point par rapport à la piste :
 * d = distance au centre de la piste, s = abscisse le long du tracé,
 * cote = côté de la normale (+1/-1), k = courbure locale.
 */
export function situer(circuit, x, y, liste = segmentsProches(circuit, x, y)) {
  const { points } = circuit;
  const n = points.length;
  let best = null, bestD2 = Infinity;
  for (const i of liste) {
    const a = points[i], b = points[(i + 1) % n];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    let t = ((x - a.x) * vx + (y - a.y) * vy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + vx * t, py = a.y + vy * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < bestD2) { bestD2 = d2; best = { i, t, px, py }; }
  }
  if (!best) return null;
  const a = points[best.i], b = points[(best.i + 1) % n];
  const nx = -a.ty, ny = a.tx;
  const cote = (x - best.px) * nx + (y - best.py) * ny >= 0 ? 1 : -1;
  return {
    d: Math.sqrt(bestD2),
    i: best.i,
    s: a.s + best.t * circuit.pas,
    cote,
    k: a.k + (b.k - a.k) * best.t,
    nx, ny, px: best.px, py: best.py,
  };
}

/** Position et cap à l'abscisse s, décalée latéralement de `decalage` px. */
export function pointA(circuit, s, decalage = 0) {
  const { points, longueur, pas } = circuit;
  const n = points.length;
  s = ((s % longueur) + longueur) % longueur;
  const i = Math.floor(s / pas) % n;
  const t = (s - i * pas) / pas;
  const a = points[i], b = points[(i + 1) % n];
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
  const tx = a.tx + (b.tx - a.tx) * t, ty = a.ty + (b.ty - a.ty) * t;
  const l = Math.hypot(tx, ty) || 1;
  return { x: x - (ty / l) * decalage, y: y + (tx / l) * decalage, angle: Math.atan2(ty, tx), k: a.k };
}

/** Courbure la plus forte sur les `distance` prochains pixels (pour l'IA). */
export function courbureDevant(circuit, s, distance) {
  const { points, pas, longueur } = circuit;
  const n = points.length;
  let max = 0;
  const i0 = Math.floor((((s % longueur) + longueur) % longueur) / pas);
  const nb = Math.ceil(distance / pas);
  for (let j = 0; j < nb; j += 2) {
    const k = Math.abs(points[(i0 + j) % n].k);
    if (k > max) max = k;
  }
  return max;
}
