/* cat.js — le compagnon.
 *
 * Le chat n'est pas une planche de sprites figée : c'est un petit squelette
 * (corps, tête, oreilles, 4 pattes, queue) redessiné à chaque image avec les
 * primitives pixel. Ça permet à la tête de suivre le doigt, aux oreilles de
 * frémir et à la queue d'onduler — ce qui vaut beaucoup mieux, pour se
 * détendre, que trois images qui bouclent.
 *
 * Le rendu se fait en deux passes : d'abord toutes les formes agrandies d'un
 * pixel en couleur de contour, puis les formes pleines. On obtient une
 * silhouette cernée d'un trait net, comme un sprite dessiné à la main.
 */

import { ellipse, rect, px, clamp, lerp, ease } from './pixel.js';

export const PELAGES = {
  roux: {
    nom: 'Roux',
    outline: '#3a2430', dark: '#c26f39', main: '#e59a55', light: '#f8dcae',
    pink: '#e08c92', eye: '#6aa86a',
  },
  gris: {
    nom: 'Gris',
    outline: '#2b2b38', dark: '#6f7385', main: '#9aa0b2', light: '#e2e6ef',
    pink: '#d99aa4', eye: '#6fa5c4',
  },
  noir: {
    nom: 'Smoking',
    outline: '#191722', dark: '#2f2c3d', main: '#413d54', light: '#ece9f2',
    pink: '#d98f9c', eye: '#d9b45c',
  },
  creme: {
    nom: 'Crème',
    outline: '#4a3630', dark: '#cfa87e', main: '#eecda4', light: '#fbf0dc',
    pink: '#dd9a9a', eye: '#7fa46f',
  },
};

// Durées (en secondes) au-delà desquelles le chat se lasse d'une posture.
const ENVIE_DE_BOUGER = [7, 16];

export class Cat {
  constructor(opts = {}) {
    this.x = opts.x ?? 60;
    this.y = opts.y ?? 100;      // y = le sol sous les pattes
    this.facing = 1;
    this.pelage = opts.pelage ?? 'roux';

    this.state = 'assis';        // assis | marche | pain | dort | etire | joue
    this.stateT = 0;
    this.nextChange = 5;

    this.targetX = this.x;
    this.walkSpeed = 13;         // pixels virtuels / seconde

    // Animation continue
    this.t = 0;
    this.blink = 0;              // 0 = ouvert, 1 = fermé
    this.nextBlink = 2;
    this.earTwitch = 0;
    this.tailPhase = 0;
    this.tailEnergy = 0.35;      // 0 = queue molle, 1 = fouette

    // Interaction
    this.bonheur = 0;            // 0..1, monte quand on le caresse
    this.purr = 0;               // 0..1, intensité du ronronnement
    this.petting = 0;            // temps restant de caresse
    this.lookAt = null;          // {x, y} en coordonnées virtuelles
    this.lookOff = { x: 0, y: 0 };
    this.squash = 0;             // -1 aplati .. +1 étiré
    this.hop = 0;                // hauteur du petit bond

    this.particles = [];         // cœurs, Zzz, notes
    this.onPurr = null;          // callback audio
    this.onPet = null;
    this.feuille = null;         // planche de sprites, si des assets existent
  }

  get palette() { return PELAGES[this.pelage] || PELAGES.roux; }

  /** Boîte de collision généreuse : sur un écran tactile, viser un chat de
   *  25 pixels de haut à la pulpe du doigt demande de la marge. */
  hitbox() {
    return { x: this.x - 18, y: this.y - 34, w: 36, h: 38 };
  }

  contains(vx, vy) {
    const b = this.hitbox();
    return vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h;
  }

  /* ---------- Interactions ---------- */

  /** Caresse : le doigt est posé sur le chat. */
  caresser(vx, vy) {
    this.petting = 0.45;
    this.lookAt = { x: vx, y: vy };
    this.bonheur = clamp(this.bonheur + 0.012, 0, 1);
    this.purr = clamp(this.purr + 0.05, 0, 1);
    this.tailEnergy = lerp(this.tailEnergy, 0.15, 0.05);

    if (this.state === 'dort' || this.state === 'marche') this.setState('pain');

    if (Math.random() < 0.06) this.emitCoeur();
    if (this.onPet) this.onPet();
  }

