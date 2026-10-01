/* tiny.js — le style Kenney « Tiny » (tuiles de 16 px, contour sombre, vue 3/4).
 *
 * Échelle commune au garage, à la ville et aux courses : 1 case de 16 px ≈ 1 m.
 *   - une personne tient dans 1 case ;
 *   - une voiture fait 2 cases de large et 3 de long (28 × 46 px) ;
 * Les packs Kenney n'ont ni voitures ni personnages modernes : on les dessine
 * ici, avec la même palette et le même contour, et on les met en cache.
 */

import { melangerCouleur } from './outils.js';

export const CASE_TINY = 16;
export const CONTOUR = '#26182e';
const COLONNES = { factory: 12, town: 12, battle: 18, ski: 12, farm: 12 };

/** Pose la tuile n d'une planche Tiny (planches = { factory, town, … }). */
export function tuileTiny(ctx, planches, pack, n, x, y) {
  const img = planches[pack];
  if (!img) return;
  const c = COLONNES[pack];
  ctx.drawImage(img, (n % c) * 16, Math.floor(n / c) * 16, 16, 16, Math.round(x), Math.round(y), 16, 16);
}

function toile(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

// --- Personnages modernes ----------------------------------------------------------------

/** Tenues : peau, cheveux, haut, bas, et un détail (casque, blouse, casquette). */
const PEAUX = ['#f2c9a0', '#e0ac7e', '#b97a52', '#8a5636', '#f6d8bd', '#c8916a'];
const CHEVEUX = ['#2a1e1e', '#f0c85a', '#6b3e1f', '#c2504d', '#3a3550', '#e8e4d6'];
const HAUTS = ['#c2504d', '#2f6fdb', '#3fa34d', '#f2c14e', '#8a6ad6', '#e86ca6', '#f39c33', '#4f7ddb'];
const BAS = ['#3a4a6b', '#2a2838', '#5c6278', '#6b4a32'];

export function tenue(apparence = 0, metier = null) {
  const a = Math.abs(apparence | 0);
  const t = { peau: PEAUX[a % PEAUX.length], cheveux: CHEVEUX[(a * 3 + 1) % CHEVEUX.length], haut: HAUTS[(a * 5 + 2) % HAUTS.length], bas: BAS[(a * 7) % BAS.length], casque: null, blouse: false };
  if (metier === 'mecano') { t.casque = '#f2c14e'; t.haut = '#2f6fdb'; }
  if (metier === 'ingenieur') { t.blouse = true; }
  if (metier === 'commercial') { t.haut = ['#c2504d', '#3fa34d', '#8a6ad6'][a % 3]; }
  return t;
}

const cachePersos = new Map();

/**
 * Sprite 16 × 16 d'un personnage. dir : 'face' | 'dos' | 'gauche' | 'droite' ;
 * pas : 0 (immobile), 1 ou 2 (jambes alternées).
 */
export function spritePerso(t, dir = 'face', pas = 0) {
  const cle = `${t.peau}${t.cheveux}${t.haut}${t.bas}${t.casque}${t.blouse}${dir}${pas}`;
  if (cachePersos.has(cle)) return cachePersos.get(cle);
  const { c, ctx } = toile(16, 16);
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const haut = t.blouse ? '#f4f1e8' : t.haut;
  const profil = dir === 'gauche' || dir === 'droite';
  // Jambes (deux colonnes qui alternent en marchant).
  const j1 = pas === 1 ? 1 : 0, j2 = pas === 2 ? 1 : 0;
  px(5, 12, 6, 4 - Math.max(j1, j2), CONTOUR);
  px(5, 12, 2, 4 - j1, CONTOUR); px(9, 12, 2, 4 - j2, CONTOUR);
  px(6, 12, 1, 3 - j1, t.bas); px(9, 12, 1, 3 - j2, t.bas);
  // Corps.
  px(4, 8, 8, 5, CONTOUR);
  px(5, 9, 6, 3, haut);
  if (t.blouse) px(7, 9, 2, 3, t.haut);       // cravate ou tee-shirt sous la blouse
  if (!profil) { px(3, 9, 1, 3, CONTOUR); px(12, 9, 1, 3, CONTOUR); px(3, 11, 1, 1, t.peau); px(12, 11, 1, 1, t.peau); }
  else { const bx = dir === 'gauche' ? 7 : 8; px(bx, 9, 1, 3, melangerCouleur(haut, '#000000', 0.25)); }
  // Tête (grosse, façon Tiny).
  px(3, 1, 10, 8, CONTOUR);
  px(4, 2, 8, 6, t.peau);
  const coiffe = t.casque || t.cheveux;
  if (dir === 'dos') px(4, 2, 8, 6, coiffe);
  else if (profil) {
    px(4, 2, 8, 3, coiffe);
    if (dir === 'gauche') px(9, 2, 3, 5, coiffe); else px(4, 2, 3, 5, coiffe);
    px(dir === 'gauche' ? 5 : 10, 5, 1, 1, CONTOUR);
  } else {
    px(4, 2, 8, 2, coiffe); px(4, 4, 1, 2, coiffe); px(11, 4, 1, 2, coiffe);
    px(6, 5, 1, 1, CONTOUR); px(9, 5, 1, 1, CONTOUR);
  }
  if (t.casque) { px(3, 4, 10, 1, CONTOUR); px(5, 2, 3, 1, melangerCouleur(t.casque, '#ffffff', 0.5)); }
  cachePersos.set(cle, c);
  return c;
}

/** Dessine un personnage, pieds en (x, y), avec son ombre. */
export function dessinerPerso(ctx, t, x, y, dir = 'face', pas = 0) {
  ctx.fillStyle = 'rgba(20,16,34,0.28)';
  ctx.fillRect(Math.round(x) - 5, Math.round(y) - 1, 10, 2);
  ctx.drawImage(spritePerso(t, dir, pas), Math.round(x) - 8, Math.round(y) - 15);
}

// --- Voitures à l'échelle ----------------------------------------------------------------

export const VOITURE_LARGEUR = 28;
export const VOITURE_LONGUEUR = 46;
const cacheVoitures = new Map();

/**
 * Voiture vue de dessus, avant vers la DROITE (angle 0), 46 × 28 px, en deux
 * couches : `flanc` (silhouette sombre et roues, posée un peu plus bas pour
 * donner l'épaisseur de la carrosserie en vue 3/4) et `dessus`.
 * looks : apparences données par les pièces (aileron, prise, larges, nitro…).
 */
export function spriteVoitureTiny(couleur, bande = null, looks = []) {
  const cle = `${couleur}|${bande}|${looks.join(',')}`;
  if (cacheVoitures.has(cle)) return cacheVoitures.get(cle);
  const L = VOITURE_LONGUEUR + 8, l = VOITURE_LARGEUR + 6;     // marge pour aileron et pneus larges
  const ox = 4, oy = 3;
  const a = new Set(looks);
  const fonce = melangerCouleur(couleur, '#000000', 0.38);
  const clair = melangerCouleur(couleur, '#ffffff', 0.32);
  const vitre = '#5f91c8', vitreClaire = '#a9d4f2';

  // Flanc : silhouette sombre + roues.
  const f = toile(L, l);
  const fx = f.ctx;
  const larges = a.has('larges') ? 2 : 0;
  fx.fillStyle = CONTOUR;
  for (const rx of [ox + 6, ox + VOITURE_LONGUEUR - 15]) {
    fx.fillRect(rx, oy - 2 - larges, 10, 4 + larges);
    fx.fillRect(rx, oy + VOITURE_LARGEUR - 2, 10, 4 + larges);
  }
  rond(fx, ox, oy, VOITURE_LONGUEUR, VOITURE_LARGEUR, 7, CONTOUR);
  rond(fx, ox + 1, oy + 1, VOITURE_LONGUEUR - 2, VOITURE_LARGEUR - 2, 6, fonce);

  // Dessus : carrosserie, capot, pare-brise, toit, lunette, phares.
  const d = toile(L, l);
  const dx = d.ctx;
  rond(dx, ox, oy, VOITURE_LONGUEUR, VOITURE_LARGEUR, 7, CONTOUR);
  rond(dx, ox + 1, oy + 1, VOITURE_LONGUEUR - 2, VOITURE_LARGEUR - 2, 6, couleur);
  dx.fillStyle = clair; dx.fillRect(ox + 4, oy + 2, VOITURE_LONGUEUR - 10, 2);           // reflet
  dx.fillStyle = fonce; dx.fillRect(ox + 4, oy + VOITURE_LARGEUR - 4, VOITURE_LONGUEUR - 10, 2);
  // Habitacle : pare-brise (vers l'avant, à droite), toit, lunette arrière.
  rond(dx, ox + 12, oy + 4, 22, VOITURE_LARGEUR - 8, 4, CONTOUR);
  dx.fillStyle = vitre; dx.fillRect(ox + 27, oy + 5, 6, VOITURE_LARGEUR - 10);
  dx.fillStyle = vitreClaire; dx.fillRect(ox + 28, oy + 6, 2, VOITURE_LARGEUR - 14);
  dx.fillStyle = vitre; dx.fillRect(ox + 13, oy + 5, 4, VOITURE_LARGEUR - 10);
  dx.fillStyle = a.has('carbone') ? '#2c2c38' : clair;
  dx.fillRect(ox + 17, oy + 5, 10, VOITURE_LARGEUR - 10);
  if (a.has('carbone')) { dx.fillStyle = '#3c3c4a'; for (let i = 0; i < 10; i += 2) dx.fillRect(ox + 17 + i, oy + 5, 1, VOITURE_LARGEUR - 10); }
  // Bande de course.
  if (bande) { dx.fillStyle = bande; dx.fillRect(ox + 1, oy + VOITURE_LARGEUR / 2 - 2, VOITURE_LONGUEUR - 2, 4); }
  // Phares (avant, à droite) et feux (arrière).
  dx.fillStyle = '#fff4b8'; dx.fillRect(ox + VOITURE_LONGUEUR - 3, oy + 3, 2, 5); dx.fillRect(ox + VOITURE_LONGUEUR - 3, oy + VOITURE_LARGEUR - 8, 2, 5);
  dx.fillStyle = '#e4432d'; dx.fillRect(ox + 1, oy + 3, 2, 4); dx.fillRect(ox + 1, oy + VOITURE_LARGEUR - 7, 2, 4);
  // Rétroviseurs.
  dx.fillStyle = CONTOUR; dx.fillRect(ox + 28, oy - 2, 3, 3); dx.fillRect(ox + 28, oy + VOITURE_LARGEUR - 1, 3, 3);
  // Pièces visibles.
  if (a.has('prise') || a.has('turbine')) {
    dx.fillStyle = CONTOUR; dx.fillRect(ox + 36, oy + 9, 6, VOITURE_LARGEUR - 18);
    dx.fillStyle = a.has('turbine') ? '#f39c33' : '#5c6278'; dx.fillRect(ox + 37, oy + 10, 4, VOITURE_LARGEUR - 20);
  }
  if (a.has('arceau')) { dx.fillStyle = CONTOUR; dx.fillRect(ox + 16, oy + 4, 2, VOITURE_LARGEUR - 8); }
  if (a.has('nitro1') || a.has('nitro2')) {
    const ys = a.has('nitro2') ? [oy + 6, oy + VOITURE_LARGEUR - 10] : [oy + VOITURE_LARGEUR / 2 - 2];
    for (const y of ys) { dx.fillStyle = CONTOUR; dx.fillRect(ox + 5, y - 1, 7, 6); dx.fillStyle = '#2a7fd6'; dx.fillRect(ox + 6, y, 5, 4); dx.fillStyle = '#7fd0ff'; dx.fillRect(ox + 6, y, 5, 1); }
  }
  if (a.has('becquet')) { dx.fillStyle = CONTOUR; dx.fillRect(ox + 2, oy + 2, 2, VOITURE_LARGEUR - 4); }
  if (a.has('aileron') || a.has('aileronGT')) {
    const gt = a.has('aileronGT');
    dx.fillStyle = CONTOUR; dx.fillRect(ox - 3, oy - 1, 5, VOITURE_LARGEUR + 2);
    dx.fillStyle = gt ? (bande || '#f4f1e8') : fonce; dx.fillRect(ox - 2, oy, 3, VOITURE_LARGEUR);
    dx.fillStyle = CONTOUR; dx.fillRect(ox + 2, oy + 6, 3, 2); dx.fillRect(ox + 2, oy + VOITURE_LARGEUR - 8, 3, 2);
  }
  // Ombre : la silhouette du flanc, noircie (sans ctx.filter, absent de certains Safari).
  const o = toile(L, l);
  o.ctx.drawImage(f.c, 0, 0);
  o.ctx.globalCompositeOperation = 'source-in';
  o.ctx.fillStyle = 'rgba(20,16,34,0.32)';
  o.ctx.fillRect(0, 0, L, l);
  const sprite = { flanc: f.c, dessus: d.c, ombre: o.c, cx: ox + VOITURE_LONGUEUR / 2, cy: oy + VOITURE_LARGEUR / 2 };
  cacheVoitures.set(cle, sprite);
  return sprite;
}

function rond(ctx, x, y, w, h, r, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x + r, y, w - 2 * r, h);
  ctx.fillRect(x, y + r, w, h - 2 * r);
  for (let i = 0; i < r; i++) {
    const k = Math.round(r - Math.sqrt(r * r - (r - i - 0.5) ** 2));
    ctx.fillRect(x + k, y + i, w - 2 * k, 1);
    ctx.fillRect(x + k, y + h - 1 - i, w - 2 * k, 1);
  }
}

