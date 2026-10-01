/* scene-garage.js — le garage vu de dessus, derrière les menus de jour.
 *
 * Tuiles Kenney (sol, personnages, mobilier urbain) et voitures du joueur.
 * Les mécaniciens se promènent entre l'établi, les ponts et le bureau, avec
 * leurs bulles d'émotion.
 */

import { tuile, objet, idPersonnage, PERSONNAGES, DIRECTION, spriteVoiture, bulle, T } from './sprites.js';
import { texte } from './course.js';
import { modele } from './partie.js';

const DY = 26;   // décalage vertical : la barre d'état couvre le haut de l'écran
const ETAPES = [
  { x: 92, y: 200 + DY }, { x: 160, y: 150 + DY }, { x: 236, y: 196 + DY }, { x: 160, y: 236 + DY }, { x: 70, y: 120 + DY },
];
const PAROLES = ['!', 'Hop !', 'Ça roule', 'Huile ?', 'Vroum', '...'];

export class SceneGarage {
  constructor(planche) {
    this.planche = planche;
    this.meca = [
      { base: PERSONNAGES[3], x: 92, y: 200 + DY, cible: 1, attente: 0, bulle: null },
      { base: PERSONNAGES[1], x: 236, y: 196 + DY, cible: 3, attente: 1.2, bulle: null },
    ];
    this.passant = -40;
  }

