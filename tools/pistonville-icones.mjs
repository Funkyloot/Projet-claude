/* pistonville-icones.mjs — icônes de l'application Pistonville (écran d'accueil).
 *
 * Dessinées pixel par pixel sur une grille de 24 × 24 : une voiture de course
 * jaune vue de dessus sur le damier d'arrivée. Agrandies au plus proche
 * voisin, elles restent nettes en 180, 192 et 512 px. Encodeur PNG maison :
 * aucune dépendance.
 *
 * Usage : node tools/pistonville-icones.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'pistonville', 'assets', 'icones');

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function morceau(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([len, corps, crc]);
}
function png(w, h, rgba) {
  const brut = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(brut, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut, { level: 9 })), morceau('IEND', Buffer.alloc(0))]);
}

// o contour · y carrosserie · Y reflet · w pare-brise · k pneu · r bande · h phare · . fond
const VOITURE = [
  '....oooooooo....',
  '...ohhyyyyhho...',
  '..koyyyyyyyyok..',
  '..koyYrrrrYyok..',
  '..koyyrrrryyok..',
  '...oywwwwwwyo...',
  '...owwwwwwwwo...',
  '...oyyrrrryyo...',
  '...oyyrrrryyo...',
  '...oyyrrrryyo...',
  '...oyyrrrryyo...',
  '...owwwwwwwwo...',
  '..koyyrrrryyok..',
  '..koyyrrrryyok..',
  '..koyyyyyyyyok..',
  '...oooooooooo...',
];
const PAL = {
  o: [26, 22, 38], y: [242, 193, 78], Y: [255, 240, 170], w: [127, 196, 232], k: [42, 40, 56], r: [228, 67, 45], h: [255, 255, 255],
};
const FOND = [31, 42, 68], CASE_A = [244, 241, 232], CASE_B = [42, 40, 56];

function dessin(marge) {
  const N = 24;
  const px = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c = FOND;
    // Damier d'arrivée en bas, sur fond bleu nuit.
    if (y >= 19 - marge / 2 && y < 21 - marge / 2) c = (((x >> 1) + (y >> 1)) & 1) ? CASE_A : CASE_B;
    const vx = x - 4, vy = y - 2 + (marge ? 1 : 0);
    if (vy >= 0 && vy < 16 && vx >= 0 && vx < 16) {
      const ch = VOITURE[vy][vx];
      if (ch !== '.') c = PAL[ch];
    }
    const o = (y * N + x) * 4;
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  }
  return px;
}

function agrandir(src, N, taille) {
  const out = Buffer.alloc(taille * taille * 4);
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) {
    const sx = Math.floor((x * N) / taille), sy = Math.floor((y * N) / taille);
    src.copy(out, (y * taille + x) * 4, (sy * N + sx) * 4, (sy * N + sx) * 4 + 4);
  }
  return out;
}

mkdirSync(SORTIE, { recursive: true });
const base = dessin(0);
for (const t of [180, 192, 512]) writeFileSync(join(SORTIE, `icone-${t}.png`), png(t, t, agrandir(base, 24, t)));
writeFileSync(join(SORTIE, 'icone-512-masquable.png'), png(512, 512, agrandir(dessin(4), 24, 512)));
console.log('Icônes écrites dans', SORTIE);
