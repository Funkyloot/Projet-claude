/* rendu-circuit.js — dessine un circuit et son décor, une fois, au chargement.
 *
 * Section 7.5 du cahier des charges : autour de la piste, des zones
 * (piste, vibreurs, dégagement, barrière, public, environnement), et chaque
 * objet ne se pose que dans sa zone. La piste est rastérisée pixel par pixel
 * pour rester nette ; le décor fixe est ensuite collé sur la même image.
 *
 * Renvoie l'image du terrain, la liste du public (animé pendant la course)
 * et la mini-carte.
 */

import { DEMI, VIBREUR, BARRIERE, PUBLIC_DEBUT, PUBLIC_FIN, pointA } from './circuit.js';
import { hash2, creerAlea, rgb, melangerCouleur } from './outils.js';
import { objet, tuile, PERSONNAGES, directionVers, T } from './sprites.js';
import { tuileTiny, dessinerPerso, tenue, spriteVoitureTiny, dessinerVoitureTiny, imageAtlas, tuileVille, pileVille } from './tiny.js';
import { batimentModerne, maisonModerne, caisses } from './ville-dessins.js';

// Palette des packs Kenney Tiny (relevée sur leurs tuiles) : tout le jeu a les mêmes couleurs.
const SOLS = {
  herbe: ['#84c669', '#7cbf61', '#8bd87d'],
  sable: ['#f3d9a4', '#ecd096', '#f8e2b4'],
  terre: ['#eaa56c', '#da9256', '#efb27e'],
  beton: ['#c0cbdc', '#b6c1d3', '#cad4e3'],
  eau: ['#75e3ff', '#6ad8f5', '#8ae9ff'],
  gravier: ['#ead9ab', '#dccb98', '#f2e3bb'],
  rue: ['#52607c', '#4b5873', '#58678a'],
};

const PISTES = {
  asphalte: ['#52607c', '#4b5873', '#58678a'],
  paves: ['#7d84a0', '#737a95', '#8890ab'],
  terre: ['#c98a55', '#bd7f4c', '#d4955f'],
  mouille: ['#46536e', '#3f4c66', '#52617f'],
  sable: ['#e2bf7d', '#d8b472', '#ebc98a'],
  glace: ['#c9e6f5', '#bddcee', '#dbf0fa'],
};

export const THEMES = {
  banlieue: { nom: 'Banlieue', sol: 'herbe', degagement: 'herbe', abords: 'herbe' },
  parc: { nom: 'Parc', sol: 'herbe', degagement: 'herbe', abords: 'herbe' },
  ville: { nom: 'Centre-ville', sol: 'beton', degagement: 'herbe', abords: 'beton' },
  port: { nom: 'Port', sol: 'beton', degagement: 'herbe', abords: 'beton' },
  plage: { nom: 'Plage', sol: 'sable', degagement: 'sable', abords: 'sable' },
  chantier: { nom: 'Chantier', sol: 'terre', degagement: 'terre', abords: 'terre' },
};

const SPONSORS = ['#c2504d', '#2f6fdb', '#f2c14e', '#f4f1e8', '#3fa34d', '#e86ca6'];
const ROUGE_VIBREUR = rgb('#e4432d');
const BLANC = rgb('#f4f6fb');
const NOIR_PNEU = rgb('#2a2838');
const CONTOUR = rgb('#26182e');

const tons = (liste) => liste.map(rgb);

// Types de cellules d'environnement (grille de 16 px).
const C = { ABORDS: 1, LIBRE: 2, EAU: 3, QUAI: 4, RUE: 5, TROTTOIR: 6, LOT: 7, BATI: 8, JARDIN: 9, PRIS: 10 };