  /** Le doigt s'est posé ailleurs : le chat va voir. */
  appeler(vx) {
    if (this.state === 'dort' && this.bonheur < 0.2) {
      // Un chat qui dort profondément ouvre juste un œil.
      this.emitParticle('?', this.x, this.y - 30);
      return;
    }
    this.targetX = vx;
    if (Math.abs(this.targetX - this.x) > 6) this.setState('marche');
  }

  /** Appui long : le chat s'installe et s'endort. */
  bercer() {
    if (this.state !== 'dort') this.setState('pain');
    this.purr = clamp(this.purr + 0.03, 0, 1);
    if (this.state === 'pain' && this.stateT > 1.6) this.setState('dort');
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    this.nextChange = lerp(ENVIE_DE_BOUGER[0], ENVIE_DE_BOUGER[1], Math.random());
    if (s === 'marche') this.tailEnergy = 0.55;
    if (s === 'dort') this.tailEnergy = 0.08;
    if (s === 'etire') this.squash = 0.6;
  }

  emitCoeur() {
    this.particles.push({
      kind: 'coeur', x: this.x + (Math.random() * 16 - 8), y: this.y - 30,
      vx: (Math.random() - 0.5) * 5, vy: -11 - Math.random() * 5, life: 1.4, t: 0,
    });
  }

  emitParticle(kind, x, y) {
    this.particles.push({ kind, x, y, vx: 2, vy: -6, life: 2.2, t: 0 });
  }

  /* ---------- Mise à jour ---------- */

  update(dt, bounds) {
    this.t += dt;
    this.stateT += dt;
    this.petting = Math.max(0, this.petting - dt);

    // Le bonheur redescend lentement, le ronron plus vite.
    if (this.petting <= 0) {
      this.bonheur = Math.max(0, this.bonheur - dt * 0.015);
      this.purr = Math.max(0, this.purr - dt * 0.35);
    }
    if (this.onPurr) this.onPurr(this.purr);

    // Clignements — irréguliers, parfois doublés.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 1.6 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);

    // Frémissement d'oreille de temps en temps.
    this.earTwitch = Math.max(0, this.earTwitch - dt * 5);
    if (Math.random() < dt * 0.25) this.earTwitch = 1;

    // Regard : la tête s'oriente vers le doigt, puis revient au centre.
    const cible = this.lookAt;
    let tx = 0, ty = 0;
    if (cible && this.state !== 'dort') {
      tx = clamp((cible.x - this.x) / 26, -1.6, 1.6);
      ty = clamp((cible.y - (this.y - 26)) / 26, -1, 1.2);
      if (Math.abs(cible.x - this.x) > 4) this.facing = cible.x > this.x ? 1 : -1;
    }
    this.lookOff.x = lerp(this.lookOff.x, tx, 1 - Math.pow(0.001, dt));
    this.lookOff.y = lerp(this.lookOff.y, ty, 1 - Math.pow(0.001, dt));
    if (this.petting <= 0 && this.lookAt && this.t % 1 < dt) this.lookAt = null;

    this.tailPhase += dt * (1.1 + this.tailEnergy * 2.6);
    this.squash = lerp(this.squash, 0, 1 - Math.pow(0.02, dt));

    switch (this.state) {
      case 'marche': this.updateMarche(dt, bounds); break;
      case 'dort': this.updateDort(dt); break;
      default: this.updateRepos(dt, bounds); break;
    }

    this.updateParticles(dt);
  }

  updateMarche(dt, bounds) {
    const d = this.targetX - this.x;
    const dir = Math.sign(d);
    if (Math.abs(d) < 2) {
      this.setState(Math.random() < 0.65 ? 'assis' : 'pain');
      return;
    }
    this.facing = dir;
    this.x += dir * this.walkSpeed * dt;
    if (bounds) this.x = clamp(this.x, bounds.left + 12, bounds.right - 12);
    this.tailEnergy = 0.5;
  }

  updateDort(dt) {
    this.purr = Math.max(this.purr, 0.25);
    if (Math.random() < dt * 0.7) {
      this.particles.push({
        kind: 'z', x: this.x + this.facing * 10, y: this.y - 14,
        vx: this.facing * 3, vy: -6, life: 2.4, t: 0,
      });
    }
    if (this.stateT > 26 && this.petting <= 0) this.setState('etire');
  }

