/* gen-sprites.mjs — exporte toute l'app en planches PNG, pixel par pixel.
 *
 * Rien n'est dessiné à la main dans ce dépôt : la mascotte et les décors
 * sont tracés par le code. Ce script rejoue ce code dans un canvas logiciel
 * (tools/rendu.mjs) et en tire de vraies planches de sprites, à l'échelle
 * 1:1, fond transparent — de quoi les reprendre dans un éditeur de pixel
 * art puis les réinjecter.
 *
 *   node tools/gen-sprites.mjs
 *
 * Sortie dans mascotte/sprites/ :
 *   mascotte/*.png   les poses et les animations de la mascotte
 *   objets/*.png     chaque objet du décor, avec ses images d'animation
 *   scenes/*.png     les dix scènes complètes, huit images chacune
 *   apercu/*.png     les mêmes, agrandies ×6 et légendées
 *   sprites.json     la grille de chaque planche (taille de case, colonnes…)
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Toile } from './rendu.mjs';
import * as M from '../mascotte/js/mascotte.js';
import * as O from '../mascotte/js/activites.js';
import { drawText } from '../mascotte/js/microfont.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', 'mascotte', 'sprites');

const L_SCENE = 104, H_SCENE = 59, SOL_SCENE = Math.round(H_SCENE * 0.8);
const manifeste = { planches: [] };

/* ---------- Fabrique de planches ---------- */

/**
 * Compose une planche : `cases` est un tableau de lignes, chaque ligne un
 * tableau de { nom, dessiner(ctx, ox, oy) }. Toutes les cases font la même
 * taille : c'est ce qui rend la planche exploitable dans un éditeur.
 */
function planche(dossier, nom, cellL, cellH, lignes, legendes) {
  const cols = Math.max(...lignes.map((r) => r.length));
  const toile = new Toile(cellL * cols, cellH * lignes.length);
  lignes.forEach((ligne, j) => {
    ligne.forEach((cas, i) => {
      const cellule = new Toile(cellL, cellH);
      cas.dessiner(cellule.ctx);
      toile.coller(cellule, i * cellL, j * cellH);
    });
  });
  mkdirSync(join(SORTIE, dossier), { recursive: true });
  writeFileSync(join(SORTIE, dossier, nom + '.png'), toile.png());
  manifeste.planches.push({
    fichier: `${dossier}/${nom}.png`,
    caseLargeur: cellL,
    caseHauteur: cellH,
    colonnes: cols,
    lignes: lignes.length,
    legendes: legendes ?? lignes.map((r) => r.map((c) => c.nom)),
  });
  apercu(dossier, nom, toile, cellL, cellH, lignes);
  return toile;
}

/** Aperçu ×6 avec damier et légendes, pour relire la planche d'un coup d'œil. */
function apercu(dossier, nom, toile, cellL, cellH, lignes) {
  const marge = 7;
  const fond = new Toile(toile.l, toile.h + marge * lignes.length);
  // Damier discret pour voir la transparence.
  for (let y = 0; y < fond.h; y++) {
    for (let x = 0; x < fond.l; x++) {
      fond.remplir(x, y, 1, 1, ((x >> 2) + (y >> 2)) & 1 ? '#2a2d33' : '#232529');
    }
  }
  lignes.forEach((ligne, j) => {
    const oy = j * (cellH + marge);
    ligne.forEach((cas, i) => {
      const cellule = new Toile(cellL, cellH);
      cas.dessiner(cellule.ctx);
      fond.coller(cellule, i * cellL, oy);
      drawText(fond.ctx, String(cas.nom).slice(0, Math.floor(cellL / 4)), i * cellL + 1, oy + cellH + 1, '#8a8f97');
    });
  });
  mkdirSync(join(SORTIE, 'apercu'), { recursive: true });
  writeFileSync(join(SORTIE, 'apercu', `${dossier}-${nom}.png`), fond.agrandie(6).png());
}