/** Index des segments pour le rendu : cellules de 32 px, portée limitée. */
function indexRendu(circuit, portee) {
  const { points } = circuit;
  const n = points.length;
  const seg = [];
  for (let i = 0; i < n; i += 2) seg.push(i);
  const CEL = 32;
  const grille = new Map();
  const nbSeg = seg.length;
  const ax = new Float32Array(nbSeg), ay = new Float32Array(nbSeg), vx = new Float32Array(nbSeg),
    vy = new Float32Array(nbSeg), l2 = new Float32Array(nbSeg), s0 = new Float32Array(nbSeg),
    ds = new Float32Array(nbSeg), k0 = new Float32Array(nbSeg), nx = new Float32Array(nbSeg),
    ny = new Float32Array(nbSeg), idx = new Int32Array(nbSeg);
  for (let j = 0; j < nbSeg; j++) {
    const a = points[seg[j]], b = points[seg[(j + 1) % nbSeg]];
    ax[j] = a.x; ay[j] = a.y; vx[j] = b.x - a.x; vy[j] = b.y - a.y;
    l2[j] = vx[j] * vx[j] + vy[j] * vy[j] || 1;
    s0[j] = a.s; ds[j] = j === nbSeg - 1 ? circuit.longueur - a.s : b.s - a.s;
    k0[j] = a.k; nx[j] = -a.ty; ny[j] = a.tx; idx[j] = seg[j];
    const x0 = Math.floor((Math.min(a.x, b.x) - portee) / CEL), x1 = Math.floor((Math.max(a.x, b.x) + portee) / CEL);
    const y0 = Math.floor((Math.min(a.y, b.y) - portee) / CEL), y1 = Math.floor((Math.max(a.y, b.y) + portee) / CEL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = cx * 100000 + cy;
      let l = grille.get(k);
      if (!l) grille.set(k, (l = []));
      l.push(j);
    }
  }
  return { CEL, grille, ax, ay, vx, vy, l2, s0, ds, k0, nx, ny, idx };
}

/** Distance, abscisse, côté et courbure du point (x, y), sans allocation. */
function mesurer(R, liste, x, y, sortie) {
  let best = -1, bestD2 = Infinity, bestT = 0;
  for (let q = 0; q < liste.length; q++) {
    const j = liste[q];
    let t = ((x - R.ax[j]) * R.vx[j] + (y - R.ay[j]) * R.vy[j]) / R.l2[j];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = R.ax[j] + R.vx[j] * t - x, py = R.ay[j] + R.vy[j] * t - y;
    const d2 = px * px + py * py;
    if (d2 < bestD2) { bestD2 = d2; best = j; bestT = t; }
  }
  if (best < 0) return false;
  const px = R.ax[best] + R.vx[best] * bestT, py = R.ay[best] + R.vy[best] * bestT;
  sortie.d = Math.sqrt(bestD2);
  sortie.s = R.s0[best] + R.ds[best] * bestT;
  sortie.cote = (x - px) * R.nx[best] + (y - py) * R.ny[best] >= 0 ? 1 : -1;
  sortie.k = R.k0[best];
  sortie.i = R.idx[best];
  return true;
}

/** Portions droites côté extérieur, assez longues pour une tribune. */
function tribunes(circuit) {
  const { points, pas } = circuit;
  const n = points.length;
  const ok = new Uint8Array(n);
  let debut = -1;
  const min = Math.ceil(150 / pas);
  for (let i = 0; i <= n; i++) {
    const droit = i < n && Math.abs(points[i].k) < 1 / 420;
    if (droit && debut < 0) debut = i;
    if (!droit && debut >= 0) {
      if (i - debut >= min) for (let j = debut + 3; j < i - 3; j++) ok[j] = 1;
      debut = -1;
    }
  }
  // Pas de tribune juste au-dessus de la ligne de départ : place au portique.
  for (let j = 0; j < Math.ceil(30 / pas); j++) { ok[j] = 0; ok[n - 1 - j] = 0; }
  return ok;
}

