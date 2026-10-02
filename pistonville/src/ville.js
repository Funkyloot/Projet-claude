/* ville.js — la balade en ville, une fois par jour, de 18 h à 19 h.
 *
 * Pistonville est une grande carte d'environ 5 km de côté (une case = 1 m),
 * organisée comme une vraie carte (voir reseau.js) : la ville au centre, en
 * grands pâtés de quatre lots, entourée d'un boulevard périphérique et
 * traversée par deux boulevards à 2 × 2 voies ; le lac au fond d'un grand
 * parc ; la zone d'activités en bordure. Autour, la campagne en grandes
 * parcelles le long d'une boucle de routes départementales (champs, fermes,
 * village, prés, vergers, éoliennes, étang, station-service ; voir
 * ville-campagne.js), et la forêt au bord de la carte. La ville vit :
 * circulation à droite avec feux en ville et STOP à la campagne,
 * piétons sur les trottoirs, coucher de soleil, lampadaires (voir
 * ville-vie.js). Tout ce qui est construit est solide.
 *
 * La carte est trop grande pour une seule image sur téléphone : elle est
 * peinte par morceaux de 510 px, à la demande, autour de la voiture.
 *
 * Les choses à faire, inspirées des jeux de course en ville ouverte (on lance
 * un défi en roulant dessus, des objets cachés à trouver) :
 *   - Sprints, en ville et à travers champs ;
 *   - Livraisons : un colis fragile chez un client ou à une ferme ;
 *   - Arène de drift : 20 secondes pour le meilleur score ;
 *   - Radars de vitesse : passer le plus vite possible (record) ;
 *   - Affiches Piston cachées (collection permanente) ;
 *   - Fans qui demandent un autographe, pièces d'or, disquettes ;
 *   - Bâtiments où entrer (zones jaunes).
 * Et des contraintes : le temps file, un accrochage coûte un constat et abîme
 * la voiture (elle courra moins vite ce soir), griller un feu devant une
 * caméra coûte une amende, foncer sur les piétons fait fuir les fans.
 */

import { Voiture, DEMI_LONGUEUR, DEMI_LARGEUR } from './voiture.js';
import { PERSONNAGES, bulle, T } from './sprites.js';
import { texte, recouvrement } from './course.js';
import { clamp, lerp, creerAlea, hash2, formatTemps } from './outils.js';
import { Trafic, Pietons, Feux } from './ville-vie.js';
import { Reseau, CELLULE, LOT, COUR } from './reseau.js';
import { tuileTiny, dessinerVoitureVille, dessinerPerso, tenue, modeleVoiture, CONTOUR, tuileVille, pileVille, imageAtlas, motifEau, motifTuile } from './tiny.js';
import {
  batimentModerne, hauteurBatiment, maisonModerne, caisses, lampadaire, banc, poubelle, borne, feuTricolore, fleurs, panneauStop,
} from './ville-dessins.js';
import { CAMPAGNE, remplirParcelle, COULEURS_SOL } from './ville-campagne.js';

export const DUREE_BALADE = 150;     // secondes réelles pour une heure de jeu
const HAUT_HUD = 52;
const TAILLE_ILOT = LOT;             // 160 px : un lot de ville
const GRAINE_PLAN = 4242;            // le plan de la ville ne change jamais
const MORCEAU = 510;                 // la carte est peinte par morceaux de 510 px (8 × 8)
const MORCEAUX_GARDES = 18;          // morceaux gardés en mémoire (≈ 19 Mo)

/** Bâtiments où l'on peut entrer, et leur lot (colonne, ligne dans la grille des lots de la ville). */
export const BATIMENTS = [
  { id: 'garage', nom: 'Garage Piston', lot: [4, 3], toit: '#f2c14e' },
  { id: 'bureau', nom: 'Bureau des courses', lot: [5, 3], toit: '#c2504d' },
  { id: 'concession', nom: 'Concession', lot: [2, 5], toit: '#2f6fdb' },
  { id: 'pieces', nom: 'Pièces Auto', lot: [5, 5], toit: '#3fa34d' },
  { id: 'tombola', nom: 'Tombola', lot: [5, 1], toit: '#e86ca6' },
  { id: 'cafe', nom: 'Café des pilotes', lot: [4, 5], toit: '#8a5a3b' },
];

/*
 * Le plan, comme une vraie carte : la ville au centre (4 × 4 grands pâtés),
 * entourée d'un boulevard périphérique et traversée par deux boulevards qui
 * se croisent au centre ; entre eux, des rues. Autour, la campagne en grandes
 * parcelles le long d'une boucle de routes départementales, reliée au
 * périphérique par six routes ; au bord de la carte, la forêt.
 *
 * PLAN : les pâtés de la carte. u = ville (voir LOTS), B forêt, F ferme,
 * C champs, P prés, V vergers, H village, W éoliennes, E étang, S station-service.
 */
const PLAN = [
  'BBBBBBBBBB',
  'BFFCCHHWWB',
  'BFFCCHHWWB',
  'BPPuuuuVVB',
  'BPPuuuuVVB',
  'BCCuuuuPPB',
  'BCCuuuuPPB',
  'BFFSSCCEEB',
  'BFFSSCCEEB',
  'BBBBBBBBBB',
];
/*
 * LOTS : la ville, lot par lot (2 × 2 lots par pâté ; les portes des lieux
 * où l'on entre sont sur les lots du bas, face à la rue). m pavillons,
 * i immeubles et commerces, p parc (un pâté entier), L parc du lac (deux
 * pâtés), z zone d'activités, k parking, d arène de drift, . lieu où l'on entre.
 */
const LOTS = [
  'mmiiiizz',
  'miiii.zz',
  'mmppiikd',
  'mipp..ik',
  'miiiiiim',
  'mi.i..im',
  'mmiiLLLL',
  'mmmiLLLL',
];
const VILLE0 = 3;                          // premier pâté de la ville
const N = PLAN.length;
/** Largeur de chaque ligne de route, en cases : 13 = boulevard (2 × 2 voies), 6 = rue, 0 = pas de route. */
const LARGEURS = [0, 6, 0, 13, 6, 13, 6, 13, 0, 6, 0];
const VILLE = [3, 7];                      // carrefours de la ville (du périphérique au périphérique)
const BOUCLE = [1, 9];                     // la boucle des routes de campagne
const LIAISONS = [3, 5, 7];                // routes qui relient le périphérique à la boucle
const dans = (k, [a, b]) => k >= a && k <= b;
/** Tronçons fermés : le parc du lac tient sur deux pâtés. */
const FERMES = new Set(['v6,6']);
function troncon(axe, k, s) {
  // axe 'h' : ligne est-ouest k, tronçon s → s + 1 ; axe 'v' : ligne nord-sud k.
  if (FERMES.has(`${axe}${axe === 'h' ? s : k},${axe === 'h' ? k : s}`)) return false;
  if (dans(k, VILLE) && dans(s, [VILLE[0], VILLE[1] - 1])) return true;                                // la ville
  if (BOUCLE.includes(k) && dans(s, [BOUCLE[0], BOUCLE[1] - 1])) return true;                         // la boucle
  if (LIAISONS.includes(k) && (dans(s, [BOUCLE[0], VILLE[0] - 1]) || dans(s, [VILLE[1], BOUCLE[1] - 1]))) return true;   // liaisons
  return false;
}
const RESEAU = new Reseau(LARGEURS, (kx, ky) => troncon('h', ky, kx), (kx, ky) => troncon('v', kx, ky));
export const TAILLE_VILLE = RESEAU.taille;

/** Le type d'un lot de ville (lx, ly), ou null hors de la ville. */
const typeLot = (lx, ly) => LOTS[ly]?.[lx] ?? null;
/** Le type d'un pâté : pour la ville, celui de son lot du haut à gauche (parc, lac) ou 'u'. */
const typePate = (bx, by) => {
  const t = PLAN[by]?.[bx];
  if (t !== 'u') return t ?? null;
  const l = typeLot((bx - VILLE0) * 2, (by - VILLE0) * 2);
  return l === 'p' || l === 'L' ? l : 'u';
};
/** Origine d'un lot de ville. */
function origineLot(lx, ly) {
  const o = RESEAU.origine(VILLE0 + (lx >> 1), VILLE0 + (ly >> 1));
  return { x: o.x + (lx % 2) * (LOT + COUR), y: o.y + (ly % 2) * (LOT + COUR) };
}

const typeIlot = (bx, by) => (bx < 0 || by < 0 || bx >= N || by >= N ? null : PLAN[by][bx]);
const lotsDuPate = (bx, by) => [0, 1].flatMap((dy) => [0, 1].map((dx) => [(bx - VILLE0) * 2 + dx, (by - VILLE0) * 2 + dy]));
const estUrbain = (bx, by) => { const t = typeIlot(bx, by); return t !== null && !CAMPAGNE.includes(t); };
/** Un carrefour est en ville si l'un des quatre pâtés qui le bordent l'est. */
export const carrefourUrbain = (kx, ky) => estUrbain(kx - 1, ky - 1) || estUrbain(kx, ky - 1) || estUrbain(kx - 1, ky) || estUrbain(kx, ky);

/** Façades des bâtiments où l'on entre (le toit reprend la couleur de la carte). */
const STYLES_BATIMENTS = {
  garage: { facade: '#aab4c8', toit: '#f2c14e', garage: true, enseigne: '#f2c14e' },
  bureau: { facade: '#f2d7c4', toit: '#c2504d', vitrine: '#ffe6a8', enseigne: '#c2504d' },
  concession: { facade: '#e6ebf2', toit: '#2f6fdb', vitrine: '#cfe8ff', enseigne: '#2f6fdb' },
  pieces: { facade: '#e9f3e0', toit: '#3fa34d', vitrine: '#cfe8ff', auvent: '#3fa34d', enseigne: '#3fa34d' },
  tombola: { facade: '#fbe3ef', toit: '#e86ca6', vitrine: '#ffd6ea', auvent: '#e86ca6', enseigne: '#e86ca6' },
  cafe: { facade: '#f4e6c8', toit: '#8a5a3b', vitrine: '#fff0c8', auvent: '#d08a3e', enseigne: '#8a5a3b' },
};

const centreCarrefour = (kx, ky) => RESEAU.centre(kx, ky);

const AFFICHES = 12;

