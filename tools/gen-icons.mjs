/* gen-icons.mjs — fabrique les icônes PNG de l'app.
 *
 * L'icône est dessinée pixel par pixel sur une grille de 32×32, puis
 * agrandie au plus proche voisin : elle reste du vrai pixel art à toutes
 * les tailles, y compris en 1024 pour l'App Store.
 *
 * L'encodeur PNG est écrit ici pour éviter toute dépendance :
 * `node tools/gen-icons.mjs` suffit, sans npm install.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', 'web', 'icons');

/* ---------- Encodeur PNG minimal (RGBA, non entrelacé) ---------- */

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

function encodePNG(width, height, rgba) {
  const brut = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    brut[y * (width * 4 + 1)] = 0;            // filtre « None »
    rgba.copy(brut, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8 bits par canal
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- L'icône : un chat assis, dos au couchant ----------
 *
 * m lune · c pelage · i intérieur d'oreille · w poitrail et museau
 * p pattes · e œil · E reflet · n truffe · g sol · . ciel
 */

const N = 32;

const ART = [
  '................................',
  '................................',
  '................................',
  '......mmm.......................',
  '.....mmmmm......................',
  '....mmmmmmm..c.....c............',
  '....mmmmmmm..cc...cc............',
  '....mmmmmmm.cic...cic...........',
  '....mmmmmmm.ciic.ciic...........',
  '.....mmmmm..ccccccccc...........',
  '......mmm...ccccccccc...........',
  '............cEecccEec...........',
  '............ceeccceec...........',
  '............cccwnwccc...........',
  '............ccwwwwwcc...........',
  '.............ccccccc............',
  '..............ccccc.............',
  '............ccccccccc...........',
  '...........ccccccccccc..........',
  '...........ccccwwwcccc..........',
  '..........ccccwwwwwcccc...cc....',
  '..........ccccwwwwwcccc...ccc...',
  '.........ccccccwwwcccccc...ccc..',
  '.........ccccccccccccccc...ccc..',
  '.........ccpppcccccpppcc.cccc...',
  'g..g..gg.ccpppcccccpppcccccgg..g',
  'gggggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggggg',
  'gggggggggggggggggggggggggggggggg'
];

const PAL = {
  m: [253, 243, 208, 255],
  c: [43, 33, 64, 255],
  i: [190, 116, 126, 255],
  w: [233, 224, 241, 255],
  p: [214, 206, 228, 255],
  e: [255, 209, 102, 255],
  E: [255, 255, 255, 255],
  n: [224, 140, 146, 255],
  g: [35, 27, 54, 255],
};

// Neuf teintes rapprochées : une trame entre deux couleurs trop
// éloignées donne un damier au lieu d'un dégradé.
const CIEL = [
  [56, 40, 94], [76, 47, 101], [103, 58, 105], [136, 71, 104], [170, 90, 101],
  [203, 116, 97], [228, 148, 95], [242, 180, 112], [248, 206, 138],
];

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function ciel(x, y) {
  const t = (y / 25) * (CIEL.length - 1);
  const i = Math.min(CIEL.length - 2, Math.floor(t));
  const c = BAYER[y & 3][x & 3] < (t - i) * 16 ? CIEL[i + 1] : CIEL[i];
  return [c[0], c[1], c[2], 255];
}

/** Grille de couleurs 32×32. `marge` : version rognable, chat réduit et
 *  recentré pour survivre au masque circulaire d'iOS et d'Android. */
function grille(marge) {
  const g = [];
  for (let y = 0; y < N; y++) {
    const ligne = [];
    for (let x = 0; x < N; x++) {
      let sx = x, sy = y;
      if (marge) {
        // Rétrécit le motif de 20 % autour du centre.
        sx = Math.round((x - N / 2) / 0.8 + N / 2);
        sy = Math.round((y - N / 2) / 0.8 + N / 2 + 1);
      }
      // Hors grille, on prolonge le bord le plus proche : sinon les marges
      // laissent passer du ciel sous la ligne d'horizon.
      sx = Math.max(0, Math.min(N - 1, sx));
      sy = Math.max(0, Math.min(N - 1, sy));
      const ch = ART[sy][sx];
      ligne.push(ch === '.' ? ciel(x, y) : PAL[ch]);
    }
    g.push(ligne);
  }
  return g;
}

function versRGBA(grille, taille) {
  const buf = Buffer.alloc(taille * taille * 4);
  const k = taille / N;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const c = grille[Math.min(N - 1, Math.floor(y / k))][Math.min(N - 1, Math.floor(x / k))];
      const o = (y * taille + x) * 4;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = c[3];
    }
  }
  return buf;
}

mkdirSync(SORTIE, { recursive: true });

const normale = grille(false);
const rognable = grille(true);

for (const [nom, taille, g] of [
  ['icon-180.png', 180, normale],
  ['icon-192.png', 192, normale],
  ['icon-512.png', 512, normale],
  ['icon-1024.png', 1024, normale],
  ['icon-512-maskable.png', 512, rognable],
]) {
  const png = encodePNG(taille, taille, versRGBA(g, taille));
  writeFileSync(join(SORTIE, nom), png);
  console.log(`${nom.padEnd(24)} ${taille}\u00d7${taille}  ${(png.length / 1024).toFixed(1)} ko`);
}