export function rendreCircuit(circuit, planche, niveau = 1, tiny = {}) {
  const { largeur: W, hauteur: H, def } = circuit;
  const theme = THEMES[def.theme] || THEMES.parc;
  const alea = creerAlea(def.graine * 31 + 7);
  const graine = def.graine;
  const L = circuit.longueur;
  const exterieur = -circuit.interieur;
  const rangs = Math.min(3, niveau + 1);

  // --- 1. Grille d'environnement (cellules de 16 px) -----------------------
  const GW = Math.ceil(W / T), GH = Math.ceil(H / T);
  const cel = new Uint8Array(GW * GH);
  const R = indexRendu(circuit, PUBLIC_FIN + 40);
  const m = { d: 0, s: 0, cote: 0, k: 0, i: 0 };
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx * T + 8, y = gy * T + 8;
    const liste = R.grille.get(Math.floor(x / R.CEL) * 100000 + Math.floor(y / R.CEL));
    const proche = liste && mesurer(R, liste, x, y, m) && m.d < PUBLIC_FIN + 20;
    cel[gy * GW + gx] = proche ? C.ABORDS : C.LIBRE;
  }
  const at = (gx, gy) => (gx < 0 || gy < 0 || gx >= GW || gy >= GH ? C.ABORDS : cel[gy * GW + gx]);
  const set = (gx, gy, v) => { if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) cel[gy * GW + gx] = v; };

  const statiques = [];   // sprites et dessins fixes, triés par y avant collage
  const env = { ville: false, eau: null };
  amenager(def.theme, { GW, GH, at, set, alea, graine, statiques, env, circuit });

  // --- 2. Rastérisation pixel par pixel ------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const solsEnv = {
    [C.ABORDS]: tons(SOLS[theme.abords]),
    [C.LIBRE]: tons(SOLS[theme.sol]),
    [C.EAU]: tons(SOLS.eau),
    [C.QUAI]: tons(SOLS.beton),
    [C.RUE]: tons(SOLS.rue),
    [C.TROTTOIR]: tons(SOLS.beton),
    [C.LOT]: tons(SOLS[theme.sol]),
    [C.BATI]: tons(SOLS.beton),
    [C.JARDIN]: tons(SOLS.herbe),
    [C.PRIS]: tons(SOLS[theme.sol]),
  };
  const degagement = tons(SOLS[theme.degagement]);
  const gravier = tons(SOLS.gravier);
  const piste = tons(PISTES[def.surface] || PISTES.asphalte);
  const sponsors = tons(SPONSORS);
  const ombre = (c) => [c[0] * 0.78, c[1] * 0.78, c[2] * 0.82];
  const ok = tribunes(circuit);
  const nbPlaces = 6 + 4 * Math.min(niveau, 2);

  const ecrire = (o, c) => { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
  const ton = (liste, x, y) => {
    // Aplats nets façon Tiny : la couleur de base presque partout, quelques touches.
    const h = hash2(x >> 2, y >> 2, graine);
    return liste[h < 0.9 ? 0 : h < 0.96 ? 1 : 2];
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const type = cel[Math.floor(y / T) * GW + Math.floor(x / T)];
      const liste = R.grille.get(Math.floor(x / R.CEL) * 100000 + Math.floor(y / R.CEL));
      if (!liste || !mesurer(R, liste, x, y, m) || m.d >= PUBLIC_FIN + 20) {
        ecrire(o, ton(solsEnv[type] || solsEnv[C.LIBRE], x, y));
        continue;
      }
      const { d, s, cote, k } = m;
      const ak = Math.abs(k);
      const exterieurVirage = cote * Math.sign(k) < 0;
      const lat = d * cote;
      if (d < DEMI - 2) {
        // Piste : damier de départ, cases de la grille, revêtement.
        const sd = Math.min(s, L - s);
        if (sd < 6) {
          const damier = (Math.floor((s + 6) / 3) + Math.floor((lat + DEMI) / 3)) & 1;
          ecrire(o, damier ? BLANC : NOIR_PNEU);
        } else if (s > L - 50 - 54 * nbPlaces && s < L - 26 && Math.abs((L - 28 - s) % 54) < 1.5 && Math.abs(Math.abs(lat) - 22) < 13) {
          ecrire(o, BLANC);
        } else if (def.surface === 'paves' && ((x % 6 === 0) || ((y + (Math.floor(x / 6) % 2) * 3) % 6 === 0))) {
          ecrire(o, ombre(piste[0]));
        } else {
          ecrire(o, ton(piste, x, y));
        }
      } else if (d < DEMI) {
        ecrire(o, ak > 1 / 330 ? (Math.floor(s / 8) & 1 ? ROUGE_VIBREUR : BLANC) : BLANC);
      } else if (d < DEMI + VIBREUR) {
        if (ak > 1 / 330) ecrire(o, Math.floor(s / 8) & 1 ? ROUGE_VIBREUR : BLANC);
        else ecrire(o, ton(degagement, x, y));
      } else if (d < BARRIERE - 8) {
        const bac = exterieurVirage && ak > 1 / 280 && d > DEMI + VIBREUR + 2;
        ecrire(o, ton(bac ? gravier : degagement, x, y));
      } else if (d < BARRIERE - 1) {
        ecrire(o, ton(degagement, x, y));
      } else if (d < BARRIERE) {
        ecrire(o, BLANC);
      } else if (d < BARRIERE + 2) {
        ecrire(o, sponsors[Math.floor(s / 36) % sponsors.length]);
      } else if (d < BARRIERE + 3) {
        ecrire(o, CONTOUR);
      } else {
        const base = type === C.ABORDS ? solsEnv[C.ABORDS] : solsEnv[type] || solsEnv[C.LIBRE];
        const c = ton(base, x, y);
        ecrire(o, d < BARRIERE + 5 ? ombre(c) : c);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- 3. Détails d'environnement (rues, bâtiments, eau) et objets ---------
  dessinerEnvironnement(ctx, planche, { GW, GH, at, cel, theme, graine, statiques, env, tiny });

  // Paddock : tentes des écuries à l'intérieur, avant la ligne de départ.
  const paddock = [];
  for (let j = 0; j < 3; j++) {
    const p = pointA(circuit, L - 120 - j * 46, -exterieur * (BARRIERE + 30));
    paddock.push(p);
    statiques.push({ y: p.y + 12, dessin: (c) => imageAtlas(c, j % 2 ? 'tenteBleue' : 'tenteRouge', p.x, p.y, 0, 0.8) });
    statiques.push({ y: p.y + 20, dessin: (c) => dessinerPerso(c, tenue(j * 5 + 1, 'mecano'), p.x + 18, p.y + 20, 'face') });
  }

  // Commissaires aux virages serrés, côté extérieur, derrière la barrière.
  const { points } = circuit;
  let dernier = -1e9;
  for (let i = 0; i < points.length; i += 4) {
    const p = points[i];
    if (Math.abs(p.k) < 1 / 200 || p.s - dernier < 500) continue;
    dernier = p.s;
    const cote = -Math.sign(p.k);
    const q = pointA(circuit, p.s, cote * (BARRIERE + 12));
    statiques.push({ y: q.y + 8, dessin: (c) => commissaire(c, planche, q.x, q.y) });
  }

  // Murs de pneus (Kenney Racing Pack) à l'extérieur des virages serrés.
  let dernierPneu = -1e9;
  for (const p of points) {
    if (Math.abs(p.k) < 1 / 250 || p.s - dernierPneu < 15) continue;
    dernierPneu = p.s;
    const q = pointA(circuit, p.s, -Math.sign(p.k) * (BARRIERE - 5));
    const rouge = Math.floor(p.s / 15) % 2;
    statiques.push({ y: q.y - 100, dessin: (c) => imageAtlas(c, rouge ? 'pneusRouges' : 'pneusBlancs', q.x, q.y, 0, 0.62) });
  }

  // Tribunes (Kenney Racing Pack) le long des lignes droites, côté extérieur, tournées vers la piste.
  const tribunesPosees = [];
  let derniereTribune = -1e9;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!ok[i] || p.s - derniereTribune < 150) continue;
    if (!ok[Math.min(points.length - 1, i + Math.ceil(130 / circuit.pas))]) continue;
    const s0 = p.s + 66;
    derniereTribune = s0 + 66;
    const pied = pointA(circuit, s0, 0), q = pointA(circuit, s0, exterieur * (PUBLIC_DEBUT + 36));
    const nx = (q.x - pied.x) / (PUBLIC_DEBUT + 36), ny = (q.y - pied.y) / (PUBLIC_DEBUT + 36);
    const angle = Math.atan2(nx, -ny);
    tribunesPosees.push(s0);
    statiques.push({ y: q.y - 200, dessin: (c) => imageAtlas(c, 'tribuneVide', q.x, q.y, angle, 0.75) });
  }

  statiques.sort((a, b) => a.y - b.y);
  for (const s of statiques) s.dessin(ctx);

  // --- 4. Public (animé pendant la course) ---------------------------------
  const spectateurs = [];
  for (let i = 0; i < points.length; i++) {
    if (i % 2) continue;
    const p = points[i];
    // Assis sur les gradins des tribunes posées : trois rangées de bancs.
    if (!tribunesPosees.some((s0) => Math.abs(p.s - s0) < 58)) continue;
    for (let r = 0; r < rangs; r++) {
      if (hash2(i, r, graine) < 0.25) continue;
      const q = pointA(circuit, p.s, exterieur * (PUBLIC_DEBUT + 22 + r * 18));
      spectateurs.push({
        x: q.x + (hash2(i, r + 9, graine) - 0.5) * 3,
        y: q.y,
        base: PERSONNAGES[Math.floor(hash2(r, i, graine) * PERSONNAGES.length)],
        dir: directionVers(p.x - q.x, p.y - q.y),
        phase: hash2(i, r + 3, graine) * 6.28,
        s: p.s,
      });
    }
  }

  return { canvas, spectateurs, paddock, minicarte: miniCarte(circuit), theme };
}