  maj(dt) {
    for (const m of this.meca) {
      if (m.attente > 0) {
        m.attente -= dt;
        continue;
      }
      const c = ETAPES[m.cible];
      const dx = c.x - m.x, dy = c.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 1) {
        m.cible = (m.cible + 1 + Math.floor(Math.random() * 2)) % ETAPES.length;
        m.attente = 1 + Math.random() * 2;
        if (Math.random() < 0.5) m.bulle = { texte: PAROLES[Math.floor(Math.random() * PAROLES.length)], vie: 1.6 };
      } else {
        m.x += (dx / d) * 28 * dt;
        m.y += (dy / d) * 28 * dt;
        m.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRECTION.droite : DIRECTION.gauche) : (dy > 0 ? DIRECTION.face : DIRECTION.dos);
      }
      if (m.bulle && (m.bulle.vie -= dt) <= 0) m.bulle = null;
    }
    this.passant += dt * 60;
    if (this.passant > 380) this.passant = -60;
  }

  dessiner(ctx, W, H, t, partie, voiture) {
    const p = this.planche;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#38cbab';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 6; x < W; x += 12) {
      if ((x * 7 + y * 13) % 17 < 2) { ctx.fillStyle = '#33bdae'; ctx.fillRect(x, y, 2, 2); }
    }

    ctx.save();
    ctx.translate(0, DY);
    // Arbres autour.
    for (const [x, y, n] of [[14, 72, 'arbre'], [306, 96, 'arbreRond'], [10, 250, 'arbreBoule'], [310, 240, 'arbre'], [300, 40, 'sapin']]) objet(ctx, p, n, x, y);

    // Rue et trottoir sous le garage.
    const yt = 296, yr = 312;
    for (let x = 0; x < W; x += T) {
      tuile(ctx, p, 36, x, yt);
      tuile(ctx, p, 441, x, yr); tuile(ctx, p, 441, x, yr + T); tuile(ctx, p, 441, x, yr + 2 * T);
    }
    ctx.fillStyle = '#9896ab'; ctx.fillRect(0, yr - 1, W, 1);
    ctx.fillStyle = '#d9d6e6';
    for (let x = 4; x < W; x += 24) ctx.fillRect(x, yr + 23, 12, 2);
    ctx.fillStyle = '#9b9ca3'; ctx.fillRect(130, 276, 60, 36);   // allée
    objet(ctx, p, 'boiteAuxLettres', 112, yt + 15);
    objet(ctx, p, 'lampadaire', 214, yt + 15);
    objet(ctx, p, 'poubelle', 236, yt + 15);
    const passante = spriteVoiture('#4f7ddb');
    ctx.save(); ctx.translate(Math.round(this.passant), yr + 34); ctx.rotate(Math.PI / 2);
    ctx.drawImage(passante, -6, -10); ctx.restore();

    // Bâtiment.
    const gx = 22, gy = 56, gw = 276, gh = 224;
    ctx.fillStyle = 'rgba(42,40,56,0.3)'; ctx.fillRect(gx + 4, gy + 4, gw, gh);
    for (let y = gy; y < gy + gh; y += T) for (let x = gx; x < gx + gw; x += T) tuile(ctx, p, 36, x, y);
    ctx.fillStyle = '#9896ab';
    for (let y = gy + 32; y < gy + gh; y += 32) ctx.fillRect(gx, y, gw, 1);
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(gx - 6, gy - 6, gw + 12, 8);
    ctx.fillRect(gx - 6, gy - 6, 8, gh + 12);
    ctx.fillRect(gx + gw - 2, gy - 6, 8, gh + 12);
    ctx.fillRect(gx - 6, gy + gh - 2, 112, 8);
    ctx.fillRect(gx + gw - 106, gy + gh - 2, 112, 8);
    ctx.fillStyle = '#5c6278';
    ctx.fillRect(gx - 4, gy - 4, gw + 8, 3);
    // Enseigne.
    ctx.fillStyle = '#1f2a44'; ctx.fillRect(W / 2 - 62, gy - 18, 124, 20);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(W / 2 - 60, gy - 16, 120, 16);
    texte(ctx, 'GARAGE PISTON', W / 2, gy - 8, 11, '#1f2a44', 'center');

    // Ponts élévateurs.
    const ponts = [{ x: 70, y: 84 }, { x: 196, y: 84 }];
    for (const pt of ponts) {
      ctx.fillStyle = '#7e7c93'; ctx.fillRect(pt.x, pt.y, 56, 92);
      ctx.fillStyle = '#9896ab'; ctx.fillRect(pt.x + 2, pt.y + 2, 52, 88);
      ctx.fillStyle = '#f2c14e';
      for (const [a, b] of [[0, 0], [48, 0], [0, 86], [48, 86]]) ctx.fillRect(pt.x + a, pt.y + b, 8, 6);
    }
    const voitures = partie.garage.slice(0, 2);
    voitures.forEach((v, i) => {
      const pt = ponts[i];
      const actif = v.uid === (voiture && voiture.uid);
      const s = spriteVoiture(modele(v.modele).couleur, actif ? '#f2c14e' : '#f4f1e8');
      ctx.save(); ctx.translate(pt.x + 28, pt.y + 46); ctx.scale(2, 2);
      ctx.drawImage(s, -6, -10); ctx.restore();
    });
    if (partie.garage.length < 2 && partie.constructions.length) {
      const pt = ponts[1];
      ctx.strokeStyle = '#1f2a44'; ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
      ctx.strokeRect(pt.x + 16, pt.y + 24, 24, 42); ctx.setLineDash([]);
      ctx.fillStyle = '#5c6278'; ctx.fillRect(pt.x + 20, pt.y + 38, 16, 10);
      texte(ctx, 'En construction', pt.x + 28, pt.y + 102, 8, '#1f2a44', 'center');
    }

    // Établi, pneus, bureau.
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(40, 214, 86, 20);
    ctx.fillStyle = '#8a5a3b'; ctx.fillRect(42, 216, 82, 16);
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(50, 220, 14, 4); ctx.fillRect(72, 218, 4, 10); ctx.fillRect(86, 222, 18, 4);
    for (const [x, y] of [[262, 238], [276, 246], [258, 254]]) {
      ctx.fillStyle = '#1c1b24'; ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#5c6278'; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.fillStyle = '#3a3550'; ctx.fillRect(196, 214, 46, 26);
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(198, 216, 42, 22);
    ctx.fillStyle = '#2f6fdb'; ctx.fillRect(206, 219, 18, 12);
    objet(ctx, p, 'jardiniere', 286, 92);

    ctx.restore();

    // Mécaniciens (leurs positions incluent déjà le décalage).
    const tri = this.meca.slice().sort((a, b) => a.y - b.y);
    for (const m of tri) {
      const marche = m.attente <= 0;
      const pas = marche ? (Math.floor(t * 6) % 2) + 1 : 0;
      tuile(ctx, p, idPersonnage(m.base, m.dir ?? DIRECTION.face, pas), m.x - 8, m.y - 14);
    }
    for (const m of tri) if (m.bulle) bulle(ctx, m.x, m.y - 16, m.bulle.texte);
  }
}
