/* ville.js — la balade en ville, une fois par jour, pendant une heure de jeu.
 *
 * On sort du garage en voiture et on roule librement dans Pistonville avec
 * les mêmes commandes qu'en course (gauche / droite), un peu moins vite.
 * Tout ce qui est construit est solide : bâtiments, arbres, lampadaires,
 * boîtes aux lettres, bornes, voitures garées, bassin du parc.
 * Devant chaque bâtiment utile, une zone jaune : on s'y gare pour entrer
 * (Bureau des courses, Concession, Pièces Auto, Tombola, Café des pilotes,
 * et le Garage pour rentrer). Pièces d'or, disquettes et fans à ramasser.
 */

import { Voiture, DEMI_LONGUEUR, DEMI_LARGEUR } from './voiture.js';
import { spriteVoiture, tuile, objet, idPersonnage, PERSONNAGES, DIRECTION, bulle, T } from './sprites.js';
import { immeuble, maison } from './rendu-circuit.js';
import { texte } from './course.js';
import { clamp, lerp, creerAlea, hash2 } from './outils.js';

const PERIODE = 14;                 // rue (4) + trottoir (1) + îlot (8) + trottoir (1), en cases
const ILOTS = 4;
const CASES = ILOTS * PERIODE + 4;  // 60 cases = 960 px
export const TAILLE_VILLE = CASES * T;
export const DUREE_BALADE = 80;     // secondes réelles pour une heure de jeu
const HAUT_HUD = 52;

/** Bâtiments où l'on peut entrer, et leur îlot (colonne, ligne). */
export const BATIMENTS = [
  { id: 'garage', nom: 'Garage Piston', ilot: [1, 1], toit: '#f2c14e' },
  { id: 'bureau', nom: 'Bureau des courses', ilot: [2, 1], toit: '#c2504d' },
  { id: 'concession', nom: 'Concession', ilot: [0, 2], toit: '#2f6fdb' },
  { id: 'pieces', nom: 'Pièces Auto', ilot: [2, 2], toit: '#3fa34d' },
  { id: 'tombola', nom: 'Tombola', ilot: [3, 0], toit: '#e86ca6' },
  { id: 'cafe', nom: 'Café des pilotes', ilot: [1, 3], toit: '#8a5a3b' },
];
const PARCS = [[0, 0], [3, 2]];
const PARKING = [3, 3];

const origineIlot = (bx, by) => ({ x: (bx * PERIODE + 5) * T, y: (by * PERIODE + 5) * T });
const TAILLE_ILOT = 8 * T;

export class Ville {
  /**
   * @param {object} o planche, voiture (decrireVoiture), son, graine
   */
  constructor(o) {
    this.planche = o.planche;
    this.son = o.son;
    this.alea = creerAlea(o.graine || 1);
    this.obstacles = [];
    this.grille = new Map();
    this.portes = [];
    this.bonus = [];
    this.fans = [];
    this.statiques = [];
    this.construire();
    this.canvas = this.peindre();
    this.minicarte = this.peindreMiniCarte();

    const p = o.voiture.physique;
    // En ville, on roule plus doucement : 60 % de la pointe, plafonnée.
    const physique = { ...p, vmax: Math.min(150, p.vmax * 0.6), accel: p.accel * 0.8 };
    this.voiture = new Voiture({ physique, couleur: o.voiture.couleur, nom: 'moi', joueur: true });
    this.voiture.looks = o.voiture.looks || [];
    this.voiture.braquageMin = 0.6;   // on peut se dégager d'un mur en braquant
    const garage = this.portes.find((g) => g.id === 'garage');
    this.voiture.placer(garage.x + garage.w / 2, garage.y + garage.h + 26, Math.PI / 2);
    this.ignorer = 'garage';           // on ne rentre pas dans la porte d'où l'on sort
    this.camera = { x: this.voiture.x, y: this.voiture.y };
    this.temps = 0;
    this.gains = { argent: 0, recherche: 0, fans: 0, exp: 0 };
    this.messages = [];
    this.particules = [];
    this.secousse = 0;
    this.entree = null;                // bâtiment où la voiture vient d'entrer
    this.fini = false;
  }

