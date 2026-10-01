/* ville-dessins.js — les bâtiments et le mobilier de la ville, style Kenney Tiny.
 *
 * Vue 3/4 à l'échelle (1 case de 16 px ≈ 1 m) : un toit plat de 2 cases vu
 * d'en haut, puis la façade, 2 cases par étage, avec fenêtres d'une case et
 * porte d'une case de large. La porte est toujours sur la façade visible
 * (côté sud), qui donne sur un trottoir. Contour sombre et palette Tiny.
 */

import { CONTOUR } from './tiny.js';
import { melangerCouleur } from './outils.js';

const VITRE = '#5f91c8', VITRE_CLAIRE = '#a9d4f2';

function cadre(c, x, y, w, h, coul) {
  c.fillStyle = CONTOUR; c.fillRect(x, y, w, h);
  c.fillStyle = coul; c.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/** Hauteur dessinée d'un bâtiment : toit (2 cases) + étages (2 cases chacun). */
export const hauteurBatiment = (etages) => 32 + etages * 32;

/**
 * Bâtiment moderne. (x, y) = coin haut-gauche du toit ; w = largeur.
 * o : { facade, toit, enseigne, auvent, vitrine, nom, garage, clim }
 */
export function batimentModerne(c, x, y, w, etages, o) {
  const h = hauteurBatiment(etages);
  const yt = y + 32;
  const yb = y + h;
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 4, yb - 2, w, 6);
  c.fillStyle = CONTOUR; c.fillRect(x, y, w, h);
  // Toit plat : bord clair, climatisation, parfois un château d'eau.
  c.fillStyle = o.toit; c.fillRect(x + 1, y + 1, w - 2, 30);
  c.fillStyle = melangerCouleur(o.toit, '#ffffff', 0.22); c.fillRect(x + 1, y + 1, w - 2, 3);
  c.fillStyle = melangerCouleur(o.toit, '#000000', 0.15); c.fillRect(x + 1, y + 27, w - 2, 4);
  if (o.clim !== false) {
    cadre(c, x + 8, y + 8, 14, 13, '#c0cbdc');
    c.fillStyle = '#8b9bb4'; c.fillRect(x + 11, y + 11, 8, 7);
    if (w > 90) { cadre(c, x + w - 30, y + 7, 20, 15, '#c0cbdc'); c.fillStyle = '#8b9bb4'; c.fillRect(x + w - 27, y + 10, 14, 2); }
  }
  // Façade.
  c.fillStyle = o.facade; c.fillRect(x + 1, yt, w - 2, h - 33);
  c.fillStyle = melangerCouleur(o.facade, '#000000', 0.28); c.fillRect(x + 1, yt, w - 2, 3);
  // Étages : fenêtres d'une case (16 × 16) régulièrement espacées.
  for (let e = 0; e < etages - 1; e++) {
    const fy = yt + 8 + e * 32;
    for (let fx = x + 8; fx + 14 <= x + w - 8; fx += 24) {
      cadre(c, fx, fy, 14, 16, VITRE);
      c.fillStyle = VITRE_CLAIRE; c.fillRect(fx + 2, fy + 2, 10, 3);
      c.fillStyle = CONTOUR; c.fillRect(fx + 6, fy + 1, 2, 14);
    }
  }
  // Rez-de-chaussée (2 cases) : enseigne, auvent, vitrine, porte ou porte de garage.
  const rz = yb - 32;
  if (o.enseigne) {
    cadre(c, x + 6, rz + 2, w - 12, 10, o.enseigne);
    if (o.nom) texteEnseigne(c, o.nom, x + w / 2, rz + 7, o.enseigne);
  }
  if (o.auvent) for (let i = 0, ax = x + 1; ax < x + w - 1; ax += 8, i++) {
    c.fillStyle = i % 2 ? '#f4f6fb' : o.auvent; c.fillRect(ax, rz + 12, Math.min(8, x + w - 1 - ax), 5);
  }
  if (o.garage) {
    const gx = x + Math.round((w - 48) / 2);
    c.fillStyle = CONTOUR; c.fillRect(gx, rz + 13, 48, 19);
    c.fillStyle = '#9aa1b5'; c.fillRect(gx + 1, rz + 14, 46, 18);
    c.fillStyle = '#80879c'; for (let gy = rz + 16; gy < yb; gy += 4) c.fillRect(gx + 1, gy, 46, 1);
  } else {
    if (o.vitrine) {
      cadre(c, x + 6, rz + 17, w - 36, 14, o.vitrine);
      c.fillStyle = '#ffffff'; c.fillRect(x + 8, rz + 19, 6, 2);
    }
    // Porte vitrée d'une case, à droite.
    const px = x + w - 24;
    cadre(c, px, rz + 14, 16, 18, '#7ab3e0');
    c.fillStyle = CONTOUR; c.fillRect(px + 7, rz + 15, 2, 17);
  }
}

