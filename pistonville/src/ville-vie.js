/* ville-vie.js — ce qui bouge en ville : circulation, feux, piétons.
 *
 * Circulation à droite sur le réseau de reseau.js : une voie par sens dans
 * les rues et sur les routes de campagne, deux sur les boulevards. Chaque
 * voiture suit sa voie, s'arrête derrière celle de devant et au feu rouge, et
 * choisit au carrefour d'aller tout droit, à droite ou à gauche (à droite
 * depuis la voie de droite, à gauche vers la voie de gauche). Les feux des
 * carrefours de ville sont décalés pour que tout ne change pas en même temps.
 * À la campagne, pas de feux : la route la plus large (ou l'est-ouest) est
 * prioritaire, l'autre a un STOP (on marque l'arrêt, on attend que le
 * carrefour soit libre). Les piétons font
 * le tour des pâtés de la ville sur les trottoirs et sautent de côté si on
 * leur fonce dessus.
 */

import { PERSONNAGES, DIRECTION, bulle, T } from './sprites.js';
import { dessinerVoiture, prechaufferVoiture, vehiculeAuHasard, dessinerPerso, tenue } from './tiny.js';
import { hash2 } from './outils.js';
import { DIRS } from './reseau.js';

const CYCLE = 9;
const NOMS_DIRECTION = ['gauche', 'face', 'dos', 'droite'];

export class Feux {
  /** urbain(kx, ky) : ce carrefour est-il en ville (feux) ou à la campagne (STOP) ? */
  constructor(reseau, graine, urbain) {
    this.r = reseau;
    this.urbain = urbain;
    this.decalage = (kx, ky) => hash2(kx, ky, graine) * CYCLE;
  }

  /** La route prioritaire d'un carrefour de campagne : la plus large, sinon l'est-ouest. */
  prioriteHorizontale(kx, ky) { return this.r.L[ky] >= this.r.L[kx]; }

  /** 'vert' | 'orange' | 'rouge' pour l'axe horizontal (est-ouest) ou vertical ; 'stop' à la campagne. */
  etat(kx, ky, horizontal, t) {
    if (!this.r.croisement(kx, ky)) return 'vert';
    if (!this.urbain(kx, ky)) return horizontal === this.prioriteHorizontale(kx, ky) ? 'vert' : 'stop';
    const c = (t + this.decalage(kx, ky)) % CYCLE;
    const h = c < 3.8 ? 'vert' : c < 4.5 ? 'orange' : 'rouge';
    const v = c < 4.5 ? 'rouge' : c < 8.3 ? 'vert' : 'orange';
    return horizontal ? h : v;
  }
}

export class Trafic {
  /**
   * o.ville(kx, ky) : ce tronçon part-il d'un carrefour de ville ? (deux tiers des
   * voitures y naissent).
   */
  constructor(reseau, alea, nombre, feux, o = {}) {
    this.r = reseau;
    this.feux = feux;
    this.alea = alea;
    this.voitures = [];
    const r = reseau;
    const troncons = [];
    for (let k = 0; k <= r.N; k++) for (let s = 0; s < r.N; s++) {
      if (r.H[k][s]) troncons.push({ horizontal: true, k, s, ville: o.ville?.(s, k) });
      if (r.V[k][s]) troncons.push({ horizontal: false, k, s, ville: o.ville?.(k, s) });
    }
    const couleurs = ['#c2504d', '#4f7ddb', '#f4f1e8', '#3fa34d', '#8a6ad6', '#2a2838', '#f39c33', '#4fc3d8'];
    for (let i = 0; i < nombre; i++) {
      const enVille = i % 3 !== 2;
      const liste = troncons.filter((t) => !!t.ville === enVille);
      const t = (liste.length ? liste : troncons)[Math.floor(alea() * (liste.length || troncons.length))];
      const dir = t.horizontal ? (alea() < 0.5 ? 0 : 2) : (alea() < 0.5 ? 1 : 3);
      const n = Math.floor(alea() * r.voies(t.k));
      // Le long du tronçon, entre les deux carrefours (loin de chacun).
      const debut = r.X[t.s] + r.L[t.s] + 30, fin = r.X[t.s + 1] - 30;
      const pos = debut + alea() * Math.max(0, fin - debut);
      const v = { dir, k: t.k, n, vmax: 55 + alea() * 30, v: 0, couleur: couleurs[i % couleurs.length], modele: vehiculeAuHasard(alea, enVille), choix: null, klaxon: 0, bloque: 0 };
      if (t.horizontal) { v.x = pos; v.y = r.voie(dir, t.k, n); } else { v.x = r.voie(dir, t.k, n); v.y = pos; }
      v.angle = Math.atan2(DIRS[dir][1], DIRS[dir][0]);
      prechaufferVoiture(v.modele, v.couleur);
      this.voitures.push(v);
    }
  }

  dansCarrefour(x, y) { return this.r.dansCarrefour(x, y); }