  // --- Plan de la ville ----------------------------------------------------------

  construire() {
    const a = this.alea;
    for (let by = 0; by < ILOTS; by++) for (let bx = 0; bx < ILOTS; bx++) {
      const o = origineIlot(bx, by);
      const bat = BATIMENTS.find((b) => b.ilot[0] === bx && b.ilot[1] === by);
      if (bat) this.ilotBatiment(o, bat);
      else if (PARCS.some(([x, y]) => x === bx && y === by)) this.ilotParc(o);
      else if (PARKING[0] === bx && PARKING[1] === by) this.ilotParking(o);
      else this.ilotMaisons(o, bx, by);
      this.trottoirs(o, bat);
    }
    // Voitures garées le long des rues, dans la voie du bord.
    for (let k = 0; k <= ILOTS; k++) {
      const route = k * PERIODE * T;
      for (let s = 5 * T; s < TAILLE_VILLE - 5 * T; s += 48) {
        if (a() < 0.12) this.voitureGaree(s + 8, route + 12, true);
        if (a() < 0.12) this.voitureGaree(route + 12, s + 8, false);
      }
    }
    // Pièces sur les rues (lignes de trois), disquettes plus rares.
    for (let k = 0; k <= ILOTS; k++) {
      const milieu = k * PERIODE * T + 2 * T;
      for (let s = 3 * T; s < TAILLE_VILLE - 3 * T; s += 150 + a() * 140) {
        const horizontal = a() < 0.5;
        if (a() < 0.18) {
          this.bonus.push({ type: 'disque', x: horizontal ? s : milieu, y: horizontal ? milieu : s, pris: false });
          continue;
        }
        for (let i = 0; i < 3; i++) {
          const d = s + i * 16;
          this.bonus.push({ type: 'piece', x: horizontal ? d : milieu, y: horizontal ? milieu : d, pris: false });
        }
      }
    }
    // Bonus posés sur une voiture garée : on les retire.
    this.bonus = this.bonus.filter((b) => !this.obstacles.some((ob) => toucheCercle(ob, b.x, b.y, 8)));
    this.indexer();
  }

  ajouter(ob) { this.obstacles.push(ob); }

  ilotBatiment(o, bat) {
    const b = { type: 'rect', x: o.x + 8, y: o.y + 8, w: TAILLE_ILOT - 16, h: 88, bat };
    this.ajouter(b);
    this.statiques.push({ y: b.y + b.h, dessin: (c) => batimentSpecial(c, b, bat) });
    const porte = { id: bat.id, nom: bat.nom, x: o.x + 40, y: b.y + b.h + 4, w: 48, h: 22, couleur: bat.toit };
    this.portes.push(porte);
    // Deux jardinières encadrent l'entrée (solides).
    for (const dx of [16, TAILLE_ILOT - 16]) {
      this.ajouter({ type: 'cercle', x: o.x + dx, y: b.y + b.h + 14, r: 5 });
      this.statiques.push({ y: b.y + b.h + 20, dessin: (c) => objet(c, this.planche, 'jardiniere', o.x + dx, b.y + b.h + 20) });
    }
  }

