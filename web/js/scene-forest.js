/* scene-forest.js — forêt d'automne à l'heure dorée.
 *
 * Reprend la lecture de la première vidéo : ciel chaud, montagnes rose
 * poussiéreux au fond, grande canopée orange et ocre, troncs mauves, sol
 * ambré, et des feuilles qui tombent en permanence sur trois profondeurs.
 *
 * Tout est généré une fois à partir d'une graine fixe, puis défile en
 * parallaxe. Les couches lointaines bougent moins que les proches, ce qui
 * crée la profondeur sans la moindre image importée.
 */

import { rect, px, ellipse, line, skyGradient, ditherRect, makeRng, clamp, lerp } from './pixel.js';

const C = {
  ciel: [
    { at: 0.00, color: '#f6dfae' },
    { at: 0.34, color: '#f3c98d' },
    { at: 0.62, color: '#e9a877' },
    { at: 1.00, color: '#dd9070' },
  ],
  soleil: '#fdf1c4',
  soleilHalo: '#f7d79a',
  montLoin: '#d3a6a8',
  montProche: '#bd8b93',
  montOmbre: '#a97a85',
  brume: '#e7bfa2',

  // Feuillages, du plus lointain au plus proche.
  canopee: [
    { clair: '#f0cf87', moyen: '#e3b264', sombre: '#cf9147' },
    { clair: '#eec073', moyen: '#dc9e4a', sombre: '#bf7e37' },
    { clair: '#e2a45c', moyen: '#c9803a', sombre: '#a9622c' },
  ],
  tronc: ['#9c7784', '#87616f', '#6d4c5b'],
  sol: '#dfae6a',
  solOmbre: '#c4904f',
  herbe: '#e8c078',
  herbeOmbre: '#c8964e',
  feuille: ['#e8a14a', '#d8813c', '#c96a34', '#eec06a'],
};

export class ForestScene {
  constructor() {
    this.id = 'foret';
    this.nom = 'Forêt';
    this.ambience = 'foret';
    this.camX = 0;
    this.t = 0;
    this.leaves = [];
    this.motes = [];
    this.built = false;
    this.worldW = 520;   // largeur du monde bouclé, en pixels virtuels
  }

