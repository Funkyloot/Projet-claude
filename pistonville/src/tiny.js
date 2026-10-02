/* tiny.js — le style Kenney « Tiny » (tuiles de 16 px, contour sombre, vue 3/4).
 *
 * Échelle commune au garage, à la ville et aux courses : 1 case de 16 px ≈ 1 m.
 *   - une personne tient dans 1 case ;
 *   - une voiture fait 2 cases de large et 3 de long (28 × 46 px) ;
 * Tout vient des packs Kenney (CC0) : personnages RPG Urban, véhicules du Car
 * Kit (rendus en 3D), tuiles Tiny et Roguelike Modern City.
 */

import { melangerCouleur } from './outils.js';
import { ATLAS_COURSE } from './atlas-course.js';
import { ATLAS_VOITURES, VUES } from './atlas-voitures.js';

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

/** Une petite toile hors écran ; `lecture` si on y relit les pixels (repeinture) : elle reste en mémoire vive. */
function toile(w, h, lecture = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', lecture ? { willReadFrequently: true } : undefined);
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

// --- Véhicules (Kenney Car Kit, rendus en 3D sous 32 angles) ------------------------------
//
// Les modèles 3D du Car Kit sont pré-rendus en vue de 3/4 (caméra au sud,
// inclinée à 50°) sous 32 angles : on choisit l'image la plus proche du cap
// de la voiture, sans la faire tourner. La même planche sert en course, en
// ville et dans les menus. La carrosserie (masque blanc à part) se repeint à
// la couleur de l'écurie en gardant l'ombrage du rendu.


/** Voitures de course, d'après l'image de profil du véhicule. */
const MODELES = {
  rounded_yellow: 'hatchback-sports', sedan_blue: 'sedan', sedan_vintage: 'sedan', convertible: 'sedan-sports',
  sports_green: 'sedan-sports', sports_red: 'sedan-sports', sports_yellow: 'hatchback-sports',
  sports_convertible: 'race-future', sports_race: 'race-future', suv: 'suv', buggy: 'suv-luxury',
  formula: 'race', kart: 'kart-oodi',
};
const COURSE = ['race', 'race-future', 'sedan-sports', 'hatchback-sports'];
export function modeleVoiture(profil, id = '') {
  if (MODELES[profil]) return MODELES[profil];
  let h = 7;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE[h % COURSE.length];
}

/** Ces modèles gardent leurs couleurs d'origine (taxi, secours, engins). */
const LIVREES = new Set(['taxi', 'police', 'ambulance', 'firetruck', 'garbage-truck', 'delivery', 'tractor']);

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
 * Masque de carrosserie d'un modèle (toute sa ligne de 32 vues) et sa couleur
 * de référence : la teinte la plus fréquente de la carrosserie d'origine. Ses
 * ombres et reflets sont reportés sur la nouvelle couleur.
 */
const cacheMasques = new Map();
function masqueModele(m) {
  if (cacheMasques.has(m)) return cacheMasques.get(m);
  const [y, w, h] = ATLAS_VOITURES[m];
  const lw = w * VUES;
  const t = toile(lw, h, true);
  t.ctx.drawImage(planches.tiny.voituresMasque, 0, y, lw, h, 0, 0, lw, h);
  const masque = t.ctx.getImageData(0, 0, lw, h).data;
  t.ctx.clearRect(0, 0, lw, h);
  t.ctx.drawImage(planches.tiny.voitures, 0, y, lw, h, 0, 0, lw, h);
  const d = t.ctx.getImageData(0, 0, lw, h).data;
  const compte = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3] || masque[i] < 128) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    compte.set(k, (compte.get(k) || 0) + 1);
  }
  let ref = null, max = 0;
  for (const [k, n] of compte) if (n > max) { max = n; ref = k; }
  const [, rs, rv] = ref === null ? [0, 0, 1] : enHsv(ref >> 16, (ref >> 8) & 255, ref & 255);
  const mm = { masque, lw, rs, rv, vide: ref === null };
  cacheMasques.set(m, mm);
  return mm;
}

/** Repeint la vue i d'une ligne (à la première fois qu'on la dessine : pas d'à-coup). */
function repeindreVue(l, i) {
  l.peintes[i] = 1;
  const mm = masqueModele(l.m);
  if (mm.vide) return;
  const [th, ts, tv] = enHsv(...[1, 3, 5].map((k) => parseInt(l.couleur.slice(k, k + 2), 16)));
  const ctx = l.c.getContext('2d');
  const img = ctx.getImageData(i * l.w, 0, l.w, l.h);
  const d = img.data;
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    const p = (y * l.w + x) * 4;
    if (!d[p + 3] || mm.masque[(y * mm.lw + i * l.w + x) * 4] < 128) continue;
    const [, ss, vv] = enHsv(d[p], d[p + 1], d[p + 2]);
    const s2 = Math.min(1, ts * (mm.rs ? ss / mm.rs : 1)), v2 = Math.min(1, Math.max(0.08, tv * (vv / mm.rv)));
    [d[p], d[p + 1], d[p + 2]] = enRgb(th, s2, v2);
  }
  ctx.putImageData(img, i * l.w, 0);
}