function texteEnseigne(c, nom, x, y, fond) {
  c.save();
  c.font = '10px "Jersey 10", monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const clair = (parseInt(fond.slice(1, 3), 16) * 0.3 + parseInt(fond.slice(3, 5), 16) * 0.59 + parseInt(fond.slice(5, 7), 16) * 0.11) > 150;
  c.fillStyle = clair ? '#1f2a44' : '#ffffff';
  c.fillText(nom, Math.round(x), Math.round(y) + 1);
  c.restore();
}

/** Maison : toit à deux pans vu de 3/4, un étage, porte au milieu. */
export function maisonModerne(c, x, y, w, toit, facade) {
  const h = 64;
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 4, y + h - 2, w, 6);
  c.fillStyle = CONTOUR; c.fillRect(x, y, w, h);
  // Toit : deux pans (clair en haut, foncé en bas) et le faîte.
  c.fillStyle = melangerCouleur(toit, '#ffffff', 0.18); c.fillRect(x + 1, y + 1, w - 2, 15);
  c.fillStyle = toit; c.fillRect(x + 1, y + 16, w - 2, 15);
  c.fillStyle = melangerCouleur(toit, '#000000', 0.25);
  for (let tx = x + 4; tx < x + w - 2; tx += 6) { c.fillRect(tx, y + 6, 1, 6); c.fillRect(tx + 3, y + 21, 1, 6); }
  c.fillStyle = CONTOUR; c.fillRect(x + 1, y + 15, w - 2, 1);
  // Façade.
  c.fillStyle = facade; c.fillRect(x + 1, y + 32, w - 2, 31);
  c.fillStyle = melangerCouleur(facade, '#000000', 0.25); c.fillRect(x + 1, y + 32, w - 2, 2);
  const porte = x + Math.round(w / 2) - 8;
  cadre(c, porte, y + 44, 16, 20, '#8a5a3b');
  c.fillStyle = '#f2c14e'; c.fillRect(porte + 12, y + 54, 2, 2);
  for (const fx of [x + 6, x + w - 20]) {
    cadre(c, fx, y + 40, 14, 14, VITRE);
    c.fillStyle = VITRE_CLAIRE; c.fillRect(fx + 2, y + 42, 10, 3);
  }
}

/** Conteneur maritime vu de 3/4 (2 × 4 cases). */
export function conteneur(c, x, y, couleur) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 3, y + 40, 32, 5);
  c.fillStyle = CONTOUR; c.fillRect(x, y, 32, 44);
  c.fillStyle = melangerCouleur(couleur, '#ffffff', 0.15); c.fillRect(x + 1, y + 1, 30, 26);
  c.fillStyle = couleur; c.fillRect(x + 1, y + 27, 30, 16);
  c.fillStyle = melangerCouleur(couleur, '#000000', 0.25);
  for (let k = x + 4; k < x + 30; k += 4) c.fillRect(k, y + 28, 1, 14);
  c.fillStyle = CONTOUR; c.fillRect(x + 1, y + 27, 30, 1);
}