  maj(dt, t, joueur) {
    const r = this.r;
    for (const c of this.voitures) {
      const [dx, dy] = DIRS[c.dir];
      const dedans = r.dansCarrefour(c.x, c.y);
      let cible = c.vmax;

      if (!dedans) {
        c.choix = null;
        // Feu ou STOP du prochain carrefour : on s'arrête à la ligne, avant d'y entrer.
        const p = r.prochain(c.dir, c.k, c.x, c.y);
        const avant = (dx ? c.x + dx * 23 : c.y + dy * 23);
        const dist = (dx || dy) > 0 ? p.bord - avant : avant - p.bord;
        const etat = this.feux.etat(p.kx, p.ky, !!dx, t);
        if (etat === 'stop') {
          if (dist < 22 && dist > -3) {
            c.arret = (c.arret || 0) + dt;
            if (c.arret < 1 || !this.carrefourLibre(p.kx, p.ky, c, joueur)) cible = 0;
          } else if (dist < 60 && dist > 0 && !c.arret) cible = Math.min(cible, (dist - 18) * 2);
          else if (dist > 60) c.arret = 0;
        } else if (dist < 22 && dist > -3 && etat !== 'vert') cible = 0;
        else if (dist < 60 && dist > 0 && etat !== 'vert') cible = Math.min(cible, (dist - 18) * 2);
      } else if (c.choix === null) {
        c.choix = this.choisir(c, dedans);
        c.arret = 0;
      }

      // Quelqu'un devant (voiture ou joueur) : on freine.
      const devant = (ox, oy) => {
        const rx = ox - c.x, ry = oy - c.y;
        const a = rx * dx + ry * dy, l = Math.abs(-rx * dy + ry * dx);
        return a > 0 && a < 62 && l < 20;
      };
      let gene = false;
      if (!dedans) for (const o of this.voitures) if (o !== c && devant(o.x, o.y)) { cible = 0; break; }
      if (devant(joueur.x, joueur.y)) { cible = 0; gene = true; }
      c.bloque = gene ? c.bloque + dt : 0;
      if (c.bloque > 1.2 && c.klaxon <= 0) { c.klaxon = 1.4; c.pouet = true; }
      if (c.klaxon > 0) c.klaxon -= dt;

      c.v += Math.max(-220 * dt, Math.min(90 * dt, cible - c.v));
      c.x += dx * c.v * dt;
      c.y += dy * c.v * dt;

      // Virage : quand on atteint la voie visée de la nouvelle route.
      if (dedans && c.choix && c.choix.dir !== c.dir) {
        const { dir: nd, n } = c.choix;
        if (nd % 2 === 1) {
          const tx = r.voie(nd, dedans.kx, n);
          if ((dx > 0 && c.x >= tx) || (dx < 0 && c.x <= tx)) { c.x = tx; c.dir = nd; c.k = dedans.kx; c.n = n; }
        } else {
          const ty = r.voie(nd, dedans.ky, n);
          if ((dy > 0 && c.y >= ty) || (dy < 0 && c.y <= ty)) { c.y = ty; c.dir = nd; c.k = dedans.ky; c.n = n; }
        }
      }
      const vise = Math.atan2(DIRS[c.dir][1], DIRS[c.dir][0]);
      let d = vise - c.angle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      c.angle += d * Math.min(1, dt * 10);
    }
  }

  /** Personne dans le carrefour ni sur le point d'y entrer par la route prioritaire. */
  carrefourLibre(kx, ky, moi, joueur) {
    const q = this.r.carre(kx, ky);
    const horizontale = this.feux.prioriteHorizontale(kx, ky);
    const approche = (x, y) => (horizontale
      ? x > q.x - 90 && x < q.x + q.w + 90 && y > q.y - 6 && y < q.y + q.h + 6
      : y > q.y - 90 && y < q.y + q.h + 90 && x > q.x - 6 && x < q.x + q.w + 6);
    for (const o of this.voitures) {
      if (o === moi) continue;
      if (o.x > q.x && o.x < q.x + q.w && o.y > q.y && o.y < q.y + q.h) return false;
      if (approche(o.x, o.y) && (o.dir % 2 === 0) === horizontale) return false;
    }
    return !approche(joueur.x, joueur.y);
  }

  /** Tout droit, à droite ou à gauche, selon les branches du carrefour ; jamais demi-tour s'il y a le choix. */
  choisir(c, { kx, ky }) {
    const b = this.r.branches(kx, ky);
    const droite = (c.dir + 1) % 4, gauche = (c.dir + 3) % 4;
    const options = [[c.dir, 5], [droite, 3], [gauche, 2]].filter(([d]) => b[d]);
    let nd = (c.dir + 2) % 4;
    if (options.length) {
      let x = this.alea() * options.reduce((s, [, p]) => s + p, 0);
      nd = options[0][0];
      for (const [d, p] of options) { x -= p; if (x <= 0) { nd = d; break; } }
    }
    const kNouveau = nd % 2 === 1 ? kx : ky;
    const voies = this.r.voies(kNouveau);
    // À droite : voie de droite ; à gauche : voie de gauche ; tout droit : on garde sa voie.
    const n = nd === droite ? 0 : nd === gauche ? voies - 1 : Math.min(c.n || 0, voies - 1);
    return { dir: nd, n };
  }

