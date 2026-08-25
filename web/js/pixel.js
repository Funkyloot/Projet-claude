/* pixel.js — moteur de rendu pixel art basse résolution.
 *
 * Tout le jeu est dessiné dans un canvas virtuel de faible résolution
 * (environ 190 px de large), puis agrandi d'un facteur ENTIER vers l'écran
 * avec le lissage désactivé. C'est ce qui donne des pixels francs et carrés
 * plutôt qu'une bouillie floue.
 */

export class PixelScreen {
  constructor(canvas, { targetWidth = 190, maxScale = 6 } = {}) {
    this.out = canvas;
    this.octx = canvas.getContext('2d', { alpha: false });
    this.targetWidth = targetWidth;
    this.maxScale = maxScale;

    // Canvas virtuel : c'est là que tout est dessiné.
    this.buf = document.createElement('canvas');
    this.ctx = this.buf.getContext('2d', { alpha: false });

    this.w = 0; this.h = 0; this.scale = 1;
    this.resize();
  }

  resize() {
    const cssW = Math.max(1, this.out.clientWidth || window.innerWidth);
    const cssH = Math.max(1, this.out.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    // Facteur d'agrandissement entier -> pixels parfaitement carrés.
    let scale = Math.round((cssW * dpr) / this.targetWidth);
    scale = Math.max(2, Math.min(this.maxScale, scale));

    const w = Math.ceil((cssW * dpr) / scale);
    const h = Math.ceil((cssH * dpr) / scale);

    if (w === this.w && h === this.h && scale === this.scale) return false;

    this.w = w; this.h = h; this.scale = scale;
    this.buf.width = w; this.buf.height = h;
    this.out.width = w * scale;
    this.out.height = h * scale;
    this.out.style.width = cssW + 'px';
    this.out.style.height = cssH + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.octx.imageSmoothingEnabled = false;
    return true;
  }

  /** Recopie le canvas virtuel sur l'écran, agrandi. */
  present() {
    this.octx.imageSmoothingEnabled = false;
    this.octx.drawImage(this.buf, 0, 0, this.w, this.h, 0, 0, this.out.width, this.out.height);
  }

  /** Convertit un point de l'écran (clientX/Y) en coordonnées virtuelles. */
  toVirtual(clientX, clientY) {
    const r = this.out.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * this.w,
      y: ((clientY - r.top) / r.height) * this.h,
    };
  }
}

/* ---------- Primitives de dessin ----------
 * Toutes arrondissent leurs coordonnées : rien ne se retrouve à cheval
 * sur un demi-pixel, ce qui est la première cause de pixel art « sale ».
 */

export function px(ctx, x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export function rect(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function hline(ctx, x, y, w, c) { rect(ctx, x, y, w, 1, c); }
export function vline(ctx, x, y, h, c) { rect(ctx, x, y, 1, h, c); }

/** Ellipse pleine tracée ligne par ligne (pas d'anti-aliasing). */
export function ellipse(ctx, cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  rx = Math.max(0.5, rx); ry = Math.max(0.5, ry);
  ctx.fillStyle = c;
  const top = Math.ceil(cy - ry), bot = Math.floor(cy + ry);
  for (let y = top; y <= bot; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const k = 1 - dy * dy;
    if (k <= 0) continue;
    const half = rx * Math.sqrt(k);
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** Disque (ellipse à rayons égaux), utile pour la lune, les fruits, etc. */
export function circle(ctx, cx, cy, r, c) { ellipse(ctx, cx, cy, r, r, c); }

/** Segment de droite en escalier (Bresenham). */
export function line(ctx, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Courbe de Bézier quadratique échantillonnée en pixels (queue du chat, câbles). */
export function curve(ctx, x0, y0, cx, cy, x1, y1, c, thickness = 1) {
  const steps = Math.max(8, Math.round(Math.hypot(x1 - x0, y1 - y0) * 2));
  let px_ = null, py_ = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    if (px_ !== null) line(ctx, px_, py_, x, y, c);
    if (thickness > 1) {
      const r = (thickness - 1) / 2;
      ellipse(ctx, x, y, r, r, c);
    }
    px_ = x; py_ = y;
  }
}

/* ---------- Dégradés tramés ----------
 * Un vrai dégradé lisse jure avec du pixel art. On empile des bandes de
 * couleur unie et on tisse une trame de Bayer à la frontière : c'est la
 * technique classique des ciels 8/16 bits.
 */

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function ditherRect(ctx, x, y, w, h, colorA, colorB, amount) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(ctx, x, y, w, h, colorA);
  if (amount <= 0) return;
  ctx.fillStyle = colorB;
  const t = Math.min(1, amount) * 16;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (BAYER4[(y + j) & 3][(x + i) & 3] < t) ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Dégradé vertical tramé entre une liste d'arrêts {at: 0..1, color}. */
export function skyGradient(ctx, x, y, w, h, stops) {
  for (let j = 0; j < h; j++) {
    const t = h <= 1 ? 0 : j / (h - 1);
    let a = stops[0], b = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k].at && t <= stops[k + 1].at) { a = stops[k]; b = stops[k + 1]; break; }
    }
    const span = Math.max(1e-6, b.at - a.at);
    const local = Math.max(0, Math.min(1, (t - a.at) / span));
    // 5 paliers de trame par bande : assez pour être doux, assez peu pour rester « pixel ».
    const step = Math.round(local * 4) / 4;
    ditherRect(ctx, x, y + j, w, 1, a.color, b.color, step);
  }
}

/* ---------- Sprites en texte ----------
 * Un sprite est un tableau de chaînes, un caractère par pixel, plus une
 * palette qui associe chaque caractère à une couleur. Le point '.' est
 * transparent. C'est lisible et modifiable directement dans le source.
 */

export function drawSprite(ctx, sprite, x, y, palette, { flip = false, alpha = 1 } = {}) {
  x = Math.round(x); y = Math.round(y);
  const prev = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  const h = sprite.length;
  for (let j = 0; j < h; j++) {
    const row = sprite[j];
    const w = row.length;
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const c = palette[ch];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + (flip ? w - 1 - i : i), y + j, 1, 1);
    }
  }
  if (alpha !== 1) ctx.globalAlpha = prev;
}

export function spriteSize(sprite) {
  return { w: Math.max(...sprite.map((r) => r.length)), h: sprite.length };
}

/* ---------- Utilitaires ---------- */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);

/** Générateur pseudo-aléatoire déterministe : la ville est identique à chaque lancement. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Mélange deux couleurs hex, sans passer par du CSS lisse. */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}