export class Ville {
  /**
   * @param {object} o planche, voiture (decrireVoiture), son, graine (du jour), memoire (records, affiches)
   */
  constructor(o) {
    this.planche = o.planche;
    this.tiny = o.tiny || {};
    this.son = o.son;
    this.memoire = o.memoire || { records: {}, affiches: {} };
    this.memoire.records = this.memoire.records || {};
    this.memoire.affiches = this.memoire.affiches || {};
    this.alea = creerAlea(GRAINE_PLAN);
    this.aleaJour = creerAlea(o.graine || 1);
    this.obstacles = [];
    this.grille = new Map();
    this.portes = [];
    this.maisons = [];
    this.lampes = [];
    this.statiques = [];
    this.champs = [];      // cultures : on y roule, mais ça secoue
    this.fermes = [];      // où livrer à la campagne
    this.animaux = [];     // vaches, moutons, poules (animés)
    this.gens = [];        // fermiers et villageois immobiles
    this.eaux = [];
    this.construire();
    this.morceaux = new Map();
    this.minicarte = this.peindreMiniCarte();

    this.reseau = RESEAU;
    this.feux = new Feux(RESEAU, 77, carrefourUrbain);
    // Plus de circulation en ville qu'à la campagne.
    this.trafic = new Trafic(RESEAU, this.aleaJour, 48, this.feux, { ville: carrefourUrbain });
    // Les piétons font le tour des pâtés de la ville (ceux qui ont un trottoir tout autour).
    const tours = [];
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      const b = RESEAU.bords(bx, by);
      if (!estUrbain(bx, by) || !(b.haut && b.bas && b.gauche && b.droite)) continue;
      const c = RESEAU.cellule(bx, by);
      tours.push({ x0: c.x + 8, y0: c.y + 8, cote: CELLULE - 16 });
    }
    this.pietons = new Pietons(tours, this.aleaJour, 64);
    this.semerDuJour();
    this.preparerDefis();

