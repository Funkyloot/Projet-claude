/* interieurs.js — l'intérieur des lieux de la ville, façon Kenney Tiny Factory.
 *
 * Quand on entre dans un bâtiment (concession, pièces auto, bureau des
 * courses, tombola, café), le menu s'ouvre sous une vue de la pièce : mur à
 * bande jaune, sol, mobilier et personnages à l'échelle (une personne =
 * 1 case, une voiture = 2 × 3 cases). Image de 320 × 112 px, mise en cache.
 */

import { tuileTiny, dessinerPerso, tenue, spriteVoitureTiny, dessinerVoitureTiny, CONTOUR } from './tiny.js';

const W = 320, H = 112;
const cache = new Map();

function rangee(c, tiny, ns, x, y) {
  ns.forEach((n, i) => { if (n !== null) tuileTiny(c, tiny, 'factory', n, x + i * 16, y); });
}

/** Sol, mur du fond (une rangée de tuiles) et contour de la pièce. */
function piece(c, tiny, sol, murs) {
  for (let y = 16; y < H; y += 16) for (let x = 0; x < W; x += 16) tuileTiny(c, tiny, 'factory', sol, x, y);
  for (let x = 0; x < W; x += 16) tuileTiny(c, tiny, 'factory', murs[(x / 16) % murs.length], x, 0);
  c.fillStyle = CONTOUR; c.fillRect(0, 0, W, 2); c.fillRect(0, H - 2, W, 2); c.fillRect(0, 0, 2, H); c.fillRect(W - 2, 0, 2, H);
}

function plateau(c, x, y) {
  c.fillStyle = CONTOUR; c.beginPath(); c.ellipse(x, y, 30, 20, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d4d9e3'; c.beginPath(); c.ellipse(x, y, 29, 19, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c0cbdc'; c.beginPath(); c.ellipse(x, y, 23, 14, 0, 0, Math.PI * 2); c.fill();
}

function prix(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x, y, 16, 12); c.fillRect(x + 7, y + 12, 2, 5);
  c.fillStyle = '#ffffff'; c.fillRect(x + 1, y + 1, 14, 10);
  c.fillStyle = '#3fa34d'; c.fillRect(x + 2, y + 2, 12, 3);
  c.fillStyle = CONTOUR; c.fillRect(x + 2, y + 7, 8, 2);
}

function comptoir(c, x, y, w) {
  c.fillStyle = CONTOUR; c.fillRect(x, y, w, 18);
  c.fillStyle = '#c98a55'; c.fillRect(x + 1, y + 1, w - 2, 6);
  c.fillStyle = '#a86e40'; c.fillRect(x + 1, y + 7, w - 2, 10);
}

function table(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x - 12, y - 10, 24, 12); c.fillRect(x - 2, y + 2, 4, 6);
  c.fillStyle = '#f4f6fb'; c.fillRect(x - 11, y - 9, 22, 8);
  c.fillStyle = '#c2504d'; c.fillRect(x - 3, y - 8, 6, 4);
}