// --- Aménagement de l'environnement par thème --------------------------------

function amenager(nomTheme, g) {
  const { GW, GH, at, set, alea, env, circuit } = g;
  if (nomTheme === 'port' || nomTheme === 'plage') {
    // L'eau occupe un côté du monde, au-delà de tout ce qui touche la piste.
    const angle = alea() * Math.PI * 2;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    let maxProj = -Infinity;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (at(gx, gy) === C.ABORDS) maxProj = Math.max(maxProj, gx * ux + gy * uy);
    }
    const seuil = maxProj + 4;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (at(gx, gy) === C.LIBRE && gx * ux + gy * uy > seuil) set(gx, gy, C.EAU);
    }
    if (nomTheme === 'port') {
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        if (at(gx, gy) !== C.LIBRE) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(gx + a, gy + b) === C.EAU)) set(gx, gy, C.QUAI);
      }
    }
    env.eau = { ux, uy, seuil };
  }
  if (nomTheme === 'ville' || nomTheme === 'banlieue') {
    // Pâtés de maisons : rues de 2 cases tous les P, trottoirs autour.
    const P = nomTheme === 'ville' ? 10 : 12;
    const ox = Math.floor(alea() * P), oy = Math.floor(alea() * P);
    const estRue = (gx, gy) => ((gx + ox) % P < 2) || ((gy + oy) % P < 2);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (at(gx, gy) === C.LIBRE && estRue(gx, gy)) set(gx, gy, C.RUE);
    }
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (at(gx, gy) !== C.LIBRE) continue;
      let pres = false;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (at(gx + a, gy + b) === C.RUE) pres = true;
      if (pres) set(gx, gy, C.TROTTOIR);
    }
    env.ville = { P, ox, oy, banlieue: nomTheme === 'banlieue' };
  }
  void circuit;
}