    const p = o.voiture.physique;
    // En ville, on roule plus doucement : 60 % de la pointe, plafonnée.
    const physique = { ...p, vmax: Math.min(150, p.vmax * 0.6), accel: p.accel * 0.8 };
    this.voiture = new Voiture({ physique, couleur: o.voiture.couleur, nom: 'moi', joueur: true });
    this.voiture.looks = o.voiture.looks || [];
    this.voiture.modele = modeleVoiture(o.voiture.profil, o.voiture.id);
    this.voiture.braquageMin = 0.6;   // on peut se dégager d'un mur en braquant
    // Au départ, la voiture sort du garage sur le boulevard, voie de droite.
    this.placerDevant(this.portes.find((g) => g.id === 'garage'));
    this.ignorer = 'garage';
    this.camera = { x: this.voiture.x, y: this.voiture.y };
    this.temps = 0;
    this.gains = { argent: 0, recherche: 0, fans: 0, exp: 0, amendes: 0, usure: 0 };
    this.journal = [];                 // ce qui s'est passé, pour le bilan
    this.messages = [];
    this.particules = [];
    this.secousse = 0;
    this.flash = 0;
    this.entree = null;
    this.fini = false;
    this.defi = null;
    this.carrefourAvant = null;
  }

  // --- Plan de la ville ----------------------------------------------------------

  construire() {
    for (const p of RESEAU.parcelles) {
      const type = typePate(p.x0, p.y0);
      const r = RESEAU.rectParcelle(p);
      // Tout ce qu'on dessine pour cette parcelle tient dans sa boîte (bord et mobilier compris).
      this.zone = { x0: r.x - 60, y0: r.y - 120, x1: r.x + r.w + 60, y1: r.y + r.h + 40 };
      if (CAMPAGNE.includes(type)) { remplirParcelle(this, p, type, RESEAU); continue; }
      if (type === 'L') { this.parcDuLac(r); continue; }
      if (type === 'p') { this.parc(r, p.x0 * 7 + p.y0); continue; }
      const [bx, by] = p.blocs[0];
      this.cour(RESEAU.origine(bx, by), bx * 5 + by);
      for (const [lx, ly] of lotsDuPate(bx, by)) {
        const o = origineLot(lx, ly);
        const t = typeLot(lx, ly);
        const bat = BATIMENTS.find((x) => x.lot[0] === lx && x.lot[1] === ly);
        const bas = ly % 2 === 1;   // lot du bas : face à la rue du bas
        if (bat) this.ilotBatiment(o, bat);
        else if (t === 'd') this.ilotArene(o);
        else if (t === 'k') this.ilotParking(o);
        else if (t === 'z') this.ilotZone(o, ly);
        else if (t === 'i') this.ilotImmeubles(o, lx, ly);
        else this.ilotMaisons(o, lx, ly, bas);
        this.trottoirs(o, bat, t, { haut: !bas, bas, gauche: lx % 2 === 0, droite: lx % 2 === 1 });
      }
    }
    // Terre-pleins des boulevards : on ne les franchit pas.
    const R = RESEAU;
    for (let k = 0; k <= R.N; k++) {
      if (R.voies(k) < 2) continue;
      for (let s = 0; s < R.N; s++) {
        const a = R.X[s] + R.L[s] + 20, l = R.X[s + 1] - 20 - a, m = R.X[k] + R.L[k] / 2 - 8;
        if (R.H[k][s]) this.ajouter({ type: 'rect', x: a, y: m, w: l, h: 16, terrePlein: true });
        if (R.V[k][s]) this.ajouter({ type: 'rect', x: m, y: a, w: 16, h: l, terrePlein: true });
      }
    }
    this.indexer();
  }

  /** Place la voiture sur la route devant une porte, voie de droite (vers l'ouest : on sort côté nord). */
  placerDevant(p) {
    const by = RESEAU.blocA(p.y);
    const k = by + 1;
    this.voiture.placer(p.x + p.w / 2, RESEAU.voie(2, k, 0), Math.PI);
    this.voiture.vx = 0; this.voiture.vy = 0;
    this.attente = true;
    // Personne pile devant la porte : la circulation proche repart plus loin sur sa route.
    for (const t of this.trafic?.voitures || []) {
      if (Math.hypot(t.x - this.voiture.x, t.y - this.voiture.y) > 180) continue;
      if (t.dir % 2 === 0) t.x += (t.x < this.voiture.x ? -1 : 1) * 260; else t.y += (t.y < this.voiture.y ? -1 : 1) * 260;
      t.v = 0;
    }
  }

  ajouter(ob) { this.obstacles.push(ob); return ob; }
  dessin(y, f, b = this.zone) { this.statiques.push({ y, dessin: f, b }); }

  /** Pelouse d'un îlot (sous tout le reste). */
  pelouse(o, couleur = '#84c669') {
    this.dessin(-1, (c) => {
      c.fillStyle = couleur; c.fillRect(o.x, o.y, TAILLE_ILOT, TAILLE_ILOT);
      for (let i = 0; i < 6; i++) {
        const x = o.x + 8 + hash2(o.x, i, 3) * (TAILLE_ILOT - 24), y = o.y + 8 + hash2(o.y, i, 4) * (TAILLE_ILOT - 24);
        tuileTiny(c, this.tiny, 'town', i % 3 === 0 ? 2 : 1, x, y);
      }
    });
  }

  /** Arbre Kenney Tiny Town : un obstacle rond au pied. */
  arbre(x, y, n = 4) {
    this.ajouter({ type: 'cercle', x, y: y - 4, r: 6 });
    this.dessin(y, (c) => {
      c.fillStyle = 'rgba(38,24,46,0.22)'; c.fillRect(x - 6, y - 2, 12, 3);
      tuileTiny(c, this.tiny, 'town', n, x - 8, y - 15);
    });
  }

  /** Bâtiment où l'on entre : enseigne, porte sur le trottoir du bas, zone jaune devant. */
  ilotBatiment(o, bat) {
    this.pelouse(o);
    const style = STYLES_BATIMENTS[bat.id] || { facade: '#e6ebf2', toit: bat.toit };
    const w = TAILLE_ILOT - 16, etages = bat.id === 'bureau' ? 3 : 2;
    const h = hauteurBatiment(etages);
    const b = this.ajouter({ type: 'rect', x: o.x + 8, y: o.y + TAILLE_ILOT - 8 - h, w, h, bat });
    this.dessin(b.y + b.h, (c) => batimentModerne(c, b.x, b.y, b.w, etages, { ...style, nom: bat.nom, enseigne: style.enseigne || bat.toit }));
    // L'entrée : devant la porte (ou la porte de garage), sur le trottoir.
    const centre = bat.id === 'garage' ? b.x + w / 2 : b.x + w - 16;
    this.portes.push({ id: bat.id, nom: bat.nom, x: centre - 26, y: b.y + b.h + 2, w: 52, h: 22, couleur: bat.toit });
    this.arbre(o.x + 14, o.y + 30, 16);
    this.arbre(o.x + TAILLE_ILOT - 14, o.y + 26, 4);
    this.dessin(o.y + 40, (c) => fleurs(c, o.x + 60, o.y + 20, bat.id.length));
  }

  ilotMaisons(o, bx, by, surRue = true) {
    this.pelouse(o);
    // Deux maisons en bas (porte sur le trottoir), jardins et arbres derrière.
    for (let i = 0; i < 2; i++) {
      const r = hash2(bx * 2 + i, by, 77);
      const toit = ['#e4432d', '#4f7ddb', '#8a6ad6', '#3fa34d', '#d08a3e'][Math.floor(r * 5)];
      const facade = ['#f4e6c8', '#e6ebf2', '#f2d7c4', '#dfe7d0'][Math.floor(hash2(i, bx + by, 5) * 4)];
      const x = o.x + 8 + i * 80, y = o.y + TAILLE_ILOT - 6 - 64;
      const m = this.ajouter({ type: 'rect', x, y, w: 64, h: 64 });
      this.dessin(m.y + m.h, (c) => maisonModerne(c, m.x, m.y, m.w, toit, facade));
      if (surRue) this.maisons.push({ x: x + 32, y: o.y + TAILLE_ILOT + 8 });   // on livre depuis la rue
      this.arbre(x + (r < 0.5 ? 14 : 50), o.y + 40, r < 0.3 ? 4 : r < 0.6 ? 16 : 28);
      this.dessin(o.y + 50, (c) => fleurs(c, x + 20, o.y + 52, i + bx));
    }
  }

  ilotImmeubles(o, bx, by) {
    this.pelouse(o, '#c0cbdc');
    const r = hash2(bx, by, 9);
    const facades = ['#e6ebf2', '#f2d7c4', '#dfe7d0', '#c9d3e6'];
    const toits = ['#8b9bb4', '#4f7ddb', '#c2504d', '#6a7690'];
    if (r < 0.35) {
      // Une grande tour de trois étages, place devant.
      const etages = 3, h = hauteurBatiment(etages);
      const m = this.ajouter({ type: 'rect', x: o.x + 8, y: o.y + TAILLE_ILOT - 8 - h, w: TAILLE_ILOT - 16, h });
      this.dessin(m.y + m.h, (c) => batimentModerne(c, m.x, m.y, m.w, etages, { facade: facades[Math.floor(r * 4)], toit: toits[Math.floor(r * 9) % 4], vitrine: '#cfe8ff' }));
      this.arbre(o.x + 20, o.y + 20, 28);
      this.arbre(o.x + TAILLE_ILOT - 20, o.y + 20, 28);
    } else {
      for (let i = 0; i < 2; i++) {
        const rr = hash2(bx * 2 + i, by * 3, 13);
        const etages = rr < 0.5 ? 2 : 3, h = hauteurBatiment(etages);
        const m = this.ajouter({ type: 'rect', x: o.x + 6 + i * 78, y: o.y + TAILLE_ILOT - 6 - h, w: 70, h });
        this.dessin(m.y + m.h, (c) => batimentModerne(c, m.x, m.y, m.w, etages, { facade: facades[Math.floor(rr * 4)], toit: toits[Math.floor(rr * 7) % 4], vitrine: rr < 0.4 ? '#ffe6a8' : null }));
      }
      this.dessin(o.y + 20, (c) => banc(c, o.x + 80, o.y + 22));
      this.ajouter({ type: 'cercle', x: o.x + 80, y: o.y + 17, r: 6 });
    }
  }

  /**
   * Parc de ville (un ou deux pâtés) : pelouse, allées de gravier en croix,
   * fontaine au milieu, arbres, bancs et massifs. r : la cellule (bord compris).
   */
  parc(r, graine) {
    const i = { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: r.h - 32 };
    const cx = i.x + i.w / 2, cy = i.y + i.h / 2;
    this.dessin(-1, (c) => {
      c.fillStyle = '#7fc464'; c.fillRect(i.x, i.y, i.w, i.h);
      for (let k = 0; k < Math.round(i.w * i.h / 4000); k++) tuileTiny(c, this.tiny, 'town', k % 3 === 0 ? 2 : 1, i.x + 6 + hash2(graine, k, 3) * (i.w - 22), i.y + 6 + hash2(k, graine, 5) * (i.h - 22));
      // Allées en croix et tour de la fontaine.
      c.fillStyle = '#ead9ab';
      c.fillRect(i.x, cy - 8, i.w, 16); c.fillRect(cx - 8, i.y, 16, i.h);
      c.fillRect(cx - 34, cy - 30, 68, 60);
    });
    // Au centre, la statue sur son socle et quatre massifs (Kenney Modern City).
    this.ajouter({ type: 'rect', x: cx - 8, y: cy - 4, w: 16, h: 14 });
    this.dessin(cy + 12, (c) => {
      pileVille(c, [110, 147], cx, cy + 12);
      for (const [dx, dy] of [[-24, -18], [8, -18], [-24, 14], [8, 14]]) tuileVille(c, 109, cx + dx, cy + dy - 8);
    });
    // Arbres le long des bords, loin des allées et de la fontaine.
    const a = creerAlea(graine * 31 + 7);
    for (let k = 0; k < Math.round(i.w * i.h / 1500); k++) {
      const x = i.x + 12 + a() * (i.w - 24), y = i.y + 20 + a() * (i.h - 28);
      if (Math.abs(x - cx) < 22 || Math.abs(y - cy) < 22) continue;
      if (Math.abs(x - cx) < 46 && Math.abs(y - cy) < 42) continue;
      this.arbre(x, y, [4, 16, 28, 3, 27, 15][Math.floor(a() * 6)]);
    }
    for (const [dx, dy] of [[-56, -14], [56, -14], [-56, 28], [56, 28]]) {
      this.ajouter({ type: 'cercle', x: cx + dx, y: cy + dy - 5, r: 6 });
      this.dessin(cy + dy, (c) => banc(c, cx + dx, cy + dy));
    }
    this.dessin(i.y + 30, (c) => { fleurs(c, i.x + 20, i.y + 14, graine); fleurs(c, i.x + i.w - 40, i.y + i.h - 30, graine + 1); });
    this.lampes.push({ x: cx - 30, y: cy - 60 }, { x: cx + 30, y: cy + 4 });
  }

  /**
   * Le parc du lac : un grand lac aux rives douces au milieu d'un parc de
   * quatre pâtés, une plage, un ponton à pédalos, une allée qui en fait le
   * tour, des arbres et des bancs. Le lac est solide (on ne roule pas dans l'eau).
   */
  parcDuLac(r) {
    const i = { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: r.h - 32 };
    const cx = i.x + i.w / 2, cy = i.y + i.h / 2 + 8;
    const rx = i.w / 2 - 78, ry = i.h / 2 - 82;
    // Bandes horizontales de 8 px : un ovale en escalier, à la manière des tuiles.
    const bandes = [];
    for (let y = -ry; y < ry; y += 8) {
      const t = (y + 4) / ry;
      const demi = Math.round((rx * Math.sqrt(Math.max(0, 1 - t * t))) / 8) * 8;
      if (demi > 0) bandes.push({ y: cy + y, demi });
    }
    this.dessin(-1, (c) => {
      c.fillStyle = '#7fc464'; c.fillRect(i.x, i.y, i.w, i.h);
      for (let k = 0; k < 40; k++) tuileTiny(c, this.tiny, 'town', k % 3 === 0 ? 2 : 1, i.x + 6 + hash2(k, 3, 11) * (i.w - 22), i.y + 6 + hash2(5, k, 13) * (i.h - 22));
      // L'allée qui fait le tour du lac, puis la rive de sable, puis l'eau.
      for (const b of bandes) { c.fillStyle = '#ead9ab'; c.fillRect(cx - b.demi - 30, b.y - 6, (b.demi + 30) * 2, 20); }
      c.fillStyle = '#ead9ab'; c.fillRect(cx - 8, i.y, 16, cy - ry - i.y); c.fillRect(i.x, cy - 8, i.w, 16);
      c.fillStyle = '#7fc464';
      for (const b of bandes) c.fillRect(cx - b.demi - 14, b.y - 2, (b.demi + 14) * 2, 12);
      for (const b of bandes) { c.fillStyle = '#f3dca2'; c.fillRect(cx - b.demi - 6, b.y, (b.demi + 6) * 2, 8); }
      c.fillStyle = motifEau(c);   // l'eau : tuile Kenney Modern City
      for (const b of bandes) c.fillRect(cx - b.demi, b.y, b.demi * 2, 8);
    });
    for (const b of bandes) this.ajouter({ type: 'rect', x: cx - b.demi, y: b.y, w: b.demi * 2, h: 8, eau: true });
    this.eaux.push({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 });
    // Barques au bord (tuiles Kenney Modern City) au sud du lac.
    const py = cy + ry - 14;
    this.dessin(py + 16, (c) => { tuileVille(c, 178, cx - 24, py - 16); tuileVille(c, 215, cx - 24, py); tuileVille(c, 251, cx + 8, py); });
    // Arbres tout autour, hors de l'allée ; bancs face à l'eau.
    const a = creerAlea(991);
    for (let k = 0; k < 70; k++) {
      const x = i.x + 12 + a() * (i.w - 24), y = i.y + 18 + a() * (i.h - 26);
      const dx = (x - cx) / (rx + 46), dy = (y - cy) / (ry + 44);
      if (dx * dx + dy * dy < 1) continue;
      if (Math.abs(x - cx) < 20 || Math.abs(y - cy) < 20) continue;
      this.arbre(x, y, [4, 16, 28, 16, 3, 15][Math.floor(a() * 6)]);
    }
    for (const [dx, dy] of [[-rx - 26, -30], [rx + 26, -30], [-rx - 26, 40], [rx + 26, 40]]) {
      this.ajouter({ type: 'cercle', x: cx + dx, y: cy + dy - 5, r: 6 });
      this.dessin(cy + dy, (c) => banc(c, cx + dx, cy + dy));
    }
    // Un marchand de glaces sur l'allée nord (stand Kenney).
    const gx = cx + 40, gy = cy - ry - 20;
    this.ajouter({ type: 'rect', x: gx - 8, y: gy - 14, w: 16, h: 14 });
    this.dessin(gy, (c) => pileVille(c, [554, 591], gx, gy));
    this.gens.push({ x: gx + 20, y: gy + 2, tenue: tenue(17), dir: 'face' }, { x: cx - 60, y: cy + ry + 26, tenue: tenue(23), dir: 'dos' });
  }

  /** Arène de drift : un grand parking vide, des cônes autour. */
  ilotArene(o) {
    this.arene = { x: o.x, y: o.y, w: TAILLE_ILOT, h: TAILLE_ILOT };
    this.dessin(-1, (c) => {
      c.fillStyle = '#58678a'; c.fillRect(o.x - 4, o.y - 4, TAILLE_ILOT + 8, TAILLE_ILOT + 8);
      c.fillStyle = '#f2c14e';
      for (let i = 0; i < TAILLE_ILOT; i += 16) { c.fillRect(o.x + i, o.y - 4, 8, 3); c.fillRect(o.x + i, o.y + TAILLE_ILOT + 1, 8, 3); }
      c.strokeStyle = '#e8e4d6'; c.lineWidth = 2;
      c.beginPath(); c.arc(o.x + 80, o.y + 80, 40, 0, Math.PI * 2); c.stroke();
    });
    this.ajouter({ type: 'cercle', x: o.x + 80, y: o.y + 80, r: 6 });
    this.dessin(o.y + 86, (c) => imageAtlas(c, 'cone', o.x + 80, o.y + 78));
  }

  ilotParking(o) {
    this.dessin(-1, (c) => {
      c.fillStyle = '#58678a'; c.fillRect(o.x, o.y, TAILLE_ILOT, TAILLE_ILOT);
      c.fillStyle = '#e8e4d6';
      for (let x = o.x + 6; x <= o.x + TAILLE_ILOT - 6; x += 37) { c.fillRect(x, o.y + 8, 2, 54); c.fillRect(x, o.y + TAILLE_ILOT - 62, 2, 54); }
    });
    for (let i = 0; i < 4; i++) {
      const x = o.x + 25 + i * 37;
      if (this.alea() < 0.7) this.voitureGaree(x, o.y + 36, false);
      if (this.alea() < 0.7) this.voitureGaree(x, o.y + TAILLE_ILOT - 36, false);
    }
  }

  /** Zone d'activités, en bordure de ville : entrepôts et piles de caisses. */
  ilotZone(o, by) {
    this.dessin(-1, (c) => {
      c.fillStyle = motifTuile(c, 'city', 703); c.fillRect(o.x, o.y, TAILLE_ILOT, TAILLE_ILOT);
    });
    const entrepot = by % 2 === 0;
    if (entrepot) {
      const m = this.ajouter({ type: 'rect', x: o.x + 8, y: o.y + 6, w: TAILLE_ILOT - 16, h: hauteurBatiment(1) });
      this.dessin(m.y + m.h, (c) => batimentModerne(c, m.x, m.y, m.w, 1, { facade: '#aab4c8', toit: '#8b9bb4', garage: true, enseigne: '#5c6278', nom: 'ENTREPÔT' }));
    }
    const y0 = entrepot ? o.y + 100 : o.y + 20;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < (entrepot ? 1 : 2); j++) {
        const x = o.x + 8 + i * 38, y = y0 + j * 64;
        const k = i + j + by;
        const r = this.ajouter({ type: 'rect', x, y: y + 12, w: 32, h: 32 });
        this.dessin(r.y + r.h, (c) => caisses(c, r.x, r.y, k));
      }
    }
  }

  voitureGaree(x, y, horizontale) {
    const couleur = ['#c2504d', '#4f7ddb', '#f4f1e8', '#3fa34d', '#8a6ad6', '#2a2838'][Math.floor(this.alea() * 6)];
    const ob = horizontale ? { type: 'rect', x: x - 22, y: y - 13, w: 44, h: 26 } : { type: 'rect', x: x - 13, y: y - 22, w: 26, h: 44 };
    ob.voiture = true;
    this.ajouter(ob);
    const modele = `voiture${1 + Math.floor(this.alea() * 5)}`;
    void modele;
    this.dessin(y + 26, (c) => dessinerVoitureVille(c, couleur, x, y, horizontale ? 0 : Math.PI / 2));
  }

  /** Mobilier du trottoir : lampadaires, poubelles, bornes ; jamais devant une porte. */
  /** La cour au milieu d'un pâté de ville : pelouse, allées, quelques arbres. */
  cour(o, g) {
    const w = LOT * 2 + COUR;
    this.dessin(-2, (c) => {
      c.fillStyle = '#8fcf6f'; c.fillRect(o.x, o.y, w, w);
      c.fillStyle = '#ead9ab'; c.fillRect(o.x + LOT + 8, o.y, COUR - 16, w); c.fillRect(o.x, o.y + LOT + 8, w, COUR - 16);
    });
    for (const [dx, dy] of [[LOT + COUR / 2 - 30, LOT + COUR / 2 + 6], [LOT + COUR / 2 + 30, LOT + COUR / 2 + 6]]) {
      if (hash2(g, dx, 7) < 0.3) continue;
      this.arbre(o.x + dx, o.y + dy, [16, 28, 4][Math.floor(hash2(g, dy, dx) * 3)]);
    }
  }

  /** Mobilier du trottoir sur les côtés du lot qui donnent sur la rue (cotes). */
  trottoirs(o, bat, type, cotesRue = { haut: true, bas: true, gauche: true, droite: true }) {
    const a = this.alea;
    const cotes = [
      (s) => ({ x: o.x + s, y: o.y - 3 }),                       // trottoir du haut
      (s) => ({ x: o.x + s, y: o.y + TAILLE_ILOT + 13 }),        // trottoir du bas (côté portes)
      (s) => ({ x: o.x - 8, y: o.y + s }),
      (s) => ({ x: o.x + TAILLE_ILOT + 8, y: o.y + s }),
    ];
    const ouverts = [cotesRue.haut, cotesRue.bas, cotesRue.gauche, cotesRue.droite];
    cotes.forEach((pos, ci) => {
      if (!ouverts[ci]) return;
      // Les coins restent libres pour les feux et les passages piétons.
      for (let s = 48; s < TAILLE_ILOT - 32; s += 32) {
        if (type === 'd') continue;   // l'arène reste ouverte de tous côtés
        if (ci === 1 && s === 80) continue;   // devant les portes : rien
        const p = pos(s);
        const r = a();
        let quoi = null;
        if (s !== 80) quoi = 'lampadaire';
        else if (r < 0.12) quoi = 'borne';
        else if (r < 0.22) quoi = 'poubelle';
        if (!quoi) continue;
        if (quoi === 'lampadaire') this.lampes.push({ x: p.x, y: p.y - 30 });
        this.ajouter({ type: 'cercle', x: p.x, y: p.y - 3, r: 4 });
        this.dessin(p.y, (c) => ({ lampadaire, borne, poubelle })[quoi](c, p.x, p.y));
      }
    });
  }

  indexer() {
    for (const ob of this.obstacles) {
      const bb = boite(ob);
      for (let gx = Math.floor(bb.x0 / 64); gx <= Math.floor(bb.x1 / 64); gx++) {
        for (let gy = Math.floor(bb.y0 / 64); gy <= Math.floor(bb.y1 / 64); gy++) {
          const k = gx * 1000 + gy;
          if (!this.grille.has(k)) this.grille.set(k, []);
          this.grille.get(k).push(ob);
        }
      }
    }
  }

  proches(x, y) {
    const res = new Set();
    for (let gx = Math.floor(x / 64) - 1; gx <= Math.floor(x / 64) + 1; gx++) {
      for (let gy = Math.floor(y / 64) - 1; gy <= Math.floor(y / 64) + 1; gy++) {
        for (const ob of this.grille.get(gx * 1000 + gy) || []) res.add(ob);
      }
    }
    return res;
  }

  libre(x, y, r = 8) {
    if (x < 12 || y < 12 || x > TAILLE_VILLE - 12 || y > TAILLE_VILLE - 12) return false;
    for (const ob of this.proches(x, y)) if (toucheCercle(ob, x, y, r)) return false;
    return true;
  }

  // --- Ce qui change chaque jour : pièces, disquettes, fans ---------------------------

  semerDuJour() {
    const a = this.aleaJour;
    const R = RESEAU;
    this.bonus = [];
    // Pièces et disquettes sur les voies, au milieu des tronçons (jamais dans un carrefour).
    for (let k = 0; k <= R.N; k++) for (let t = 0; t < R.N; t++) {
      for (const horizontal of [true, false]) {
        if (!(horizontal ? R.H[k][t] : R.V[k][t]) || a() < 0.45) continue;
        const debut = R.X[t] + R.L[t] + 40, fin = R.X[t + 1] - 40;
        const dir = horizontal ? (a() < 0.5 ? 0 : 2) : (a() < 0.5 ? 1 : 3);
        const travers = R.voie(dir, k, Math.floor(a() * R.voies(k)));
        const s0 = debut + a() * Math.max(0, fin - debut - 50);
        const point = (d) => (horizontal ? { x: d, y: travers } : { x: travers, y: d });
        if (a() < 0.18) { this.bonus.push({ type: 'disque', ...point(s0), pris: false }); continue; }
        for (let i = 0; i < 3; i++) this.bonus.push({ type: 'piece', ...point(s0 + i * 22), pris: false });
      }
    }
    // Fans : huit sur les trottoirs de la ville, trois au bord des routes de campagne.
    this.fans = [];
    for (let i = 0, essais = 0; i < 11 && essais < 800; essais++) {
      const bx = Math.floor(a() * N), by = Math.floor(a() * N);
      if (i < 8 ? !estUrbain(bx, by) : estUrbain(bx, by)) continue;
      if (!R.bords(bx, by).bas || typeIlot(bx, by) === 'B') continue;
      const cel = R.cellule(bx, by);
      const x = cel.x + 30 + a() * (cel.w - 60), y = cel.y + cel.h - 2;
      if (!this.libre(x, y - 4, 6)) continue;
      i++;
      this.fans.push({ x, y, base: PERSONNAGES[Math.floor(a() * PERSONNAGES.length)], tenue: tenue(Math.floor(a() * 60)), content: 0, vu: false });
    }
  }

  // --- Défis -----------------------------------------------------------------------------

  preparerDefis() {
    const c = centreCarrefour;
    const R = RESEAU;
    // Point sur la voie de droite d'un tronçon : ligne k, entre les carrefours s et s + 1.
    const surVoie = (horizontal, k, s, dir, f = 0.5) => {
      const d = R.X[s] + R.L[s] + f * (R.X[s + 1] - R.X[s] - R.L[s]);
      return horizontal ? { x: d, y: R.voie(dir, k, 0) } : { x: R.voie(dir, k, 0), y: d };
    };
    this.defis = [
      { id: 'sprint-nord', type: 'sprint', nom: 'Sprint du Nord', ...c(4, 4), etapes: [c(7, 4), c(7, 3), c(3, 3)] },
      { id: 'sprint-port', type: 'sprint', nom: 'Le grand périphérique', ...c(5, 7), etapes: [c(3, 7), c(3, 3), c(7, 3), c(7, 7)] },
      { id: 'sprint-centre', type: 'sprint', nom: 'Tour du Centre', ...c(4, 6), etapes: [c(4, 4), c(6, 4), c(6, 6)] },
      { id: 'livraison', type: 'livraison', nom: 'Livraison express', ...surVoie(true, 5, 4, 0) },
      { id: 'livraison-2', type: 'livraison', nom: 'Colis de la zone', ...surVoie(false, 7, 3, 1) },
      { id: 'drift', type: 'drift', nom: 'Arène de drift', x: this.arene.x + 80, y: this.arene.y + 136 },
      // À la campagne.
      { id: 'rallye', type: 'sprint', nom: 'Rallye des moissons', ...c(3, 1), etapes: [c(1, 1), c(1, 9), c(5, 9)] },
      { id: 'tour-lac', type: 'sprint', nom: 'Tour du parc du lac', ...c(5, 6), etapes: [c(7, 6), c(7, 7), c(5, 7)] },
      { id: 'oeufs', type: 'livraison', vers: 'ferme', nom: 'Œufs frais', ...surVoie(false, 7, 1, 1) },
    ];
    for (const d of this.defis) d.fait = false;
    // Radars de vitesse sur de longues lignes droites : boulevards et routes de campagne.
    this.radars = [
      { id: 'radar-a', ...surVoie(true, 5, 3, 0) },
      { id: 'radar-b', ...surVoie(false, 5, 6, 1) },
      { id: 'radar-c', ...surVoie(true, 3, 4, 2) },
      { id: 'radar-champs', ...surVoie(true, 1, 3, 0) },
      { id: 'radar-bois', ...surVoie(false, 9, 4, 3) },
    ].map((r) => ({ ...r, attente: 0 }));
    // Caméras de feu rouge (en ville seulement).
    this.cameras = [[4, 4], [5, 5], [6, 4], [4, 6], [5, 3], [7, 5], [3, 5]].map(([kx, ky]) => ({ kx, ky }));
    // Affiches Piston : toujours aux mêmes endroits, cachées dans les coins tranquilles ;
    // sept en ville, cinq à la campagne.
    const a = creerAlea(GRAINE_PLAN + 1);
    this.affiches = [];
    let essais = 0;
    while (this.affiches.length < AFFICHES && essais++ < 6000) {
      const bx = Math.floor(a() * N), by = Math.floor(a() * N);
      const enVille = estUrbain(bx, by);
      const nVille = this.affiches.filter((f) => f.ville).length;
      if (enVille ? nVille >= 7 : this.affiches.length - nVille >= AFFICHES - 7) continue;
      if (typeIlot(bx, by) === 'B' && a() < 0.7) continue;   // un peu moins souvent dans la forêt
      const cel = RESEAU.cellule(bx, by);
      const x = cel.x + 24 + a() * (cel.w - 48), y = cel.y + 24 + a() * (cel.h - 48);
      if (this.affiches.some((f) => Math.hypot(f.x - x, f.y - y) < 300)) continue;
      if (!this.libre(x, y, 12)) continue;
      this.affiches.push({ id: `affiche-${this.affiches.length + 1}`, x, y, bx, by, ville: enVille });
    }
  }

  lancerDefi(d) {
    const v = this.voiture;
    if (d.type === 'sprint') {
      let dist = 0, px = d.x, py = d.y;
      for (const e of d.etapes) { dist += Math.abs(e.x - px) + Math.abs(e.y - py); px = e.x; py = e.y; }
      const limite = Math.round(dist / 105 + 6);
      this.defi = { d, type: 'sprint', etape: 0, t: 0, limite, cible: d.etapes[0] };
      this.annonce(`${d.nom} : ${d.etapes.length} points en ${limite} s !`, '#ffe066');
    } else if (d.type === 'livraison') {
      const liste = d.vers === 'ferme' ? this.fermes : this.maisons;
      const dest = liste[Math.floor(this.aleaJour() * liste.length)];
      const dist = Math.abs(dest.x - d.x) + Math.abs(dest.y - d.y);
      const limite = Math.round(dist / 100 + 8);
      this.defi = { d, type: 'livraison', t: 0, limite, cible: dest, intact: 1 };
      this.annonce('Colis fragile ! Livre-le sans casse.', '#ffe066');
    } else if (d.type === 'drift') {
      this.defi = { d, type: 'drift', t: 0, limite: 20, score: 0, cible: { x: this.arene.x + 80, y: this.arene.y + 80 } };
      this.annonce('20 s : drifte dans l\'arène !', '#c4b5fd');
    }
    this.son?.bip(660, 0.15);
    void v;
  }

  majDefi(dt) {
    const v = this.voiture;
    for (const d of this.defis) {
      if (this.defi || d.fait) continue;
      if ((d.x - v.x) ** 2 + (d.y - v.y) ** 2 < 28 * 28) this.lancerDefi(d);
    }
    const f = this.defi;
    if (!f) return;
    f.t += dt;
    const proche = (p, r = 32) => (p.x - v.x) ** 2 + (p.y - v.y) ** 2 < r * r;
    if (f.type === 'sprint') {
      if (proche(f.cible, 40)) {
        f.etape++;
        this.son?.piece();
        if (f.etape >= f.d.etapes.length) return this.finDefi(true);
        f.cible = f.d.etapes[f.etape];
      }
    } else if (f.type === 'livraison') {
      if (proche(f.cible, 28)) return this.finDefi(true);
    } else if (f.type === 'drift') {
      const dans = v.x > this.arene.x - 8 && v.x < this.arene.x + this.arene.w + 8 && v.y > this.arene.y - 8 && v.y < this.arene.y + this.arene.h + 8;
      // Tourner vite rapporte un peu, glisser rapporte beaucoup.
      if (dans && v.vitesse > 45 && v.direction !== 0) f.score += dt * (v.drift ? 10 : 4) * clamp(v.vitesse / 80, 0.6, 1.4);
    }
    if (f.t >= f.limite) this.finDefi(f.type === 'drift');
  }

  finDefi(reussi) {
    const f = this.defi;
    this.defi = null;
    f.d.fait = true;
    const rec = this.memoire.records;
    if (f.type === 'sprint') {
      if (!reussi) { this.annonce('Trop tard ! Le chrono est écoulé.', '#fca5a5'); return; }
      const reste = f.limite - f.t;
      const gain = 250 + Math.round(reste * 30);
      const record = !rec[f.d.id] || f.t < rec[f.d.id];
      if (record) rec[f.d.id] = Math.round(f.t * 10) / 10;
      this.gagner({ argent: gain, fans: 6, exp: 12 }, `${f.d.nom} : ${formatTemps(f.t)}${record ? ' · RECORD !' : ''}`);
    } else if (f.type === 'livraison') {
      if (!reussi) { this.annonce('Le client a annulé : trop tard.', '#fca5a5'); return; }
      const gain = Math.round((300 + (f.limite - f.t) * 20) * f.intact);
      this.gagner({ argent: gain, fans: 3, exp: 10 }, f.intact < 1 ? `Livré, mais abîmé : +${gain} G` : `Livré intact : +${gain} G`);
    } else if (f.type === 'drift') {
      const score = Math.round(f.score);
      const medaille = score >= 150 ? 'or' : score >= 90 ? 'argent' : score >= 40 ? 'bronze' : null;
      const pr = { or: 8, argent: 4, bronze: 2 }[medaille] || 0;
      const record = score > 0 && (!rec.drift || score > rec.drift);
      if (record) rec.drift = score;
      this.gagner({ recherche: pr, exp: Math.round(score / 6), fans: medaille ? 5 : 0 },
        `Drift : ${score} pts${medaille ? ` · médaille ${medaille}` : ''}${record ? ' · RECORD !' : ''}`);
    }
  }

  gagner(g, texteMsg) {
    for (const [k, val] of Object.entries(g)) this.gains[k] += val;
    this.journal.push(texteMsg);
    this.annonce(texteMsg, '#9fe870');
    this.son?.niveau();
  }

  /** Dépense obligatoire (amende, constat) : on la note et on l'annonce. */
  payer(montant, raison) {
    this.gains.amendes += montant;
    this.journal.push(`${raison} : −${montant} G`);
    this.annonce(`${raison} : −${montant} G`, '#fca5a5');
    this.son?.choc(120);
  }

  annonce(t, couleur) { this.bandeau = { texte: t, couleur, vie: 2.4 }; }

  // --- Mise à jour ---------------------------------------------------------------

  maj(dt, entrees) {
    if (this.fini || this.entree) return;
    if (!this.attente) this.temps += dt;   // l'heure ne file pas tant qu'on n'a pas démarré
    const v = this.voiture;
    v.direction = (entrees.droite ? 1 : 0) - (entrees.gauche ? 1 : 0);
    const deux = entrees.gauche && entrees.droite;
    // Les deux côtés : on freine, puis on recule tant qu'on garde les doigts posés.
    if (deux) {
      v.direction = 0;
      this.tenuDeux = (this.tenuDeux || 0) + dt;
    } else this.tenuDeux = 0;
    // Coincé contre un mur ou une voiture : petite marche arrière automatique.
    if (this.reculAuto > 0) this.reculAuto -= dt;
    else if (!deux && this.contact && v.vitesse < 12 && this.temps > 1) {
      this.coince = (this.coince || 0) + dt;
      if (this.coince > 0.5) { this.reculAuto = 0.9; this.coince = 0; this.message('Marche arrière', '#cfe0ff', v); }
    } else this.coince = 0;
    v.recul = this.reculAuto > 0 || (deux && (v.vitesse < 8 || this.tenuDeux > 0.6) && this.tenuDeux > 0.25);
    v.frein = deux && !v.recul ? 1 : 0;
    // À la sortie d'un bâtiment, la voiture attend qu'on touche l'écran pour démarrer.
    if (this.attente) {
      if (entrees.gauche || entrees.droite) this.attente = false;
      else { v.frein = 1; v.recul = false; }
    }
    this.contact = false;
    v.maj(dt, true);
    // Dans un champ : la terre freine et secoue un peu.
    if (v.vitesse > 30 && this.champs.some((f) => v.x > f.x && v.x < f.x + f.w && v.y > f.y && v.y < f.y + f.h)) {
      const k = Math.pow(0.35, dt);
      v.vx *= k; v.vy *= k;
      this.secousse = Math.max(this.secousse, 0.8);
    }
    this.trafic.maj(dt, this.temps, v);
    this.chocs(v);
    this.chocsTrafic(v);
    const effrayes = this.pietons.maj(dt, v);
    if (effrayes) {
      this.gains.fans -= 3 * effrayes;
      this.journal.push('Piétons effrayés : −3 fans');
      this.message('−3 fans', '#fca5a5', v);
    }
    this.surveillerFeux(v);
    this.radarsVitesse(dt, v);
    this.ramasser(v);
    this.majDefi(dt);
    this.portesDevant(v);
    for (const m of this.messages) m.vie -= dt;
    this.messages = this.messages.filter((m) => m.vie > 0);
    for (const p of this.particules) { p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt; }
    this.particules = this.particules.filter((p) => p.vie > 0);
    for (const f of this.fans) if (f.content > 0) f.content -= dt;
    if (this.bandeau && (this.bandeau.vie -= dt) <= 0) this.bandeau = null;
    if (this.secousse > 0) this.secousse = Math.max(0, this.secousse - dt * 18);
    if (this.flash > 0) this.flash -= dt;
    if (this.temps >= DUREE_BALADE) this.fini = true;
  }

  chocs(v) {
    const m = 24;
    if (v.x < m || v.x > TAILLE_VILLE - m) { v.x = clamp(v.x, m, TAILLE_VILLE - m); v.vx *= -0.5; }
    if (v.y < m || v.y > TAILLE_VILLE - m) { v.y = clamp(v.y, m, TAILLE_VILLE - m); v.vy *= -0.5; }
    for (let iter = 0; iter < 2; iter++) {
      for (const ob of this.proches(v.x, v.y)) {
        const c = ob.type === 'rect' ? contreRect(v, ob) : contreCercle(v, ob);
        if (!c) continue;
        v.x += c.nx * c.prof; v.y += c.ny * c.prof;
        this.contact = true;
        const choc = -(v.vx * c.nx + v.vy * c.ny);
        if (choc <= 0) continue;
        v.vx += c.nx * choc * 1.3; v.vy += c.ny * choc * 1.3;
        v.vx *= 0.75; v.vy *= 0.75;
        if (choc > 35) this.impact(v, c, choc);
      }
    }
  }

  /** Chocs avec la circulation : la voiture d'en face ne bouge pas, on rebondit. */
  chocsTrafic(v) {
    for (const t of this.trafic.voitures) {
      if ((t.x - v.x) ** 2 + (t.y - v.y) ** 2 > 56 * 56) continue;
      const c = recouvrement(v, t);
      if (!c) continue;
      v.x -= c.nx * c.prof; v.y -= c.ny * c.prof;
      this.contact = true;
      const choc = (v.vx * c.nx + v.vy * c.ny);
      if (choc <= 0) continue;
      v.vx -= c.nx * choc * 1.4; v.vy -= c.ny * choc * 1.4;
      v.vx *= 0.7; v.vy *= 0.7;
      t.v = 0; t.klaxon = 1.4;
      if (choc > 30 && this.temps > 2 && (t.constat || 0) < this.temps) {
        t.constat = this.temps + 3;
        this.gains.usure += 0.02;
        this.payer(80, 'Accrochage, constat amiable');
        if (this.defi?.type === 'livraison') this.defi.intact = Math.max(0.25, this.defi.intact - 0.25);
      }
      this.impact(v, { nx: -c.nx, ny: -c.ny }, choc);
    }
  }

  impact(v, c, choc) {
    this.son?.choc(choc);
    this.secousse = Math.min(4, choc / 30);
    for (let i = 0; i < 6; i++) this.particules.push({ x: v.x - c.nx * 20, y: v.y - c.ny * 20, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, vie: 0.25 });
    if (choc > 60 && this.defi?.type === 'livraison') {
      this.defi.intact = Math.max(0.25, this.defi.intact - 0.25);
      this.message('Le colis !', '#fca5a5', v);
    }
  }

  /** Entrer dans un carrefour au rouge devant une caméra : amende. */
  surveillerFeux(v) {
    const c = this.trafic.dansCarrefour(v.x, v.y);
    const cle = c ? `${c.kx},${c.ky}` : null;
    if (c && cle !== this.carrefourAvant && this.carrefourAvant !== undefined) {
      const camera = this.cameras.find((k) => k.kx === c.kx && k.ky === c.ky);
      const horizontal = Math.abs(Math.cos(v.angle)) > Math.abs(Math.sin(v.angle));
      if (camera && v.vitesse > 30 && this.temps > 5 && this.feux.etat(c.kx, c.ky, horizontal, this.temps) === 'rouge') {
        this.flash = 0.25;
        this.payer(150, 'Flashé au feu rouge');
      }
    }
    this.carrefourAvant = cle;
  }

  radarsVitesse(dt, v) {
    for (const r of this.radars) {
      if (r.attente > 0) { r.attente -= dt; continue; }
      if ((r.x - v.x) ** 2 + (r.y - v.y) ** 2 > 36 * 36) continue;
      r.attente = 4;
      const kmh = Math.round(v.vitesse * 0.8);
      const seuil = Math.round(v.p.vmax * 0.8 * 0.7);
      const rec = this.memoire.records;
      const cle = r.id;
      const record = !rec[cle] || kmh > rec[cle];
      if (kmh >= seuil) {
        if (record) rec[cle] = kmh;
        this.gagner({ fans: 4 + Math.round((kmh - seuil) / 4), exp: 4 }, `Radar : ${kmh} km/h${record ? ' · RECORD !' : ''}`);
      } else {
        this.annonce(`Radar : ${kmh} km/h (il faut ${seuil})`, '#cfe0ff');
      }
    }
  }

  ramasser(v) {
    for (const b of this.bonus) {
      if (b.pris || (b.x - v.x) ** 2 + (b.y - v.y) ** 2 > 22 * 22) continue;
      b.pris = true;
      if (b.type === 'piece') { this.gains.argent += 20; this.message('+20 G', '#ffe066', b); this.son?.piece(); }
      else { this.gains.recherche += 1; this.message('+1 PR', '#7dd3fc', b); this.son?.disque(); }
    }
    for (const f of this.fans) {
      if (f.vu || (f.x - v.x) ** 2 + (f.y - v.y) ** 2 > 40 * 40) continue;
      f.vu = true; f.content = 2;
      this.gains.fans += 5; this.gains.exp += 5;
      this.message('Un autographe ! +5 fans', '#f9a8d4', f);
      this.son?.caisse();
    }
    for (const a of this.affiches) {
      if (this.memoire.affiches[a.id] || (a.x - v.x) ** 2 + (a.y - v.y) ** 2 > 28 * 28) continue;
      this.memoire.affiches[a.id] = true;
      const n = Object.keys(this.memoire.affiches).length;
      this.gagner({ recherche: 3, exp: 8 }, `Affiche Piston trouvée ! (${n}/${AFFICHES})`);
      if (n === AFFICHES) this.gagner({ argent: 10000 }, 'Toutes les affiches ! +10 000 G');
    }
  }

  portesDevant(v) {
    let dans = null;
    for (const p of this.portes) if (v.x > p.x && v.x < p.x + p.w && v.y > p.y && v.y < p.y + p.h) dans = p;
    if (!dans) { this.ignorer = null; return; }
    if (dans.id === this.ignorer || this.defi) return;
    this.entree = dans;
    this.ignorer = dans.id;
    v.vx = 0; v.vy = 0;
    this.son?.bip(660, 0.12);
  }

  sortir() {
    const p = this.entree;
    this.entree = null;
    if (!p) return;
    // En sortant, on reprend la voie de droite de la rue, dans le sens de la circulation.
    this.placerDevant(p);
  }

  message(texteMsg, couleur, ancre) {
    this.messages.push({ texte: texteMsg, couleur, x: ancre.x, y: ancre.y, vie: 1, max: 1 });
  }

  heure() {
    const min = Math.min(59, Math.floor((this.temps / DUREE_BALADE) * 60));
    return `18:${String(min).padStart(2, '0')}`;
  }

  // --- Dessin --------------------------------------------------------------------

  // --- Peinture par morceaux -------------------------------------------------------

  /** Le morceau (i, j) de la carte, peint à la demande et gardé en cache. */
  morceau(i, j) {
    const cle = i * 100 + j;
    let m = this.morceaux.get(cle);
    if (m) { this.morceaux.delete(cle); this.morceaux.set(cle, m); return m; }   // le plus récent en dernier
    if (!this.statiquesTries) { this.statiques.sort((a, b) => a.y - b.y); this.statiquesTries = true; }
    m = this.recycles?.pop() || document.createElement('canvas');
    m.width = MORCEAU; m.height = MORCEAU;
    const c = m.getContext('2d');
    c.imageSmoothingEnabled = false;
    const x0 = i * MORCEAU, y0 = j * MORCEAU, x1 = x0 + MORCEAU, y1 = y0 + MORCEAU;
    c.save();
    c.translate(-x0, -y0);
    c.beginPath(); c.rect(x0, y0, MORCEAU, MORCEAU); c.clip();
    this.peindreSol(c, x0, y0, x1, y1);
    for (const s of this.statiques) {
      const b = s.b;
      if (b && (b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1)) continue;
      s.dessin(c);
    }
    this.peindreRoutesDessus(c, x0, y0, x1, y1);
    c.restore();
    this.morceaux.set(cle, m);
    while (this.morceaux.size > MORCEAUX_GARDES) {
      const [k, vieux] = this.morceaux.entries().next().value;
      this.morceaux.delete(k);
      (this.recycles = this.recycles || []).push(vieux);
    }
    return m;
  }

  /** Peint d'avance, un par image, les morceaux autour de la caméra (pas d'à-coup en roulant). */
  prechauffer(camX, camY, W, H) {
    const marge = 260;
    for (let j = Math.floor((camY - marge) / MORCEAU); j <= Math.floor((camY + H + marge) / MORCEAU); j++) {
      for (let i = Math.floor((camX - marge) / MORCEAU); i <= Math.floor((camX + W + marge) / MORCEAU); i++) {
        if (i < 0 || j < 0 || i * MORCEAU >= TAILLE_VILLE || j * MORCEAU >= TAILLE_VILLE) continue;
        if (!this.morceaux.has(i * 100 + j)) { this.morceau(i, j); return; }
      }
    }
  }

  /** Sol : pelouse, routes (bitume), trottoirs en ville, bas-côtés d'herbe à la campagne. */
  peindreSol(c, x0, y0, x1, y1) {
    c.fillStyle = '#84c669'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    const R = RESEAU;
    for (let gy = Math.max(0, Math.floor(y0 / T)); gy < Math.min(R.cases, Math.ceil(y1 / T)); gy++) {
      for (let gx = Math.max(0, Math.floor(x0 / T)); gx < Math.min(R.cases, Math.ceil(x1 / T)); gx++) {
        const k = R.classer(gx, gy);
        if (!k || k.type === 'terre') continue;
        const x = gx * T, y = gy * T;
        if (k.type === 'route') { c.fillStyle = '#52607c'; c.fillRect(x, y, T, T); continue; }
        if (estUrbain(k.bx, k.by)) {
          c.fillStyle = '#d4d9e3'; c.fillRect(x, y, T, T);
          c.fillStyle = '#c4cad6'; c.fillRect(x + T - 1, y, 1, T); c.fillRect(x, y + T - 1, T, 1);
          // Bordure de trottoir, côté route.
          c.fillStyle = '#8b9bb4';
          if (k.gauche) c.fillRect(x, y, 2, T);
          if (k.droite) c.fillRect(x + T - 2, y, 2, T);
          if (k.haut) c.fillRect(x, y, T, 2);
          if (k.bas) c.fillRect(x, y + T - 2, T, 2);
        } else {
          // Bas-côté : herbe rase et terre tassée le long du bitume.
          c.fillStyle = '#76b35d'; c.fillRect(x, y, T, T);
          c.fillStyle = '#d9a46e';
          if (k.gauche) c.fillRect(x, y, 3, T);
          if (k.droite) c.fillRect(x + T - 3, y, 3, T);
          if (k.haut) c.fillRect(x, y, T, 3);
          if (k.bas) c.fillRect(x, y + T - 3, T, 3);
        }
      }
    }
  }

  /** Marquages : lignes, terre-pleins, passages piétons, lignes de STOP ; zones d'entrée. */
  peindreRoutesDessus(c, x0, y0, x1, y1) {
    const R = RESEAU;
    for (let k = 0; k <= R.N; k++) for (let s = 0; s < R.N; s++) {
      for (const horizontal of [true, false]) {
        if (!(horizontal ? R.H[k][s] : R.V[k][s])) continue;
        const a = R.X[s] + R.L[s], l = R.X[s + 1] - a, b = R.X[k], w = R.L[k];
        const box = horizontal ? { x: a, y: b, w: l, h: w } : { x: b, y: a, w, h: l };
        if (box.x > x1 || box.x + box.w < x0 || box.y > y1 || box.y + box.h < y0) continue;
        const ville = horizontal ? (estUrbain(s, k - 1) || estUrbain(s, k)) : (estUrbain(k - 1, s) || estUrbain(k, s));
        this.marquages(c, a, l, b, w, horizontal, ville);
      }
    }
    for (let kx = 0; kx <= R.N; kx++) for (let ky = 0; ky <= R.N; ky++) {
      if (!R.croisement(kx, ky)) continue;
      const q = R.carre(kx, ky);
      if (q.x > x1 + 40 || q.x + q.w < x0 - 40 || q.y > y1 + 40 || q.y + q.h < y0 - 40) continue;
      const [e, su, o, no] = R.branches(kx, ky);
      c.fillStyle = '#f4f6fb';
      if (carrefourUrbain(kx, ky)) {
        // Passages piétons sur chaque branche, au ras du carrefour.
        for (let i = 4; i < q.w - 4; i += 12) { if (no) c.fillRect(q.x + i, q.y - 15, 7, 13); if (su) c.fillRect(q.x + i, q.y + q.h + 2, 7, 13); }
        for (let i = 4; i < q.h - 4; i += 12) { if (o) c.fillRect(q.x - 15, q.y + i, 13, 7); if (e) c.fillRect(q.x + q.w + 2, q.y + i, 13, 7); }
      } else if (this.feux.prioriteHorizontale(kx, ky)) {
        // STOP : ligne blanche sur la moitié qui arrive.
        if (no) c.fillRect(q.x + 4, q.y - 6, q.w / 2 - 8, 4);
        if (su) c.fillRect(q.x + q.w / 2 + 4, q.y + q.h + 2, q.w / 2 - 8, 4);
      } else {
        if (o) c.fillRect(q.x - 6, q.y + q.h / 2 + 4, 4, q.h / 2 - 8);
        if (e) c.fillRect(q.x + q.w + 2, q.y + 4, 4, q.h / 2 - 8);
      }
    }
    // Zones d'entrée des bâtiments.
    for (const p of this.portes) {
      if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
      c.fillStyle = 'rgba(242,193,78,0.35)'; c.fillRect(p.x, p.y, p.w, p.h);
      c.fillStyle = '#f2c14e';
      for (let i = 0; i < p.w; i += 6) { c.fillRect(p.x + i, p.y, 3, 2); c.fillRect(p.x + i, p.y + p.h - 2, 3, 2); }
      for (let i = 0; i < p.h; i += 6) { c.fillRect(p.x, p.y + i, 2, 3); c.fillRect(p.x + p.w - 2, p.y + i, 2, 3); }
    }
  }

  /**
   * Marquages d'un tronçon (a : début le long de la route, l : longueur ; b, w : position
   * et largeur en travers). Rue : tirets au milieu. Boulevard : terre-plein planté et
   * tirets entre les deux voies de chaque sens. Campagne : lignes de rive.
   */
  marquages(c, a, l, b, w, horizontal, ville) {
    const rect = (pa, pb, la, lb) => (horizontal ? c.fillRect(a + pa, b + pb, la, lb) : c.fillRect(b + pb, a + pa, lb, la));
    const marge = 20;
    c.fillStyle = '#e8e4d6';
    if (!ville) { rect(0, 5, l, 2); rect(0, w - 7, l, 2); }
    if (w >= 13 * T) {
      for (let p = marge; p < l - marge - 8; p += 24) { rect(p, 47, 12, 2); rect(p, w - 49, 12, 2); }
      // Terre-plein central : bordures, herbe et petits buissons.
      const m = w / 2 - 8;
      c.fillStyle = '#8b9bb4'; rect(marge, m, l - 2 * marge, 16);
      c.fillStyle = '#7fc464'; rect(marge + 2, m + 2, l - 2 * marge - 4, 12);
      c.fillStyle = '#5a9a4e';
      for (let p = marge + 14; p < l - marge - 10; p += 40) rect(p, m + 4, 8, 8);
    } else {
      for (let p = 18; p < l - 12; p += 24) rect(p, w / 2 - 1, 12, 2);
    }
  }

  peindreMiniCarte() {
    const n = 98;
    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const c = canvas.getContext('2d');
    const R = RESEAU;
    const e = n / TAILLE_VILLE;
    const VILLE_COUL = { m: '#d6c9b4', i: '#c9d3e6', p: '#8fcf6f', L: '#8fcf6f', z: '#aab4c8', k: '#aab4c8', d: '#8a6ad6', b: '#c9d3e6', '.': '#c9d3e6' };
    const CAMP_COUL = { B: '#3f8a4a', F: '#d9b48a', C: '#e3c36a', P: '#8fcf6f', V: '#6fb85a', H: '#d6c9b4', W: '#a8dc8c', E: '#7fc464', S: '#e3c36a' };
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const gx = Math.floor((px + 0.5) / e / T), gy = Math.floor((py + 0.5) / e / T);
      const k = R.classer(gx, gy);
      if (!k) continue;
      if (k.type === 'route') c.fillStyle = '#52607c';
      else { const t = typePate(k.bx, k.by); c.fillStyle = CAMP_COUL[t] || VILLE_COUL[t] || '#c9d3e6'; }
      c.fillRect(px, py, 1, 1);
    }
    for (const ob of this.obstacles) if (ob.eau) { c.fillStyle = '#75e3ff'; c.fillRect(ob.x * e, ob.y * e, Math.max(1, ob.w * e), Math.max(1, ob.h * e)); }
    for (const ob of this.obstacles) if (ob.bat) {
      c.fillStyle = ob.bat.toit;
      c.fillRect(ob.x * e - 1, ob.y * e - 1, Math.max(3, ob.w * e + 2), Math.max(3, ob.h * e + 2));
    }
    if (this.arene) { c.fillStyle = '#8a6ad6'; c.fillRect(this.arene.x * e, this.arene.y * e, this.arene.w * e, this.arene.h * e); }
    return canvas;
  }

  dessiner(ctx, W, H, t) {
    const v = this.voiture;
    this.camera.x = lerp(this.camera.x, v.x + v.vx * 0.4, 0.12);
    this.camera.y = lerp(this.camera.y, v.y + v.vy * 0.4, 0.12);
    const sx = this.secousse ? (Math.random() - 0.5) * this.secousse : 0;
    const camX = Math.round(clamp(this.camera.x - W / 2 + sx, 0, TAILLE_VILLE - W));
    const camY = Math.round(clamp(this.camera.y - H / 2 + sx, 0, TAILLE_VILLE - H));
    ctx.imageSmoothingEnabled = false;
    // Les morceaux de carte visibles (peints à la demande), puis un de plus d'avance.
    for (let j = Math.floor(camY / MORCEAU); j <= Math.floor((camY + H - 1) / MORCEAU); j++) {
      for (let i = Math.floor(camX / MORCEAU); i <= Math.floor((camX + W - 1) / MORCEAU); i++) {
        ctx.drawImage(this.morceau(i, j), i * MORCEAU - camX, j * MORCEAU - camY);
      }
    }
    this.prechauffer(camX, camY, W, H);
    ctx.save();
    ctx.translate(-camX, -camY);
    const visible = (x, y, m = 40) => x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m;

    // La campagne vit : bêtes qui broutent, fermiers et promeneurs.
    for (const a of this.animaux) {
      if (!visible(a.x, a.y, 24)) continue;
      const b = Math.sin(t * 1.3 + a.phase) > 0.85 ? 1 : 0;
      ctx.fillStyle = 'rgba(38,24,46,0.2)'; ctx.fillRect(Math.round(a.x) - 6, Math.round(a.y) - 2, 12, 3);
      tuileTiny(ctx, this.tiny, 'farm', a.n, a.x - 8, a.y - 15 - b);
    }
    for (const g of this.gens) if (visible(g.x, g.y, 20)) dessinerPerso(ctx, g.tenue, g.x, g.y, g.dir, Math.sin(t * 2 + g.x) > 0.9 ? 1 : 0);

    this.dessinerFeux(ctx, visible);
    for (const p of this.portes) {
      if (!visible(p.x, p.y, 60)) continue;
      const fl = Math.sin(t * 5) > 0 ? 1 : 0;
      texte(ctx, p.id === 'garage' ? 'RENTRER' : 'ENTRER', p.x + p.w / 2, p.y + p.h / 2 - fl, 9, '#ffe066', 'center');
    }
    // Points de départ des défis (anneaux qui pulsent).
    for (const d of this.defis) {
      if (d.fait || this.defi || !visible(d.x, d.y)) continue;
      anneau(ctx, d.x, d.y, 24 + Math.sin(t * 4) * 2, d.type === 'drift' ? '#c4b5fd' : d.type === 'livraison' ? '#f39c33' : '#ffe066');
      texte(ctx, { sprint: 'SPRINT', livraison: 'COLIS', drift: 'DRIFT' }[d.type], d.x, d.y - 32, 9, '#ffffff', 'center');
    }
    if (this.defi) {
      const c = this.defi.cible;
      anneau(ctx, c.x, c.y, 30 + Math.sin(t * 6) * 3, '#9fe870');
      if (this.defi.type === 'livraison') bulle(ctx, c.x, c.y - 18, 'Ici !');
    }
    for (const r of this.radars) if (visible(r.x, r.y)) radar(ctx, r.x, r.y);
    for (const a of this.affiches) if (!this.memoire.affiches[a.id] && visible(a.x, a.y)) affiche(ctx, a.x, a.y, t);
    for (const b of this.bonus) if (!b.pris && visible(b.x, b.y)) dessinerBonusVille(ctx, b, t);
    this.pietons.dessiner(ctx, this.planche, t, camX, camY, W, H);
    for (const f of this.fans) {
      if (!visible(f.x, f.y)) continue;
      const saute = f.content > 0 && Math.sin(t * 14) > 0;
      dessinerPerso(ctx, f.tenue, f.x, f.y - (saute ? 3 : 0), 'face', saute ? 1 : 0);
      if (!f.vu && Math.sin(t * 3 + f.x) > -0.3) bulle(ctx, f.x, f.y - 18, 'Fan !');
    }
    this.trafic.dessiner(ctx, camX, camY, W, H);

    dessinerVoitureVille(ctx, v.couleur, v.x, v.y, v.angle);

    ctx.fillStyle = '#ffe066';
    for (const p of this.particules) ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    for (const m of this.messages) {
      const a = 1 - m.vie / m.max;
      texte(ctx, m.texte, m.x, m.y - 32 - a * 16, 10, m.couleur, 'center');
    }
    this.dessinerSoir(ctx, camX, camY, W, H, visible);
    ctx.restore();

    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 3})`; ctx.fillRect(0, 0, W, H); }
    if (this.defi) this.fleche(ctx, W, H, camX, camY);
    this.dessinerInterface(ctx, W, H, t);
  }

  /** Un feu sur poteau à chaque coin de carrefour, tourné vers la voie qui arrive. */
  dessinerFeux(ctx, visible) {
    const R = RESEAU;
    for (let kx = 0; kx <= R.N; kx++) for (let ky = 0; ky <= R.N; ky++) {
      if (!R.croisement(kx, ky)) continue;
      const q = R.carre(kx, ky);
      if (!visible(q.x + q.w / 2, q.y + q.h / 2, 140)) continue;
      const [e, su, o, no] = R.branches(kx, ky);
      // Les quatre coins : nord-ouest, nord-est, sud-est, sud-ouest (x, y, pâté du coin).
      const NO = [q.x - 8, q.y - 2, kx - 1, ky - 1], NE = [q.x + q.w + 8, q.y - 2, kx, ky - 1];
      const SE = [q.x + q.w + 8, q.y + q.h + 14, kx, ky], SO = [q.x - 8, q.y + q.h + 14, kx - 1, ky];
      if (!carrefourUrbain(kx, ky)) {
        // À la campagne : un STOP à droite de chaque route non prioritaire.
        const pancarte = ([x, y, bx, by]) => { if (typeIlot(bx, by)) panneauStop(ctx, x, y); };
        if (this.feux.prioriteHorizontale(kx, ky)) { if (no) pancarte(NO); if (su) pancarte(SE); } else { if (o) pancarte(SO); if (e) pancarte(NE); }
        continue;
      }
      const h = this.feux.etat(kx, ky, true, this.temps);
      const v = this.feux.etat(kx, ky, false, this.temps);
      // Nord-ouest : ceux qui descendent ; nord-est : ceux qui vont à l'ouest ;
      // sud-est : ceux qui montent ; sud-ouest : ceux qui vont à l'est.
      for (const [[x, y, bx, by], etat, branche] of [[NO, v, no], [NE, h, e], [SE, v, su], [SO, h, o]]) {
        if (!branche || !estUrbain(bx, by)) continue;
        feuTricolore(ctx, x, y, etat);
      }
      if (this.cameras.some((c) => c.kx === kx && c.ky === ky)) {
        const x = q.x + q.w + 8, y = q.y - 44;
        ctx.fillStyle = CONTOUR; ctx.fillRect(x - 6, y - 6, 12, 8);
        ctx.fillStyle = '#c0cbdc'; ctx.fillRect(x - 5, y - 5, 7, 6);
        ctx.fillStyle = '#e4432d'; ctx.fillRect(x + 3, y - 5, 2, 2);
      }
    }
  }

  /** Le soleil se couche, les lampadaires s'allument. */
  dessinerSoir(ctx, camX, camY, W, H, visible) {
    const a = this.temps / DUREE_BALADE;
    ctx.fillStyle = `rgba(255,140,60,${0.12 * Math.min(1, a * 2)})`;
    ctx.fillRect(camX, camY, W, H);
    if (a > 0.45) {
      const nuit = Math.min(1, (a - 0.45) / 0.5);
      ctx.fillStyle = `rgba(30,24,80,${0.32 * nuit})`;
      ctx.fillRect(camX, camY, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lampes) {
        if (!visible(l.x, l.y)) continue;
        ctx.fillStyle = `rgba(255,214,120,${0.07 * nuit})`;
        ctx.beginPath(); ctx.arc(l.x, l.y + 26, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,236,170,${0.5 * nuit})`;
        ctx.fillRect(l.x - 1, l.y + 1, 3, 2);
      }
      ctx.restore();
    }
  }

  /** Flèche au bord de l'écran vers l'objectif du défi en cours. */
  fleche(ctx, W, H, camX, camY) {
    const c = this.defi.cible;
    const cx = W / 2, cy = (H + HAUT_HUD) / 2;
    const dx = c.x - camX - cx, dy = c.y - camY - cy;
    if (Math.abs(dx) < W / 2 - 20 && Math.abs(dy) < (H - HAUT_HUD) / 2 - 20) return;
    const ang = Math.atan2(dy, dx);
    const r = Math.min((W / 2 - 22) / Math.abs(Math.cos(ang) || 1e-3), ((H - HAUT_HUD) / 2 - 40) / Math.abs(Math.sin(ang) || 1e-3));
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.rotate(ang);
    ctx.fillStyle = '#1a1626'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.fill();
    ctx.fillStyle = '#9fe870'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill();
    ctx.restore();
  }

  dessinerInterface(ctx, W, H) {
    ctx.fillStyle = 'rgba(31,42,68,0.92)'; ctx.fillRect(0, 0, W, HAUT_HUD);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, HAUT_HUD, W, 2);
    texte(ctx, 'BALADE EN VILLE', 8, 12, 10, '#9fb3d9', 'left');
    texte(ctx, this.heure(), 8, 32, 18, '#ffe066', 'left');
    const reste = 1 - this.temps / DUREE_BALADE;
    ctx.fillStyle = '#3a4a6b'; ctx.fillRect(8, 44, 140, 4);
    ctx.fillStyle = reste > 0.25 ? '#5ad16a' : '#e4432d'; ctx.fillRect(8, 44, Math.round(140 * reste), 4);
    const net = this.gains.argent - this.gains.amendes;
    texte(ctx, `${net >= 0 ? '' : '−'}${Math.abs(net)} G`, 156, 18, 11, net >= 0 ? '#ffe066' : '#fca5a5', 'left');
    texte(ctx, `${this.gains.recherche} PR · ${this.gains.fans} fans`, 156, 36, 10, '#cfe0ff', 'left');

    // Défi en cours : nom, chrono, avancement.
    if (this.defi) {
      const f = this.defi;
      const y = HAUT_HUD + 4;
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(6, y, 200, 34);
      texte(ctx, f.d.nom, 12, y + 10, 10, '#ffe066', 'left');
      const det = f.type === 'sprint' ? `Point ${f.etape + 1}/${f.d.etapes.length}`
        : f.type === 'livraison' ? `Colis ${Math.round(f.intact * 100)} %` : `Score ${Math.round(f.score)}`;
      texte(ctx, `${Math.max(0, f.limite - f.t).toFixed(1)} s · ${det}`, 12, y + 24, 10, '#ffffff', 'left');
    }

    const mc = this.minicarte;
    const mx = W - mc.width - 6, my = HAUT_HUD + 8;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(mx - 3, my - 3, mc.width + 6, mc.height + 6);
    ctx.drawImage(mc, mx, my);
    const e = mc.width / TAILLE_VILLE;
    const point = (x, y, coul, t = 3) => { ctx.fillStyle = coul; ctx.fillRect(Math.round(mx + x * e) - (t >> 1), Math.round(my + y * e) - (t >> 1), t, t); };
    for (const p of this.portes) point(p.x + p.w / 2, p.y, '#ffffff');
    for (const d of this.defis) if (!d.fait && !this.defi) point(d.x, d.y, d.type === 'drift' ? '#c4b5fd' : d.type === 'livraison' ? '#f39c33' : '#ffe066');
    if (this.defi) point(this.defi.cible.x, this.defi.cible.y, '#9fe870', 4);
    point(this.voiture.x, this.voiture.y, '#1a1626', 6);
    point(this.voiture.x, this.voiture.y, '#ffe066', 4);
    texte(ctx, `Affiches ${Object.keys(this.memoire.affiches).length}/${AFFICHES}`, mx + mc.width / 2, my + mc.height + 10, 8, '#f4f1e8', 'center');

    if (this.bandeau) {
      ctx.fillStyle = 'rgba(15,23,42,0.88)'; ctx.fillRect(10, H - 70, W - 20, 30);
      texte(ctx, this.bandeau.texte, W / 2, H - 55, 10, this.bandeau.couleur, 'center');
    }
    ctx.fillStyle = 'rgba(31,42,68,0.55)';
    ctx.fillRect(0, H - 26, W, 26);
    texte(ctx, '◀ gauche', 10, H - 13, 10, '#f4f1e8', 'left');
    texte(ctx, 'les deux : freiner / reculer', W / 2, H - 13, 9, '#cfe0ff', 'center');
    if (this.attente && Math.sin(this.temps * 6) > -0.4) {
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(W / 2 - 96, H - 108, 192, 26);
      texte(ctx, 'Touche un côté pour démarrer', W / 2, H - 95, 10, '#ffe066', 'center');
    }
    texte(ctx, 'droite ▶', W - 10, H - 13, 10, '#f4f1e8', 'right');
  }

  /** Gains nets de la balade, à verser dans la partie. */
  bilan() {
    const g = this.gains;
    return {
      argent: g.argent - g.amendes, recherche: g.recherche, fans: g.fans,
      exp: g.exp + Math.round(Math.max(0, g.argent) / 40), usure: g.usure, amendes: g.amendes, journal: this.journal.slice(-6),
    };
  }
}

