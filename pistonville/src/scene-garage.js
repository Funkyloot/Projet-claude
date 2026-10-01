/* scene-garage.js — le garage vu de dessus, derrière les menus de jour.
 *
 * Tuiles Kenney (sol, personnages, mobilier urbain) et voitures du joueur,
 * avec leurs pièces et leur peinture. Les mécaniciens circulent par les
 * allées libres (jamais à travers les meubles), avec leurs bulles d'émotion.
 * Pendant une construction, la voiture apparaît étape par étape sur le pont.
 */

import { tuile, objet, idPersonnage, PERSONNAGES, DIRECTION, spriteVoiture, bulle, T } from './sprites.js';
import { texte } from './course.js';
import { decrireVoiture } from './partie.js';

const DY = 26;          // décalage vertical : la barre d'état couvre le haut de l'écran
const COULOIR = 222;    // allée horizontale entre les ponts et l'établi
// Points de passage, tous sur des colonnes libres reliées au couloir.
const ETAPES = [{ x: 52, y: 222 }, { x: 160, y: 176 }, { x: 160, y: 222 }, { x: 270, y: 222 }, { x: 160, y: 280 }];
const PONTS = [{ x: 70, y: 84 + DY }, { x: 196, y: 84 + DY }];
const POSTES = [{ x: 184, y: 160 }, { x: 264, y: 160 }];
const PAROLES = ['!', 'Hop !', 'Ça roule', 'Huile ?', 'Vroum', '...'];

export class SceneGarage {
  constructor(planche) {
    this.planche = planche;
    this.meca = [
      { base: PERSONNAGES[3], x: 52, y: 222, cible: 1, attente: 0, bulle: null },
      { base: PERSONNAGES[1], x: 270, y: 222, cible: 2, attente: 1.2, bulle: null },
    ];
    this.passant = -40;
    this.construction = null;
    this.etincelles = [];
  }

  /** Lance l'animation de construction d'une voiture (durée en secondes). */
  construire(voiture, duree) {
    this.construction = { voiture, duree, t: 0 };
    this.meca.forEach((m, i) => { m.poste = POSTES[i]; m.attente = 0; });
  }

  finConstruction() {
    this.construction = null;
    this.meca.forEach((m) => { m.poste = null; });
  }