/* ---------- 1. La mascotte ---------- */

const CL = 26, CH = 22;                 // case des planches de mascotte
const POSEX = 4, POSEY = 20;            // où poser ses pieds dans la case

function mascotte(o) {
  return (ctx) => {
    M.reglerMascotte(o.t ?? 0, o.clignement);
    M.dessinerMascotte(ctx, {
      x: POSEX, sol: POSEY, ombre: false, souffle: 1, ...o,
    });
  };
}

function planchesMascotte() {
  const yeux = ['ouvert', 'mi', 'content', 'ferme'];
  const IMAGES = 8;

  // Respiration : un cycle complet fait 2π / 2,1 ≈ 3 s.
  for (const sens of [1, -1]) {
    const suffixe = sens > 0 ? 'droite' : 'gauche';
    planche('mascotte', `debout-${suffixe}`, CL, CH,
      yeux.map((y) => Array.from({ length: IMAGES }, (_, i) => ({
        nom: `${y[0]}${i}`,
        dessiner: mascotte({ t: (i / IMAGES) * 2.99, sens, pose: 'debout', yeux: y }),
      }))));

    planche('mascotte', `marche-${suffixe}`, CL, CH,
      [Array.from({ length: IMAGES }, (_, i) => ({
        nom: `M${i}`,
        dessiner: mascotte({ t: (i / IMAGES) * 2.99, sens, pose: 'marche', pas: (i / IMAGES) * Math.PI * 2, yeux: 'ouvert' }),
      }))]);

    planche('mascotte', `assis-${suffixe}`, CL, CH,
      [yeux.map((y) => ({
        nom: y.slice(0, 5),
        dessiner: mascotte({ t: 0.5, sens, pose: 'assis', yeux: y }),
      }))]);

    planche('mascotte', `couche-${suffixe}`, CL, CH,
      [Array.from({ length: 4 }, (_, i) => ({
        nom: `D${i}`,
        dessiner: mascotte({ t: i * 0.7, sens, pose: 'couche', yeux: 'ferme', souffle: 2.2, dy: Math.sin(i * 0.7 * 1.2) * 0.8 }),
      }))]);
  }

  // Le bras : douze directions, à portée maximale, près puis loin. La case
  // est plus large que les autres pour que la main tendue tienne dedans.
  const dirs = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
  planche('mascotte', 'bras', CL + 8, CH, [
    dirs.map((a, i) => ({
      nom: `P${i}`,
      dessiner: mascotte({
        t: 0.5, sens: 1, pose: 'debout', yeux: 'ouvert',
        bras: [{ x: POSEX + 14 + Math.cos(a) * M.PORTEE, y: POSEY - 8 + Math.sin(a) * M.PORTEE }],
      }),
    })),
    dirs.map((a, i) => ({
      nom: `L${i}`,
      dessiner: mascotte({
        t: 0.5, sens: 1, pose: 'debout', yeux: 'ouvert',
        bras: [null, { x: POSEX + 14 + Math.cos(a) * M.PORTEE, y: POSEY - 8 + Math.sin(a) * M.PORTEE }],
      }),
    })),
  ]);
}

/* ---------- 2. Les objets ---------- */

/** Un objet : on le dessine dans une case, décalé de (dx, dy). */
function obj(nom, dx, dy, f) {
  return { nom, dessiner: (ctx) => f(ctx, dx, dy) };
}