/** Lampadaire (pieds en x, y). */
export function lampadaire(c, x, y) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x - 4, y - 1, 9, 3);
  c.fillStyle = CONTOUR; c.fillRect(x - 1, y - 30, 3, 30); c.fillRect(x - 5, y - 33, 11, 5);
  c.fillStyle = '#8b9bb4'; c.fillRect(x, y - 29, 1, 28);
  c.fillStyle = '#fff2a8'; c.fillRect(x - 4, y - 29, 9, 1);
}

/** Banc public, poubelle, borne. */
export function banc(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x - 12, y - 10, 24, 10);
  c.fillStyle = '#c98a55'; c.fillRect(x - 11, y - 9, 22, 3); c.fillRect(x - 11, y - 5, 22, 3);
  c.fillStyle = CONTOUR; c.fillRect(x - 10, y - 2, 2, 3); c.fillRect(x + 8, y - 2, 2, 3);
}
export function poubelle(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x - 5, y - 13, 10, 13);
  c.fillStyle = '#3fa34d'; c.fillRect(x - 4, y - 12, 8, 11);
  c.fillStyle = '#65c46a'; c.fillRect(x - 4, y - 12, 8, 2);
}
export function borne(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x - 4, y - 12, 8, 12);
  c.fillStyle = '#e4432d'; c.fillRect(x - 3, y - 11, 6, 10);
  c.fillStyle = '#ff8a7a'; c.fillRect(x - 3, y - 11, 2, 3);
}

/** Feu tricolore sur poteau, vu de face (pieds en x, y). */
export function feuTricolore(c, x, y, etat) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x - 3, y - 1, 7, 3);
  c.fillStyle = CONTOUR; c.fillRect(x - 1, y - 24, 3, 24); c.fillRect(x - 5, y - 40, 11, 18);
  const r = etat === 'rouge', o = etat === 'orange', v = etat === 'vert';
  c.fillStyle = r ? '#ff4a3a' : '#5a2a2a'; c.fillRect(x - 3, y - 38, 7, 4);
  c.fillStyle = o ? '#ffb02e' : '#5a4a2a'; c.fillRect(x - 3, y - 33, 7, 4);
  c.fillStyle = v ? '#5af07a' : '#2a4a2a'; c.fillRect(x - 3, y - 28, 7, 4);
}

/** Petit massif de fleurs (une case). */
export function fleurs(c, x, y, graine = 0) {
  const cs = ['#e86ca6', '#f2c14e', '#ffffff', '#e4432d'];
  for (let i = 0; i < 5; i++) {
    c.fillStyle = cs[(i + graine) % 4];
    c.fillRect(x + 2 + ((i * 5 + graine) % 11), y + 3 + ((i * 7 + graine) % 9), 3, 3);
  }
}

// --- Campagne ---------------------------------------------------------------------------------