/** La ligne d'un modèle (32 vues), à repeindre au besoin vue par vue ; et l'empreinte au sol du modèle. */
const cacheLignes = new Map();
function ligneVoiture(modele, couleur) {
  const m = ATLAS_VOITURES[modele] ? modele : 'sedan';
  const repeinte = !!couleur && !LIVREES.has(m) && !!planches.tiny.voituresMasque;
  const cle = repeinte ? `${m}|${couleur}` : m;
  if (cacheLignes.has(cle)) return cacheLignes.get(cle);
  const [y, w, h, cy] = ATLAS_VOITURES[m];
  const planche = planches.tiny.voitures;
  const l = toile(w * VUES, h, repeinte);
  if (!planche) return { c: l.c, w, h, cy };
  l.ctx.drawImage(planche, 0, y, w * VUES, h, 0, 0, w * VUES, h);
  const ligne = { c: l.c, w, h, cy, m, couleur, peintes: repeinte ? new Uint8Array(VUES) : null, ...empreinte(m) };
  cacheLignes.set(cle, ligne);
  return ligne;
}

/** Longueur et largeur au sol (en px), mesurées sur les vues de côté et de face. */
const cacheEmpreintes = new Map();
function empreinte(m) {
  if (cacheEmpreintes.has(m)) return cacheEmpreintes.get(m);
  const [y, w, h] = ATLAS_VOITURES[m];
  const t = toile(w, h, true);
  const mesure = (i) => {
    t.ctx.clearRect(0, 0, w, h);
    t.ctx.drawImage(planches.tiny.voitures, i * w, y, w, h, 0, 0, w, h);
    const d = t.ctx.getImageData(0, 0, w, h).data;
    let a = w, b = 0;
    for (let x = 0; x < w; x++) for (let yy = 0; yy < h; yy++) if (d[(yy * w + x) * 4 + 3]) { a = Math.min(a, x); b = Math.max(b, x); break; }
    return Math.max(4, b - a - 2);
  };
  const e = { longueur: mesure(0), largeur: mesure(VUES / 4) };
  cacheEmpreintes.set(m, e);
  return e;
}

/**
 * Dessine un véhicule centré au sol en (x, y), le nez vers `angle` (0 = est,
 * sens horaire). `couleur` : null garde la couleur d'origine. Ombre portée ;
 * `echelle` pour les vignettes.
 */
export function dessinerVoiture(ctx, modele, couleur, x, y, angle, echelle = 1, ombre = true) {
  const l = ligneVoiture(modele, couleur);
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const i = Math.round((a / (Math.PI * 2)) * VUES) % VUES;
  if (l.peintes && !l.peintes[i]) repeindreVue(l, i);
  const px = Math.round(x), py = Math.round(y);
  if (ombre && l.longueur) {
    // L'empreinte du véhicule, aplatie par la vue de 3/4, un peu décalée vers le bas.
    ctx.save();
    ctx.translate(px + 2 * echelle, py + 3 * echelle);
    ctx.scale(echelle, echelle * 0.77);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(20,16,34,0.30)';
    ctx.beginPath();
    ctx.roundRect(-l.longueur / 2, -l.largeur / 2, l.longueur, l.largeur, 4);
    ctx.fill();
    ctx.restore();
  }
  const w = l.w * echelle, h = l.h * echelle;
  ctx.drawImage(l.c, i * l.w, 0, l.w, l.h, Math.round(px - w / 2), Math.round(py - (l.cy + 4) * echelle), Math.round(w), Math.round(h));
}

/** Repeint d'avance les quatre vues de face, de dos et de côté (la circulation, au départ). */
export function prechaufferVoiture(modele, couleur) {
  const l = ligneVoiture(modele, couleur);
  if (!l.peintes) return;
  for (let k = 0; k < 4; k++) if (!l.peintes[k * VUES / 4]) repeindreVue(l, k * VUES / 4);
}

/** Vignette d'un véhicule (vue de trois quarts avant) pour les menus, en data URL. */
const cacheVignettes = new Map();
export function vignetteVoiture(modele, couleur, echelle = 1) {
  const cle = `${modele}|${couleur}|${echelle}`;
  if (cacheVignettes.has(cle)) return cacheVignettes.get(cle);
  const { c, ctx } = toile(Math.round(72 * echelle), Math.round(60 * echelle));
  dessinerVoiture(ctx, modele, couleur, c.width / 2, c.height / 2 + 6 * echelle, ANGLE_VITRINE, echelle);
  const url = c.toDataURL();
  if (planches.tiny.voitures) cacheVignettes.set(cle, url);
  return url;
}
/** L'angle « de vitrine » : la voiture vient vers nous, de trois quarts. */
export const ANGLE_VITRINE = Math.PI * 0.75;

/** Véhicules de la circulation : voitures en ville, engins agricoles et camions à la campagne. */
const FLOTTE_VILLE = ['sedan', 'sedan', 'suv', 'suv-luxury', 'taxi', 'van', 'hatchback-sports', 'sedan', 'police', 'delivery', 'truck', 'garbage-truck', 'ambulance', 'firetruck'];
const FLOTTE_CAMPAGNE = ['tractor', 'truck', 'truck-flat', 'sedan', 'suv', 'tractor', 'van', 'delivery'];
export function vehiculeAuHasard(alea, ville = true) {
  const f = ville ? FLOTTE_VILLE : FLOTTE_CAMPAGNE;
  return f[Math.floor(alea() * f.length)];
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
