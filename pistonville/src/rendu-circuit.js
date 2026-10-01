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
import { objet, tuile, PERSONNAGES, idPersonnage, directionVers, DIRECTION, spriteVoiture, T } from './sprites.js';

const SOLS = {
  herbe: ['#38cbab', '#33bdae', '#3fd8ab'],
  sable: ['#d6d4af', '#cdcaa5', '#dfddbe'],
  terre: ['#b5916b', '#a8865f', '#c09c76'],
  beton: ['#aaa8bd', '#a2a0b5', '#b3b1c5'],
  eau: ['#59b6d8', '#52aed0', '#66c2e3'],
  gravier: ['#d8cfa8', '#c6bc93', '#e4dcbb'],
  rue: ['#5c6278', '#565c71', '#62697f'],
};

const PISTES = {
  asphalte: ['#5c6278', '#545a6e', '#646b83'],
  paves: ['#7a768e', '#716d85', '#837f97'],
  terre: ['#9a7656', '#8e6c4e', '#a68060'],
  mouille: ['#4c546a', '#465064', '#5a6680'],
  sable: ['#c4a874', '#b99d6b', '#cfb37f'],
  glace: ['#b9d3e3', '#aecbdc', '#d2e6f0'],
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
const ROUGE_VIBREUR = rgb('#c2504d');
const BLANC = rgb('#eceaf2');
const NOIR_PNEU = rgb('#2a2838');
const GRIS_PNEU = rgb('#5c6278');
const CONTOUR = rgb('#3a3550');
const GRADIN = rgb('#b8b6c9');
const GRADIN_BORD = rgb('#7e7c93');
const TOIT_TRIBUNE = rgb('#c2504d');

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

export function rendreCircuit(circuit, planche, niveau = 1) {
  const { largeur: W, hauteur: H, def } = circuit;
  const theme = THEMES[def.theme] || THEMES.parc;
  const alea = creerAlea(def.graine * 31 + 7);
  const graine = def.graine;
  const L = circuit.longueur;
  const exterieur = -circuit.interieur;
  const rangs = Math.min(3, niveau + 1);
  const profondeurTribune = rangs * 12 + 6;

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
    const h = hash2(x >> 1, y >> 1, graine);
    return liste[h < 0.68 ? 0 : h < 0.88 ? 1 : 2];
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
        } else if (s > L - 40 - 26 * nbPlaces && s < L - 20 && Math.abs((L - 30 - s) % 26) < 1.2 && Math.abs(Math.abs(lat) - 15) < 7) {
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
        if (exterieurVirage && ak > 1 / 250) {
          const u = ((s % 7) + 7) % 7 - 3.5, v = d - (BARRIERE - 4.5);
          const r2 = u * u + v * v;
          ecrire(o, r2 < 2.2 ? GRIS_PNEU : r2 < 12 ? NOIR_PNEU : ton(degagement, x, y));
        } else ecrire(o, ton(degagement, x, y));
      } else if (d < BARRIERE) {
        ecrire(o, BLANC);
      } else if (d < BARRIERE + 2) {
        ecrire(o, sponsors[Math.floor(s / 36) % sponsors.length]);
      } else if (d < BARRIERE + 3) {
        ecrire(o, CONTOUR);
      } else if (cote === exterieur && ok[m.i] && d >= PUBLIC_DEBUT && d < PUBLIC_DEBUT + profondeurTribune) {
        const e = d - PUBLIC_DEBUT;
        ecrire(o, e > profondeurTribune - 4 ? TOIT_TRIBUNE : e % 12 < 1.5 ? GRADIN_BORD : GRADIN);
      } else {
        const base = type === C.ABORDS ? solsEnv[C.ABORDS] : solsEnv[type] || solsEnv[C.LIBRE];
        const c = ton(base, x, y);
        ecrire(o, d < BARRIERE + 5 ? ombre(c) : c);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- 3. Détails d'environnement (rues, bâtiments, eau) et objets ---------
  dessinerEnvironnement(ctx, planche, { GW, GH, at, cel, theme, graine, statiques, env });

  // Paddock : tentes des écuries à l'intérieur, avant la ligne de départ.
  const paddock = [];
  for (let j = 0; j < 3; j++) {
    const p = pointA(circuit, L - 120 - j * 46, -exterieur * (BARRIERE + 30));
    paddock.push(p);
    statiques.push({ y: p.y + 12, dessin: (c) => tente(c, p.x, p.y, SPONSORS[(j + 1) % SPONSORS.length]) });
    statiques.push({ y: p.y + 20, dessin: (c) => tuile(c, planche, idPersonnage(PERSONNAGES[3], DIRECTION.face), p.x + 10, p.y + 4) });
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

  statiques.sort((a, b) => a.y - b.y);
  for (const s of statiques) s.dessin(ctx);

  // --- 4. Public (animé pendant la course) ---------------------------------
  const spectateurs = [];
  for (let i = 0; i < points.length; i++) {
    if (!ok[i] || i % 2) continue;
    const p = points[i];
    for (let r = 0; r < rangs; r++) {
      if (hash2(i, r, graine) < 0.25) continue;
      const q = pointA(circuit, p.s, exterieur * (PUBLIC_DEBUT + 10 + r * 12));
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
      else if (r < 0.32) statiques.push({ y: by, dessin: (c) => conteneur(c, x, y, h(gx, gy, 5)) });
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
      else if (r > 0.97) statiques.push({ y: by, dessin: (c) => tuile(c, planche, idPersonnage(PERSONNAGES[Math.floor(h(gx, gy, 3) * 6)], Math.floor(h(gx, gy, 4) * 4)), x, y) });
    } else if (type === C.LIBRE || type === C.ABORDS) {
      if (type === C.ABORDS) continue;
      if (env.ville) continue;   // les lots de ville sont traités en bloc plus bas
      vegetation(g, planche, gx, gy, x, y, cx, by, r);
    }
  }

  if (env.ville) batir(ctx, planche, g);
  void theme;
}

function vegetation(g, planche, gx, gy, x, y, cx, by, r) {
  const { theme, statiques, graine } = g;
  const amas = hash2(gx >> 2, gy >> 2, graine + 77);
  if (theme.sol === 'herbe') {
    const densite = theme.nom === 'Parc' ? 0.55 : 0.3;
    if (r < densite * amas) {
      const quoi = ['arbre', 'arbreRond', 'arbreBoule', 'sapin', 'buisson', 'grosBuisson'][Math.floor(hash2(gx, gy, graine + 4) * 6)];
      statiques.push({ y: by, dessin: (c) => objet(c, planche, quoi, cx + Math.round((r - 0.5) * 6), by) });
    } else if (r > 0.985) {
      statiques.push({ y: by, dessin: (c) => fleurs(c, x, y, graine + gx * 7 + gy) });
    }
  } else if (theme.sol === 'sable') {
    if (r < 0.05) statiques.push({ y: by, dessin: (c) => parasol(c, cx, y + 8, hash2(gx, gy, 3)) });
    else if (r < 0.08 && amas > 0.5) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'arbreBoule', cx, by) });
  } else if (theme.sol === 'terre') {
    if (r < 0.06) statiques.push({ y: by, dessin: (c) => tas(c, cx, y + 9) });
    else if (r < 0.1) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'cone', cx, by) });
    else if (r < 0.12) statiques.push({ y: by, dessin: (c) => objet(c, planche, 'barriereChantier', cx, by) });
  } else if (theme.sol === 'beton') {
    // Parc à conteneurs : des rangées de 3 cases séparées par des allées.
    const allee = gy % 4 === 3 || gx % 8 === 7;
    if (!allee && amas > 0.42) {
      const couleur = hash2(gx >> 1, gy, graine + 5);
      statiques.push({ y: by, dessin: (c) => conteneur(c, x, y, couleur) });
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
      ctx.fillStyle = '#38cbab'; ctx.fillRect(gx * T, gy * T, T, T);
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
        statiques.push({ y: bati.y + bati.h, dessin: (c) => maison(c, bati.x, bati.y, bati.w, bati.h, couleur) });
      } else {
        statiques.push({ y: bati.y + bati.h, dessin: (c) => immeuble(c, bati.x, bati.y, bati.w, bati.h, couleur, r) });
      }
    }
    // Arbres sur la pelouse restante, jamais sur le bâtiment.
    for (const [gx, gy] of pelouse) {
      const x = gx * T, y = gy * T;
      if (bati && x + T > bati.x && x < bati.x + bati.w && y + T > bati.y && y < bati.y + bati.h + 6) continue;
      const r = hash2(gx, gy, graine + 21);
      if (r < (banlieue ? 0.22 : 0.12)) {
        const quoi = r < 0.07 ? 'arbre' : r < 0.14 ? 'arbreRond' : 'buisson';
        statiques.push({ y: y + 15, dessin: (c) => objet(c, planche, quoi, x + 8, y + 15) });
      }
    }
  }
  void GW;
}