  ilotMaisons(o, bx, by) {
    const a = this.alea;
    for (let i = 0; i < 4; i++) {
      const lx = o.x + (i % 2) * 64, ly = o.y + Math.floor(i / 2) * 64;
      const r = hash2(bx * 2 + (i % 2), by * 2 + Math.floor(i / 2), 77);
      const toit = ['#c2504d', '#4f7ddb', '#7a5a9e', '#3fa34d', '#d08a3e'][Math.floor(r * 5)];
      if (r < 0.45) {
        const m = { type: 'rect', x: lx + 8, y: ly + 6, w: 48, h: 40 };
        this.ajouter(m);
        this.statiques.push({ y: m.y + m.h, dessin: (c) => maison(c, m.x, m.y, m.w, m.h, toit) });
        if (a() < 0.7) {
          const ax = lx + (a() < 0.5 ? 6 : 58), ay = ly + 58;
          this.ajouter({ type: 'cercle', x: ax, y: ay - 4, r: 5 });
          this.statiques.push({ y: ay, dessin: (c) => objet(c, this.planche, a() < 0.5 ? 'arbreRond' : 'buisson', ax, ay) });
        }
      } else {
        const m = { type: 'rect', x: lx + 4, y: ly + 4, w: 56, h: 52 };
        this.ajouter(m);
        this.statiques.push({ y: m.y + m.h, dessin: (c) => immeuble(c, m.x, m.y, m.w, m.h, toit, r) });
      }
    }
  }

  ilotParc(o) {
    const a = this.alea;
    const bassin = { type: 'rect', x: o.x + 32, y: o.y + 40, w: 64, h: 40, eau: true };
    this.ajouter(bassin);
    this.statiques.push({ y: 0, dessin: (c) => {
      c.fillStyle = '#7e7c93'; c.fillRect(bassin.x - 2, bassin.y - 2, bassin.w + 4, bassin.h + 4);
      c.fillStyle = '#59b6d8'; c.fillRect(bassin.x, bassin.y, bassin.w, bassin.h);
      c.fillStyle = '#9fdcef'; c.fillRect(bassin.x + 8, bassin.y + 10, 10, 1); c.fillRect(bassin.x + 36, bassin.y + 26, 12, 1);
    } });
    for (let i = 0; i < 9; i++) {
      const x = o.x + 10 + a() * (TAILLE_ILOT - 20), y = o.y + 14 + a() * (TAILLE_ILOT - 24);
      if (x > bassin.x - 12 && x < bassin.x + bassin.w + 12 && y > bassin.y - 8 && y < bassin.y + bassin.h + 16) continue;
      this.ajouter({ type: 'cercle', x, y: y - 4, r: 5 });
      const nom = ['arbre', 'arbreRond', 'arbreBoule', 'sapin'][Math.floor(a() * 4)];
      this.statiques.push({ y, dessin: (c) => objet(c, this.planche, nom, x, y) });
    }
    this.statiques.push({ y: o.y + 100, dessin: (c) => objet(c, this.planche, 'banc', o.x + 64, o.y + 100) });
    this.ajouter({ type: 'rect', x: o.x + 57, y: o.y + 92, w: 14, h: 8 });
    this.fans.push(this.creerFan(o.x + 20, o.y + 110));
  }

  ilotParking(o) {
    this.statiques.push({ y: 0, dessin: (c) => {
      c.fillStyle = '#62697f'; c.fillRect(o.x, o.y, TAILLE_ILOT, TAILLE_ILOT);
      c.fillStyle = '#d9d6e6';
      for (let x = o.x + 8; x <= o.x + TAILLE_ILOT - 8; x += 20) { c.fillRect(x, o.y + 6, 1, 28); c.fillRect(x, o.y + TAILLE_ILOT - 34, 1, 28); }
    } });
    for (let x = o.x + 18; x < o.x + TAILLE_ILOT - 8; x += 20) {
      if (this.alea() < 0.6) this.voitureGaree(x, o.y + 20, false);
      if (this.alea() < 0.6) this.voitureGaree(x, o.y + TAILLE_ILOT - 20, false);
    }
    this.fans.push(this.creerFan(o.x + 64, o.y + 64));
  }

