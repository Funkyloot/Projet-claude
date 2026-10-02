/* tiny.js — le style Kenney « Tiny » (tuiles de 16 px, contour sombre, vue 3/4).
 *
 * Échelle commune au garage, à la ville et aux courses : 1 case de 16 px ≈ 1 m.
 *   - une personne tient dans 1 case ;
 *   - une voiture fait 2 cases de large et 3 de long (28 × 46 px) ;
 * Les packs Kenney n'ont ni voitures ni personnages modernes : on les dessine
 * ici, avec la même palette et le même contour, et on les met en cache.
 */

import { melangerCouleur } from './outils.js';
import { ATLAS_COURSE } from './atlas-course.js';

export const CASE_TINY = 16;
export const CONTOUR = '#26182e';
const COLONNES = { factory: 12, town: 12, battle: 18, ski: 12, farm: 12, city: 37 };

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

/*
 * Personnages : ceux du pack Kenney RPG Urban (CC0), 16 × 16, six personnes
 * en 4 directions (gauche, face, dos, droite) et 3 images (repos, pas 1, pas 2).
 * Pour varier les tenues, on change seulement la couleur du haut (ou du bleu
 * de travail), en gardant le dessin et l'ombrage de Kenney.
 */
let planches = { urbain: null, tiny: {} };
/** À appeler une fois les images chargées (main.js). */
export function definirPlanches(urbain, tiny) { planches = { urbain, tiny: tiny || {} }; cachePersos.clear(); }

const COLONNES_URBAIN = 27;
export const PERSONNES = { vert: 23, rouge: 104, lunettes: 185, ouvrier: 266, chauve: 347, bandeau: 428 };
const DIRECTIONS = { gauche: 0, face: 1, dos: 2, droite: 3 };
/** Couleur du haut de chaque personnage Kenney (teinte, ombre), celle qu'on peut changer. */
const VETEMENT = {
  23: ['#42a379', '#369069'], 104: ['#c2504d', '#a54240'], 185: ['#42a379', '#369069'],
  266: ['#918eb9', '#7a77a4'], 347: ['#aaa8bd', '#898ca6'], 428: ['#aaa8bd', '#898ca6'],
};
const HAUTS = ['#c2504d', '#2f6fdb', '#3fa34d', '#f2c14e', '#8a6ad6', '#e86ca6', '#f39c33', '#4fc3d8', '#f4f6fb'];
const CIVILS = [23, 104, 185, 347, 428];

/**
 * La tenue d'un personnage : { base (personnage Kenney), haut (couleur ou null = celle de Kenney) }.
 * Mécanicien : l'ouvrier au casque de chantier ; ingénieur : blouse blanche ;
 * commercial : chemise de couleur.
 */
export function tenue(apparence = 0, metier = null) {
  const a = Math.abs(apparence | 0);
  const t = { base: CIVILS[a % CIVILS.length], haut: a % 3 === 0 ? null : HAUTS[(a * 5 + 2) % HAUTS.length] };
  if (metier === 'mecano') { t.base = PERSONNES.ouvrier; t.haut = a % 2 ? null : '#2f6fdb'; }
  if (metier === 'ingenieur') { t.base = a % 2 ? PERSONNES.chauve : PERSONNES.lunettes; t.haut = '#f4f6fb'; }
  if (metier === 'commercial') { t.base = PERSONNES.rouge; t.haut = ['#c2504d', '#3fa34d', '#8a6ad6'][a % 3]; }
  return t;
}

const cachePersos = new Map();

/**
 * Sprite 16 × 16 d'un personnage. dir : 'face' | 'dos' | 'gauche' | 'droite' ;
 * pas : 0 (immobile), 1 ou 2 (en marchant). t.tuile = [pack, n] : une tuile
 * Kenney Tiny (par exemple le fermier de Tiny Farm) à la place.
 */
