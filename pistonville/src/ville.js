/* ville.js — la balade en ville, une fois par jour, de 18 h à 19 h.
 *
 * Pistonville fait 6 × 6 pâtés de maisons (1 408 px de côté) : centre, quartiers
 * résidentiels, parcs, port. La ville vit : circulation à droite avec feux,
 * piétons sur les trottoirs, coucher de soleil, lampadaires qui s'allument
 * (voir ville-vie.js). Tout ce qui est construit est solide.
 *
 * Les choses à faire, inspirées des jeux de course en ville ouverte (on lance
 * un défi en roulant dessus, des objets cachés à trouver) :
 *   - Sprints : passer des points de contrôle avant la fin du chrono ;
 *   - Livraisons : apporter un colis fragile chez un client ;
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
import { Trafic, Pietons, Feux, PERIODE, PAS_RUE, LARGEUR_RUE, CASES_RUE, CASES_ILOT } from './ville-vie.js';
import { tuileTiny, spriteVoitureTiny, dessinerVoitureTiny, dessinerPerso, tenue, CONTOUR } from './tiny.js';
import { batimentModerne, hauteurBatiment, maisonModerne, conteneur, lampadaire, banc, poubelle, borne, feuTricolore, fleurs } from './ville-dessins.js';

const ILOTS = 6;
const CASES = ILOTS * PERIODE + CASES_RUE;   // 114 cases : 1 824 px de côté
export const TAILLE_VILLE = CASES * T;
export const DUREE_BALADE = 120;     // secondes réelles pour une heure de jeu
const HAUT_HUD = 52;
const TAILLE_ILOT = CASES_ILOT * T;   // 160 px
const GRAINE_PLAN = 4242;            // le plan de la ville ne change jamais

/** Bâtiments où l'on peut entrer, et leur îlot (colonne, ligne). */
export const BATIMENTS = [
  { id: 'garage', nom: 'Garage Piston', ilot: [2, 2], toit: '#f2c14e' },
  { id: 'bureau', nom: 'Bureau des courses', ilot: [3, 2], toit: '#c2504d' },
  { id: 'concession', nom: 'Concession', ilot: [1, 3], toit: '#2f6fdb' },
  { id: 'pieces', nom: 'Pièces Auto', ilot: [3, 3], toit: '#3fa34d' },
  { id: 'tombola', nom: 'Tombola', ilot: [4, 0], toit: '#e86ca6' },
  { id: 'cafe', nom: 'Café des pilotes', ilot: [2, 4], toit: '#8a5a3b' },
];
// Quartiers : p parc, m maisons, i immeubles, d arène de drift, k parking, q port.
const PLAN = [
  'pmmibm',
  'mpiiim',
  'mi..ii',
  'i.i.ip',
  'mm.idi',
  'qqqqkq',
];

const origineIlot = (bx, by) => ({ x: (bx * PERIODE + CASES_RUE + 1) * T, y: (by * PERIODE + CASES_RUE + 1) * T });

/** Façades des bâtiments où l'on entre (le toit reprend la couleur de la carte). */
const STYLES_BATIMENTS = {
  garage: { facade: '#aab4c8', toit: '#f2c14e', garage: true, enseigne: '#f2c14e' },
  bureau: { facade: '#f2d7c4', toit: '#c2504d', vitrine: '#ffe6a8', enseigne: '#c2504d' },
  concession: { facade: '#e6ebf2', toit: '#2f6fdb', vitrine: '#cfe8ff', enseigne: '#2f6fdb' },
  pieces: { facade: '#e9f3e0', toit: '#3fa34d', vitrine: '#cfe8ff', auvent: '#3fa34d', enseigne: '#3fa34d' },
  tombola: { facade: '#fbe3ef', toit: '#e86ca6', vitrine: '#ffd6ea', auvent: '#e86ca6', enseigne: '#e86ca6' },
  cafe: { facade: '#f4e6c8', toit: '#8a5a3b', vitrine: '#fff0c8', auvent: '#d08a3e', enseigne: '#8a5a3b' },
};