function dessinerEnvironnement(ctx, planche, g) {
  const { GW, GH, at, theme, graine, statiques, env } = g;
  const h = (a, b, s = 0) => hash2(a, b, graine + s);

  // Bord de l'eau : écume ou quai.
  if (env.eau) {
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (at(gx, gy) !== C.EAU) continue;
      const x = gx * T, y = gy * T;
      if (at(gx, gy - 1) !== C.EAU) { ctx.fillStyle = '#e8f4f8'; ctx.fillRect(x, y, T, 2); }
      if (at(gx - 1, gy) !== C.EAU) { ctx.fillStyle = '#e8f4f8'; ctx.fillRect(x, y, 2, T); }
      if (at(gx + 1, gy) !== C.EAU) { ctx.fillStyle = '#e8f4f8'; ctx.fillRect(x + T - 2, y, 2, T); }
      if (at(gx, gy + 1) !== C.EAU) { ctx.fillStyle = '#e8f4f8'; ctx.fillRect(x, y + T - 2, T, 2); }
      if (h(gx, gy) < 0.06) { ctx.fillStyle = '#9fdcef'; ctx.fillRect(x + 4, y + 7, 6, 1); }
    }
  }

  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const type = at(gx, gy);
    const x = gx * T, y = gy * T, cx = x + 8, by = y + 15;
    const r = h(gx, gy, 11);
    if (type === C.QUAI) {
      if (r < 0.12) statiques.push({ y: by, dessin: (c) => { c.fillStyle = '#3a3550'; c.fillRect(cx - 2, y + 6, 4, 4); c.fillStyle = '#5c6278'; c.fillRect(cx - 1, y + 7, 2, 2); } });
      else if (r < 0.32) statiques.push({ y: by, dessin: (c) => tuileVille(c, 605, x, y) });
    } else if (type === C.RUE) {
      const v = env.ville;
      const horizontale = (gy + v.oy) % v.P < 2 && !((gx + v.ox) % v.P < 2);
      const verticale = (gx + v.ox) % v.P < 2 && !((gy + v.oy) % v.P < 2);
      ctx.fillStyle = '#d9d6e6';
      if (horizontale && (gy + v.oy) % v.P === 1 && gx % 2 === 0) ctx.fillRect(x + 2, y - 1, 8, 2);
      if (verticale && (gx + v.ox) % v.P === 1 && gy % 2 === 0) ctx.fillRect(x - 1, y + 2, 2, 8);
      if (r < 0.05 && (horizontale || verticale)) {
        const couleur = ['#c2504d', '#4f7ddb', '#f2c14e', '#f4f1e8', '#3fa34d'][Math.floor(h(gx, gy, 2) * 5)];
        statiques.push({ y: by, dessin: (c) => voitureGaree(c, cx, y + 8, couleur, horizontale) });
      }
    } else if (type === C.TROTTOIR) {
      ctx.fillStyle = '#9896ab';
      if (at(gx, gy - 1) === C.RUE) ctx.fillRect(x, y, T, 1);
      if (at(gx, gy + 1) === C.RUE) ctx.fillRect(x, y + T - 1, T, 1);
      if (at(gx - 1, gy) === C.RUE) ctx.fillRect(x, y, 1, T);
      if (at(gx + 1, gy) === C.RUE) ctx.fillRect(x + T - 1, y, 1, T);
      const bordRue = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(gx + a, gy + b) === C.RUE);
      const bordLot = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(gx + a, gy + b) === C.LIBRE);
      // La boîte aux lettres : sur un trottoir, entre la rue et un bâtiment.
      if (bordRue && bordLot && r < 0.12) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'boiteAuxLettres', cx, by) });
      else if (bordRue && (gx + gy) % 4 === 0 && r < 0.5) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'lampadaire', cx, by) });
      else if (bordRue && r > 0.93) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'borneIncendie', cx, by) });
      else if (bordRue && r > 0.88) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'poubelle', cx, by) });
      else if (r > 0.97) statiques.push({ y: by, dessin: (c) => dessinerPerso(c, tenue(Math.floor(h(gx, gy, 3) * 40)), cx, by, ['gauche', 'face', 'dos', 'droite'][Math.floor(h(gx, gy, 4) * 4)]) });
    } else if (type === C.LIBRE || type === C.ABORDS) {
      if (type === C.ABORDS) continue;
      if (env.ville) continue;   // les lots de ville sont traités en bloc plus bas
      vegetation(g, planche, gx, gy, x, y, cx, by, r);
    }
  }

  if (env.ville) batir(ctx, planche, g);
  void theme;
}