  voitureGaree(x, y, horizontale) {
    const couleur = ['#c2504d', '#4f7ddb', '#f4f1e8', '#3fa34d', '#8a6ad6', '#2a2838'][Math.floor(this.alea() * 6)];
    const ob = horizontale
      ? { type: 'rect', x: x - 11, y: y - 7, w: 22, h: 14 }
      : { type: 'rect', x: x - 7, y: y - 11, w: 14, h: 22 };
    if (this.obstacles.some((o) => o.type === 'rect' && chevauche(o, ob, 4))) return;
    ob.voiture = { couleur, horizontale };
    this.ajouter(ob);
    this.statiques.push({ y: y + 10, dessin: (c) => {
      const s = spriteVoiture(couleur);
      c.save(); c.translate(x, y); if (horizontale) c.rotate(Math.PI / 2);
      c.drawImage(s, -Math.floor(s.width / 2), -Math.floor(s.height / 2)); c.restore();
    } });
  }

  /** Mobilier du trottoir : lampadaires, boîtes aux lettres, bornes, poubelles. */
  trottoirs(o, bat) {
    const a = this.alea;
    const bord = 6;   // côté rue du trottoir
    const cotes = [
      (s) => ({ x: o.x + s, y: o.y - T + bord + 9 }),                 // nord
      (s) => ({ x: o.x + s, y: o.y + TAILLE_ILOT + T - bord }),       // sud
      (s) => ({ x: o.x - T + bord, y: o.y + s + 8 }),                 // ouest
      (s) => ({ x: o.x + TAILLE_ILOT + T - bord, y: o.y + s + 8 }),   // est
    ];
    cotes.forEach((pos, ci) => {
      for (let s = 16; s < TAILLE_ILOT; s += 32) {
        // Devant la porte d'un bâtiment, le trottoir reste libre.
        if (bat && ci === 1 && s > 24 && s < 104) continue;
        const p = pos(s);
        const r = a();
        let nom = null;
        if (s % 64 === 16) nom = 'lampadaire';
        else if (r < 0.12) nom = 'boiteAuxLettres';
        else if (r < 0.2) nom = 'borneIncendie';
        else if (r < 0.28) nom = 'poubelle';
        if (!nom) continue;
        this.ajouter({ type: 'cercle', x: p.x, y: p.y - 3, r: nom === 'lampadaire' ? 3 : 4 });
        this.statiques.push({ y: p.y, dessin: (c) => objet(c, this.planche, nom, p.x, p.y) });
      }
    });
    if (!bat && a() < 0.5) this.fans.push(this.creerFan(o.x + 30 + a() * 60, o.y + TAILLE_ILOT + 10));
  }

  creerFan(x, y) {
    return { x, y, base: PERSONNAGES[Math.floor(this.alea() * PERSONNAGES.length)], content: 0, vu: false };
  }

  /** Grille d'accès rapide aux obstacles (cases de 64 px). */
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

  // --- Mise à jour ---------------------------------------------------------------

  maj(dt, entrees) {
    if (this.fini || this.entree) return;
    this.temps += dt;
    const v = this.voiture;
    v.direction = (entrees.droite ? 1 : 0) - (entrees.gauche ? 1 : 0);
    // Les deux côtés à la fois : on freine.
    v.frein = entrees.gauche && entrees.droite ? 1 : 0;
    if (v.frein) v.direction = 0;
    v.maj(dt, true);
    this.chocs(v);
    this.ramasser(v);
    this.portesDevant(v);
    for (const m of this.messages) m.vie -= dt;
    this.messages = this.messages.filter((m) => m.vie > 0);
    for (const p of this.particules) { p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt; }
    this.particules = this.particules.filter((p) => p.vie > 0);
    for (const f of this.fans) if (f.content > 0) f.content -= dt;
    if (this.secousse > 0) this.secousse = Math.max(0, this.secousse - dt * 18);
    if (this.temps >= DUREE_BALADE) this.fini = true;
  }

