/* scene-city.js — la ville, la nuit, sous la pluie.
 *
 * Inspiré de la seconde vidéo (l'écran de veille de la télé) : une gare aux
 * grandes arches, une façade voisine avec un café éclairé, un panneau
 * publicitaire, un bus qui passe, des câbles en travers du ciel et une
 * skyline qui clignote au fond. Bleu nuit et violet, halos orange.
 *
 * L'heure et la température affichées sur la façade sont les vraies : c'est
 * ce petit détail qui fait que la scène a l'air vivante plutôt que bouclée.
 */

import { rect, px, ellipse, line, circle, skyGradient, ditherRect, makeRng, clamp, lerp } from './pixel.js';
import { drawText, textWidth } from './microfont.js';

const C = {
  ciel: [
    { at: 0.00, color: '#1b1636' },
    { at: 0.38, color: '#2e2154' },
    { at: 0.66, color: '#4b2c66' },
    { at: 0.86, color: '#7a3f6b' },
    { at: 1.00, color: '#a35a6a' },
  ],
  lune: '#f3e9c8',
  luneOmbre: '#d9cba6',
  etoile: '#cfd8f5',

  skyLoin: '#2a2149',
  skyMid: '#332658',
  skyProche: '#241c42',
  fenetreLoin: '#f0c076',

  facade: '#3d3160',
  facadeClair: '#4c3d73',
  facadeOmbre: '#2b2248',
  pierre: '#574577',
  toit: '#241d3f',
  vitre: '#12102a',
  vitreAllumee: '#f7c979',
  vitreFroide: '#8fd0e8',

  neonRose: '#ff77b0',
  neonBleu: '#6fe0f0',
  neonJaune: '#ffd166',

  rue: '#1c1733',
  trottoir: '#2c2450',
  trottoirClair: '#3a3062',
  bande: '#5a4c86',
  lampe: '#ffc978',
  halo: '#ffb85c',
  pluie: '#9aa6d8',
  cable: '#171327',
};

export class CityScene {
  constructor() {
    this.id = 'ville';
    this.nom = 'Ville';
    this.ambience = 'ville';
    this.camX = 0;
    this.t = 0;
    this.built = false;
    this.worldW = 620;
    this.bus = { x: -80, active: false, wait: 4 };
  }

  build(W, H) {
    const rng = makeRng(4926);
    this.W = W; this.H = H;

    this.streetY = Math.round(H * 0.88);      // niveau de la chaussée
    this.groundY = Math.round(H * 0.80);      // le trottoir, où marche le chat
    this.facadeTop = Math.round(H * 0.40);
    this.bounds = { left: 8, right: W - 8 };

    // --- Skyline lointaine : immeubles simples avec fenêtres allumées ---
    this.sky = [[], []];
    for (let layer = 0; layer < 2; layer++) {
      let x = 0;
      const baseY = this.facadeTop - 4 - layer * 10;
      while (x < this.worldW) {
        const w = 10 + Math.floor(rng() * 22);
        const h = (12 + Math.floor(rng() * 34)) * (layer === 0 ? 1 : 0.7);
        const b = { x, w, h: Math.round(h), y: baseY, windows: [], top: rng() };
        for (let wy = 3; wy < h - 3; wy += 4) {
          for (let wx = 2; wx < w - 2; wx += 3) {
            if (rng() < 0.42) b.windows.push({ x: wx, y: wy, ph: rng() * 100 });
          }
        }
        // Une antenne avec un feu rouge, de temps en temps.
        if (rng() < 0.22) b.antenna = 5 + Math.floor(rng() * 8);
        this.sky[layer].push(b);
        x += w + 1 + Math.floor(rng() * 4);
      }
    }

    // --- Étoiles ---
    this.stars = [];
    for (let i = 0; i < 60; i++) {
      this.stars.push({ x: rng() * W, y: rng() * this.facadeTop * 0.85, ph: rng() * 7, br: rng() });
    }

    // --- Pluie, sur trois profondeurs ---
    this.rain = [];
    for (let i = 0; i < 110; i++) this.rain.push(this.newDrop(rng, true));

    // --- Éclaboussures sur le trottoir ---
    this.splashes = [];

    // --- Fenêtres de la façade principale : allumage indépendant ---
    this.facadeWindows = [];
    for (let i = 0; i < 40; i++) this.facadeWindows.push({ on: rng() < 0.55, ph: rng() * 60, froide: rng() < 0.25 });

    this.built = true;
  }