function planchesObjets() {
  const cadre = (l, h, lignes, nom, legendes) => planche('objets', nom, l, h, lignes, legendes);

  // — Guitare : huit images de grattage, caisse et manche compris.
  cadre(30, 26, [Array.from({ length: 8 }, (_, i) => {
    const g = Math.sin((i / 8) * Math.PI * 2);
    const main = { x: 10, y: 16 + g * 1.2 };
    const manche = { x: 14, y: 9 };
    return obj(`G${i}`, 0, 0, (ctx) => {
      O.caisseGuitare(ctx, main);
      O.mancheGuitare(ctx, main, manche);
    });
  })], 'guitare');

  cadre(20, 18, [[0, 1].map((i) => obj(`A${i}`, 1, 1, (ctx, x, y) => O.ampli(ctx, x, y, i ? 0.3 : 0.8)))], 'ampli');

  cadre(15, 5, [Array.from({ length: 6 }, (_, i) =>
    obj(`T${i}`, 1, 1, (ctx, x, y) => O.clavierObjet(ctx, x, y, i / 7 + 0.01)))], 'clavier');

  cadre(22, 19, [Array.from({ length: 8 }, (_, i) =>
    obj(`E${i}`, 1, 1, (ctx, x, y) => O.ecran(ctx, x, y, i * 0.34)))], 'ecran');

  cadre(24, 14, [[obj('bureau', 1, 1, (ctx, x, y) => O.bureau(ctx, x, y, 22, 12))]], 'bureau');
  cadre(22, 10, [[obj('tabouret', 1, 1, (ctx, x, y) => O.tabouret(ctx, x, y, 8))]], 'tabouret');
  cadre(18, 16, [[obj('guerid', 1, 5, (ctx, x, y) => O.gueridon(ctx, x, y, 10))]], 'gueridon');
  cadre(30, 24, [[
    obj('dossier', 1, 1, (ctx, x, y) => O.fauteuilDossier(ctx, x, y)),
    obj('assise', 1, 1, (ctx, x, y) => O.fauteuilAssise(ctx, x, y, 8)),
  ]], 'fauteuil');
  cadre(48, 16, [[obj('lit', 1, 10, (ctx, x, y) => O.lit(ctx, x, y))]], 'lit');
  cadre(24, 8, [[obj('couvert', 1, 1, (ctx, x, y) => O.couverture(ctx, x, y))]], 'couverture');

  cadre(10, 14, [Array.from({ length: 6 }, (_, i) =>
    obj(`C${i}`, 1, 8, (ctx, x, y) => O.tasse(ctx, x, y, i * 0.4, true)))], 'tasse');

  cadre(24, 34, [Array.from({ length: 6 }, (_, i) =>
    obj(`P${i}`, 1, 0, (ctx, x, y) => O.panier(ctx, { x: x + 2, y: y + 12 }, y + 32, i * 0.5)))], 'chariot');

  cadre(42, 36, [[0, 1, 2].map((i) => obj(`R${i}`, 1, 1, (ctx, x, y) => O.rayon(ctx, x, y, i)))], 'rayon');

  cadre(11, 10, [[
    obj('livre', 1, 1, (ctx, x, y) => O.livre(ctx, x, y, false)),
    obj('page', 1, 1, (ctx, x, y) => O.livre(ctx, x, y, true)),
  ]], 'livre');

  const coups = O.coupsDePinceau(8, 12);
  cadre(14, 30, [Array.from({ length: 8 }, (_, i) =>
    obj(`T${i}`, 3, 2, (ctx, x, y) => O.chevalet(ctx, x, y, 8, 12, 26, coups, Math.round((i / 7) * coups.length))))], 'chevalet');
  cadre(10, 6, [[obj('palette', 1, 2, (ctx, x, y) => O.paletteObjet(ctx, x, y))]], 'palette');

  cadre(48, 16, [[0, 1].map((i) =>
    obj(`F${i}`, 1, 3, (ctx, x, y) => O.planCuisson(ctx, x, y, 46, 12, i ? 0.1 : 0.4)))], 'plan-cuisson');
  cadre(32, 10, [[obj('bocaux', 1, 1, (ctx, x, y) => O.etagereBocaux(ctx, x, y))]], 'etagere-bocaux');
  cadre(14, 18, [Array.from({ length: 4 }, (_, i) =>
    obj(`V${i}`, 2, 10, (ctx, x, y) => O.casserole(ctx, x, y, i * 0.5)))], 'casserole');
  cadre(22, 24, [Array.from({ length: 8 }, (_, i) =>
    obj(`P${i}`, 2, 20, (ctx, x, y) => O.poele(ctx, x, y, i / 8)))], 'poele');

  cadre(20, 36, [Array.from({ length: 8 }, (_, i) =>
    obj(`F${i}`, 2, 26, (ctx, x, y) => O.potFleur(ctx, x, y, i / 7)))], 'pot-fleur');
  cadre(18, 14, [[0, 1].map((i) =>
    obj(i ? 'incline' : 'droit', 2, 6, (ctx, x, y) => O.arrosoir(ctx, x, y, i)))], 'arrosoir');

  cadre(14, 38, [[obj('lampe', 7, 36, (ctx, x, y) => O.lampeSalon(ctx, x, y))]], 'lampe-salon');
  cadre(32, 32, [[obj('halo', 16, 0, (ctx, x) =>
    O.lampadaire(ctx, { l: 32, t: 0, sol: 30 }, x))]], 'lampadaire');
  cadre(22, 10, [[obj('voiture', 0, 0, (ctx) =>
    O.voiture(ctx, { l: 22, sol: 8 }, 1, 0.31, 22))]], 'voiture');
  cadre(32, 24, [Array.from({ length: 6 }, (_, i) =>
    obj(`P${i}`, 0, 0, (ctx) => O.fenetrePluie(ctx, 1, 1, i * 0.3)))], 'fenetre');

  cadre(10, 8, [[
    obj('note', 2, 1, (ctx, x, y) => M.dessinerNote(ctx, x, y, '#e3b25c')),
    obj('note2', 2, 1, (ctx, x, y) => M.dessinerNote(ctx, x, y, '#b07f34')),
  ]], 'note');
}