// --- Petits dessins pixel ------------------------------------------------------

function immeuble(c, x, y, w, h, toit, r) {
  const facade = 18;
  c.fillStyle = '#3a3550'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = toit; c.fillRect(x, y, w, h - facade);
  c.fillStyle = melangerCouleur(toit, '#ffffff', 0.25); c.fillRect(x, y, w, 2);
  c.fillStyle = melangerCouleur(toit, '#000000', 0.15);
  for (let i = 6; i < h - facade; i += 6) c.fillRect(x + 2, y + i, w - 4, 1);
  // équipements sur le toit
  c.fillStyle = '#c9ccd4'; c.fillRect(x + 6 + Math.floor(r * 20), y + 8, 10, 8);
  c.fillStyle = '#7e7c93'; c.fillRect(x + 8 + Math.floor(r * 20), y + 10, 6, 4);
  // façade côté sud, avec fenêtres et porte (vue Kenney légèrement de face)
  const fy = y + h - facade;
  c.fillStyle = r < 0.5 ? '#dc8f7a' : '#d6d4af'; c.fillRect(x, fy, w, facade);
  c.fillStyle = '#3a3550'; c.fillRect(x, fy, w, 1);
  for (let i = x + 4; i < x + w - 8; i += 10) {
    c.fillStyle = '#3a3550'; c.fillRect(i - 1, fy + 3, 7, 7);
    c.fillStyle = '#9fd3ff'; c.fillRect(i, fy + 4, 5, 5);
  }
  c.fillStyle = '#3a3550'; c.fillRect(x + w / 2 - 5, fy + 6, 10, facade - 6);
  c.fillStyle = '#836a62'; c.fillRect(x + w / 2 - 4, fy + 7, 8, facade - 7);
  c.fillStyle = 'rgba(42,40,56,0.35)'; c.fillRect(x + w + 1, y + 3, 3, h);
}