  chocs(v) {
    // Bords de la ville.
    const m = 12;
    if (v.x < m || v.x > TAILLE_VILLE - m) { v.x = clamp(v.x, m, TAILLE_VILLE - m); v.vx *= -0.5; }
    if (v.y < m || v.y > TAILLE_VILLE - m) { v.y = clamp(v.y, m, TAILLE_VILLE - m); v.vy *= -0.5; }
    for (let iter = 0; iter < 2; iter++) {
      for (const ob of this.proches(v.x, v.y)) {
        const c = ob.type === 'rect' ? contreRect(v, ob) : contreCercle(v, ob);
        if (!c) continue;
        v.x += c.nx * c.prof; v.y += c.ny * c.prof;
        const choc = -(v.vx * c.nx + v.vy * c.ny);
        if (choc <= 0) continue;
        v.vx += c.nx * choc * 1.3; v.vy += c.ny * choc * 1.3;
        v.vx *= 0.75; v.vy *= 0.75;
        if (choc > 35) {
          this.son?.choc(choc);
          this.secousse = Math.min(4, choc / 30);
          for (let i = 0; i < 6; i++) this.particules.push({ x: v.x - c.nx * 10, y: v.y - c.ny * 10, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, vie: 0.25 });
        }
      }
    }
  }

  ramasser(v) {
    for (const b of this.bonus) {
      if (b.pris || (b.x - v.x) ** 2 + (b.y - v.y) ** 2 > 14 * 14) continue;
      b.pris = true;
      if (b.type === 'piece') { this.gains.argent += 20; this.message('+20 G', '#ffe066', b); this.son?.piece(); }
      else { this.gains.recherche += 1; this.message('+1 PR', '#7dd3fc', b); this.son?.disque(); }
    }
    for (const f of this.fans) {
      if (f.vu || (f.x - v.x) ** 2 + (f.y - v.y) ** 2 > 30 * 30) continue;
      f.vu = true; f.content = 2;
      this.gains.fans += 5; this.gains.exp += 5;
      this.message('Un autographe ! +5 fans', '#f9a8d4', f);
      this.son?.caisse();
    }
  }

  portesDevant(v) {
    let dans = null;
    for (const p of this.portes) {
      if (v.x > p.x && v.x < p.x + p.w && v.y > p.y && v.y < p.y + p.h) dans = p;
    }
    if (!dans) { this.ignorer = null; return; }
    if (dans.id === this.ignorer) return;
    this.entree = dans;
    this.ignorer = dans.id;
    v.vx = 0; v.vy = 0;
    this.son?.bip(660, 0.12);
  }

  /** Ressortir d'un bâtiment : la voiture repart face à la rue. */
  sortir() {
    const p = this.entree;
    this.entree = null;
    if (!p) return;
    const v = this.voiture;
    v.placer(p.x + p.w / 2, p.y + p.h / 2, Math.PI / 2);
  }

  message(texteMsg, couleur, ancre) {
    this.messages.push({ texte: texteMsg, couleur, x: ancre.x, y: ancre.y, vie: 1, max: 1 });
  }