/** Grange rouge à toit à deux pans, grande porte en croix (x, y = coin haut-gauche ; w = largeur). */
export function grange(c, x, y, w) {
  const h = 80;
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 4, y + h - 2, w, 6);
  c.fillStyle = CONTOUR; c.fillRect(x, y, w, h);
  // Toit : tôle grise, deux pans et faîte.
  c.fillStyle = '#9aa1b5'; c.fillRect(x + 1, y + 1, w - 2, 17);
  c.fillStyle = '#80879c'; c.fillRect(x + 1, y + 18, w - 2, 17);
  c.fillStyle = '#6a7088';
  for (let tx = x + 4; tx < x + w - 2; tx += 5) { c.fillRect(tx, y + 3, 1, 13); c.fillRect(tx, y + 20, 1, 13); }
  c.fillStyle = CONTOUR; c.fillRect(x + 1, y + 17, w - 2, 1); c.fillRect(x + 1, y + 35, w - 2, 1);
  // Façade rouge à planches.
  c.fillStyle = '#c2504d'; c.fillRect(x + 1, y + 36, w - 2, h - 37);
  c.fillStyle = '#a63f3c'; for (let px = x + 5; px < x + w - 2; px += 6) c.fillRect(px, y + 36, 1, h - 37);
  c.fillStyle = '#f4f1e8'; c.fillRect(x + 1, y + 36, w - 2, 2);
  // Grande porte à croix blanche, au milieu.
  const pw = 32, px = x + Math.round((w - pw) / 2), py = y + h - 34;
  cadre(c, px, py, pw, 34, '#8f3a37');
  c.strokeStyle = '#f4f1e8'; c.lineWidth = 2;
  c.strokeRect(px + 2, py + 2, pw - 4, 30);
  c.beginPath(); c.moveTo(px + 3, py + 3); c.lineTo(px + pw - 3, py + 31); c.moveTo(px + pw - 3, py + 3); c.lineTo(px + 3, py + 31); c.stroke();
  // Lucarne à foin.
  cadre(c, x + w / 2 - 7, y + 40, 14, 10, '#f2c14e');
}

/** Silo cylindrique (pieds en x, y). */
export function silo(c, x, y) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x - 12, y - 2, 26, 5);
  c.fillStyle = CONTOUR; c.fillRect(x - 13, y - 70, 26, 70);
  c.fillStyle = '#c0cbdc'; c.fillRect(x - 12, y - 62, 24, 61);
  c.fillStyle = '#e6ebf2'; c.fillRect(x - 10, y - 62, 5, 61);
  c.fillStyle = '#8b9bb4'; c.fillRect(x + 6, y - 62, 5, 61);
  for (let k = y - 54; k < y; k += 10) { c.fillStyle = '#8b9bb4'; c.fillRect(x - 12, k, 24, 1); }
  // Dôme.
  c.fillStyle = CONTOUR; c.beginPath(); c.ellipse(x, y - 63, 13, 9, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#c2504d'; c.beginPath(); c.ellipse(x, y - 63, 12, 8, 0, Math.PI, 0); c.fill();
}

/** Tracteur vu de dessus, orienté selon l'angle (centre en x, y). */
export function tracteur(c, x, y, angle) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.rotate(angle);
  c.fillStyle = 'rgba(38,24,46,0.28)'; c.fillRect(-17, -11, 36, 24);
  // Grosses roues arrière, petites roues avant.
  c.fillStyle = CONTOUR; c.fillRect(-16, -13, 13, 6); c.fillRect(-16, 7, 13, 6); c.fillRect(8, -11, 8, 4); c.fillRect(8, 7, 8, 4);
  c.fillStyle = '#4b5873'; c.fillRect(-15, -12, 11, 4); c.fillRect(-15, 8, 11, 4);
  // Capot et cabine.
  c.fillStyle = CONTOUR; c.fillRect(-12, -8, 30, 16);
  c.fillStyle = '#3fa34d'; c.fillRect(-11, -7, 28, 14);
  c.fillStyle = '#2f7d3a'; c.fillRect(2, -7, 15, 2);
  c.fillStyle = CONTOUR; c.fillRect(-12, -7, 13, 14);
  c.fillStyle = '#a9d4f2'; c.fillRect(-11, -6, 11, 12);
  c.fillStyle = '#f2c14e'; c.fillRect(-10, -5, 9, 2);
  c.fillStyle = '#2a2838'; c.fillRect(14, -2, 3, 1);
  c.restore();
}

