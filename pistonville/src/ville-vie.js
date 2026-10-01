/* ville-vie.js — ce qui bouge en ville : circulation, feux, piétons.
 *
 * Circulation à droite, une voie par sens (comme les simulateurs de trafic
 * en grille) : chaque voiture suit sa voie, s'arrête derrière celle de devant
 * et au feu rouge, et choisit au carrefour d'aller tout droit, à droite ou à
 * gauche. Les feux de chaque carrefour sont décalés pour que tout ne change
 * pas en même temps. Les piétons font le tour des pâtés de maisons sur les
 * trottoirs et sautent de côté si on leur fonce dessus.
 */

import { PERSONNAGES, idPersonnage, DIRECTION, tuile, spriteVoiture, bulle, T } from './sprites.js';
import { hash2 } from './outils.js';

export const PERIODE = 14;
export const PAS_RUE = PERIODE * T;           // 224 px d'un carrefour au suivant
export const LARGEUR_RUE = 4 * T;             // 64 px
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 0 est, 1 sud, 2 ouest, 3 nord
const CYCLE = 9;

/** Coordonnée de la voie (circulation à droite) sur la rue d'indice k. */
export function voie(dir, k) {
  const base = k * PAS_RUE;
  return [base + 46, base + 18, base + 18, base + 46][dir];
}

export class Feux {
  constructor(n, graine) {
    this.n = n;
    this.decalage = (kx, ky) => hash2(kx, ky, graine) * CYCLE;
  }

  /** 'vert' | 'orange' | 'rouge' pour l'axe horizontal (est-ouest) ou vertical. */
  etat(kx, ky, horizontal, t) {
    const c = (t + this.decalage(kx, ky)) % CYCLE;
    const h = c < 3.8 ? 'vert' : c < 4.5 ? 'orange' : 'rouge';
    const v = c < 4.5 ? 'rouge' : c < 8.3 ? 'vert' : 'orange';
    return horizontal ? h : v;
  }
}

export class Trafic {
  /** n : nombre de rues par sens − 1 (indices de carrefour 0..n). */
  constructor(n, alea, nombre, feux) {
    this.n = n;
    this.feux = feux;
    this.alea = alea;
    this.voitures = [];
    const couleurs = ['#c2504d', '#4f7ddb', '#f4f1e8', '#3fa34d', '#8a6ad6', '#2a2838', '#f39c33', '#4fc3d8'];
    for (let i = 0; i < nombre; i++) {
      const dir = Math.floor(alea() * 4);
      const k = Math.floor(alea() * (n + 1));
      const seg = Math.floor(alea() * n);
      const s = seg * PAS_RUE + LARGEUR_RUE + 20 + alea() * (PAS_RUE - LARGEUR_RUE - 40);
      const v = { dir, vmax: 55 + alea() * 30, v: 0, couleur: couleurs[i % couleurs.length], choix: null, klaxon: 0, bloque: 0 };
      if (dir % 2 === 0) { v.x = s; v.y = voie(dir, k); } else { v.x = voie(dir, k); v.y = s; }
      v.angle = Math.atan2(DIRS[dir][1], DIRS[dir][0]);
      this.voitures.push(v);
    }
  }

  dansCarrefour(x, y) {
    const ix = Math.floor(x / PAS_RUE), iy = Math.floor(y / PAS_RUE);
    return x - ix * PAS_RUE < LARGEUR_RUE && y - iy * PAS_RUE < LARGEUR_RUE ? { kx: ix, ky: iy } : null;
  }