function cone(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x - 6, y - 2, 12, 3); c.fillRect(x - 4, y - 12, 8, 11);
  c.fillStyle = '#f39c33'; c.fillRect(x - 3, y - 11, 6, 9);
  c.fillStyle = '#ffffff'; c.fillRect(x - 3, y - 7, 6, 2);
}
const centreCarrefour = (kx, ky) => ({ x: kx * PAS_RUE + LARGEUR_RUE / 2, y: ky * PAS_RUE + LARGEUR_RUE / 2 });

const AFFICHES = 8;

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
    this.construire();
    this.canvas = this.peindre();
    this.minicarte = this.peindreMiniCarte();

    this.feux = new Feux(ILOTS, 77);
    this.trafic = new Trafic(ILOTS, this.aleaJour, 26, this.feux);
    this.pietons = new Pietons(ILOTS, this.aleaJour, 44);
    this.semerDuJour();
    this.preparerDefis();

    const p = o.voiture.physique;
    // En ville, on roule plus doucement : 60 % de la pointe, plafonnée.
    const physique = { ...p, vmax: Math.min(150, p.vmax * 0.6), accel: p.accel * 0.8 };
    this.voiture = new Voiture({ physique, couleur: o.voiture.couleur, nom: 'moi', joueur: true });
    this.voiture.looks = o.voiture.looks || [];
    this.voiture.braquageMin = 0.6;   // on peut se dégager d'un mur en braquant
    const garage = this.portes.find((g) => g.id === 'garage');
    // Au départ, la voiture sort du garage et prend la voie de droite, vers l'est.
    this.voiture.placer(garage.x + garage.w / 2, garage.y + garage.h + 72, 0);
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
    for (let by = 0; by < ILOTS; by++) for (let bx = 0; bx < ILOTS; bx++) {
      const o = origineIlot(bx, by);
      const bat = BATIMENTS.find((b) => b.ilot[0] === bx && b.ilot[1] === by);
      const type = PLAN[by][bx];
      if (bat) this.ilotBatiment(o, bat);
      else if (type === 'p') this.ilotParc(o);
      else if (type === 'd') this.ilotArene(o);
      else if (type === 'k') this.ilotParking(o);
      else if (type === 'q') this.ilotPort(o, bx);
      else if (type === 'i') this.ilotImmeubles(o, bx, by);
      else this.ilotMaisons(o, bx, by);
      this.trottoirs(o, bat, type);
    }
    this.indexer();
  }

  ajouter(ob) { this.obstacles.push(ob); return ob; }
  dessin(y, f) { this.statiques.push({ y, dessin: f }); }

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

  ilotMaisons(o, bx, by) {
    this.pelouse(o);
    // Deux maisons en bas (porte sur le trottoir), jardins et arbres derrière.
    for (let i = 0; i < 2; i++) {
      const r = hash2(bx * 2 + i, by, 77);
      const toit = ['#e4432d', '#4f7ddb', '#8a6ad6', '#3fa34d', '#d08a3e'][Math.floor(r * 5)];
      const facade = ['#f4e6c8', '#e6ebf2', '#f2d7c4', '#dfe7d0'][Math.floor(hash2(i, bx + by, 5) * 4)];
      const x = o.x + 8 + i * 80, y = o.y + TAILLE_ILOT - 6 - 64;
      const m = this.ajouter({ type: 'rect', x, y, w: 64, h: 64 });
      this.dessin(m.y + m.h, (c) => maisonModerne(c, m.x, m.y, m.w, toit, facade));
      this.maisons.push({ x: x + 32, y: o.y + TAILLE_ILOT + 8 });
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

  ilotParc(o) {
    this.pelouse(o);
    const a = this.alea;
    const bassin = this.ajouter({ type: 'rect', x: o.x + 40, y: o.y + 48, w: 80, h: 48, eau: true });
    this.dessin(0, (c) => {
      // Allées de gravier en croix, bassin bordé de pierre.
      c.fillStyle = '#ead9ab'; c.fillRect(o.x + 72, o.y, 16, TAILLE_ILOT); c.fillRect(o.x, o.y + 120, TAILLE_ILOT, 14);
      c.fillStyle = CONTOUR; c.fillRect(bassin.x - 3, bassin.y - 3, bassin.w + 6, bassin.h + 6);
      c.fillStyle = '#c0cbdc'; c.fillRect(bassin.x - 2, bassin.y - 2, bassin.w + 4, bassin.h + 4);
      c.fillStyle = '#75e3ff'; c.fillRect(bassin.x, bassin.y, bassin.w, bassin.h);
      c.fillStyle = '#d9f7ff'; c.fillRect(bassin.x + 10, bassin.y + 12, 12, 2); c.fillRect(bassin.x + 46, bassin.y + 30, 14, 2);
    });
    for (let i = 0; i < 12; i++) {
      const x = o.x + 12 + a() * (TAILLE_ILOT - 24), y = o.y + 18 + a() * (TAILLE_ILOT - 28);
      if (x > bassin.x - 14 && x < bassin.x + bassin.w + 14 && y > bassin.y - 8 && y < bassin.y + bassin.h + 20) continue;
      if (Math.abs(x - (o.x + 80)) < 18 || Math.abs(y - (o.y + 127)) < 18) continue;
      this.arbre(x, y, [4, 16, 28, 3, 27][Math.floor(a() * 5)]);
    }
    for (const dx of [36, 124]) {
      this.ajouter({ type: 'cercle', x: o.x + dx, y: o.y + 113, r: 6 });
      this.dessin(o.y + 118, (c) => banc(c, o.x + dx, o.y + 118));
    }
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
    this.dessin(o.y + 86, (c) => cone(c, o.x + 80, o.y + 86));
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

  /** Port : entrepôt, conteneurs en rangées, allées entre eux. */
  ilotPort(o, bx) {
    this.dessin(-1, (c) => { c.fillStyle = '#c0cbdc'; c.fillRect(o.x, o.y, TAILLE_ILOT, TAILLE_ILOT); });
    const couleurs = ['#e4432d', '#2f6fdb', '#3fa34d', '#f39c33'];
    if (bx % 2 === 0) {
      const m = this.ajouter({ type: 'rect', x: o.x + 8, y: o.y + 6, w: TAILLE_ILOT - 16, h: hauteurBatiment(1) });
      this.dessin(m.y + m.h, (c) => batimentModerne(c, m.x, m.y, m.w, 1, { facade: '#aab4c8', toit: '#8b9bb4', garage: true }));
    }
    const y0 = bx % 2 === 0 ? o.y + 100 : o.y + 20;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < (bx % 2 === 0 ? 1 : 2); j++) {
        const x = o.x + 8 + i * 38, y = y0 + j * 64;
        const coul = couleurs[(i + j + bx) % 4];
        const r = this.ajouter({ type: 'rect', x, y, w: 32, h: 44 });
        this.dessin(r.y + r.h, (c) => conteneur(c, r.x, r.y, coul));
      }
    }
  }

  voitureGaree(x, y, horizontale) {
    const couleur = ['#c2504d', '#4f7ddb', '#f4f1e8', '#3fa34d', '#8a6ad6', '#2a2838'][Math.floor(this.alea() * 6)];
    const ob = horizontale ? { type: 'rect', x: x - 22, y: y - 13, w: 44, h: 26 } : { type: 'rect', x: x - 13, y: y - 22, w: 26, h: 44 };
    ob.voiture = true;
    this.ajouter(ob);
    this.dessin(y + 22, (c) => dessinerVoitureTiny(c, spriteVoitureTiny(couleur), x, y, horizontale ? 0 : Math.PI / 2));
  }

  /** Mobilier du trottoir : lampadaires, poubelles, bornes ; jamais devant une porte. */
  trottoirs(o, bat, type) {
    const a = this.alea;
    const cotes = [
      (s) => ({ x: o.x + s, y: o.y - 3 }),                       // trottoir du haut
      (s) => ({ x: o.x + s, y: o.y + TAILLE_ILOT + 13 }),        // trottoir du bas (côté portes)
      (s) => ({ x: o.x - 8, y: o.y + s }),
      (s) => ({ x: o.x + TAILLE_ILOT + 8, y: o.y + s }),
    ];
    cotes.forEach((pos, ci) => {
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
    this.bonus = [];
    for (let k = 0; k <= ILOTS; k++) {
      const milieu = k * PAS_RUE + LARGEUR_RUE / 2;
      for (let s = 80; s < TAILLE_VILLE - 80; s += 140 + a() * 160) {
        if ((s % PAS_RUE) < LARGEUR_RUE + 8) continue;   // pas dans les carrefours
        const horizontal = a() < 0.5;
        if (a() < 0.15) { this.bonus.push({ type: 'disque', x: horizontal ? s : milieu, y: horizontal ? milieu : s, pris: false }); continue; }
        for (let i = 0; i < 3; i++) {
          const d = s + i * 22;
          this.bonus.push({ type: 'piece', x: horizontal ? d : milieu, y: horizontal ? milieu : d, pris: false });
        }
      }
    }
    this.fans = [];
    for (let i = 0; i < 8; i++) {
      const bx = Math.floor(a() * ILOTS), by = Math.floor(a() * ILOTS);
      const o = origineIlot(bx, by);
      const x = o.x + 20 + a() * (TAILLE_ILOT - 40), y = o.y + TAILLE_ILOT + 14;
      this.fans.push({ x, y, base: PERSONNAGES[Math.floor(a() * PERSONNAGES.length)], tenue: tenue(Math.floor(a() * 60)), content: 0, vu: false });
    }
  }

  // --- Défis -----------------------------------------------------------------------------

  preparerDefis() {
    const c = centreCarrefour;
    this.defis = [
      { id: 'sprint-nord', type: 'sprint', nom: 'Sprint du Nord', ...c(1, 1), etapes: [c(5, 1), c(5, 3), c(3, 0)] },
      { id: 'sprint-port', type: 'sprint', nom: 'Sprint du Port', ...c(4, 4), etapes: [c(0, 6), c(6, 6), c(6, 4)] },
      { id: 'sprint-centre', type: 'sprint', nom: 'Tour du Centre', ...c(2, 5), etapes: [c(1, 2), c(4, 2), c(4, 5)] },
      { id: 'livraison', type: 'livraison', nom: 'Livraison express', x: 3 * PAS_RUE + LARGEUR_RUE + 96, y: 4 * PAS_RUE + LARGEUR_RUE / 2 },
      { id: 'livraison-2', type: 'livraison', nom: 'Colis du port', x: 1 * PAS_RUE + LARGEUR_RUE + 96, y: 5 * PAS_RUE + LARGEUR_RUE / 2 },
      { id: 'drift', type: 'drift', nom: 'Arène de drift', x: this.arene.x + 80, y: this.arene.y + 136 },
    ];
    for (const d of this.defis) d.fait = false;
    // Radars de vitesse sur de longues lignes droites.
    this.radars = [
      { id: 'radar-a', x: 1 * PAS_RUE + LARGEUR_RUE + 96, y: 3 * PAS_RUE + 72 },
      { id: 'radar-b', x: 5 * PAS_RUE + 72, y: 2 * PAS_RUE + LARGEUR_RUE + 96 },
      { id: 'radar-c', x: 3 * PAS_RUE + LARGEUR_RUE + 96, y: 1 * PAS_RUE + 24 },
    ].map((r) => ({ ...r, attente: 0 }));
    // Caméras de feu rouge.
    this.cameras = [[2, 2], [3, 3], [4, 2], [1, 4], [5, 5]].map(([kx, ky]) => ({ kx, ky }));
    // Affiches Piston : toujours aux mêmes endroits, cachées dans les coins tranquilles.
    const a = creerAlea(GRAINE_PLAN + 1);
    this.affiches = [];
    let essais = 0;
    const zones = ['p', 'q', 'm', 'i', 'k'];
    while (this.affiches.length < AFFICHES && essais++ < 2000) {
      const bx = Math.floor(a() * ILOTS), by = Math.floor(a() * ILOTS);
      if (!zones.includes(PLAN[by][bx])) continue;
      if (this.affiches.some((f) => f.bx === bx && f.by === by)) continue;
      const o = origineIlot(bx, by);
      const x = o.x + 12 + a() * (TAILLE_ILOT - 24), y = o.y + 12 + a() * (TAILLE_ILOT - 24);
      if (!this.libre(x, y, 12)) continue;
      this.affiches.push({ id: `affiche-${this.affiches.length + 1}`, x, y, bx, by });
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
      const dest = this.maisons[Math.floor(this.aleaJour() * this.maisons.length)];
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
    this.temps += dt;
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
    this.contact = false;
    v.maj(dt, true);
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
      if (camera && v.vitesse > 30 && this.feux.etat(c.kx, c.ky, horizontal, this.temps) === 'rouge') {
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
    this.voiture.placer(p.x + p.w / 2, p.y + p.h + 72, 0);
  }

  message(texteMsg, couleur, ancre) {
    this.messages.push({ texte: texteMsg, couleur, x: ancre.x, y: ancre.y, vie: 1, max: 1 });
  }

  heure() {
    const min = Math.min(59, Math.floor((this.temps / DUREE_BALADE) * 60));
    return `18:${String(min).padStart(2, '0')}`;
  }

  // --- Dessin --------------------------------------------------------------------

  peindre() {
    const canvas = document.createElement('canvas');
    canvas.width = TAILLE_VILLE; canvas.height = TAILLE_VILLE;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    // Sol : pelouse Tiny, rues de 6 cases, trottoirs d'une case avec bordure.
    c.fillStyle = '#84c669'; c.fillRect(0, 0, TAILLE_VILLE, TAILLE_VILLE);
    const BITUME = '#52607c', TROTTOIR = '#d4d9e3', BORDURE = '#8b9bb4';
    for (let gy = 0; gy < CASES; gy++) for (let gx = 0; gx < CASES; gx++) {
      const mx = gx % PERIODE, my = gy % PERIODE;
      const rue = mx < CASES_RUE || my < CASES_RUE;
      const trottoir = !rue && (mx === CASES_RUE || mx === PERIODE - 1 || my === CASES_RUE || my === PERIODE - 1);
      const x = gx * T, y = gy * T;
      if (rue) { c.fillStyle = BITUME; c.fillRect(x, y, T, T); }
      else if (trottoir) {
        c.fillStyle = TROTTOIR; c.fillRect(x, y, T, T);
        c.fillStyle = '#c4cad6'; c.fillRect(x + T - 1, y, 1, T); c.fillRect(x, y + T - 1, T, 1);
      }
    }
    // Bordures de trottoir, côté rue.
    c.fillStyle = BORDURE;
    for (let k = 0; k <= ILOTS; k++) {
      const a = k * PAS_RUE, b = a + LARGEUR_RUE;
      for (let s = 0; s < TAILLE_VILLE; s += PAS_RUE) {
        const d = s + LARGEUR_RUE, f = s + PAS_RUE;
        if (f > TAILLE_VILLE) continue;
        if (a > 0) { c.fillRect(a - 2, d, 2, f - d); c.fillRect(d, a - 2, f - d, 2); }
        if (b < TAILLE_VILLE) { c.fillRect(b, d, 2, f - d); c.fillRect(d, b, f - d, 2); }
      }
    }
    // Ligne médiane en tirets entre les deux voies, hors des carrefours.
    c.fillStyle = '#e8e4d6';
    for (let k = 0; k <= ILOTS; k++) {
      const m = k * PAS_RUE + LARGEUR_RUE / 2;
      for (let s = 0; s < TAILLE_VILLE; s += 24) {
        if ((s % PAS_RUE) < LARGEUR_RUE + 18 || (s % PAS_RUE) > PAS_RUE - 30) continue;
        c.fillRect(s, m - 1, 12, 2);
        c.fillRect(m - 1, s, 2, 12);
      }
    }
    // Passages piétons sur les quatre branches de chaque carrefour, dans l'alignement des trottoirs.
    c.fillStyle = '#f4f6fb';
    for (let kx = 0; kx <= ILOTS; kx++) for (let ky = 0; ky <= ILOTS; ky++) {
      const x0 = kx * PAS_RUE, y0 = ky * PAS_RUE;
      for (let i = 4; i < LARGEUR_RUE - 4; i += 12) {
        if (ky < ILOTS) c.fillRect(x0 + i, y0 + LARGEUR_RUE + 2, 7, 13);
        if (ky > 0) c.fillRect(x0 + i, y0 - 15, 7, 13);
        if (kx < ILOTS) c.fillRect(x0 + LARGEUR_RUE + 2, y0 + i, 13, 7);
        if (kx > 0) c.fillRect(x0 - 15, y0 + i, 13, 7);
      }
    }
    // Zones d'entrée des bâtiments.
    for (const p of this.portes) {
      c.fillStyle = 'rgba(242,193,78,0.35)'; c.fillRect(p.x, p.y, p.w, p.h);
      c.fillStyle = '#f2c14e';
      for (let i = 0; i < p.w; i += 6) { c.fillRect(p.x + i, p.y, 3, 2); c.fillRect(p.x + i, p.y + p.h - 2, 3, 2); }
      for (let i = 0; i < p.h; i += 6) { c.fillRect(p.x, p.y + i, 2, 3); c.fillRect(p.x + p.w - 2, p.y + i, 2, 3); }
    }
    this.statiques.sort((a, b) => a.y - b.y);
    for (const s of this.statiques) s.dessin(c);
    return canvas;
  }

  peindreMiniCarte() {
    const n = 84;
    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const c = canvas.getContext('2d');
    const e = n / TAILLE_VILLE;
    c.fillStyle = '#84c669'; c.fillRect(0, 0, n, n);
    c.fillStyle = '#52607c';
    for (let k = 0; k <= ILOTS; k++) {
      const m = k * PAS_RUE * e;
      c.fillRect(m, 0, LARGEUR_RUE * e, n); c.fillRect(0, m, n, LARGEUR_RUE * e);
    }
    for (const ob of this.obstacles) if (ob.type === 'rect' && !ob.voiture) {
      c.fillStyle = ob.bat ? ob.bat.toit : ob.eau ? '#75e3ff' : '#c0cbdc';
      c.fillRect(ob.x * e, ob.y * e, Math.max(1, ob.w * e), Math.max(1, ob.h * e));
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
    ctx.drawImage(this.canvas, camX, camY, W, H, 0, 0, W, H);
    ctx.save();
    ctx.translate(-camX, -camY);
    const visible = (x, y, m = 40) => x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m;

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

    dessinerVoitureTiny(ctx, spriteVoitureTiny(v.couleur, '#f2c14e', v.looks), v.x, v.y, v.angle);

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
    for (let kx = 0; kx <= ILOTS; kx++) for (let ky = 0; ky <= ILOTS; ky++) {
      const x0 = kx * PAS_RUE, y0 = ky * PAS_RUE;
      if (!visible(x0 + 48, y0 + 48, 120)) continue;
      const h = this.feux.etat(kx, ky, true, this.temps);
      const v = this.feux.etat(kx, ky, false, this.temps);
      const L = LARGEUR_RUE;
      // Nord-ouest : ceux qui descendent ; nord-est : ceux qui vont à l'ouest ;
      // sud-est : ceux qui montent ; sud-ouest : ceux qui vont à l'est.
      for (const [x, y, e] of [[x0 - 8, y0 - 2, v], [x0 + L + 8, y0 - 2, h], [x0 + L + 8, y0 + L + 14, v], [x0 - 8, y0 + L + 14, h]]) {
        if (x < 0 || y < 0 || x > TAILLE_VILLE || y > TAILLE_VILLE) continue;
        feuTricolore(ctx, x, y, e);
      }
      if (this.cameras.some((c) => c.kx === kx && c.ky === ky)) {
        const x = x0 + L + 8, y = y0 - 44;
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