/** Mât d'éolienne (pieds en x, y), sans les pales. */
export function eolienne(c, x, y) {
  c.fillStyle = 'rgba(38,24,46,0.2)'; c.fillRect(x - 6, y - 2, 14, 4);
  c.fillStyle = CONTOUR; c.fillRect(x - 3, y - 96, 7, 96);
  c.fillStyle = '#f4f6fb'; c.fillRect(x - 2, y - 95, 5, 95);
  c.fillStyle = '#c0cbdc'; c.fillRect(x + 1, y - 95, 2, 95);
  c.fillStyle = CONTOUR; c.fillRect(x - 6, y - 102, 13, 9);
  c.fillStyle = '#e6ebf2'; c.fillRect(x - 5, y - 101, 11, 7);
}

/** Les trois pales, qui tournent (moyeu en x, y). */
export function palesEolienne(c, x, y, angle) {
  c.save();
  c.translate(x, y);
  for (let i = 0; i < 3; i++) {
    c.rotate((Math.PI * 2) / 3);
    c.save(); c.rotate(angle);
    c.fillStyle = CONTOUR; c.fillRect(-3, -42, 6, 40);
    c.fillStyle = '#f4f6fb'; c.fillRect(-2, -41, 4, 38);
    c.fillStyle = '#e4432d'; c.fillRect(-2, -41, 4, 5);
    c.restore();
  }
  c.fillStyle = CONTOUR; c.fillRect(-3, -3, 6, 6);
  c.fillStyle = '#c0cbdc'; c.fillRect(-2, -2, 4, 4);
  c.restore();
}

/** Clôture de bois horizontale ou verticale, de longueur l (x, y = début, au sol). */
export function cloture(c, x, y, l, verticale = false) {
  c.fillStyle = CONTOUR;
  if (!verticale) {
    c.fillRect(x, y - 9, l, 3); c.fillRect(x, y - 4, l, 3);
    for (let k = 0; k <= l - 3; k += 12) c.fillRect(x + k, y - 12, 4, 12);
    c.fillStyle = '#c98a55'; c.fillRect(x, y - 8, l, 1); c.fillRect(x, y - 3, l, 1);
    for (let k = 0; k <= l - 3; k += 12) c.fillRect(x + k + 1, y - 11, 2, 10);
  } else {
    c.fillRect(x - 2, y, 4, l);
    for (let k = 0; k <= l; k += 12) c.fillRect(x - 2, y + k - 9, 5, 10);
    c.fillStyle = '#c98a55'; c.fillRect(x - 1, y, 2, l);
    for (let k = 0; k <= l; k += 12) c.fillRect(x - 1, y + k - 8, 3, 8);
  }
}

/** Station-service : auvent sur piliers et deux pompes (x, y = coin haut-gauche de l'auvent). */
export function auventStation(c, x, y, w) {
  c.fillStyle = 'rgba(38,24,46,0.22)'; c.fillRect(x + 6, y + 40, w - 4, 18);
  for (const px of [x + 10, x + w - 14]) { c.fillStyle = CONTOUR; c.fillRect(px, y + 18, 5, 36); c.fillStyle = '#e6ebf2'; c.fillRect(px + 1, y + 18, 3, 35); }
  for (const px of [x + w / 2 - 22, x + w / 2 + 10]) {
    cadre(c, px, y + 34, 12, 20, '#e4432d');
    c.fillStyle = '#f4f6fb'; c.fillRect(px + 2, y + 37, 8, 5);
    c.fillStyle = CONTOUR; c.fillRect(px + 12, y + 40, 3, 2); c.fillRect(px + 14, y + 40, 1, 8);
  }
  cadre(c, x, y, w, 20, '#f4f6fb');
  c.fillStyle = '#e4432d'; c.fillRect(x + 1, y + 13, w - 2, 5);
  c.fillStyle = '#f2c14e'; c.fillRect(x + 1, y + 11, w - 2, 2);
}