  maj(dt, t, joueur) {
    for (const c of this.voitures) {
      const [dx, dy] = DIRS[c.dir];
      const dedans = this.dansCarrefour(c.x, c.y);
      let cible = c.vmax;

      // Feu rouge : on s'arrête à la ligne, avant d'entrer dans le carrefour.
      if (!dedans) {
        c.choix = null;
        const avant = dx ? c.x + dx * 11 : c.y + dy * 11;
        const pos = dx ? c.x : c.y;
        const prochain = dx > 0 || dy > 0 ? (Math.floor(pos / PAS_RUE) + 1) * PAS_RUE : Math.floor(pos / PAS_RUE) * PAS_RUE + LARGEUR_RUE;
        const dist = (dx || dy) > 0 ? prochain - avant : avant - prochain;
        const kx = dx ? Math.round((prochain - (dx > 0 ? 0 : LARGEUR_RUE)) / PAS_RUE) : Math.floor(c.x / PAS_RUE);
        const ky = dy ? Math.round((prochain - (dy > 0 ? 0 : LARGEUR_RUE)) / PAS_RUE) : Math.floor(c.y / PAS_RUE);
        if (dist < 10 && dist > -3 && this.feux.etat(kx, ky, !!dx, t) !== 'vert') cible = 0;
        else if (dist < 40 && dist > 0 && this.feux.etat(kx, ky, !!dx, t) !== 'vert') cible = Math.min(cible, dist * 2);
      } else if (!c.choix) {
        c.choix = this.choisir(c, dedans);
      }

      // Quelqu'un devant (voiture ou joueur) : on freine.
      const devant = (ox, oy) => {
        const rx = ox - c.x, ry = oy - c.y;
        const a = rx * dx + ry * dy, l = Math.abs(-rx * dy + ry * dx);
        return a > 0 && a < 30 && l < 10;
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

      // Virage : quand on atteint la voie de la nouvelle direction.
      if (dedans && c.choix !== null && c.choix !== c.dir) {
        const nd = c.choix;
        if (nd % 2 === 1) {
          const tx = voie(nd, dedans.kx);
          if ((dx > 0 && c.x >= tx) || (dx < 0 && c.x <= tx)) { c.x = tx; c.dir = nd; }
        } else {
          const ty = voie(nd, dedans.ky);
          if ((dy > 0 && c.y >= ty) || (dy < 0 && c.y <= ty)) { c.y = ty; c.dir = nd; }
        }
      }
      const vise = Math.atan2(DIRS[c.dir][1], DIRS[c.dir][0]);
      let d = vise - c.angle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      c.angle += d * Math.min(1, dt * 10);
    }
  }

  /** Tout droit, à droite ou à gauche, jamais demi-tour ni hors de la ville. */
  choisir(c, { kx, ky }) {
    const possible = (d) => (d === 0 ? kx < this.n : d === 1 ? ky < this.n : d === 2 ? kx > 0 : ky > 0);
    const options = [[c.dir, 5], [(c.dir + 1) % 4, 3], [(c.dir + 3) % 4, 2]].filter(([d]) => possible(d));
    if (!options.length) return (c.dir + 2) % 4;
    let r = this.alea() * options.reduce((s, [, p]) => s + p, 0);
    for (const [d, p] of options) { r -= p; if (r <= 0) return d; }
    return options[0][0];
  }

  dessiner(ctx, camX, camY, W, H) {
    for (const c of this.voitures) {
      if (c.x < camX - 20 || c.x > camX + W + 20 || c.y < camY - 20 || c.y > camY + H + 20) continue;
      ctx.fillStyle = 'rgba(30,28,40,0.28)';
      ctx.save(); ctx.translate(Math.round(c.x) + 2, Math.round(c.y) + 2); ctx.rotate(c.angle + Math.PI / 2);
      ctx.fillRect(-7, -11, 14, 23); ctx.restore();
      const s = spriteVoiture(c.couleur, '#f4f1e8');
      ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.rotate(c.angle + Math.PI / 2);
      ctx.drawImage(s, -Math.floor(s.width / 2), -Math.floor(s.height / 2));
      // Feux stop quand elle freine.
      if (c.v < c.vmax * 0.5) { ctx.fillStyle = '#ff3b30'; ctx.fillRect(-5, 10, 2, 1); ctx.fillRect(3, 10, 2, 1); }
      ctx.restore();
      if (c.klaxon > 0.6) bulle(ctx, c.x, c.y - 14, 'Pouet !');
    }
  }
}

/** Piétons : ils font le tour des pâtés de maisons, sur le trottoir. */
export class Pietons {
  constructor(ilots, alea, nombre) {
    this.liste = [];
    for (let i = 0; i < nombre; i++) {
      const bx = Math.floor(alea() * ilots), by = Math.floor(alea() * ilots);
      const x0 = (bx * PERIODE + 5) * T - 8, y0 = (by * PERIODE + 5) * T - 8;
      const cote = 8 * T + 16;
      this.liste.push({
        x0, y0, cote, s: alea() * cote * 4, sens: alea() < 0.5 ? 1 : -1, v: 14 + alea() * 10,
        base: PERSONNAGES[Math.floor(alea() * PERSONNAGES.length)], saut: 0, ecart: 0, bulle: null, puni: 0,
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
      if (d < 16 && vitesse > 25) {
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
      const pas = p.saut > 0 ? 1 : Math.floor(t * 6 + p.s) % 3 === 0 ? 0 : (Math.floor(t * 6) % 2) + 1;
      tuile(ctx, planche, idPersonnage(p.base, p.dir, pas), p.x - 8, p.y - 14 - (p.saut > 0 ? 3 : 0));
    }
    for (const p of this.liste) if (p.bulle) bulle(ctx, p.x, p.y - 16, p.bulle.texte);
  }
}