  /** Heure affichée : de 18 h 00 à 19 h 00. */
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
    c.fillStyle = '#38cbab'; c.fillRect(0, 0, TAILLE_VILLE, TAILLE_VILLE);
    for (let gy = 0; gy < CASES; gy++) for (let gx = 0; gx < CASES; gx++) {
      const mx = gx % PERIODE, my = gy % PERIODE;
      const rue = mx < 4 || my < 4;
      const trottoir = !rue && (mx === 4 || mx === 13 || my === 4 || my === 13);
      const x = gx * T, y = gy * T;
      if (rue) tuile(c, this.planche, 441, x, y);
      else if (trottoir) tuile(c, this.planche, 36, x, y);
      else if (hash2(gx, gy, 5) < 0.05) { c.fillStyle = '#33bdae'; c.fillRect(x + 4, y + 6, 2, 2); }
    }
    // Marquage au sol : tirets au milieu des rues.
    c.fillStyle = '#d9d6e6';
    for (let k = 0; k <= ILOTS; k++) {
      const m = k * PERIODE * T + 2 * T;
      for (let s = 0; s < TAILLE_VILLE; s += 24) {
        const dansCarrefour = (s % (PERIODE * T)) < 4 * T;
        if (dansCarrefour) continue;
        c.fillRect(s, m - 1, 12, 2);
        c.fillRect(m - 1, s, 2, 12);
      }
    }
    // Passages piétons aux carrefours.
    for (let kx = 0; kx <= ILOTS; kx++) for (let ky = 0; ky <= ILOTS; ky++) {
      const x0 = kx * PERIODE * T, y0 = ky * PERIODE * T;
      for (let i = 2; i < 4 * T; i += 6) {
        c.fillRect(x0 + i, y0 + 4 * T + 1, 3, 10);
        c.fillRect(x0 + 4 * T + 1, y0 + i, 10, 3);
      }
    }
    // Zones d'entrée, avant les objets.
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
    const n = 72;
    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const c = canvas.getContext('2d');
    const e = n / TAILLE_VILLE;
    c.fillStyle = '#38cbab'; c.fillRect(0, 0, n, n);
    c.fillStyle = '#5c6278';
    for (let k = 0; k <= ILOTS; k++) {
      const m = k * PERIODE * T * e;
      c.fillRect(m, 0, 4 * T * e, n); c.fillRect(0, m, n, 4 * T * e);
    }
    for (const ob of this.obstacles) if (ob.type === 'rect' && !ob.voiture) {
      c.fillStyle = ob.bat ? ob.bat.toit : ob.eau ? '#59b6d8' : '#9896ab';
      c.fillRect(ob.x * e, ob.y * e, Math.max(1, ob.w * e), Math.max(1, ob.h * e));
    }
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

    // Enseignes clignotantes au-dessus des portes.
    for (const p of this.portes) {
      if (p.x + p.w < camX - 60 || p.x > camX + W + 60 || p.y < camY - 20 || p.y > camY + H + 40) continue;
      const fl = Math.sin(t * 5) > 0 ? 1 : 0;
      texte(ctx, p.id === 'garage' ? 'RENTRER' : 'ENTRER', p.x + p.w / 2, p.y + p.h / 2 - fl, 9, '#ffe066', 'center');
    }

    for (const b of this.bonus) if (!b.pris) dessinerBonusVille(ctx, b, t);
    for (const f of this.fans) {
      const saute = f.content > 0 && Math.sin(t * 14) > 0;
      tuile(ctx, this.planche, idPersonnage(f.base, DIRECTION.face, saute ? 1 : 0), f.x - 8, f.y - 14 - (saute ? 2 : 0));
      if (!f.vu && Math.sin(t * 3 + f.x) > -0.3) bulle(ctx, f.x, f.y - 16, 'Fan !');
    }

    // Voiture du joueur.
    ctx.fillStyle = 'rgba(30,28,40,0.28)';
    ctx.save(); ctx.translate(Math.round(v.x) + 2, Math.round(v.y) + 2); ctx.rotate(v.angle + Math.PI / 2);
    ctx.fillRect(-7, -11, 14, 23); ctx.restore();
    const s = spriteVoiture(v.couleur, '#f2c14e', v.looks);
    ctx.save(); ctx.translate(Math.round(v.x), Math.round(v.y)); ctx.rotate(v.angle + Math.PI / 2);
    ctx.drawImage(s, -Math.floor(s.width / 2), -Math.floor(s.height / 2)); ctx.restore();

    ctx.fillStyle = '#ffe066';
    for (const p of this.particules) ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    for (const m of this.messages) {
      const a = 1 - m.vie / m.max;
      texte(ctx, m.texte, m.x, m.y - 20 - a * 16, 10, m.couleur, 'center');
    }
    ctx.restore();