/** Panneau STOP sur poteau (pieds en x, y). */
export function panneauStop(c, x, y) {
  c.fillStyle = CONTOUR; c.fillRect(x - 1, y - 18, 3, 18);
  c.fillStyle = CONTOUR; c.fillRect(x - 6, y - 30, 13, 13);
  c.fillStyle = '#e4432d'; c.fillRect(x - 5, y - 29, 11, 11);
  c.fillStyle = '#ffffff'; c.fillRect(x - 4, y - 25, 9, 2);
}

/** Parapet de pont le long d'une route (x, y, longueur, sens). */
export function parapet(c, x, y, l, verticale = false) {
  c.fillStyle = CONTOUR;
  if (!verticale) {
    c.fillRect(x, y, l, 6);
    c.fillStyle = '#c0cbdc'; c.fillRect(x, y + 1, l, 3);
    c.fillStyle = '#8b9bb4'; for (let k = 0; k < l; k += 16) c.fillRect(x + k, y + 1, 2, 4);
  } else {
    c.fillRect(x, y, 6, l);
    c.fillStyle = '#c0cbdc'; c.fillRect(x + 1, y, 3, l);
    c.fillStyle = '#8b9bb4'; for (let k = 0; k < l; k += 16) c.fillRect(x + 1, y + k, 4, 2);
  }
}

/** Église de village : nef au toit d'ardoise, clocher carré à flèche (x, y = coin haut-gauche ; 96 × 112). */
export function eglise(c, x, y) {
  c.fillStyle = 'rgba(38,24,46,0.25)'; c.fillRect(x + 4, y + 110, 96, 6);
  // Nef.
  c.fillStyle = CONTOUR; c.fillRect(x, y + 40, 64, 72);
  c.fillStyle = '#5c6278'; c.fillRect(x + 1, y + 41, 62, 16);
  c.fillStyle = '#6a7088'; c.fillRect(x + 1, y + 57, 62, 16);
  c.fillStyle = CONTOUR; c.fillRect(x + 1, y + 56, 62, 1); c.fillRect(x + 1, y + 72, 62, 1);
  c.fillStyle = '#e9e2cf'; c.fillRect(x + 1, y + 73, 62, 38);
  c.fillStyle = '#d6cdb4'; c.fillRect(x + 1, y + 73, 62, 2);
  for (const fx of [x + 8, x + 44]) { cadre(c, fx, y + 80, 10, 16, '#7ab3e0'); c.fillStyle = '#e4432d'; c.fillRect(fx + 2, y + 82, 6, 3); }
  cadre(c, x + 24, y + 88, 16, 24, '#8a5a3b');
  c.fillStyle = CONTOUR; c.fillRect(x + 31, y + 89, 2, 23);
  // Clocher.
  c.fillStyle = CONTOUR; c.fillRect(x + 64, y + 20, 32, 92);
  c.fillStyle = '#e9e2cf'; c.fillRect(x + 65, y + 36, 30, 75);
  c.fillStyle = '#d6cdb4'; c.fillRect(x + 89, y + 36, 6, 75);
  cadre(c, x + 74, y + 48, 12, 14, '#2a2838');
  c.fillStyle = '#f2c14e'; c.fillRect(x + 78, y + 52, 4, 6);
  cadre(c, x + 74, y + 72, 12, 12, '#f4f6fb');
  c.fillStyle = CONTOUR; c.fillRect(x + 79, y + 74, 1, 5); c.fillRect(x + 79, y + 78, 4, 1);
  // Flèche et croix.
  c.fillStyle = CONTOUR;
  for (let k = 0; k < 16; k++) c.fillRect(x + 64 + k, y + 36 - k * 2 - 2, 32 - k * 2, 2);
  c.fillStyle = '#5c6278';
  for (let k = 0; k < 15; k++) c.fillRect(x + 65 + k, y + 36 - k * 2 - 1, 30 - k * 2, 1);
  c.fillStyle = CONTOUR; c.fillRect(x + 79, y - 6, 2, 10); c.fillRect(x + 76, y - 3, 8, 2);
}