  updateRepos(dt, bounds) {
    if (this.state === 'etire' && this.stateT > 1.1) { this.setState('assis'); return; }
    if (this.petting > 0) return;

    this.nextChange -= dt;
    if (this.nextChange > 0) return;

    // Le chat décide tout seul : rester, changer de posture, ou aller
    // flâner ailleurs. Un chat qu'on ne touche pas finit par s'assoupir.
    const r = Math.random();
    if (r < 0.3 && bounds) {
      this.targetX = lerp(bounds.left + 16, bounds.right - 16, Math.random());
      this.setState('marche');
    } else if (r < 0.5) {
      this.setState('etire');
    } else if (r < 0.78) {
      this.setState(this.state === 'assis' ? 'pain' : 'assis');
    } else {
      this.setState('dort');
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 5 * dt;              // les cœurs ralentissent en montant
      p.vx *= 1 - dt * 0.8;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
  }

  /* ---------- Rendu ---------- */

  draw(ctx) {
    // Une planche de sprites fournie prend le pas sur le squelette dessiné.
    // Si elle ne couvre pas la posture courante, on retombe dessus sans bruit.
    if (this.feuille && this.drawFeuille(ctx)) {
      this.drawParticles(ctx);
      return;
    }

    const P = this.palette;
    const rig = this.buildRig();

    // Ombre portée au sol : un simple aplat sombre translucide.
    ctx.globalAlpha = 0.22;
    ellipse(ctx, this.x, this.y + 0.5, rig.shadowR, 1.5, P.outline);
    ctx.globalAlpha = 1;

    // Passe 1 : contour (mêmes formes, un pixel de plus).
    this.drawShapes(ctx, rig, P.outline, 1);
    // Passe 2 : remplissage.
    this.drawShapes(ctx, rig, null, 0);

    this.drawFace(ctx, rig, P);
    this.drawParticles(ctx);
  }

  /** Construit la position de chaque morceau pour l'image courante. */
  buildRig() {
    const P = this.palette;
    const f = this.facing;
    const breathe = Math.sin(this.t * (this.state === 'dort' ? 1.1 : 1.9)) * 0.5;
    const purrShake = this.purr > 0.1 ? (Math.random() - 0.5) * this.purr * 0.7 : 0;

    const rig = { P, f, legs: [], breathe };

    if (this.state === 'dort') {
      // Chat en boule. La tête doit dépasser franchement du corps : tant
      // qu'elle reste dans l'ellipse du dos, la pose se lit comme une limace.
      rig.body = { x: this.x + f * 2, y: this.y - 5, rx: 11.5, ry: 5.5 + breathe * 0.4 };
      rig.head = { x: this.x - f * 9, y: this.y - 9.5, r: 6 };
      rig.earSpread = 4.5; rig.earH = 3.5;
      rig.tail = { curl: true };
      rig.shadowR = 14;
      rig.eyesShut = true;
      return rig;
    }

    if (this.state === 'pain') {
      // « Pain de mie » : pattes rentrées sous le corps.
      rig.body = { x: this.x, y: this.y - 7, rx: 11, ry: 7 + breathe * 0.4 };
      rig.head = { x: this.x + this.lookOff.x * 2, y: this.y - 16 + this.lookOff.y + purrShake, r: 7.5 };
      rig.earSpread = 5.5; rig.earH = 5;
      rig.tail = { curl: true };
      rig.shadowR = 12;
      return rig;
    }

    if (this.state === 'etire') {
      // Le vrai étirement du chat : pattes avant loin devant, poitrail au
      // ras du sol, arrière-train relevé — pas un simple allongement.
      const k = ease(clamp(this.stateT / 1.1, 0, 1));
      const stretch = Math.sin(k * Math.PI);
      rig.body = {
        x: this.x - f * stretch * 2,
        y: this.y - 8 + stretch * 2.5,
        rx: 10 + stretch * 4,
        ry: 5.5 - stretch * 0.5,
      };
      rig.head = {
        x: this.x + f * (10 + stretch * 3),
        y: this.y - 11 + stretch * 2,
        r: 6.5,
      };
      rig.earSpread = 5; rig.earH = 5;
      rig.tail = { curl: false, lift: 0.4 + stretch * 0.9 };
      rig.shadowR = 13 + stretch * 3;
      rig.legs = [
        { x: this.x + f * (8 + stretch * 4), y: this.y, h: 4.5 - stretch * 2.5 },
        { x: this.x + f * 4, y: this.y, h: 5 - stretch * 2 },
        { x: this.x - f * 5, y: this.y, h: 6 + stretch * 1.5 },
        { x: this.x - f * 8, y: this.y, h: 6 + stretch * 2 },
      ];
      return rig;
    }

    if (this.state === 'marche') {
      const cycle = this.t * 7.5;
      const bob = Math.abs(Math.sin(cycle)) * 1.2;
      rig.body = { x: this.x, y: this.y - 8 - bob, rx: 10.5, ry: 5.5 };
      rig.head = { x: this.x + f * 8, y: this.y - 14 - bob + this.lookOff.y * 0.6, r: 6.5 };
      rig.earSpread = 5; rig.earH = 5;
      rig.tail = { curl: false, lift: 0.5 };
      rig.shadowR = 12;
      // Deux paires nettement séparées — avant sous les épaules, arrière sous
      // les hanches, ventre vide entre les deux. Groupées, quatre pattes de
      // 3 px se lisent comme les dents d'un peigne.
      rig.legs = [
        { x: this.x + f * 7, y: this.y, h: 6 - Math.max(0, Math.sin(cycle)) * 3 },
        { x: this.x + f * 3.5, y: this.y, h: 6 - Math.max(0, Math.sin(cycle + Math.PI)) * 3 },
        { x: this.x - f * 4.5, y: this.y, h: 6 - Math.max(0, Math.sin(cycle + Math.PI * 0.5)) * 3 },
        { x: this.x - f * 8, y: this.y, h: 6 - Math.max(0, Math.sin(cycle + Math.PI * 1.5)) * 3 },
      ];
      return rig;
    }

    // Assis, de face : la posture par défaut, celle qu'on caresse.
    const sq = this.squash;
    rig.body = { x: this.x, y: this.y - 8 + sq, rx: 9.5 - sq * 1.5, ry: 8 + breathe * 0.5 + sq };
    rig.head = {
      x: this.x + this.lookOff.x * 2 + purrShake,
      y: this.y - 20 + this.lookOff.y * 1.5 + breathe * 0.4 - this.hop,
      r: 8,
    };
    rig.earSpread = 6; rig.earH = 5.5;
    rig.tail = { curl: false, lift: 0.25 };
    rig.shadowR = 11;
    rig.legs = [
      { x: this.x - 5, y: this.y, h: 3, paw: true },
      { x: this.x + 5, y: this.y, h: 3, paw: true },
    ];
    return rig;
  }

  /** Dessine les formes. Si `outline` est fourni, on grossit d'un pixel. */
  drawShapes(ctx, rig, outline, g) {
    const P = rig.P;
    const f = rig.f;
    const col = (fill) => outline || fill;

    // Queue — derrière tout le reste.
    this.drawTail(ctx, rig, col(P.dark), g);

    // Pattes arrière (les plus éloignées) — teinte foncée.
    for (let i = rig.legs.length - 1; i >= 2; i--) {
      const l = rig.legs[i];
      rect(ctx, l.x - 1.5 - g, l.y - l.h - g, 3 + g * 2, l.h + g, col(P.dark));
    }

    // Corps.
    ellipse(ctx, rig.body.x, rig.body.y, rig.body.rx + g, rig.body.ry + g, col(P.main));

    // Pattes avant.
    for (let i = 0; i < Math.min(2, rig.legs.length); i++) {
      const l = rig.legs[i];
      rect(ctx, l.x - 1.5 - g, l.y - l.h - g, 3 + g * 2, l.h + g, col(l.paw ? P.light : P.main));
    }

    // Poitrail plus clair, uniquement en remplissage.
    if (!outline && this.state !== 'dort') {
      ellipse(ctx, rig.body.x, rig.body.y + rig.body.ry * 0.28,
        rig.body.rx * 0.45, rig.body.ry * 0.5, P.light);
    }

    // Oreilles — triangles bâtis à la main, ligne par ligne.
    const twitch = this.earTwitch * (Math.sin(this.t * 40) * 1.2);
    for (const s of [-1, 1]) {
      const ex = rig.head.x + s * rig.earSpread;
      const ey = rig.head.y - rig.head.r * 0.72;
      const h = rig.earH + (s > 0 ? twitch : -twitch * 0.6);
      for (let i = 0; i <= h; i++) {
        const wgt = Math.round((1 - i / (h + 1)) * 4) + g;
        rect(ctx, ex - wgt / 2 + s * i * 0.35, ey - i, wgt, 1, col(P.main));
      }
      if (!outline) {
        // Intérieur rosé.
        for (let i = 1; i <= h - 2; i++) {
          const wgt = Math.max(1, Math.round((1 - i / (h + 1)) * 3) - 1);
          rect(ctx, ex - wgt / 2 + s * i * 0.35, ey - i, wgt, 1, P.pink);
        }
      }
    }

    // Tête.
    ellipse(ctx, rig.head.x, rig.head.y, rig.head.r + g, rig.head.r * 0.88 + g, col(P.main));

    // Museau clair.
    if (!outline) {
      ellipse(ctx, rig.head.x + this.lookOff.x * 0.6, rig.head.y + rig.head.r * 0.34,
        rig.head.r * 0.52, rig.head.r * 0.34, P.light);
    }
  }

  /** Dessine une image de la planche de sprites.
   *
   *  Chaque posture cherche son animation, puis se rabat sur une posture
   *  voisine : une planche téléchargée n'aura presque jamais les cinq.
   *  Renvoie false si rien ne convient, pour laisser la main au squelette.
   */
  drawFeuille(ctx) {
    const REPLIS = {
      assis: ['assis'],
      pain: ['pain', 'assis'],
      dort: ['dort', 'pain', 'assis'],
      marche: ['marche', 'assis'],
      etire: ['etire', 'assis'],
    };
    const f = this.feuille;
    let anim = null;
    for (const nom of REPLIS[this.state] || ['assis']) {
      if (f.animations[nom]) { anim = f.animations[nom]; break; }
    }
    if (!anim) return false;

    const cases = Math.max(1, anim.cases || 1);
    const frame = Math.floor(this.t * (anim.ips || 6)) % cases;
    const lc = f.largeurCase, hc = f.hauteurCase;
    const sx = frame * lc, sy = (anim.ligne || 0) * hc;
    const dx = Math.round(this.x - lc / 2), dy = Math.round(this.y - hc);

    ctx.globalAlpha = 0.22;
    ellipse(ctx, this.x, this.y + 0.5, lc * 0.34, 1.5, this.palette.outline);
    ctx.globalAlpha = 1;

    if (this.facing < 0) {
      ctx.save();
      ctx.translate(dx + lc, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(f.img, sx, sy, lc, hc, 0, 0, lc, hc);
      ctx.restore();
    } else {
      ctx.drawImage(f.img, sx, sy, lc, hc, dx, dy, lc, hc);
    }
    return true;
  }

  /** Queue fuselée, échantillonnée le long d'une Bézier cubique.
   *
   *  Un simple trait d'un pixel se lit comme une antenne : c'est l'épaisseur
   *  qui décroît de la base vers le bout, et la double courbure en S, qui
   *  font lire « queue de chat ».
   */
  drawTail(ctx, rig, color, g) {
    const f = rig.f;
    const tail = rig.tail;
    const x0 = rig.body.x - f * (rig.body.rx - 1.5);
    const y0 = rig.body.y + rig.body.ry * 0.3;
    const sway = Math.sin(this.tailPhase) * (2 + this.tailEnergy * 6);

    let p1, p2, p3;
    if (tail.curl) {
      // Enroulée : elle part vers l'arrière, longe le flanc et vient
      // se poser devant les pattes.
      p1 = { x: x0 - f * 11, y: y0 + 3 };
      p2 = { x: x0 - f * 6, y: y0 + 7 };
      p3 = { x: rig.body.x + f * (rig.body.rx - 1), y: y0 + 5 };
    } else {
      const lift = tail.lift ?? 0.3;
      p1 = { x: x0 - f * 8, y: y0 - 3 - lift * 5 };
      p2 = { x: x0 - f * 11 + sway * 0.4, y: y0 - 10 - lift * 8 };
      p3 = { x: x0 - f * 7 + sway, y: y0 - 15 - lift * 10 };
    }

    const pas = 26;
    for (let i = 0; i <= pas; i++) {
      const t = i / pas, u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const y = u * u * u * y0 + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      const r = lerp(2.1, 0.7, t) + g * 0.9;
      ellipse(ctx, x, y, r, r, color);
    }
  }

  drawFace(ctx, rig, P) {
    if (this.state === 'dort') { this.drawEyesShut(ctx, rig, P); return; }

    const hx = rig.head.x, hy = rig.head.y;
    const ox = this.lookOff.x * 1.2;
    const oy = this.lookOff.y * 0.8;
    const eyeY = Math.round(hy - 0.5 + oy);
    const dx = 3;

    const heureux = this.petting > 0 || this.bonheur > 0.55;
    const ferme = this.blink > 0.25;

    for (const s of [-1, 1]) {
      const ex = Math.round(hx + s * dx + ox);
      if (ferme) {
        rect(ctx, ex - 1, eyeY, 3, 1, P.outline);
      } else if (heureux) {
        // Yeux plissés de contentement : un petit accent circonflexe.
        px(ctx, ex - 1, eyeY, P.outline);
        px(ctx, ex, eyeY - 1, P.outline);
        px(ctx, ex + 1, eyeY, P.outline);
      } else {
        rect(ctx, ex - 1, eyeY - 1, 3, 3, P.outline);
        rect(ctx, ex - 1, eyeY - 1, 3, 2, P.eye);
        px(ctx, ex, eyeY, P.outline);              // pupille
        px(ctx, ex + (s > 0 ? 1 : -1), eyeY - 1, '#ffffff'); // reflet
      }
    }

    // Truffe et bouche.
    const nx = Math.round(hx + ox * 0.7);
    const ny = Math.round(hy + rig.head.r * 0.32 + oy * 0.4);
    rect(ctx, nx - 1, ny, 2, 1, P.pink);
    px(ctx, nx - 2, ny + 1, P.outline);
    px(ctx, nx + 1, ny + 1, P.outline);

    // Moustaches — discrètes, une ligne de chaque côté.
    ctx.globalAlpha = 0.55;
    for (const s of [-1, 1]) {
      const wx = nx + s * 3;
      rect(ctx, s < 0 ? wx - 3 : wx, ny, 3, 1, P.outline);
    }
    ctx.globalAlpha = 1;
  }

  drawEyesShut(ctx, rig, P) {
    const hx = rig.head.x, hy = rig.head.y;
    for (const s of [-1, 1]) {
      const ex = Math.round(hx + s * 3);
      rect(ctx, ex - 1, Math.round(hy), 3, 1, P.outline);
    }
    const nx = Math.round(hx);
    rect(ctx, nx - 1, Math.round(hy + rig.head.r * 0.34), 2, 1, P.pink);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = p.t / p.life;
      const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.5) / 0.5);
      ctx.globalAlpha = clamp(a, 0, 1);
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.kind === 'coeur') {
        const c = '#ef7d92';
        px(ctx, x - 1, y - 1, c); px(ctx, x + 1, y - 1, c);
        rect(ctx, x - 2, y, 5, 1, c);
        rect(ctx, x - 1, y + 1, 3, 1, c);
        px(ctx, x, y + 2, c);
      } else if (p.kind === 'z') {
        const c = '#e8e2ef';
        rect(ctx, x, y, 4, 1, c);
        px(ctx, x + 2, y + 1, c);
        px(ctx, x + 1, y + 2, c);
        rect(ctx, x, y + 3, 4, 1, c);
      } else {
        const c = '#f4e7c8';
        rect(ctx, x, y, 3, 1, c);
        px(ctx, x + 2, y + 1, c);
        px(ctx, x + 1, y + 2, c);
        px(ctx, x + 1, y + 4, c);
      }
    }
    ctx.globalAlpha = 1;
  }
}