function maison(c, x, y, w, h, toit) {
  const facade = 12;
  c.fillStyle = '#3a3550'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = toit; c.fillRect(x, y, w, (h - facade) / 2);
  c.fillStyle = melangerCouleur(toit, '#000000', 0.18); c.fillRect(x, y + (h - facade) / 2, w, (h - facade) / 2);
  c.fillStyle = '#d6d4af'; c.fillRect(x, y + h - facade, w, facade);
  c.fillStyle = '#3a3550'; c.fillRect(x, y + h - facade, w, 1);
  c.fillStyle = '#9fd3ff'; c.fillRect(x + 5, y + h - 9, 5, 5); c.fillRect(x + w - 10, y + h - 9, 5, 5);
  c.fillStyle = '#836a62'; c.fillRect(x + w / 2 - 3, y + h - 9, 6, 9);
}

function conteneur(c, x, y, r) {
  const couleurs = ['#c2504d', '#2f6fdb', '#3fa34d', '#f2c14e', '#c77b47'];
  const col = couleurs[Math.floor(r * couleurs.length)];
  c.fillStyle = '#2a2838'; c.fillRect(x, y + 2, 16, 12);
  c.fillStyle = col; c.fillRect(x + 1, y + 3, 14, 10);
  c.fillStyle = melangerCouleur(col, '#000000', 0.25);
  for (let i = x + 3; i < x + 15; i += 3) c.fillRect(i, y + 4, 1, 8);
}

function voitureGaree(c, x, y, couleur, horizontale) {
  const s = spriteVoiture(couleur);
  c.save();
  c.translate(x, y);
  if (horizontale) c.rotate(Math.PI / 2);
  c.drawImage(s, -Math.floor(s.width / 2), -Math.floor(s.height / 2));
  c.restore();
}

function tente(c, x, y, couleur) {
  x = Math.round(x); y = Math.round(y);
  c.fillStyle = 'rgba(42,40,56,0.3)'; c.fillRect(x - 13, y - 7, 30, 22);
  c.fillStyle = '#2a2838'; c.fillRect(x - 15, y - 11, 30, 22);
  for (let i = 0; i < 28; i++) {
    c.fillStyle = Math.floor(i / 4) % 2 ? '#f4f1e8' : couleur;
    c.fillRect(x - 14 + i, y - 10, 1, 20);
  }
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x - 14, y - 10, 28, 2);
}

function commissaire(c, planche, x, y) {
  tuile(c, planche, idPersonnage(PERSONNAGES[3], DIRECTION.face), x - 8, y - 8);
  c.fillStyle = '#2a2838'; c.fillRect(Math.round(x) + 6, Math.round(y) - 10, 1, 10);
  c.fillStyle = '#f2c14e'; c.fillRect(Math.round(x) + 7, Math.round(y) - 10, 6, 4);
}

function parasol(c, x, y, r) {
  const col = ['#c2504d', '#2f6fdb', '#f2c14e', '#3fa34d'][Math.floor(r * 4)];
  c.fillStyle = 'rgba(42,40,56,0.25)'; c.fillRect(x - 5, y - 2, 12, 9);
  for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
    if (a * a + b * b > 36) continue;
    const quart = (a >= 0) !== (b >= 0);
    c.fillStyle = quart ? col : '#f4f1e8';
    c.fillRect(x + a, y + b - 4, 1, 1);
  }
  c.fillStyle = '#e8d7a8'; c.fillRect(x + 4, y + 4, 8, 4);
}

function tas(c, x, y) {
  c.fillStyle = '#8e6c4e';
  c.fillRect(x - 6, y - 2, 12, 5); c.fillRect(x - 4, y - 4, 8, 2);
  c.fillStyle = '#a68060'; c.fillRect(x - 3, y - 3, 4, 2);
}

function fleurs(c, x, y, s) {
  const cols = ['#e86ca6', '#f2c14e', '#f4f1e8', '#c2504d'];
  for (let i = 0; i < 6; i++) {
    c.fillStyle = cols[(s + i) % cols.length];
    c.fillRect(x + 2 + ((s * (i + 3)) % 11), y + 3 + ((s * (i + 5)) % 9), 2, 2);
  }
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