// --- Géométrie des chocs ---------------------------------------------------------

function boite(ob) {
  if (ob.type === 'rect') return { x0: ob.x, y0: ob.y, x1: ob.x + ob.w, y1: ob.y + ob.h };
  return { x0: ob.x - ob.r, y0: ob.y - ob.r, x1: ob.x + ob.r, y1: ob.y + ob.r };
}

function toucheCercle(ob, x, y, r) {
  if (ob.type === 'rect') return x > ob.x - r && x < ob.x + ob.w + r && y > ob.y - r && y < ob.y + ob.h + r;
  return (ob.x - x) ** 2 + (ob.y - y) ** 2 < (ob.r + r) ** 2;
}

export function contreRect(v, ob) {
  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  const cx = ob.x + ob.w / 2, cy = ob.y + ob.h / 2;
  const dx = v.x - cx, dy = v.y - cy;
  let best = null;
  for (const [nx, ny] of [[1, 0], [0, 1], [fx, fy], [-fy, fx]]) {
    const rv = DEMI_LONGUEUR * Math.abs(fx * nx + fy * ny) + DEMI_LARGEUR * Math.abs(-fy * nx + fx * ny);
    const rb = (ob.w / 2) * Math.abs(nx) + (ob.h / 2) * Math.abs(ny);
    const d = dx * nx + dy * ny;
    const prof = rv + rb - Math.abs(d);
    if (prof <= 0) return null;
    if (!best || prof < best.prof) best = { nx: d < 0 ? -nx : nx, ny: d < 0 ? -ny : ny, prof };
  }
  return best;
}