  build(W, H) {
    const rng = makeRng(20260814);
    this.W = W; this.H = H;

    // Le sol est placé aux deux tiers bas de l'écran.
    this.groundY = Math.round(H * 0.78);
    this.bounds = { left: 10, right: W - 10 };

    // --- Montagnes : deux crêtes générées par marche aléatoire ---
    this.ridges = [];
    for (let r = 0; r < 2; r++) {
      const pts = [];
      let y = 0;
      const base = this.groundY - 30 - r * 14;
      for (let x = 0; x <= this.worldW; x += 4) {
        y += (rng() - 0.5) * 7;
        y = clamp(y, -16, 16);
        pts.push({ x, y: base + y - Math.sin(x * 0.02 + r) * 9 });
      }
      this.ridges.push(pts);
    }

    // --- Arbres, répartis sur trois plans ---
    this.trees = [[], [], []];
    const counts = [14, 9, 5];
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < counts[layer]; i++) {
        const scale = lerp(0.55, 1.35, layer / 2) * lerp(0.85, 1.2, rng());
        this.trees[layer].push({
          x: (i / counts[layer]) * this.worldW + rng() * 26,
          scale,
          trunkH: Math.round(lerp(22, 52, layer / 2) * lerp(0.8, 1.15, rng())),
          lean: (rng() - 0.5) * 0.5,
          blobs: this.makeCanopy(rng, scale),
          seed: Math.floor(rng() * 1e6),
        });
      }
      this.trees[layer].sort((a, b) => a.x - b.x);
    }

    // --- Touffes d'herbe au sol ---
    this.tufts = [];
    for (let i = 0; i < 90; i++) {
      this.tufts.push({ x: rng() * this.worldW, h: 2 + Math.floor(rng() * 3), d: rng() < 0.4 });
    }

    // --- Feuilles qui tombent ---
    this.leaves = [];
    for (let i = 0; i < 46; i++) this.leaves.push(this.newLeaf(rng, true));

    // --- Poussières lumineuses qui flottent dans le contre-jour ---
    this.motes = [];
    for (let i = 0; i < 26; i++) {
      this.motes.push({ x: rng() * W, y: rng() * H * 0.8, ph: rng() * 7, sp: 0.3 + rng() * 0.6 });
    }

    this.built = true;
  }

  makeCanopy(rng, scale) {
    // Une couronne, c'est 4 à 6 ellipses qui se chevauchent : les blobs
    // isolés font « brocoli », les blobs fondus font « feuillage ».
    const n = 4 + Math.floor(rng() * 3);
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.7;
      const d = rng() * 9 * scale;
      blobs.push({
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d * 0.55 - rng() * 3 * scale,
        rx: (7 + rng() * 6) * scale,
        ry: (5 + rng() * 4) * scale,
      });
    }
    return blobs;
  }

  newLeaf(rng, spread) {
    const depth = rng();
    return {
      x: rng() * (this.W + 40) - 20,
      y: spread ? rng() * this.H : -6,
      depth,
      vy: lerp(7, 22, depth),
      sway: 6 + rng() * 14,
      ph: rng() * Math.PI * 2,
      spin: rng() * Math.PI * 2,
      spinSp: (rng() - 0.5) * 5,
      c: C.feuille[Math.floor(rng() * C.feuille.length)],
    };
  }

  /** Le vent souffle par bouffées : une lente somme de sinus. */
  wind() {
    return Math.sin(this.t * 0.31) * 0.6 + Math.sin(this.t * 0.13 + 2) * 0.4;
  }

  update(dt, W, H, input) {
    if (!this.built || this.W !== W || this.H !== H) this.build(W, H);
    this.t += dt;

    // Dérive lente automatique + panoramique au doigt.
    this.camX += dt * 2.2 + (input?.panVX ?? 0);
    this.camX = ((this.camX % this.worldW) + this.worldW) % this.worldW;

    const w = this.wind();
    const rng = Math.random;
    for (const l of this.leaves) {
      l.y += l.vy * dt;
      l.ph += dt * 1.6;
      l.spin += l.spinSp * dt;
      l.x += (Math.sin(l.ph) * l.sway + w * 16 * (0.4 + l.depth)) * dt;
      if (l.y > H + 6 || l.x < -24 || l.x > W + 24) {
        Object.assign(l, this.newLeaf(rng, false));
        l.x = rng() * (W + 40) - 20;
      }
    }
    for (const m of this.motes) {
      m.ph += dt * m.sp;
      m.y -= dt * m.sp * 2.2;
      if (m.y < -2) { m.y = H * 0.85; m.x = rng() * W; }
    }
  }

  draw(ctx, W, H) {
    if (!this.built) this.build(W, H);

    // 1. Ciel
    skyGradient(ctx, 0, 0, W, this.groundY + 4, C.ciel);

    // 2. Soleil bas, légèrement à droite, avec un halo tramé
    const sx = Math.round(W * 0.72), sy = Math.round(H * 0.24);
    for (let r = 22; r > 9; r -= 3) {
      ctx.globalAlpha = 0.1;
      ellipse(ctx, sx, sy, r, r, C.soleilHalo);
    }
    ctx.globalAlpha = 1;
    ellipse(ctx, sx, sy, 9, 9, C.soleilHalo);
    ellipse(ctx, sx, sy, 7, 7, C.soleil);

    // 3. Montagnes
    this.drawRidge(ctx, W, H, this.ridges[0], 0.08, C.montLoin, C.montOmbre);
    this.drawRidge(ctx, W, H, this.ridges[1], 0.16, C.montProche, C.montOmbre);

    // 4. Brume de vallée : une bande tramée qui noie le pied des montagnes
    ditherRect(ctx, 0, this.groundY - 26, W, 12, C.brume, C.montLoin, 0.35);
    ditherRect(ctx, 0, this.groundY - 14, W, 10, C.brume, C.sol, 0.5);

    // 5. Arbres lointains et intermédiaires
    this.drawTreeLayer(ctx, W, 0, 0.22);
    this.drawTreeLayer(ctx, W, 1, 0.45);

    // 6. Sol
    rect(ctx, 0, this.groundY, W, H - this.groundY, C.sol);
    ditherRect(ctx, 0, this.groundY, W, 3, C.herbe, C.sol, 0.5);
    ditherRect(ctx, 0, this.groundY + 8, W, H - this.groundY - 8, C.sol, C.solOmbre, 0.45);
    this.drawTufts(ctx, W, 0.45);

    // 7. Arbres du premier plan (le chat marche entre eux)
    this.drawTreeLayer(ctx, W, 2, 0.85);

    // 8. Poussières dans la lumière
    ctx.globalAlpha = 0.5;
    for (const m of this.motes) {
      if (Math.sin(m.ph) > 0.1) px(ctx, m.x, m.y, '#fff3cf');
    }
    ctx.globalAlpha = 1;
  }

  /** Les feuilles passent devant le chat : appelé après le rendu du chat. */
  drawForeground(ctx, W, H) {
    for (const l of this.leaves) {
      const c = l.c;
      const x = Math.round(l.x), y = Math.round(l.y);
      // Une feuille tourne : selon l'angle on la voit de face (3 px) ou de profil (1 px).
      const face = Math.abs(Math.cos(l.spin));
      ctx.globalAlpha = lerp(0.55, 1, l.depth);
      if (face > 0.66) {
        px(ctx, x, y, c); px(ctx, x + 1, y, c);
        px(ctx, x, y + 1, c);
      } else if (face > 0.3) {
        px(ctx, x, y, c); px(ctx, x, y + 1, c);
      } else {
        px(ctx, x, y, c);
      }
      ctx.globalAlpha = 1;
    }

    // Vignette chaude sur les bords, pour ramener l'œil au centre.
    ctx.globalAlpha = 0.16;
    ditherRect(ctx, 0, 0, W, 10, '#8a5a3c', '#8a5a3c', 0.5);
    ditherRect(ctx, 0, H - 8, W, 8, '#8a5a3c', '#8a5a3c', 0.5);
    ctx.globalAlpha = 1;
  }

  drawRidge(ctx, W, H, pts, par, col, shade) {
    const off = this.camX * par;
    ctx.fillStyle = col;
    for (let x = 0; x < W; x++) {
      const wx = ((x + off) % this.worldW + this.worldW) % this.worldW;
      const i = Math.min(pts.length - 1, Math.floor(wx / 4));
      const y = Math.round(pts[i].y);
      ctx.fillRect(x, y, 1, this.groundY - y + 2);
      // Un liseré plus sombre sur le versant à l'ombre du soleil.
      if (i > 0 && pts[i].y > pts[i - 1].y) { ctx.fillStyle = shade; ctx.fillRect(x, y, 1, 2); ctx.fillStyle = col; }
    }
  }

  drawTufts(ctx, W, par) {
    const off = this.camX * par;
    for (const t of this.tufts) {
      const x = Math.round(((t.x - off) % this.worldW + this.worldW) % this.worldW);
      if (x < -2 || x > W + 2) continue;
      const c = t.d ? C.herbeOmbre : C.herbe;
      for (let i = 0; i < t.h; i++) px(ctx, x, this.groundY - i, c);
      if (t.h > 2) px(ctx, x + 1, this.groundY - 1, c);
    }
  }

  drawTreeLayer(ctx, W, layer, par) {
    const pal = C.canopee[layer];
    const trunkC = C.tronc[layer];
    const off = this.camX * par;
    const wind = this.wind();

    for (const tree of this.trees[layer]) {
      let x = ((tree.x - off) % this.worldW + this.worldW) % this.worldW;
      // On dessine aussi la copie décalée d'un tour de monde, pour que rien
      // ne « pope » sur les bords.
      for (const wrap of [0, -this.worldW, this.worldW]) {
        const tx = x + wrap;
        if (tx < -40 || tx > W + 40) continue;
        this.drawTree(ctx, tree, tx, layer, pal, trunkC, wind, par);
      }
    }
  }

  drawTree(ctx, tree, x, layer, pal, trunkC, wind, par) {
    const baseY = this.groundY + (layer === 2 ? 2 : -2 - layer);
    const topY = baseY - tree.trunkH;
    const swayAmt = wind * (2 + layer * 1.6);

    // Tronc : légèrement penché, il s'affine vers le haut.
    const wTrunk = Math.max(2, Math.round(2 + layer * 1.6));
    for (let i = 0; i < tree.trunkH; i++) {
      const t = i / tree.trunkH;
      const y = baseY - i;
      const lean = tree.lean * i * 0.25 + swayAmt * t * t;
      const w = Math.max(1, Math.round(wTrunk * (1 - t * 0.35)));
      rect(ctx, x + lean - w / 2, y, w, 1, trunkC);
      // Écorce : une colonne plus sombre sur le côté opposé au soleil.
      if (w > 2 && (i % 5) !== 0) px(ctx, x + lean - w / 2, y, C.tronc[Math.min(2, layer + 1)]);
    }

    // Branches sur les arbres du premier plan.
    if (layer === 2) {
      for (const s of [-1, 1]) {
        const by = baseY - tree.trunkH * 0.62;
        line(ctx, x, by, x + s * 9, by - 7, trunkC);
      }
    }

    // Couronne.
    const cx = x + tree.lean * tree.trunkH * 0.25 + swayAmt;
    const cy = topY - 2;
    for (const b of tree.blobs) {
      ellipse(ctx, cx + b.dx, cy + b.dy, b.rx, b.ry, pal.sombre);
    }
    for (const b of tree.blobs) {
      ellipse(ctx, cx + b.dx, cy + b.dy - 1, b.rx * 0.92, b.ry * 0.85, pal.moyen);
    }
    // Lumière rasante venue du soleil, à droite : on éclaire le haut-droite.
    for (const b of tree.blobs) {
      ellipse(ctx, cx + b.dx + b.rx * 0.22, cy + b.dy - b.ry * 0.4, b.rx * 0.5, b.ry * 0.42, pal.clair);
    }
    // Quelques trouées de ciel dans le feuillage, pour casser la masse.
    const rng = makeRng(tree.seed);
    for (let i = 0; i < 5 + layer * 3; i++) {
      const b = tree.blobs[Math.floor(rng() * tree.blobs.length)];
      const a = rng() * Math.PI * 2, d = rng();
      px(ctx, cx + b.dx + Math.cos(a) * b.rx * d, cy + b.dy + Math.sin(a) * b.ry * d, pal.clair);
    }
  }
}