/** Arbres Kenney Tiny Town (verts et d'automne), posés au pied. */
const ARBRES = [4, 16, 28, 4, 16, 3, 27];
function arbreTiny(c, tiny, n, x, by) {
  c.fillStyle = 'rgba(38,24,46,0.22)'; c.fillRect(Math.round(x) - 6, Math.round(by) - 2, 12, 3);
  tuileTiny(c, tiny, 'town', n, x - 8, by - 15);
}

function vegetation(g, planche, gx, gy, x, y, cx, by, r) {
  const { theme, statiques, graine } = g;
  const amas = hash2(gx >> 2, gy >> 2, graine + 77);
  if (theme.sol === 'herbe') {
    const densite = theme.nom === 'Parc' ? 0.55 : 0.3;
    if (r < densite * amas) {
      const n = ARBRES[Math.floor(hash2(gx, gy, graine + 4) * ARBRES.length)];
      statiques.push({ y: by, dessin: (c) => arbreTiny(c, g.tiny, n, cx + Math.round((r - 0.5) * 6), by) });
    } else if (r > 0.985) {
      statiques.push({ y: by, dessin: (c) => tuileTiny(c, g.tiny, 'town', 2, x, y) });
    }
  } else if (theme.sol === 'sable') {
    if (r < 0.05) statiques.push({ y: by, dessin: (c) => pileVille(c, [hash2(gx, gy, 3) < 0.5 ? 552 : 553], cx, by) });
    else if (r < 0.08 && amas > 0.5) statiques.push({ y: by, dessin: (c) => arbreTiny(c, g.tiny, 28, cx, by) });
  } else if (theme.sol === 'terre') {
    if (r < 0.06) statiques.push({ y: by, dessin: (c) => imageAtlas(c, 'rocher', cx, y + 8, 0, 0.5) });
    else if (r < 0.1) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'cone', cx, by) });
    else if (r < 0.12) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'barriereChantier', cx, by) });
  } else if (theme.sol === 'beton') {
    // Parc à conteneurs : des rangées de 3 cases séparées par des allées.
    const allee = gy % 4 === 3 || gx % 8 === 7;
    if (!allee && amas > 0.42) {
      const couleur = hash2(gx >> 1, gy, graine + 5);
      void couleur;
      statiques.push({ y: by, dessin: (c) => tuileVille(c, [605, 606, 642][Math.floor(r * 3)], x, y) });
    } else if (allee && gx % 8 === 7 && gy % 4 === 3 && r < 0.6) {
      statiques.push({ y: by, dessin: (c) => objet(c, planche, 'lampadaire', cx, by) });
    }
  }
}