/* ---------- 3. La palette ---------- */

function planchePalette() {
  const entrees = [
    ...Object.entries(M.GRIS).map(([n, c]) => [`gris ${n}`, c]),
    ...Object.entries(M.DECOR).map(([n, c]) => [n, c]),
  ];
  const CL_P = 28, CH_P = 10, cols = 6;
  const lignes = [];
  for (let i = 0; i < entrees.length; i += cols) {
    lignes.push(entrees.slice(i, i + cols).map(([nom, c]) => ({
      nom,
      dessiner: (ctx) => { ctx.fillStyle = c; ctx.fillRect(0, 0, CL_P, CH_P); },
    })));
  }
  planche('palette', 'palette', CL_P, CH_P, lignes);
}

/* ---------- 4. Les scènes entières ---------- */

function planchesScenes() {
  for (const a of O.ACTIVITES) {
    const IMAGES = 8;
    const toile = new Toile(L_SCENE, H_SCENE * IMAGES);
    for (let i = 0; i < IMAGES; i++) {
      const t = (i / IMAGES) * 4;
      M.reglerMascotte(t);
      const image = new Toile(L_SCENE, H_SCENE);
      a.dessiner({ ctx: image.ctx, l: L_SCENE, h: H_SCENE, sol: SOL_SCENE, t });
      toile.coller(image, 0, i * H_SCENE);
    }
    mkdirSync(join(SORTIE, 'scenes'), { recursive: true });
    writeFileSync(join(SORTIE, 'scenes', `${a.id}.png`), toile.png());
    manifeste.planches.push({
      fichier: `scenes/${a.id}.png`,
      caseLargeur: L_SCENE,
      caseHauteur: H_SCENE,
      colonnes: 1,
      lignes: IMAGES,
      legendes: [[`${a.nom} — 8 images sur 4 s`]],
    });
  }
}

/* ---------- Exécution ---------- */

rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
planchesMascotte();
planchesObjets();
planchePalette();
planchesScenes();
writeFileSync(join(SORTIE, 'sprites.json'), JSON.stringify(manifeste, null, 2) + '\n');
console.log(`${manifeste.planches.length} planches écrites dans mascotte/sprites/`);
