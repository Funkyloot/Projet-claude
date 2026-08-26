/* rendu.mjs — un canvas logiciel minimal, pour dessiner l'app hors du navigateur.
 *
 * Le moteur de l'app ne se sert que de `fillStyle`, `fillRect` et
 * `globalAlpha` : une trentaine de lignes suffisent donc à le faire tourner
 * dans Node, et à exporter de vraies planches PNG pixel par pixel.
 *
 * L'encodeur PNG est repris de gen-icons.mjs, toujours sans dépendance.
 */

import { deflateSync } from 'node:zlib';

/* ---------- Encodeur PNG (RGBA, non entrelacé) ---------- */

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([len, corps, crc]);
}

export function encodePNG(width, height, rgba) {
  const brut = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    brut[y * (width * 4 + 1)] = 0;
    rgba.copy(brut, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- Couleurs ---------- */

const cacheCouleur = new Map();

function analyser(css) {
  if (cacheCouleur.has(css)) return cacheCouleur.get(css);
  let c = [0, 0, 0, 255];
  if (css[0] === '#') {
    const n = parseInt(css.slice(1), 16);
    if (css.length === 7) c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    else if (css.length === 4) {
      const r = (n >> 8) & 15, g = (n >> 4) & 15, b = n & 15;
      c = [r * 17, g * 17, b * 17, 255];
    }
  } else {
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map((v) => parseFloat(v));
      c = [p[0] | 0, p[1] | 0, p[2] | 0, Math.round((p[3] ?? 1) * 255)];
    }
  }
  cacheCouleur.set(css, c);
  return c;
}

/* ---------- Toile ---------- */

export class Toile {
  constructor(l, h) {
    this.l = l;
    this.h = h;
    this.data = Buffer.alloc(l * h * 4);
    const toile = this;
    this.ctx = {
      fillStyle: '#000000',
      globalAlpha: 1,
      imageSmoothingEnabled: false,
      fillRect(x, y, w, hh) { toile.remplir(x, y, w, hh, this.fillStyle, this.globalAlpha); },
    };
  }

  remplir(x, y, w, h, css, alpha = 1) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const [r, g, b, a0] = analyser(css);
    const a = (a0 / 255) * alpha;
    if (a <= 0) return;
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.l, x + w); i++) {
        const o = (j * this.l + i) * 4;
        if (a >= 1) {
          this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255;
        } else {
          const d = this.data[o + 3] / 255;
          const na = a + d * (1 - a);
          this.data[o] = Math.round((r * a + this.data[o] * d * (1 - a)) / na);
          this.data[o + 1] = Math.round((g * a + this.data[o + 1] * d * (1 - a)) / na);
          this.data[o + 2] = Math.round((b * a + this.data[o + 2] * d * (1 - a)) / na);
          this.data[o + 3] = Math.round(na * 255);
        }
      }
    }
  }

  /** Recopie une autre toile à (x, y), en gardant la transparence. */
  coller(src, x, y) {
    for (let j = 0; j < src.h; j++) {
      for (let i = 0; i < src.l; i++) {
        const so = (j * src.l + i) * 4;
        if (src.data[so + 3] === 0) continue;
        const dx = x + i, dy = y + j;
        if (dx < 0 || dy < 0 || dx >= this.l || dy >= this.h) continue;
        const o = (dy * this.l + dx) * 4;
        src.data.copy(this.data, o, so, so + 4);
      }
    }
  }

  /** Boîte englobante des pixels non transparents. */
  cadre() {
    let x0 = this.l, y0 = this.h, x1 = -1, y1 = -1;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.l; i++) {
        if (this.data[(j * this.l + i) * 4 + 3] === 0) continue;
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, l: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  png() { return encodePNG(this.l, this.h, this.data); }

  /** Agrandissement entier au plus proche voisin, pour les aperçus. */
  agrandie(k) {
    const t = new Toile(this.l * k, this.h * k);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.l; i++) {
        const so = (j * this.l + i) * 4;
        for (let b = 0; b < k; b++) {
          for (let a = 0; a < k; a++) {
            const o = ((j * k + b) * t.l + i * k + a) * 4;
            this.data.copy(t.data, o, so, so + 4);
          }
        }
      }
    }
    return t;
  }
}