/** Pâtés de maisons : bâtiments (ville) ou maisons avec jardin (banlieue). */
function batir(ctx, planche, g) {
  const { GW, GH, at, env, graine, statiques } = g;
  const { P, ox, oy, banlieue } = env.ville;
  const toits = ['#c2504d', '#c77b47', '#9ea3ac', '#6f7fa3', '#8a6a9e'];
  const libre = (ax, ay, w, h) => {
    for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) if (at(ax + a, ay + b) !== C.LIBRE) return false;
    return true;
  };
  for (let by0 = -oy; by0 < GH; by0 += P) for (let bx0 = -ox; bx0 < GW; bx0 += P) {
    const x0 = bx0 + 3, y0 = by0 + 3, taille = P - 4;
    const couleur = toits[Math.floor(hash2(bx0, by0, graine + 8) * toits.length)];
    // Le lot devient d'abord une pelouse ; le bâtiment se pose s'il a la place.
    const pelouse = [];
    for (let a = 0; a < taille; a++) for (let b = 0; b < taille; b++) {
      const gx = x0 + a, gy = y0 + b;
      if (at(gx, gy) !== C.LIBRE) continue;
      ctx.fillStyle = '#84c669'; ctx.fillRect(gx * T, gy * T, T, T);
      pelouse.push([gx, gy]);
    }
    let bati = null;
    if (banlieue) {
      if (libre(x0 + 1, y0 + 1, taille - 2, taille - 3)) bati = { x: (x0 + 1) * T + 4, y: (y0 + 1) * T + 4, w: (taille - 2) * T - 8, h: (taille - 3) * T - 8 };
    } else if (libre(x0, y0, taille, taille)) bati = { x: x0 * T + 4, y: y0 * T + 4, w: taille * T - 8, h: taille * T - 8 };
    else if (libre(x0 + 1, y0 + 1, taille - 2, taille - 2)) bati = { x: (x0 + 1) * T + 2, y: (y0 + 1) * T + 2, w: (taille - 2) * T - 4, h: (taille - 2) * T - 4 };
    if (bati) {
      const r = hash2(bx0, by0, graine);
      if (banlieue) {
        ctx.fillStyle = '#d6d4af';
        ctx.fillRect(bati.x + bati.w / 2 - 4, bati.y + bati.h, 8, (y0 + taille) * T - bati.y - bati.h);   // allée
        statiques.push({ y: bati.y + bati.h, dessin: (c) => maisonModerne(c, bati.x + bati.w / 2 - 32, bati.y + bati.h - 64, 64, couleur, '#f4e6c8') });
      } else {
        const etages = Math.max(1, Math.min(3, Math.floor((bati.h - 32) / 32)));
        statiques.push({ y: bati.y + bati.h, dessin: (c) => batimentModerne(c, bati.x, bati.y + bati.h - 32 - etages * 32, bati.w, etages, { facade: r < 0.5 ? '#c2504d' : '#9ea3ac', toit: couleur, vitrine: r > 0.6 }) });
      }
    }
    // Arbres sur la pelouse restante, jamais sur le bâtiment.
    for (const [gx, gy] of pelouse) {
      const x = gx * T, y = gy * T;
      if (bati && x + T > bati.x && x < bati.x + bati.w && y + T > bati.y && y < bati.y + bati.h + 6) continue;
      const r = hash2(gx, gy, graine + 21);
      if (r < (banlieue ? 0.22 : 0.12)) {
        const n = r < 0.07 ? 16 : r < 0.14 ? 4 : 28;
        statiques.push({ y: y + 15, dessin: (c) => arbreTiny(c, g.tiny, n, x + 8, y + 15) });
      }
    }
  }
  void GW;
}