  dessiner(ctx, camX, camY, W, H) {
    for (const c of this.voitures) {
      if (c.x < camX - 40 || c.x > camX + W + 40 || c.y < camY - 40 || c.y > camY + H + 40) continue;
      dessinerVoiture(ctx, c.modele, c.couleur, c.x, c.y, c.angle);
      // Feux stop quand elle freine.
      if (c.v < c.vmax * 0.5) {
        const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
        ctx.fillStyle = '#ff3b30';
        for (const k of [-8, 8]) ctx.fillRect(Math.round(c.x - fx * 21 - fy * k) - 1, Math.round(c.y - fy * 21 + fx * k) - 1, 3, 3);
      }
      if (c.klaxon > 0.6) bulle(ctx, c.x, c.y - 26, 'Pouet !');
    }
  }
}

/** Piétons : ils font le tour des pâtés de maisons, sur le trottoir. */
export class Pietons {
  /** tours : les trottoirs dont on fait le tour, { x0, y0, cote } (coin haut-gauche et côté du carré). */
  constructor(tours, alea, nombre) {
    this.liste = [];
    for (let i = 0; i < nombre; i++) {
      const { x0, y0, cote } = tours[Math.floor(alea() * tours.length)];
      this.liste.push({
        x0, y0, cote, s: alea() * cote * 4, sens: alea() < 0.5 ? 1 : -1, v: 14 + alea() * 10,
        base: PERSONNAGES[Math.floor(alea() * PERSONNAGES.length)], tenue: tenue(Math.floor(alea() * 60)), saut: 0, ecart: 0, bulle: null, puni: 0,
      });
    }
    this.placer();
  }

  placer() {
    for (const p of this.liste) {
      const c = p.cote, s = ((p.s % (4 * c)) + 4 * c) % (4 * c);
      let x, y, dir;
      if (s < c) { x = p.x0 + s; y = p.y0; dir = p.sens > 0 ? DIRECTION.droite : DIRECTION.gauche; }
      else if (s < 2 * c) { x = p.x0 + c; y = p.y0 + s - c; dir = p.sens > 0 ? DIRECTION.face : DIRECTION.dos; }
      else if (s < 3 * c) { x = p.x0 + c - (s - 2 * c); y = p.y0 + c; dir = p.sens > 0 ? DIRECTION.gauche : DIRECTION.droite; }
      else { x = p.x0; y = p.y0 + c - (s - 3 * c); dir = p.sens > 0 ? DIRECTION.dos : DIRECTION.face; }
      p.x = x + (p.ecartX || 0); p.y = y + (p.ecartY || 0); p.dir = dir;
    }
  }

  /** Renvoie le nombre de piétons effrayés (pour la pénalité). */
  maj(dt, joueur) {
    let effrayes = 0;
    const vitesse = Math.hypot(joueur.vx, joueur.vy);
    for (const p of this.liste) {
      if (p.saut > 0) p.saut -= dt; else p.s += p.sens * p.v * dt;
      if (p.puni > 0) p.puni -= dt;
      if (p.bulle && (p.bulle.vie -= dt) <= 0) p.bulle = null;
      p.ecartX = (p.ecartX || 0) * Math.pow(0.2, dt);
      p.ecartY = (p.ecartY || 0) * Math.pow(0.2, dt);
      const dx = p.x - joueur.x, dy = p.y - joueur.y;
      const d = Math.hypot(dx, dy);
      if (d < 28 && vitesse > 25) {
        // Il saute de côté.
        p.saut = 0.5;
        p.ecartX = (p.ecartX || 0) + (dx / (d || 1)) * 14;
        p.ecartY = (p.ecartY || 0) + (dy / (d || 1)) * 14;
        if (p.puni <= 0) {
          p.puni = 4;
          p.bulle = { texte: 'Hé ! Attention !', vie: 1.4 };
          if (vitesse > 60) effrayes++;
        }
      }
    }
    this.placer();
    return effrayes;
  }

  dessiner(ctx, planche, t, camX, camY, W, H) {
    for (const p of this.liste) {
      if (p.x < camX - 16 || p.x > camX + W + 16 || p.y < camY - 20 || p.y > camY + H + 20) continue;
      const pas = p.saut > 0 ? 1 : (Math.floor(t * 6 + p.s * 0.1) % 2) + 1;
      dessinerPerso(ctx, p.tenue, p.x, p.y + 6 - (p.saut > 0 ? 3 : 0), NOMS_DIRECTION[p.dir] || 'face', pas);
    }
    for (const p of this.liste) if (p.bulle) bulle(ctx, p.x, p.y - 12, p.bulle.texte);
  }
}