export function contreCercle(v, ob) {
  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  const rx = ob.x - v.x, ry = ob.y - v.y;
  const u = clamp(rx * fx + ry * fy, -DEMI_LONGUEUR, DEMI_LONGUEUR);
  const w = clamp(-rx * fy + ry * fx, -DEMI_LARGEUR, DEMI_LARGEUR);
  const qx = v.x + fx * u - fy * w, qy = v.y + fy * u + fx * w;
  let nx = qx - ob.x, ny = qy - ob.y;
  const d = Math.hypot(nx, ny);
  if (d >= ob.r) return null;
  if (d < 1e-3) {
    nx = v.x - ob.x; ny = v.y - ob.y;
    const l = Math.hypot(nx, ny) || 1;
    return { nx: nx / l, ny: ny / l, prof: ob.r + DEMI_LARGEUR };
  }
  return { nx: nx / d, ny: ny / d, prof: ob.r - d };
}

// --- Petits dessins ----------------------------------------------------------------

function anneau(ctx, x, y, r, couleur) {
  ctx.save();
  ctx.strokeStyle = '#1a1626'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = couleur; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function radar(ctx, x, y) {
  ctx.fillStyle = '#1a1626'; ctx.fillRect(x - 5, y - 30, 10, 12); ctx.fillRect(x - 1, y - 18, 2, 6);
  ctx.fillStyle = '#9fb3d9'; ctx.fillRect(x - 4, y - 29, 8, 10);
  ctx.fillStyle = '#1a1626'; ctx.fillRect(x - 2, y - 26, 4, 4);
  ctx.fillStyle = 'rgba(242,193,78,0.25)'; ctx.fillRect(x - 22, y - 10, 44, 20);
}

function affiche(ctx, x, y, t) {
  const b = Math.sin(t * 3 + x) > 0 ? 1 : 0;
  ctx.fillStyle = '#1a1626'; ctx.fillRect(x - 7, y - 12 - b, 14, 16); ctx.fillRect(x - 1, y + 4 - b, 2, 6);
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 6, y - 11 - b, 12, 14);
  ctx.fillStyle = '#c2504d'; ctx.fillRect(x - 4, y - 9 - b, 3, 10); ctx.fillRect(x - 1, y - 9 - b, 4, 3); ctx.fillRect(x + 2, y - 7 - b, 2, 3); ctx.fillRect(x - 1, y - 5 - b, 4, 2);
}

function dessinerBonusVille(ctx, b, t) {
  const x = Math.round(b.x), y = Math.round(b.y);
  if (b.type === 'piece') {
    const w = Math.max(1, Math.round(Math.abs(Math.cos(t * 5 + b.x * 0.05)) * 3));
    ctx.fillStyle = '#7a5a12'; ctx.fillRect(x - w - 1, y - 4, w * 2 + 3, 9);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - w, y - 3, w * 2 + 1, 7);
  } else {
    const f = Math.sin(t * 4 + b.y) > 0 ? 1 : 0;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(x - 5, y - 6 - f, 11, 11);
    ctx.fillStyle = '#2f6fdb'; ctx.fillRect(x - 4, y - 5 - f, 9, 9);
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x - 3, y - f, 7, 3);
  }
}