// --- Petits dessins pixel ------------------------------------------------------




export function voitureGaree(c, x, y, couleur, horizontale) {
  dessinerVoitureTiny(c, spriteVoitureTiny(couleur, null, [], `voiture${1 + (Math.round(x + y) % 5)}`), x, y, horizontale ? 0 : Math.PI / 2);
}


function commissaire(c, planche, x, y) {
  dessinerPerso(c, { ...tenue(2), haut: '#f39c33' }, x, y + 7, 'face');
  c.fillStyle = '#26182e'; c.fillRect(Math.round(x) + 6, Math.round(y) - 12, 1, 12);
  c.fillStyle = '#f2c14e'; c.fillRect(Math.round(x) + 7, Math.round(y) - 12, 6, 4);
}




/** Mini-carte : le tracé en blanc, la ligne d'arrivée en jaune. */
export function miniCarte(circuit, largeurMax = 88, hauteurMax = 100) {
  const { points } = circuit;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const echelle = Math.min((largeurMax - 12) / (maxX - minX), (hauteurMax - 12) / (maxY - minY));
  const w = Math.ceil((maxX - minX) * echelle + 12), h = Math.ceil((maxY - minY) * echelle + 12);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tracer = (largeur, couleur) => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = (p.x - minX) * echelle + 6, y = (p.y - minY) * echelle + 6;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.lineWidth = largeur; ctx.strokeStyle = couleur; ctx.lineJoin = 'round'; ctx.stroke();
  };
  tracer(6, '#2a2838');
  tracer(3, '#f4f1e8');
  const d = points[0];
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(Math.round((d.x - minX) * echelle + 6) - 2, Math.round((d.y - minY) * echelle + 6) - 2, 4, 4);
  return { canvas: c, echelle, minX, minY, decalage: 6 };
}