    this.dessinerInterface(ctx, W, H, t);
  }

  dessinerInterface(ctx, W, H) {
    ctx.fillStyle = 'rgba(31,42,68,0.92)'; ctx.fillRect(0, 0, W, HAUT_HUD);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, HAUT_HUD, W, 2);
    texte(ctx, 'BALADE EN VILLE', 8, 12, 10, '#9fb3d9', 'left');
    texte(ctx, this.heure(), 8, 32, 18, '#ffe066', 'left');
    const reste = 1 - this.temps / DUREE_BALADE;
    ctx.fillStyle = '#3a4a6b'; ctx.fillRect(8, 44, 140, 4);
    ctx.fillStyle = reste > 0.25 ? '#5ad16a' : '#e4432d'; ctx.fillRect(8, 44, Math.round(140 * reste), 4);
    texte(ctx, `${this.gains.argent} G`, 156, 18, 11, '#ffe066', 'left');
    texte(ctx, `${this.gains.recherche} PR · ${this.gains.fans} fans`, 156, 36, 10, '#cfe0ff', 'left');

    const mc = this.minicarte;
    const mx = W - mc.width - 6, my = HAUT_HUD + 8;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(mx - 3, my - 3, mc.width + 6, mc.height + 6);
    ctx.drawImage(mc, mx, my);
    const e = mc.width / TAILLE_VILLE;
    for (const p of this.portes) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(mx + (p.x + p.w / 2) * e) - 1, Math.round(my + p.y * e) - 1, 3, 3);
    }
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(Math.round(mx + this.voiture.x * e) - 3, Math.round(my + this.voiture.y * e) - 3, 6, 6);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(Math.round(mx + this.voiture.x * e) - 2, Math.round(my + this.voiture.y * e) - 2, 4, 4);

    // Rappel des commandes en bas.
    ctx.fillStyle = 'rgba(31,42,68,0.55)';
    ctx.fillRect(0, H - 26, W, 26);
    texte(ctx, '◀ gauche', 10, H - 13, 10, '#f4f1e8', 'left');
    texte(ctx, 'les deux : freiner', W / 2, H - 13, 9, '#cfe0ff', 'center');
    texte(ctx, 'droite ▶', W - 10, H - 13, 10, '#f4f1e8', 'right');
  }

  bilan() { return { ...this.gains, exp: this.gains.exp + Math.round(this.gains.argent / 40) }; }
}

// --- Géométrie des chocs ---------------------------------------------------------

function boite(ob) {
  if (ob.type === 'rect') return { x0: ob.x, y0: ob.y, x1: ob.x + ob.w, y1: ob.y + ob.h };
  return { x0: ob.x - ob.r, y0: ob.y - ob.r, x1: ob.x + ob.r, y1: ob.y + ob.r };
}

function chevauche(a, b, marge = 0) {
  return a.x < b.x + b.w + marge && b.x < a.x + a.w + marge && a.y < b.y + b.h + marge && b.y < a.y + a.h + marge;
}

function toucheCercle(ob, x, y, r) {
  if (ob.type === 'rect') return x > ob.x - r && x < ob.x + ob.w + r && y > ob.y - r && y < ob.y + ob.h + r;
  return (ob.x - x) ** 2 + (ob.y - y) ** 2 < (ob.r + r) ** 2;
}

/** Voiture (rectangle orienté) contre rectangle aligné : normale qui pousse la voiture dehors. */
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

function batimentSpecial(c, b, bat) {
  immeuble(c, b.x, b.y, b.w, b.h, bat.toit, 0.3);
  // Enseigne sur le toit.
  c.fillStyle = '#1f2a44'; c.fillRect(b.x + 6, b.y + 18, b.w - 12, 22);
  c.fillStyle = '#fff6e0'; c.fillRect(b.x + 8, b.y + 20, b.w - 16, 18);
  texte(c, bat.nom, b.x + b.w / 2, b.y + 29, 9, '#1f2a44', 'center');
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