/**
 * Dessine une voiture centrée en (x, y), tournée de `angle` (0 = vers la droite).
 * Vue 3/4 : ombre au sol, flanc 3 px plus bas, puis le dessus. `echelle` < 1
 * pour une vignette.
 */
export function dessinerVoitureTiny(ctx, sprite, x, y, angle, echelle = 1, ombre = true) {
  const { flanc, dessus, cx, cy } = sprite;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (ombre) {
    ctx.save();
    ctx.translate(3 * echelle, 5 * echelle);
    ctx.rotate(angle);
    ctx.scale(echelle, echelle);
    ctx.drawImage(sprite.ombre, -cx, -cy);
    ctx.restore();
  }
  for (let k = 3; k >= 1; k--) {
    ctx.save();
    ctx.translate(0, k * echelle);
    ctx.rotate(angle);
    ctx.scale(echelle, echelle);
    ctx.drawImage(flanc, -cx, -cy);
    ctx.restore();
  }
  ctx.rotate(angle);
  ctx.scale(echelle, echelle);
  ctx.drawImage(dessus, -cx, -cy);
  ctx.restore();
}

/** Vignette d'une voiture (vue de 3/4, avant en bas) pour les menus, en data URL. */
const cacheVignettes = new Map();
export function vignetteVoitureTiny(couleur, bande, looks = []) {
  const cle = `${couleur}|${bande}|${looks.join(',')}`;
  if (cacheVignettes.has(cle)) return cacheVignettes.get(cle);
  const { c, ctx } = toile(44, 60);
  dessinerVoitureTiny(ctx, spriteVoitureTiny(couleur, bande, looks), 22, 28, Math.PI / 2);
  const url = c.toDataURL();
  cacheVignettes.set(cle, url);
  return url;
}