const DESSINS = {
  concession(c, tiny) {
    piece(c, tiny, 1, [44, 74, 46, 74, 47, 74]);
    const voitures = [['#e4432d', 52], ['#3fa34d', 130], ['#8a6ad6', 208]];
    for (const [coul, x] of voitures) {
      plateau(c, x, 66);
      dessinerVoitureTiny(c, spriteVoitureTiny(coul, coul === '#e4432d' ? '#f4f6fb' : null), x, 62, 0);
      prix(c, x + 26, 78);
    }
    comptoir(c, 256, 64, 52);
    tuileTiny(c, tiny, 'factory', 111, 288, 48);
    dessinerPerso(c, tenue(13), 272, 62, 'face');
    dessinerPerso(c, tenue(22), 96, 104, 'dos');
    tuileTiny(c, tiny, 'town', 17, 300, 92);
  },
  pieces(c, tiny) {
    piece(c, tiny, 0, [44, 46, 47, 57]);
    rangee(c, tiny, [72, 84, 72, 84, 72, 84], 8, 18);
    rangee(c, tiny, [73, 73, 97, 85, 85], 8, 50);
    rangee(c, tiny, [126, 126, 114], 104, 50);
    // Piles de pneus.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      c.fillStyle = CONTOUR; c.beginPath(); c.ellipse(170 + i * 16, 88 - j * 6, 7, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#4b5873'; c.beginPath(); c.ellipse(170 + i * 16, 88 - j * 6, 3, 2, 0, 0, Math.PI * 2); c.fill();
    }
    comptoir(c, 222, 60, 86);
    rangee(c, tiny, [121, 122, 123], 232, 46);
    dessinerPerso(c, tenue(5, 'mecano'), 270, 58, 'face');
    dessinerPerso(c, tenue(31), 250, 104, 'dos');
  },
  bureau(c, tiny) {
    piece(c, tiny, 1, [44, 57, 58, 59, 46]);
    // Drapeaux et affiches de courses au mur.
    tuileTiny(c, tiny, 'ski', 8, 40, 2); tuileTiny(c, tiny, 'ski', 9, 56, 2);
    tuileTiny(c, tiny, 'ski', 22, 120, 2); tuileTiny(c, tiny, 'ski', 23, 136, 2);
    comptoir(c, 100, 52, 120);
    rangee(c, tiny, [111, null, null, 112], 112, 38);
    dessinerPerso(c, tenue(9), 140, 50, 'face');
    dessinerPerso(c, tenue(17), 190, 50, 'face');
    // Vitrine des trophées.
    c.fillStyle = CONTOUR; c.fillRect(250, 20, 56, 40);
    c.fillStyle = '#cfe8ff'; c.fillRect(252, 22, 52, 36);
    for (const [x, col] of [[260, '#f2c14e'], [276, '#c0cbdc'], [292, '#d08a3e']]) {
      c.fillStyle = CONTOUR; c.fillRect(x - 4, 30, 9, 14); c.fillStyle = col; c.fillRect(x - 3, 31, 7, 12);
    }
    rangee(c, tiny, [6, 6, 6], 16, 86);
    dessinerPerso(c, tenue(26), 30, 98, 'face');
    dessinerPerso(c, tenue(40), 150, 106, 'dos');
  },
  tombola(c, tiny) {
    piece(c, tiny, 1, [44, 46, 47]);
    // La grande roue de la tombola.
    const cx = 80, cy = 58, r = 30;
    const couleurs = ['#e4432d', '#f2c14e', '#2f6fdb', '#3fa34d', '#e86ca6', '#f39c33'];
    for (let i = 0; i < 6; i++) {
      c.fillStyle = couleurs[i]; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); c.fill();
    }
    c.strokeStyle = CONTOUR; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    c.fillStyle = CONTOUR; c.fillRect(cx - 3, cy - 3, 6, 6); c.fillRect(cx - 2, cy - r - 8, 4, 8);
    comptoir(c, 150, 60, 80);
    rangee(c, tiny, [123, 73, 97], 160, 46);
    dessinerPerso(c, tenue(11), 200, 58, 'face');
    dessinerPerso(c, tenue(3), 120, 104, 'dos');
    dessinerPerso(c, tenue(44), 264, 100, 'gauche');
  },
  cafe(c, tiny) {
    piece(c, tiny, 0, [44, 58, 59, 46, 47]);
    comptoir(c, 12, 44, 104);
    rangee(c, tiny, [75, 76, 86], 20, 28);
    dessinerPerso(c, tenue(7), 70, 44, 'face');
    for (const [x, y] of [[170, 66], [250, 66], [210, 100]]) {
      table(c, x, y);
      dessinerPerso(c, tenue(x + y), x - 18, y + 6, 'droite');
      dessinerPerso(c, { ...tenue(x * 3), casque: '#e4432d', haut: '#f4f1e8' }, x + 18, y + 6, 'gauche');
    }
  },
};

/** URL de l'image d'intérieur d'un lieu (ou null s'il n'en a pas). */
export function interieur(id, tiny) {
  if (!DESSINS[id] || !tiny?.factory) return null;
  if (cache.has(id)) return cache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  DESSINS[id](c, tiny);
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