export function spritePerso(t, dir = 'face', pas = 0) {
  const cle = t.tuile ? `t${t.tuile.join()}` : `${t.base}${t.haut}${dir}${pas}`;
  if (cachePersos.has(cle)) return cachePersos.get(cle);
  const { c, ctx } = toile(16, 16);
  if (t.tuile) {
    tuileTiny(ctx, planches.tiny, t.tuile[0], t.tuile[1], 0, 0);
  } else if (planches.urbain) {
    const base = t.base ?? CIVILS[0];
    const n = base + (DIRECTIONS[dir] ?? 1) + (pas % 3) * COLONNES_URBAIN;
    ctx.drawImage(planches.urbain, (n % COLONNES_URBAIN) * 16, Math.floor(n / COLONNES_URBAIN) * 16, 16, 16, 0, 0, 16, 16);
    if (t.haut && VETEMENT[base]) recolorer(ctx, VETEMENT[base], [t.haut, melangerCouleur(t.haut, '#000000', 0.18)]);
  }
  if (planches.urbain || t.tuile) cachePersos.set(cle, c);
  return c;
}

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Remplace des couleurs exactes du sprite (de → vers), pixel par pixel. */
function recolorer(ctx, de, vers) {
  const img = ctx.getImageData(0, 0, 16, 16);
  const d = img.data, src = de.map(rgb), dst = vers.map(rgb);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    for (let k = 0; k < src.length; k++) {
      if (d[i] === src[k][0] && d[i + 1] === src[k][1] && d[i + 2] === src[k][2]) { [d[i], d[i + 1], d[i + 2]] = dst[k]; break; }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Dessine un personnage, pieds en (x, y), avec son ombre. */
export function dessinerPerso(ctx, t, x, y, dir = 'face', pas = 0) {
  ctx.fillStyle = 'rgba(20,16,34,0.28)';
  ctx.fillRect(Math.round(x) - 5, Math.round(y) - 1, 10, 2);
  ctx.drawImage(spritePerso(t, dir, pas), Math.round(x) - 8, Math.round(y) - 15);
}

// --- Voitures (Kenney Racing Pack) --------------------------------------------------------

export const VOITURE_LARGEUR = 28;
export const VOITURE_LONGUEUR = 46;
const cacheVoitures = new Map();

/** Modèle Kenney (Racing Pack) de chaque voiture, d'après son image de profil. */
const MODELES = {
  rounded_yellow: 'voiture2', sedan_blue: 'voiture1', sedan_vintage: 'voiture1', convertible: 'voiture2',
  sports_green: 'voiture3', sports_red: 'voiture3', sports_yellow: 'voiture5', sports_convertible: 'voiture5',
  sports_race: 'voiture5', suv: 'voiture4', buggy: 'voiture4', formula: 'petite3', kart: 'petite2',
};
export function modeleVoiture(profil, id = '') {
  if (MODELES[profil]) return MODELES[profil];
  let h = 7;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `voiture${1 + (h % 5)}`;
}

const enHsv = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
};
const enRgb = (h, s, v) => {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

/**
 * Repeint la carrosserie (rouge-orangé chez Kenney) dans la couleur voulue en
 * gardant les ombres et les reflets du dessin d'origine.
 */
function repeindre(ctx, w, h, couleur, teinte = [340, 40]) {
  const [th, ts, tv] = enHsv(...[1, 3, 5].map((i) => parseInt(couleur.slice(i, i + 2), 16)));
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const dans = (hh) => (teinte[0] > teinte[1] ? hh >= teinte[0] || hh <= teinte[1] : hh >= teinte[0] && hh <= teinte[1]);
  // Référence : la couleur la plus fréquente de la carrosserie d'origine.
  const compte = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [hh, ss] = enHsv(d[i], d[i + 1], d[i + 2]);
    if (ss < 0.25 || !dans(hh)) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    compte.set(k, (compte.get(k) || 0) + 1);
  }
  let ref = null, max = 0;
  for (const [k, n] of compte) if (n > max) { max = n; ref = k; }
  if (ref === null) return;
  const [, REF_S, REF_V] = enHsv(ref >> 16, (ref >> 8) & 255, ref & 255);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [hh, ss, vv] = enHsv(d[i], d[i + 1], d[i + 2]);
    if (ss < 0.25 || !dans(hh)) continue;   // vitres, phares, pneus : on n'y touche pas
    const s2 = Math.min(1, ts * (ss / REF_S)), v2 = Math.min(1, Math.max(0.08, tv * (vv / REF_V)));
    [d[i], d[i + 1], d[i + 2]] = enRgb(th, s2, v2);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Voiture vue de dessus (Kenney Racing Pack), dans la couleur voulue.
 * modele : 'voiture1' à 'voiture5', 'petite1' à 'petite5' (karts, formules).
 * bande et looks : gardés pour compatibilité (le dessin Kenney ne change pas).
 */
export function spriteVoitureTiny(couleur, bande = null, looks = [], modele = 'voiture1') {
  const cle = `${couleur}|${modele}`;
  if (cacheVoitures.has(cle)) return cacheVoitures.get(cle);
  const r = ATLAS_COURSE[modele] || ATLAS_COURSE.voiture1;
  const [sx, sy, w, h] = r;
  const d = toile(w, h);
  if (planches.tiny.course) {
    d.ctx.drawImage(planches.tiny.course, sx, sy, w, h, 0, 0, w, h);
    if (couleur) repeindre(d.ctx, w, h, couleur);
  }
  const o = toile(w, h);
  o.ctx.drawImage(d.c, 0, 0);
  o.ctx.globalCompositeOperation = 'source-in';
  o.ctx.fillStyle = 'rgba(20,16,34,0.32)';
  o.ctx.fillRect(0, 0, w, h);
  const sprite = { dessus: d.c, ombre: o.c, cx: w / 2, cy: h / 2 };
  if (planches.tiny.course) cacheVoitures.set(cle, sprite);
  return sprite;
}

/**
 * Dessine une voiture centrée en (x, y), tournée de `angle` (0 = vers la
 * droite ; le dessin Kenney regarde vers le haut). Ombre portée au sol ;
 * `echelle` < 1 pour une vignette.
 */
export function dessinerVoitureTiny(ctx, sprite, x, y, angle, echelle = 1, ombre = true) {
  const { dessus, cx, cy } = sprite;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (ombre) {
    ctx.save();
    ctx.translate(3 * echelle, 4 * echelle);
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale(echelle, echelle);
    ctx.drawImage(sprite.ombre, -cx, -cy);
    ctx.restore();
  }
  ctx.rotate(angle + Math.PI / 2);
  ctx.scale(echelle, echelle);
  ctx.drawImage(dessus, -cx, -cy);
  ctx.restore();
}

/** Vignette d'une voiture (vue de dessus, avant en haut) pour les menus, en data URL. */
const cacheVignettes = new Map();
export function vignetteVoitureTiny(couleur, bande, looks = [], modele = 'voiture1') {
  const cle = `${couleur}|${modele}`;
  if (cacheVignettes.has(cle)) return cacheVignettes.get(cle);
  const { c, ctx } = toile(44, 60);
  dessinerVoitureTiny(ctx, spriteVoitureTiny(couleur, bande, looks, modele), 22, 28, -Math.PI / 2);
  const url = c.toDataURL();
  cacheVignettes.set(cle, url);
  return url;
}

// --- Voitures de la ville (Kenney Roguelike Modern City) -----------------------------------
//
// En ville (vue de 3/4), une voiture se voit de côté quand elle va vers l'est
// ou l'ouest, et de face ou de dos vers le sud ou le nord : quatre dessins
// Kenney, à l'échelle des tuiles. La carrosserie verte d'origine est repeinte.

const VUES_VILLE = { gauche: [496, 256, 48, 32], droite: [544, 256, 48, 32], dos: [496, 288, 32, 32], face: [528, 288, 32, 32] };
const cacheVille = new Map();

export function spriteVoitureVille(couleur, vue) {
  const cle = `${couleur}|${vue}`;
  if (cacheVille.has(cle)) return cacheVille.get(cle);
  const [sx, sy, w, h] = VUES_VILLE[vue] || VUES_VILLE.droite;
  const d = toile(w, h);
  if (planches.tiny.city) {
    d.ctx.drawImage(planches.tiny.city, sx, sy, w, h, 0, 0, w, h);
    if (couleur) repeindre(d.ctx, w, h, couleur, [100, 180]);
    cacheVille.set(cle, d.c);
  }
  return d.c;
}

/** Vue d'après l'angle (0 = est) : la plus proche des quatre. */
export function vueDepuisAngle(angle) {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.round(a / (Math.PI / 2)) % 4;
  return ['droite', 'face', 'gauche', 'dos'][q];
}

/** Dessine une voiture de ville centrée en (x, y), avec son ombre au sol. */
export function dessinerVoitureVille(ctx, couleur, x, y, angle) {
  const vue = vueDepuisAngle(angle);
  const img = spriteVoitureVille(couleur, vue);
  const cote = vue === 'gauche' || vue === 'droite';
  ctx.fillStyle = 'rgba(20,16,34,0.25)';
  if (cote) ctx.fillRect(Math.round(x) - 17, Math.round(y) + 6, 34, 5);
  else ctx.fillRect(Math.round(x) - 10, Math.round(y) + 10, 20, 5);
  ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2 - (cote ? 2 : 0)));
}