  newDrop(rng, spread) {
    const depth = rng();
    return {
      x: rng() * (this.W + 60) - 30,
      y: spread ? rng() * this.H : -8,
      depth,
      vy: lerp(150, 330, depth),
      len: 2 + Math.round(depth * 4),
    };
  }

  update(dt, W, H, input) {
    if (!this.built || this.W !== W || this.H !== H) this.build(W, H);
    this.t += dt;
    this.camX += dt * 1.6 + (input?.panVX ?? 0);
    this.camX = ((this.camX % this.worldW) + this.worldW) % this.worldW;

    const rng = Math.random;
    for (const d of this.rain) {
      d.y += d.vy * dt;
      d.x -= d.vy * dt * 0.18;      // la pluie tombe en biais
      if (d.y > this.groundY) {
        if (d.depth > 0.5 && this.splashes.length < 40) {
          this.splashes.push({ x: d.x, y: this.groundY + rng() * 3, t: 0 });
        }
        Object.assign(d, this.newDrop(rng, false));
      }
    }
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 0.4);

    // Le bus traverse, puis on attend un moment avant le suivant.
    const b = this.bus;
    if (b.active) {
      b.x += 34 * dt;
      if (b.x > W + 70) { b.active = false; b.wait = 9 + rng() * 14; }
    } else {
      b.wait -= dt;
      if (b.wait <= 0) { b.active = true; b.x = -70; }
    }
  }

  draw(ctx, W, H) {
    if (!this.built) this.build(W, H);

    // 1. Ciel + étoiles + lune
    skyGradient(ctx, 0, 0, W, this.facadeTop + 20, C.ciel);
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.t * 1.4 + s.ph);
      if (tw > 0.35) {
        ctx.globalAlpha = clamp(tw * (0.4 + s.br * 0.6), 0, 1);
        px(ctx, s.x, s.y, C.etoile);
      }
    }
    ctx.globalAlpha = 1;
    const mx = Math.round(W * 0.22), my = Math.round(H * 0.12);
    ctx.globalAlpha = 0.12; circle(ctx, mx, my, 12, C.lune); ctx.globalAlpha = 1;
    circle(ctx, mx, my, 6, C.lune);
    circle(ctx, mx + 2, my - 1, 1.5, C.luneOmbre);
    circle(ctx, mx - 2, my + 2, 1, C.luneOmbre);

    // 2. Skyline
    this.drawSkyline(ctx, W, 1, 0.10, C.skyLoin);
    this.drawSkyline(ctx, W, 0, 0.20, C.skyMid);

    // 3. Câbles électriques en travers du ciel
    this.drawCables(ctx, W);

    // 4. Façades
    this.drawFacades(ctx, W, H);

    // 5. Rue
    rect(ctx, 0, this.groundY, W, H - this.groundY, C.trottoir);
    ditherRect(ctx, 0, this.groundY, W, 2, C.trottoirClair, C.trottoir, 0.5);
    rect(ctx, 0, this.streetY, W, H - this.streetY, C.rue);
    // Bande centrale en pointillés
    for (let x = -((this.camX * 0.9) % 12); x < W; x += 12) {
      rect(ctx, x, this.streetY + 5, 5, 1, C.bande);
    }
    // Dalles du trottoir
    for (let x = -((this.camX * 0.9) % 11); x < W; x += 11) {
      rect(ctx, x, this.groundY + 2, 1, this.streetY - this.groundY - 2, C.trottoirClair);
    }

    // 6. Réverbères
    this.drawLamps(ctx, W);

    // 7. Bus
    if (this.bus.active) this.drawBus(ctx, this.bus.x, this.streetY + 6);

    // 8. Flaques : elles renvoient les néons
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 4; i++) {
      const px_ = ((i * 97 - this.camX * 0.9) % W + W) % W;
      ellipse(ctx, px_, this.streetY + 9, 9, 2, C.neonRose);
    }
    ctx.globalAlpha = 1;
  }

  drawForeground(ctx, W, H) {
    // Pluie devant tout, y compris devant le chat.
    for (const d of this.rain) {
      ctx.globalAlpha = lerp(0.18, 0.5, d.depth);
      const x = Math.round(d.x), y = Math.round(d.y);
      for (let i = 0; i < d.len; i++) px(ctx, x + Math.round(i * 0.18), y - i, C.pluie);
    }
    ctx.globalAlpha = 0.5;
    for (const s of this.splashes) {
      const k = s.t / 0.4;
      const r = 1 + k * 3;
      px(ctx, s.x - r, s.y, C.pluie);
      px(ctx, s.x + r, s.y, C.pluie);
    }
    ctx.globalAlpha = 1;

    // Assombrissement des bords.
    ctx.globalAlpha = 0.2;
    ditherRect(ctx, 0, 0, W, 12, '#0d0a1c', '#0d0a1c', 0.6);
    ditherRect(ctx, 0, H - 10, W, 10, '#0d0a1c', '#0d0a1c', 0.6);
    ctx.globalAlpha = 1;
  }

  drawSkyline(ctx, W, layer, par, col) {
    const off = this.camX * par;
    for (const b of this.sky[layer]) {
      for (const wrap of [0, -this.worldW, this.worldW]) {
        const x = Math.round(b.x - off + wrap);
        if (x > W + 4 || x + b.w < -4) continue;
        const y = b.y - b.h;
        rect(ctx, x, y, b.w, b.h + 6, col);
        // Toit : plat, en pente, ou avec un bloc technique.
        if (b.top < 0.3) rect(ctx, x + 2, y - 2, b.w - 4, 2, col);
        else if (b.top < 0.5) rect(ctx, x + b.w - 5, y - 3, 3, 3, col);
        if (b.antenna) {
          rect(ctx, x + Math.floor(b.w / 2), y - b.antenna, 1, b.antenna, col);
          // Feu rouge anticollision, qui bat lentement.
          if (Math.sin(this.t * 2 + b.x) > 0.6) px(ctx, x + Math.floor(b.w / 2), y - b.antenna, '#ff5a5a');
        }
        for (const w of b.windows) {
          if (Math.sin(this.t * 0.25 + w.ph) > -0.5) px(ctx, x + w.x, y + w.y, C.fenetreLoin);
        }
      }
    }
  }

  drawCables(ctx, W) {
    // Deux câbles qui traversent, avec quelques isolateurs.
    for (let k = 0; k < 2; k++) {
      const y0 = this.facadeTop - 26 - k * 9;
      const sag = 7 + k * 3;
      ctx.fillStyle = C.cable;
      for (let x = 0; x < W; x++) {
        const t = x / W;
        const y = Math.round(y0 + Math.sin(t * Math.PI) * sag + Math.sin(this.t * 0.4 + k) * 0.6);
        ctx.fillRect(x, y, 1, 1);
      }
      // Un oiseau posé, immobile, qui s'envole de temps en temps.
      const bx = Math.round(W * (0.3 + k * 0.35));
      const by = Math.round(y0 + Math.sin((bx / W) * Math.PI) * sag) - 2;
      if (Math.sin(this.t * 0.11 + k * 2) > -0.4) {
        rect(ctx, bx, by, 2, 2, C.cable);
        px(ctx, bx + 2, by, C.cable);
      }
    }
  }

  drawFacades(ctx, W, H) {
    const top = this.facadeTop;
    const par = 0.9;
    const off = (this.camX * par) % this.worldW;

    // Bloc de fond continu : la ville ne doit jamais laisser voir le ciel
    // entre deux bâtiments au niveau de la rue.
    rect(ctx, 0, top + 6, W, this.groundY - top - 6, C.facadeOmbre);

    // On répète un motif de 3 bâtiments sur toute la largeur.
    const motif = 210;
    const start = -((off % motif) + motif) % motif;
    for (let bx = start - motif; bx < W + motif; bx += motif) {
      this.drawGare(ctx, bx, top, 96);
      this.drawImmeubleCafe(ctx, bx + 100, top - 6, 62);
      this.drawImmeublePub(ctx, bx + 164, top + 8, 44);
    }
  }

  /** La gare : grand toit à deux pentes et trois arches vitrées. */
  drawGare(ctx, x, top, w) {
    const bottom = this.groundY;
    rect(ctx, x, top + 10, w, bottom - top - 10, C.facade);
    rect(ctx, x, top + 10, 1, bottom - top - 10, C.facadeClair);

    // Toit
    for (let i = 0; i < 12; i++) {
      const iw = Math.round(w * (i / 12));
      rect(ctx, x + (w - iw) / 2, top + 10 - i, iw, 1, C.toit);
    }
    rect(ctx, x, top + 10, w, 2, C.pierre);

    // Trois grandes arches
    for (let a = 0; a < 3; a++) {
      const ax = x + 8 + a * 28;
      const aw = 20, ah = 26;
      const ay = top + 18;
      // Cintre
      for (let i = 0; i < aw / 2; i++) {
        const dy = Math.round(Math.sqrt(Math.max(0, (aw / 2) ** 2 - (aw / 2 - i) ** 2)));
        rect(ctx, ax + i, ay + aw / 2 - dy, 1, ah - (aw / 2 - dy), C.vitre);
        rect(ctx, ax + aw - 1 - i, ay + aw / 2 - dy, 1, ah - (aw / 2 - dy), C.vitre);
      }
      // Meneaux
      const fw = this.facadeWindows[a % this.facadeWindows.length];
      const on = fw.on && Math.sin(this.t * 0.2 + fw.ph) > -0.7;
      const glass = on ? C.vitreAllumee : C.vitre;
      for (let i = 2; i < aw - 2; i += 4) {
        rect(ctx, ax + i, ay + 4, 1, ah - 6, on ? glass : C.pierre);
      }
      if (on) {
        ctx.globalAlpha = 0.5;
        rect(ctx, ax + 2, ay + 6, aw - 4, ah - 10, glass);
        ctx.globalAlpha = 1;
      }
      rect(ctx, ax - 1, ay, 1, ah, C.pierre);
      rect(ctx, ax + aw, ay, 1, ah, C.pierre);
    }

    // Horloge de gare — à la vraie heure.
    const cx = x + w / 2, cy = top + 6;
    circle(ctx, cx, cy, 5, C.pierre);
    circle(ctx, cx, cy, 4, '#f4ecd8');
    const now = new Date();
    const hA = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2;
    const mA = (now.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;
    line(ctx, cx, cy, cx + Math.cos(hA) * 2, cy + Math.sin(hA) * 2, '#2b2248');
    line(ctx, cx, cy, cx + Math.cos(mA) * 3.2, cy + Math.sin(mA) * 3.2, '#2b2248');

    // Marquise et bandeau lumineux au-dessus de l'entrée.
    rect(ctx, x + 4, this.groundY - 20, w - 8, 2, C.pierre);
    ctx.globalAlpha = 0.35;
    rect(ctx, x + 4, this.groundY - 18, w - 8, 3, C.halo);
    ctx.globalAlpha = 1;
    drawText(ctx, 'GARE DU NORD', x + w / 2 - textWidth('GARE DU NORD') / 2, this.groundY - 28, C.neonJaune);
  }

  /** Immeuble voisin : un café éclairé, avec une silhouette et la météo. */
  drawImmeubleCafe(ctx, x, top, w) {
    const bottom = this.groundY;
    rect(ctx, x, top, w, bottom - top, C.facadeClair);
    rect(ctx, x, top, w, 2, C.pierre);
    rect(ctx, x + w - 1, top, 1, bottom - top, C.facadeOmbre);

    // Rangées de petites fenêtres.
    let k = 3;
    for (let wy = top + 6; wy < bottom - 34; wy += 9) {
      for (let wx = x + 4; wx < x + w - 6; wx += 9) {
        const fw = this.facadeWindows[(k++) % this.facadeWindows.length];
        const on = fw.on && Math.sin(this.t * 0.18 + fw.ph) > -0.6;
        rect(ctx, wx, wy, 5, 6, on ? (fw.froide ? C.vitreFroide : C.vitreAllumee) : C.vitre);
        rect(ctx, wx, wy, 5, 1, C.pierre);
        if (on) { ctx.globalAlpha = 0.18; rect(ctx, wx - 2, wy - 2, 9, 10, C.halo); ctx.globalAlpha = 1; }
      }
    }

    // La grande vitrine du café.
    const vy = bottom - 30, vw = w - 8, vh = 20;
    rect(ctx, x + 4, vy, vw, vh, C.vitre);
    ctx.globalAlpha = 0.9;
    rect(ctx, x + 5, vy + 1, vw - 2, vh - 2, '#3a2a3f');
    ctx.globalAlpha = 1;
    // Lumière chaude au plafond du café
    rect(ctx, x + 5, vy + 1, vw - 2, 3, '#f0b968');
    ctx.globalAlpha = 0.25;
    rect(ctx, x + 2, vy - 2, vw + 4, vh + 6, C.halo);
    ctx.globalAlpha = 1;

    // Une silhouette accoudée au comptoir, qui bouge à peine.
    const px_ = x + 12 + Math.round(Math.sin(this.t * 0.35) * 1);
    const py = vy + 8;
    rect(ctx, px_, py, 4, 7, '#241b30');           // buste
    circle(ctx, px_ + 2, py - 2, 2, '#241b30');    // tête
    rect(ctx, x + 6, vy + 14, vw - 4, 1, '#5a4360'); // comptoir

    // Widget météo, comme sur l'écran : température + petit nuage.
    const tempe = this.temperature();
    drawText(ctx, tempe + '°', x + w - 22, vy + 5, C.vitreFroide);
    this.drawNuage(ctx, x + w - 21, vy + 12);

    // Enseigne néon verticale.
    const flick = Math.sin(this.t * 9) > -0.9 ? 1 : 0.4;
    ctx.globalAlpha = flick;
    drawText(ctx, 'CAFE', x + w - 6, top + 8, C.neonRose);
    ctx.globalAlpha = 0.2 * flick;
    rect(ctx, x + w - 8, top + 6, 7, 20, C.neonRose);
    ctx.globalAlpha = 1;
  }

  drawNuage(ctx, x, y) {
    const c = C.vitreFroide;
    ellipse(ctx, x + 3, y + 2, 4, 2, c);
    ellipse(ctx, x + 2, y + 1, 2, 1.5, c);
    ellipse(ctx, x + 5, y + 1, 1.5, 1.5, c);
    // Trois gouttes qui tombent en boucle.
    for (let i = 0; i < 3; i++) {
      const dy = ((this.t * 6 + i * 1.3) % 4);
      ctx.globalAlpha = 1 - dy / 4;
      px(ctx, x + 1 + i * 2, y + 4 + dy, c);
      ctx.globalAlpha = 1;
    }
  }

  temperature() {
    // Pas de réseau : on simule une température nocturne plausible qui
    // dérive très lentement, plutôt que d'afficher une valeur figée.
    const base = 18 + Math.round(Math.sin(Date.now() / 3.6e6) * 4);
    return String(base);
  }

  /** Petit immeuble bas avec un panneau publicitaire rétroéclairé. */
  drawImmeublePub(ctx, x, top, w) {
    const bottom = this.groundY;
    rect(ctx, x, top, w, bottom - top, C.facade);
    rect(ctx, x, top, w, 1, C.pierre);

    const py = top + 6, pw = w - 8, ph = 18;
    rect(ctx, x + 4, py, pw, ph, '#1a1530');
    rect(ctx, x + 5, py + 1, pw - 2, ph - 2, '#2b4d7a');
    // Un dégradé de couchant peint sur l'affiche.
    ditherRect(ctx, x + 5, py + 1, pw - 2, 6, '#f08a5d', '#f7c873', 0.4);
    ellipse(ctx, x + 5 + pw * 0.7, py + 7, 3, 3, '#ffe6a7');
    rect(ctx, x + 5, py + 12, pw - 2, ph - 13, '#1f3b63');
    drawText(ctx, 'VOYAGE', x + 6, py + 13, '#ffe6a7');
    // Rampe d'éclairage au-dessus du panneau.
    ctx.globalAlpha = 0.28;
    rect(ctx, x + 3, py - 2, pw + 2, 3, C.halo);
    ctx.globalAlpha = 1;

    // Rideau de fer et porte au rez-de-chaussée.
    rect(ctx, x + 6, bottom - 16, 16, 16, C.facadeOmbre);
    for (let i = 0; i < 16; i += 2) rect(ctx, x + 6, bottom - 16 + i, 16, 1, C.facade);
  }

  drawLamps(ctx, W) {
    const off = (this.camX * 0.9) % 74;
    for (let x = -off - 74; x < W + 74; x += 74) {
      const lx = Math.round(x);
      const ly = this.groundY;
      const h = 26;
      rect(ctx, lx, ly - h, 2, h, '#191430');
      rect(ctx, lx, ly - h, 7, 1, '#191430');
      rect(ctx, lx + 6, ly - h + 1, 2, 2, C.lampe);
      // Cône de lumière : quelques trapèzes translucides empilés.
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.07;
        const t = i / 5;
        const spread = 3 + t * 16;
        rect(ctx, lx + 7 - spread / 2, ly - h + 3 + t * (h - 3), spread, (h - 3) / 5 + 1, C.halo);
      }
      ctx.globalAlpha = 0.22;
      ellipse(ctx, lx + 7, ly + 1, 11, 2.5, C.halo);
      ctx.globalAlpha = 1;
    }
  }

  drawBus(ctx, x, y) {
    x = Math.round(x); y = Math.round(y);
    const w = 46, h = 15;
    rect(ctx, x, y - h, w, h, '#4a6fa8');
    rect(ctx, x, y - h, w, 3, '#5d86c2');
    rect(ctx, x, y - 4, w, 2, '#33507c');
    // Vitres
    for (let i = 0; i < 5; i++) rect(ctx, x + 4 + i * 8, y - h + 4, 6, 5, '#bfe3f2');
    // Pare-brise et phare
    rect(ctx, x + w - 6, y - h + 4, 5, 6, '#d8f0fa');
    ctx.globalAlpha = 0.5; ellipse(ctx, x + w + 4, y - 5, 7, 3, C.halo); ctx.globalAlpha = 1;
    px(ctx, x + w - 1, y - 5, '#fff0c0');
    // Feu arrière
    px(ctx, x, y - 6, '#ff6a6a');
    // Roues
    circle(ctx, x + 9, y, 3, '#151228');
    circle(ctx, x + w - 10, y, 3, '#151228');
    // Girouette
    drawText(ctx, '6', x + 3, y - h + 1, C.neonJaune);
  }
}
