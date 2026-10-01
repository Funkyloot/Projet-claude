/* outils.js — petits utilitaires partagés : hasard reproductible, maths. */

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite. */
export function creerAlea(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const entre = (alea, a, b) => a + (b - a) * alea();
export const choisir = (alea, liste) => liste[Math.floor(alea() * liste.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Ramène un angle dans ]-π, π]. */
export function angleNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Hachage entier simple de deux coordonnées (bruit de texture stable). */
export function hash2(x, y, graine = 0) {
  let h = (x * 374761393 + y * 668265263 + graine * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function melangerCouleur(hex, autre, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(autre.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const formatArgent = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' G';

export function formatTemps(s) {
  if (!isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

export const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