// --- Tuiles et images Kenney, sans avoir à passer les planches ------------------------------

/** Une tuile de la planche Roguelike Modern City (37 colonnes). */
export function tuileVille(ctx, n, x, y) { tuileTiny(ctx, planches.tiny, 'city', n, x, y); }

/** Une pile de tuiles Modern City, de haut en bas, posée au pied (x = centre, y = sol). */
export function pileVille(ctx, tuiles, x, y) {
  tuiles.forEach((n, i) => tuileVille(ctx, n, x - 8, y - 16 * (tuiles.length - i)));
}

/** Une image de l'atlas de course (Racing Pack, panneaux), centrée en (x, y), tournée de `angle`. */
export function imageAtlas(ctx, nom, x, y, angle = 0, echelle = 1) {
  const r = ATLAS_COURSE[nom];
  if (!r || !planches.tiny.course) return;
  const [sx, sy, w, h] = r;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (angle) ctx.rotate(angle);
  if (echelle !== 1) ctx.scale(echelle, echelle);
  ctx.drawImage(planches.tiny.course, sx, sy, w, h, -Math.round(w / 2), -Math.round(h / 2), w, h);
  ctx.restore();
}
export const tailleAtlas = (nom) => ATLAS_COURSE[nom]?.slice(2) || [0, 0];

/** Une tuile de n'importe quelle planche Kenney chargée (town, farm, factory…). */
export function tuileKenney(ctx, pack, n, x, y) { tuileTiny(ctx, planches.tiny, pack, n, x, y); }

/** Motif (pour remplir une forme) fait d'une tuile Kenney ; l'eau : tuile 214 de Modern City. */
const cacheTuiles = new Map();
export function motifTuile(ctx, pack, n) {
  const cle = `${pack}${n}`;
  let t = cacheTuiles.get(cle);
  if (!t) {
    t = toile(16, 16);
    tuileTiny(t.ctx, planches.tiny, pack, n, 0, 0);
    if (planches.tiny[pack]) cacheTuiles.set(cle, t);
  }
  return ctx.createPattern(t.c, 'repeat');
}
export const motifEau = (ctx) => motifTuile(ctx, 'city', 214);