  maj(dt) {
    for (const [i, m] of this.meca.entries()) {
      if (m.attente > 0 && !m.poste) { m.attente -= dt; continue; }
      const c = m.poste || ETAPES[m.cible];
      const dx = c.x - m.x, dy = c.y - m.y;
      const v = 30 * dt;
      if (Math.abs(dx) > 0.5) {
        // Changer de colonne se fait toujours par le couloir.
        if (Math.abs(m.y - COULOIR) > 0.5) this.pas(m, 0, Math.sign(COULOIR - m.y) * Math.min(v, Math.abs(COULOIR - m.y)));
        else this.pas(m, Math.sign(dx) * Math.min(v, Math.abs(dx)), 0);
      } else if (Math.abs(dy) > 0.5) {
        this.pas(m, 0, Math.sign(dy) * Math.min(v, Math.abs(dy)));
      } else if (m.poste) {
        m.dir = i === 0 ? DIRECTION.droite : DIRECTION.gauche;
      } else {
        m.cible = (m.cible + 1 + Math.floor(Math.random() * 3)) % ETAPES.length;
        m.attente = 1 + Math.random() * 2;
        if (Math.random() < 0.5) m.bulle = { texte: PAROLES[Math.floor(Math.random() * PAROLES.length)], vie: 1.6 };
      }
      if (m.bulle && (m.bulle.vie -= dt) <= 0) m.bulle = null;
    }
    const pont = PONTS[1];
    if (this.construction) {
      this.construction.t += dt;
      if (Math.random() < 0.6) {
        this.etincelles.push({ x: pont.x + 28 + (Math.random() - 0.5) * 26, y: pont.y + 30 + Math.random() * 40, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, vie: 0.4 });
      }
    }
    for (const e of this.etincelles) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 120 * dt; e.vie -= dt; }
    this.etincelles = this.etincelles.filter((e) => e.vie > 0);
    this.passant += dt * 60;
    if (this.passant > 380) this.passant = -60;
  }

  pas(m, x, y) {
    m.x += x; m.y += y;
    if (x) m.dir = x > 0 ? DIRECTION.droite : DIRECTION.gauche;
    else if (y) m.dir = y > 0 ? DIRECTION.face : DIRECTION.dos;
    m.marche = true;
  }

  dessiner(ctx, W, H, t, partie) {
    const p = this.planche;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#38cbab';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 6; x < W; x += 12) {
      if ((x * 7 + y * 13) % 17 < 2) { ctx.fillStyle = '#33bdae'; ctx.fillRect(x, y, 2, 2); }
    }

    ctx.save();
    ctx.translate(0, DY);
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
    ctx.drawImage(passante, -Math.floor(passante.width / 2), -Math.floor(passante.height / 2)); ctx.restore();

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
    ctx.fillStyle = '#1f2a44'; ctx.fillRect(W / 2 - 62, gy - 18, 124, 20);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(W / 2 - 60, gy - 16, 120, 16);
    texte(ctx, 'GARAGE PISTON', W / 2, gy - 8, 11, '#1f2a44', 'center');

    // Étagère des trophées, contre le mur du haut.
    const trophees = Object.values(partie.trophees || {});
    ctx.fillStyle = '#8a5a3b'; ctx.fillRect(gx + 8, gy + 4, 56, 5);
    trophees.slice(0, 9).forEach((place, i) => {
      const couleur = place === 1 ? '#f2c14e' : place === 2 ? '#c9ccd4' : place === 3 ? '#c77b47' : '#8a94a6';
      const x = gx + 10 + i * 6;
      ctx.fillStyle = '#2a2838'; ctx.fillRect(x, gy - 2, 5, 7);
      ctx.fillStyle = couleur; ctx.fillRect(x + 1, gy - 1, 3, 3); ctx.fillRect(x + 2, gy + 2, 1, 2);
    });
    ctx.restore();

    // Ponts élévateurs (coordonnées absolues).
    for (const pt of PONTS) {
      ctx.fillStyle = '#7e7c93'; ctx.fillRect(pt.x, pt.y, 56, 92);
      ctx.fillStyle = '#9896ab'; ctx.fillRect(pt.x + 2, pt.y + 2, 52, 88);
      ctx.fillStyle = '#f2c14e';
      for (const [a, b] of [[0, 0], [48, 0], [0, 86], [48, 86]]) ctx.fillRect(pt.x + a, pt.y + b, 8, 6);
    }
    const enChantier = this.construction?.voiture?.uid;
    const visibles = partie.garage.filter((v) => v.uid !== enChantier);
    const active = visibles.find((v) => v.uid === partie.voitureActive);
    const autre = visibles.filter((v) => v !== active).slice(-1)[0];
    [[active, PONTS[0]], [autre, PONTS[1]]].forEach(([v, pt]) => {
      if (!v || (this.construction && pt === PONTS[1])) return;
      const d = decrireVoiture(partie, v);
      const s = spriteVoiture(d.couleur, v === active ? '#f2c14e' : '#f4f1e8', d.looks);
      ctx.save(); ctx.translate(pt.x + 28, pt.y + 46); ctx.scale(2, 2);
      ctx.drawImage(s, -Math.floor(s.width / 2), -Math.floor(s.height / 2)); ctx.restore();
    });
    if (this.construction) this.dessinerChantier(ctx, t);

    // Établi, pneus, bureau.
    const y0 = DY;
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(40, 214 + y0, 86, 20);
    ctx.fillStyle = '#8a5a3b'; ctx.fillRect(42, 216 + y0, 82, 16);
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(50, 220 + y0, 14, 4); ctx.fillRect(72, 218 + y0, 4, 10); ctx.fillRect(86, 222 + y0, 18, 4);
    for (const [x, y] of [[262, 238], [276, 246], [258, 254]]) {
      ctx.fillStyle = '#1c1b24'; ctx.fillRect(x - 6, y - 6 + y0, 12, 12);
      ctx.fillStyle = '#5c6278'; ctx.fillRect(x - 2, y - 2 + y0, 4, 4);
    }
    ctx.fillStyle = '#3a3550'; ctx.fillRect(196, 214 + y0, 46, 26);
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(198, 216 + y0, 42, 22);
    ctx.fillStyle = '#2f6fdb'; ctx.fillRect(206, 219 + y0, 18, 12);
    objet(ctx, p, 'jardiniere', 286, 92 + y0);

    for (const e of this.etincelles) {
      ctx.fillStyle = e.vie > 0.2 ? '#ffe066' : '#f39c33';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 2, 2);
    }

    // Mécaniciens.
    const tri = this.meca.slice().sort((a, b) => a.y - b.y);
    for (const m of tri) {
      const travaille = m.poste && Math.abs(m.x - m.poste.x) < 1 && Math.abs(m.y - m.poste.y) < 1;
      const pas = travaille ? (Math.floor(t * 8) % 2) + 1 : m.marche ? (Math.floor(t * 6) % 2) + 1 : 0;
      m.marche = false;
      tuile(ctx, p, idPersonnage(m.base, m.dir ?? DIRECTION.face, pas), m.x - 8, m.y - 14);
    }
    for (const m of tri) if (m.bulle) bulle(ctx, m.x, m.y - 16, m.bulle.texte);
  }

  /** La voiture se monte de l'avant vers l'arrière, puis reçoit sa peinture. */
  dessinerChantier(ctx, t) {
    const c = this.construction;
    const pt = PONTS[1];
    const avance = Math.min(1, c.t / c.duree);
    const brute = spriteVoiture('#9ea3ac', '#c9ccd4', []);
    const finie = spriteVoiture(c.voiture.couleur, '#f2c14e', c.voiture.looks || []);
    const s = avance > 0.85 ? finie : brute;
    const h = Math.ceil(s.height * Math.min(1, avance / 0.8));
    ctx.save();
    ctx.translate(pt.x + 28, pt.y + 46);
    ctx.scale(2, 2);
    const ox = -Math.floor(s.width / 2), oy = -Math.floor(s.height / 2);
    // Châssis en pointillés, puis la carrosserie qui se monte rangée après rangée.
    ctx.fillStyle = 'rgba(31,42,68,0.35)';
    for (let y = 0; y < s.height; y += 2) ctx.fillRect(ox + 1, oy + y, s.width - 2, 1);
    ctx.drawImage(s, 0, 0, s.width, h, ox, oy, s.width, h);
    if (avance < 0.85) {
      ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ffe066' : '#ffffff';
      ctx.fillRect(ox, oy + h - 1, s.width, 1);
    }
    ctx.restore();
  }
}
