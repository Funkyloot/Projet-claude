/* scene-garage.js — le terrain du garage vu de dessus, façon Kairosoft.
 *
 * Une grille de cases de 32 px (8 de large) au bord d'une rue. On y voit les
 * bâtiments construits (avec leur niveau), le décor, les voitures sur les
 * ponts élévateurs, et le personnel qui va de son poste à la salle de repos
 * en suivant les allées libres (recherche de chemin sur les cases vides).
 * En mode construction, la grille apparaît et un fantôme vert ou rouge
 * montre où le bâtiment se posera.
 */

import { DIRECTION, bulle, police } from './sprites.js';
import { tuileTiny, dessinerPerso, tenue, spriteVoitureTiny, dessinerVoitureTiny, CONTOUR as CONTOUR_TINY } from './tiny.js';
import { texte } from './course.js';
import { decrireVoiture } from './partie.js';
import { batiment, COLONNES_TERRAIN, combosActifs, raisonPlacement, effets } from './garage.js';

export const CASE = 32;
export const X0 = (320 - COLONNES_TERRAIN * CASE) / 2;   // 32 px de marge
const Y0 = 184;                                          // haut du terrain (sous la barre, l’objectif et la rue)
const NOMS_DIRECTION = ['gauche', 'face', 'dos', 'droite'];
const PAROLES = { mecano: ['Clac !', 'Serré !', 'Huile ?'], ingenieur: ['Eurêka !', 'Hmm…', '3,14'], commercial: ['Merci !', 'Promo !', 'Souriez !'] };

export class SceneGarage {
  constructor(planche, tiny = {}) {
    this.planche = planche;
    this.tiny = tiny;
    this.scroll = 0;
    this.construction = null;
    this.etincelles = [];
    this.passant = -40;
    this.marcheurs = new Map();      // uid du personnel → position animée
    this.flottants = [];             // « +150 G » au-dessus des distributeurs
    this.minuteurRevenu = 3;
    this.placement = null;           // { id, x, y, sauf } en mode construction
    this.selection = null;           // uid du bâtiment touché
  }

  // --- Coordonnées -------------------------------------------------------------------

  origine() { return { x: X0, y: Y0 - this.scroll }; }

  /** Case sous un point de l'écran (ou null hors du terrain). */
  caseA(partie, px, py) {
    const o = this.origine();
    const cx = Math.floor((px - o.x) / CASE), cy = Math.floor((py - o.y) / CASE);
    if (cx < 0 || cy < 0 || cx >= COLONNES_TERRAIN || cy >= partie.terrain.lignes) return null;
    return { x: cx, y: cy };
  }

  batimentA(partie, px, py) {
    const c = this.caseA(partie, px, py);
    if (!c) return null;
    return partie.terrain.batiments.find((b) => {
      const d = batiment(b.id);
      return c.x >= b.x && c.x < b.x + d.l && c.y >= b.y && c.y < b.y + d.h;
    }) || null;
  }

  defiler(dy, partie, hVue) {
    const max = Math.max(0, partie.terrain.lignes * CASE + 24 - hVue);
    this.scroll = Math.max(0, Math.min(max, this.scroll + dy));
  }

  construire(voiture, duree) { this.construction = { voiture, duree, t: 0 }; }
  finConstruction() { this.construction = null; }

  // --- Chemins du personnel ------------------------------------------------------------

  /** Grille des cases libres (true = on peut y marcher). */
  grilleLibre(partie) {
    const L = partie.terrain.lignes, C = COLONNES_TERRAIN;
    const g = Array.from({ length: L }, () => Array(C).fill(true));
    for (const b of partie.terrain.batiments) {
      const d = batiment(b.id);
      for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.l; x++) if (g[y]) g[y][x] = false;
    }
    return g;
  }

  /** Cases libres autour d'un bâtiment, celles de devant (en dessous) d'abord. */
  portes(partie, b, libre) {
    const d = batiment(b.id);
    const essais = [];
    for (let x = b.x; x < b.x + d.l; x++) essais.push([x, b.y + d.h]);
    for (let y = b.y; y < b.y + d.h; y++) essais.push([b.x - 1, y], [b.x + d.l, y]);
    for (let x = b.x; x < b.x + d.l; x++) essais.push([x, b.y - 1]);
    return essais.filter(([x, y]) => libre[y]?.[x]).map(([x, y]) => ({ x, y }));
  }

  caseLibreAuHasard(libre, pres = null, rayon = 99) {
    const cases = [];
    for (let y = 0; y < libre.length; y++) for (let x = 0; x < libre[0].length; x++) {
      if (!libre[y][x]) continue;
      if (pres && Math.abs(x - pres.x) + Math.abs(y - pres.y) > rayon) continue;
      cases.push({ x, y });
    }
    return cases.length ? cases[Math.floor(Math.random() * cases.length)] : null;
  }

  chemin(libre, depart, arrivee) {
    const L = libre.length, C = libre[0].length;
    const cle = (x, y) => y * C + x;
    const prec = new Map([[cle(depart.x, depart.y), null]]);
    const file = [depart];
    while (file.length) {
      const c = file.shift();
      if (c.x === arrivee.x && c.y === arrivee.y) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (n.x < 0 || n.y < 0 || n.x >= C || n.y >= L || !libre[n.y][n.x] || prec.has(cle(n.x, n.y))) continue;
        prec.set(cle(n.x, n.y), c);
        file.push(n);
      }
    }
    if (!prec.has(cle(arrivee.x, arrivee.y))) return [arrivee];
    const res = [];
    for (let c = arrivee; c; c = prec.get(cle(c.x, c.y))) res.unshift(c);
    return res;
  }

  // --- Mise à jour ----------------------------------------------------------------------

  maj(dt, partie) {
    this.passant += dt * 60;
    if (this.passant > 380) this.passant = -60;
    if (this.construction) {
      this.construction.t += dt;
      const pont = partie?.terrain.batiments.find((b) => b.id === 'pont');
      if (pont && Math.random() < 0.6) {
        const o = this.origine();
        this.etincelles.push({ x: o.x + pont.x * CASE + 32 + (Math.random() - 0.5) * 30, y: o.y + pont.y * CASE + 20 + Math.random() * 30, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, vie: 0.4 });
      }
    }
    for (const e of this.etincelles) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 120 * dt; e.vie -= dt; }
    this.etincelles = this.etincelles.filter((e) => e.vie > 0);
    for (const f of this.flottants) { f.y -= 14 * dt; f.vie -= dt; }
    this.flottants = this.flottants.filter((f) => f.vie > 0);
    if (!partie?.terrain) return;

    // Petits gains visibles : les distributeurs et la boutique « encaissent ».
    this.minuteurRevenu -= dt;
    if (this.minuteurRevenu <= 0) {
      this.minuteurRevenu = 2.5 + Math.random() * 2;
      const vendeurs = partie.terrain.batiments.filter((b) => ['distributeur', 'cafeteria', 'boutique'].includes(b.id));
      const b = vendeurs[Math.floor(Math.random() * vendeurs.length)];
      if (b) {
        const d = batiment(b.id);
        this.flottants.push({ cx: b.x + d.l / 2, cy: b.y, texte: b.id === 'boutique' ? '+G ♪' : '+G', vie: 1.2, y: 0 });
      }
    }

    // Personnel, façon Kairosoft : chacun à son poste (une place par personne
    // autour du bâtiment), les fatigués DANS la salle de repos, les autres se
    // promènent dans les allées. Jamais tous entassés dans un coin.
    const libre = this.grilleLibre(partie);
    const repos = partie.terrain.batiments.filter((b) => b.id === 'repos');
    const occupation = new Map();   // bâtiment → nombre de personnes déjà placées
    for (const s of partie.personnel) {
      let m = this.marcheurs.get(s.uid);
      const poste = s.poste && partie.terrain.batiments.find((b) => b.uid === s.poste);
      const salle = s.auRepos && repos.length ? repos[partie.personnel.indexOf(s) % repos.length] : null;
      const lieu = salle || (!s.auRepos ? poste : null);
      const rangDansLieu = lieu ? (occupation.get(lieu.uid) || 0) : 0;
      if (lieu) occupation.set(lieu.uid, rangDansLieu + 1);
      const portes = lieu ? this.portes(partie, lieu, libre) : [];
      const cible = portes.length ? portes[rangDansLieu % portes.length] : null;
      if (!m) {
        const depart = cible || this.caseLibreAuHasard(libre) || { x: 0, y: 0 };
        m = { x: depart.x, y: depart.y, chemin: [], vers: null, attente: Math.random() * 2, bulle: null, dir: DIRECTION.face };
        this.marcheurs.set(s.uid, m);
      }
      m.dedans = null;
      if (cible) {
        if (!m.vers || m.vers.x !== cible.x || m.vers.y !== cible.y) {
          m.vers = cible;
          m.chemin = this.chemin(libre, { x: Math.round(m.x), y: Math.round(m.y) }, cible);
        }
      } else if (!m.chemin.length && m.attente <= 0) {
        // Sans poste : une petite promenade vers une case libre proche.
        const but = this.caseLibreAuHasard(libre, m, 3);
        if (but) { m.vers = but; m.chemin = this.chemin(libre, { x: Math.round(m.x), y: Math.round(m.y) }, but); }
        m.attente = 2 + Math.random() * 4;
      }
      if (m.chemin.length) {
        const n = m.chemin[0];
        const dx = n.x - m.x, dy = n.y - m.y;
        const d = Math.hypot(dx, dy);
        const v = 1.6 * dt;
        if (d <= v) { m.x = n.x; m.y = n.y; m.chemin.shift(); }
        else { m.x += (dx / d) * v; m.y += (dy / d) * v; }
        m.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRECTION.droite : DIRECTION.gauche) : (dy > 0 ? DIRECTION.face : DIRECTION.dos);
        m.marche = true;
      } else {
        m.marche = false;
        if (lieu && cible) {
          // Arrivé : il se tourne vers son bâtiment ; en salle de repos, il entre s'asseoir.
          const d = batiment(lieu.id);
          if (cible.y >= lieu.y + d.h) m.dir = DIRECTION.dos;
          else if (cible.y < lieu.y) m.dir = DIRECTION.face;
          else m.dir = cible.x < lieu.x ? DIRECTION.droite : DIRECTION.gauche;
          if (salle) m.dedans = { x: lieu.x + 0.1 + (rangDansLieu % 3) * 0.55, y: lieu.y - 0.25 + d.h - 1 };
        }
        m.attente -= dt;
        if (m.attente <= 0 && lieu) {
          m.attente = 3 + Math.random() * 4;
          if (Math.random() < 0.4) {
            const p = s.auRepos ? ['Zzz…', 'Pause !', 'Café ?'] : PAROLES[s.metier];
            m.bulle = { texte: p[Math.floor(Math.random() * p.length)], vie: 1.5 };
          }
        }
      }
      if (m.bulle && (m.bulle.vie -= dt) <= 0) m.bulle = null;
    }
    for (const uidM of this.marcheurs.keys()) if (!partie.personnel.some((s) => s.uid === uidM)) this.marcheurs.delete(uidM);
  }

  // --- Dessin ---------------------------------------------------------------------------

  /**
   * Le garage vu de l'intérieur, façon Kenney Tiny Factory : un grand atelier au
   * sol orangé, mur du fond gris à bande jaune avec la grande porte sur la rue,
   * chaque bâtiment posé comme une pièce meublée (mur, machines, établis), et le
   * personnel qui circule entre les postes. 1 case du terrain = 2 m.
   */
  dessiner(ctx, W, H, t, partie) {
    const tiny = this.tiny;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#34283a';
    ctx.fillRect(0, 0, W, H);
    if (!partie?.terrain) return;
    const o = this.origine();
    const L = partie.terrain.lignes;
    const largeur = COLONNES_TERRAIN * CASE, hauteur = L * CASE;
    // Sol extérieur : terre sombre et cailloux (tuiles Tiny Factory).
    const dy = ((o.y % 16) + 16) % 16;
    for (let y = dy - 16; y < H; y += 16) for (let x = 0; x < W; x += 16) {
      const k = (((x * 7 + (y - o.y) * 13) % 23) + 23) % 23;
      tuileTiny(ctx, tiny, 'factory', k === 0 ? 32 : k === 5 ? 33 : 3, x, y);
    }

    // La rue au-dessus, avec sa voiture qui passe.
    const yRue = o.y - 96;
    ctx.fillStyle = '#d9d3c3'; ctx.fillRect(0, yRue - 10, W, 10); ctx.fillRect(0, yRue + 38, W, 12);
    ctx.fillStyle = '#a59f90'; ctx.fillRect(0, yRue - 1, W, 1); ctx.fillRect(0, yRue + 38, W, 1);
    ctx.fillStyle = '#4f5470'; ctx.fillRect(0, yRue, W, 38);
    ctx.fillStyle = '#e8e4d6';
    for (let x = 4; x < W; x += 24) ctx.fillRect(x, yRue + 18, 12, 2);
    dessinerVoitureTiny(ctx, spriteVoitureTiny('#4f7ddb'), Math.round(this.passant), yRue + 22, 0);
    // Allée de béton entre la rue et la grande porte.
    const porteX = o.x + largeur / 2 - 24;
    ctx.fillStyle = '#bdb6a4'; ctx.fillRect(porteX, yRue + 50, 48, o.y - 20 - (yRue + 50));
    ctx.fillStyle = '#a59f90'; for (let y = yRue + 56; y < o.y - 20; y += 8) ctx.fillRect(porteX, y, 48, 1);

    // Le bâtiment : contour clair bordé de sombre, comme les pièces de Tiny Factory.
    cadreTiny(ctx, o.x - 4, o.y - 20, largeur + 8, hauteur + 24);
    // Mur du fond (une rangée de tuiles), avec la grande porte au milieu.
    for (let x = 0; x < largeur; x += 16) {
      const i = Math.floor((x - (largeur / 2 - 24)) / 16);
      const n = i >= 0 && i < 3 ? [69, 70, 71][i] : [44, 46, 47, 57, 46, 58, 59, 47][(x / 16) % 8];
      tuileTiny(ctx, tiny, 'factory', n, o.x + x, o.y - 16);
    }
    // Enseigne au-dessus du mur, de chaque côté de la porte.
    ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(o.x + 6, o.y - 40, 88, 18);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(o.x + 8, o.y - 38, 84, 14);
    texte(ctx, 'GARAGE PISTON', o.x + 50, o.y - 31, 9, '#1f2a44', 'center');
    // Sol : dalles orangées ; les cases libres forment les allées.
    for (let y = 0; y < hauteur; y += 16) for (let x = 0; x < largeur; x += 16) tuileTiny(ctx, tiny, 'factory', 0, o.x + x, o.y + y);

    // Grille en mode construction.
    if (this.placement) {
      ctx.fillStyle = 'rgba(38,24,46,0.22)';
      for (let x = 0; x <= COLONNES_TERRAIN; x++) ctx.fillRect(o.x + x * CASE, o.y, 1, hauteur);
      for (let y = 0; y <= L; y++) ctx.fillRect(o.x, o.y + y * CASE, largeur, 1);
    }

    // Bâtiments et décor, du fond vers l'avant.
    const combos = combosActifs(partie);
    const enCombo = new Set(combos.flatMap((c) => c.membres));
    const tries = partie.terrain.batiments.slice().sort((a, b) => a.y + batiment(a.id).h - (b.y + batiment(b.id).h));
    const ponts = tries.filter((b) => b.id === 'pont');
    const voitures = this.voituresSurPonts(partie, ponts.length);
    for (const b of tries) {
      if (this.placement?.sauf === b.uid) continue;
      const d = batiment(b.id);
      const x = o.x + b.x * CASE, y = o.y + b.y * CASE, w = d.l * CASE, h = d.h * CASE;
      if (y + h < -16 || y > H) continue;
      dessinerBatiment(ctx, tiny, b, d, x, y, w, h, t, !!this.placement || this.selection === b.uid);
      if (b.id === 'pont') {
        const i = ponts.indexOf(b);
        if (i === 0 && this.construction) this.dessinerChantier(ctx, x + w / 2, y + h / 2, t);
        else if (voitures[i]) {
          const v = voitures[i];
          dessinerVoitureTiny(ctx, spriteVoitureTiny(v.couleur, v.active ? '#f2c14e' : null, v.looks), x + w / 2, y + h / 2 - 3, Math.PI / 2);
        }
      }
      if (enCombo.has(b.uid)) { ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ffe066' : '#f39c33'; ctx.fillRect(x + w - 7, y + 2, 5, 5); }
      if (this.selection === b.uid) {
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
    }

    for (const e of this.etincelles) { ctx.fillStyle = e.vie > 0.2 ? '#ffe066' : '#f39c33'; ctx.fillRect(Math.round(e.x), Math.round(e.y), 2, 2); }

    // Personnel : petits personnages modernes (casque jaune des mécanos, blouse des ingénieurs).
    const persos = partie.personnel.map((s) => ({ s, m: this.marcheurs.get(s.uid) })).filter((x) => x.m)
      .map((x) => ({ ...x, pos: x.m.dedans || x.m })).sort((a, b) => a.pos.y - b.pos.y);
    for (const { s, m, pos } of persos) {
      const px = o.x + pos.x * CASE + 16, py = o.y + pos.y * CASE + 26;
      const pas = m.marche ? (Math.floor(t * 6) % 2) + 1 : 0;
      dessinerPerso(ctx, tenue(s.apparence, s.metier), px, py, NOMS_DIRECTION[m.dir] || 'face', pas);
      if (s.auRepos) { ctx.fillStyle = '#7dd3fc'; ctx.fillRect(px + 6, py - 18, 3, 3); }
    }
    for (const { m, pos } of persos) if (m.bulle) bulle(ctx, o.x + pos.x * CASE + 16, o.y + pos.y * CASE + 8, m.bulle.texte);

    for (const f of this.flottants) {
      texte(ctx, f.texte, o.x + f.cx * CASE, o.y + f.cy * CASE - 4 + f.y, 9, '#ffe066', 'center');
    }

    // Fantôme du bâtiment à poser.
    if (this.placement && this.placement.x !== undefined) {
      const d = batiment(this.placement.id);
      const ok = !raisonPlacement(partie, this.placement.id, this.placement.x, this.placement.y, this.placement.sauf);
      const x = o.x + this.placement.x * CASE, y = o.y + this.placement.y * CASE;
      ctx.globalAlpha = 0.75;
      dessinerBatiment(ctx, tiny, { id: d.id, niveau: 1 }, d, x, y, d.l * CASE, d.h * CASE, t);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ok ? 'rgba(90,209,106,0.35)' : 'rgba(228,67,45,0.4)';
      ctx.fillRect(x, y, d.l * CASE, d.h * CASE);
      ctx.strokeStyle = ok ? '#5ad16a' : '#e4432d'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, d.l * CASE - 2, d.h * CASE - 2);
    }
  }

  voituresSurPonts(partie, n) {
    const enChantier = this.construction?.voiture?.uid;
    const garage = partie.garage.filter((v) => v.uid !== enChantier);
    const active = garage.find((v) => v.uid === partie.voitureActive);
    const ordre = [active, ...garage.filter((v) => v !== active)].filter(Boolean);
    const liste = [];
    // Pendant une construction, le premier pont est pris par le chantier.
    if (this.construction) liste.push(null);
    for (const v of ordre) {
      if (liste.length >= n) break;
      const dv = decrireVoiture(partie, v);
      liste.push({ couleur: dv.couleur, looks: dv.looks, active: v === active });
    }
    return liste;
  }

  /** La voiture se monte de l'arrière vers l'avant, puis reçoit sa peinture. */
  dessinerChantier(ctx, cx, cy, t) {
    const c = this.construction;
    const avance = Math.min(1, c.t / c.duree);
    const s = avance > 0.85 ? spriteVoitureTiny(c.voiture.couleur, '#f2c14e', c.voiture.looks || []) : spriteVoitureTiny('#9ea3ac', null, []);
    const h = Math.ceil(60 * Math.min(1, avance / 0.8));
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 32, cy + 30 - h, 64, h); ctx.clip();
    dessinerVoitureTiny(ctx, s, cx, cy - 3, Math.PI / 2);
    ctx.restore();
    if (avance < 0.85) { ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ffe066' : '#ffffff'; ctx.fillRect(cx - 16, cy + 30 - h, 32, 1); }
  }
}

// --- Dessin des bâtiments (style Kenney Tiny Factory) ------------------------------------------
// Une case du terrain fait 32 px = 2 tuiles de 16 px. Chaque bâtiment est une
// « pièce » : un bout de mur au fond (bande jaune), le sol à damier, et ses
// machines ou meubles à l'échelle (une personne = 1 tuile, une voiture = 2 × 3).

/** Contour de pièce : trait clair bordé de sombre. */
export function cadreTiny(ctx, x, y, w, h) {
  ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#c4cbda'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

/** Pose une ligne de tuiles Tiny Factory à partir de (x, y), de gauche à droite. */
function rangee(ctx, tiny, ns, x, y) {
  ns.forEach((n, i) => { if (n !== null) tuileTiny(ctx, tiny, 'factory', n, x + i * 16, y); });
}

/** Sol à damier, mur du fond et contour : la base d'une pièce. */
function piece(ctx, tiny, x, y, w, h, murs, sol = 1) {
  for (let yy = 0; yy < h; yy += 16) for (let xx = 0; xx < w; xx += 16) tuileTiny(ctx, tiny, 'factory', sol, x + xx, y + yy);
  if (murs) for (let xx = 0; xx < w; xx += 16) tuileTiny(ctx, tiny, 'factory', murs[(xx / 16) % murs.length], x + xx, y);
  ctx.fillStyle = 'rgba(38,24,46,0.55)';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

function plaque(ctx, x, y, w, nom, niveau, max) {
  const court = nom.length > 14 && w < 64 ? `${nom.slice(0, 11)}.` : nom;
  ctx.font = police(7);
  const lw = Math.min(w - 4, Math.ceil(ctx.measureText(court).width) + 8);
  ctx.fillStyle = 'rgba(31,42,68,0.88)'; ctx.fillRect(x + (w - lw) / 2, y + 1, lw, 9);
  texte(ctx, court, x + w / 2, y + 6, 7, '#ffffff', 'center');
  if (max > 1) texte(ctx, '★'.repeat(niveau), x + w / 2, y + 15, 6, '#ffe066', 'center');
}

function etoiles(ctx, xd, y, n) {
  for (let i = 0; i < n; i++) {
    const x = xd - 5 - i * 6;
    ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x - 1, y - 1, 6, 6);
    ctx.fillStyle = '#ffe066'; ctx.fillRect(x, y, 4, 4);
    ctx.fillStyle = '#fff6c8'; ctx.fillRect(x, y, 2, 1);
  }
}

function perso(ctx, x, y, apparence, dir = 'face') {
  dessinerPerso(ctx, tenue(apparence), x, y, dir, 0);
}

/** Dessine un bâtiment ou un décor dans son rectangle (en pixels d'écran). */
export function dessinerBatiment(ctx, tiny, b, d, x, y, w, h, t = 0, avecNom = false) {
  const n = b.niveau || 1;
  // Le nom n'apparaît que sur demande (bâtiment touché, mode construction) ; sinon, le niveau en petites étoiles.
  const nom = () => {
    if (!b.uid) return;
    if (avecNom) plaque(ctx, x, y, w, d.nom, n, d.niveauMax);
    else if (d.niveauMax > 1) etoiles(ctx, x + w - 3, y + 3, n);
  };
  switch (d.id) {
    case 'pont': {
      // Pont élévateur : plateau gris à l'échelle d'une voiture, quatre colonnes jaunes.
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 8, y + 4, w - 16, h - 8);
      ctx.fillStyle = '#9aa1b5'; ctx.fillRect(x + 9, y + 5, w - 18, h - 10);
      ctx.fillStyle = '#80879c'; for (let yy = y + 9; yy < y + h - 6; yy += 6) ctx.fillRect(x + 10, yy, w - 20, 1);
      for (const [a, c] of [[3, 2], [w - 9, 2], [3, h - 12], [w - 9, h - 12]]) {
        ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + a, y + c, 6, 10);
        ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + a + 1, y + c + 1, 4, 8);
        ctx.fillStyle = '#fff1a8'; ctx.fillRect(x + a + 1, y + c + 1, 1, 8);
      }
      if (b.uid) etoiles(ctx, x + w - 10, y + h - 9, n);
      return;
    }
    case 'bureau-etudes':
      piece(ctx, tiny, x, y, w, h, [44, 58, 59, 45]);
      rangee(ctx, tiny, [111, 112, null, 100], x, y + 14);
      rangee(ctx, tiny, [54, 55, 56], x + 8, y + 38);
      tuileTiny(ctx, tiny, 'town', 17, x + w - 16, y + 44);
      perso(ctx, x + 32, y + 36, 7, 'dos');
      return nom();
    case 'soufflerie':
      piece(ctx, tiny, x, y, w, h, [44, 46, 47, 45]);
      rangee(ctx, tiny, [30, 31], x + 4, y + 16); rangee(ctx, tiny, [42, 43], x + 4, y + 32);
      tuileTiny(ctx, tiny, 'factory', 114, x + 40, y + 20);
      { const k = Math.floor(t * 12) % 2; ctx.fillStyle = '#c4e8ff'; ctx.fillRect(x + 10 + k * 3, y + 30, 14, 1); ctx.fillRect(x + 12 - k * 2, y + 34, 12, 1); }
      rangee(ctx, tiny, [105, 107], x + 30, y + 46);
      return nom();
    case 'precision':
      piece(ctx, tiny, x, y, w, h, [44, 57, 46, 45]);
      rangee(ctx, tiny, [54, 55, 56, 122], x, y + 14);
      return nom();
    case 'banc':
      piece(ctx, tiny, x, y, w, h, [44, 46, 47, 45]);
      rangee(ctx, tiny, [87, 88, 114, 126], x, y + 14);
      return nom();
    case 'analyse':
      piece(ctx, tiny, x, y, w, h, [44, 57, 58, 45]);
      rangee(ctx, tiny, [111, 112, 113, 99], x, y + 14);
      rangee(ctx, tiny, [54, 55, 56], x + 8, y + 40);
      perso(ctx, x + 22, y + 38, 3, 'dos');
      return nom();
    case 'repos': {
      piece(ctx, tiny, x, y, w, h, [44, 58, 59, 45]);
      // Canapé (dessiné dans le style Tiny) et fontaine à eau.
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 3, y + 17, 38, 13);
      ctx.fillStyle = '#e86ca6'; ctx.fillRect(x + 4, y + 18, 36, 6);
      ctx.fillStyle = '#c8508a'; ctx.fillRect(x + 4, y + 24, 36, 5);
      ctx.fillStyle = '#f7a9cd'; ctx.fillRect(x + 6, y + 19, 14, 2); ctx.fillRect(x + 23, y + 19, 14, 2);
      tuileTiny(ctx, tiny, 'factory', 86, x + w - 18, y + 14);
      return nom();
    }
    case 'cafeteria':
      piece(ctx, tiny, x, y, w, h, [44, 46, 47, 45]);
      rangee(ctx, tiny, [75, 76, 55, 56], x, y + 14);
      return nom();
    case 'sport': {
      piece(ctx, tiny, x, y, w, h, [44, 46, 47, 45]);
      // Tapis de course et haltères.
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 4, y + 18, 22, 12); ctx.fillRect(x + 22, y + 13, 3, 8);
      ctx.fillStyle = '#5c6278'; ctx.fillRect(x + 5, y + 19, 20, 10);
      ctx.fillStyle = '#2a2838'; for (let i = 0; i < 20; i += 4) ctx.fillRect(x + 5 + ((i + Math.floor(t * 20)) % 20), y + 19, 1, 10);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 34, y + 24, 20, 2); ctx.fillRect(x + 32, y + 20, 5, 10); ctx.fillRect(x + 51, y + 20, 5, 10);
      ctx.fillStyle = '#9896ab'; ctx.fillRect(x + 33, y + 21, 3, 8); ctx.fillRect(x + 52, y + 21, 3, 8);
      return nom();
    }
    case 'distributeur':
      piece(ctx, tiny, x, y, w, h, null, 0);
      rangee(ctx, tiny, [75, 76], x, y + 10);
      return;
    case 'boutique':
      piece(ctx, tiny, x, y, w, h, [44, 57, 46, 45]);
      rangee(ctx, tiny, [72, 73, 123, 56], x, y + 14);
      return nom();
    case 'tribune': {
      // Gradins de face, avec le public (une personne = une tuile).
      piece(ctx, tiny, x, y, w, h, null, 0);
      for (let r = 0; r < 3; r++) {
        const yy = y + 6 + r * 16;
        ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 2, yy + 10, w - 4, 7);
        ctx.fillStyle = r % 2 ? '#aab1c4' : '#c4cbda'; ctx.fillRect(x + 3, yy + 11, w - 6, 5);
        for (let i = 0; i < 4; i++) perso(ctx, x + 9 + i * 15 + (r % 2) * 3, yy + 13, i * 3 + r * 5);
      }
      return nom();
    }
    case 'simu-route': case 'simu-terre': case 'simu-glace': {
      const tapis = { 'simu-route': '#5c6278', 'simu-terre': '#a8865f', 'simu-glace': '#a9c6d8' }[d.id];
      piece(ctx, tiny, x, y, w, h, [44, 46, 47, 45]);
      rangee(ctx, tiny, [111, 112], x + 2, y + 10);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 36, y + 14, 22, 16);
      ctx.fillStyle = tapis; ctx.fillRect(x + 37, y + 15, 20, 14);
      ctx.fillStyle = '#2a2838'; ctx.fillRect(x + 41, y + 18, 12, 9);
      ctx.fillStyle = '#c2504d'; ctx.fillRect(x + 43, y + 20, 8, 5);
      return nom();
    }
    // --- Décor -----------------------------------------------------------------------------
    case 'fleurs': {
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 3, y + 12, 26, 15);
      ctx.fillStyle = '#8a5a3b'; ctx.fillRect(x + 4, y + 20, 24, 6);
      ctx.fillStyle = '#3fa34d'; ctx.fillRect(x + 4, y + 13, 24, 7);
      const cs = ['#e86ca6', '#f2c14e', '#ffffff', '#e4432d'];
      for (let i = 0; i < 6; i++) { ctx.fillStyle = cs[i % 4]; ctx.fillRect(x + 6 + (i % 3) * 7, y + 13 + Math.floor(i / 3) * 3, 3, 3); }
      return;
    }
    case 'banc-public':
      piece(ctx, tiny, x, y, w, h, null, 0);
      rangee(ctx, tiny, [6, 6], x, y + 12);
      return;
    case 'arbre': {
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 9, y + 22, 14, 9);
      ctx.fillStyle = '#c2504d'; ctx.fillRect(x + 10, y + 23, 12, 7);
      tuileTiny(ctx, tiny, 'town', 4, x + 8, y + 6);
      return;
    }
    case 'lampadaire': {
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = 'rgba(38,24,46,0.3)'; ctx.fillRect(x + 12, y + 28, 10, 2);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 15, y + 6, 3, 23); ctx.fillRect(x + 10, y + 3, 13, 5);
      ctx.fillStyle = '#fff2a8'; ctx.fillRect(x + 11, y + 6, 11, 1);
      return;
    }
    case 'drapeaux':
      piece(ctx, tiny, x, y, w, h, null, 0);
      tuileTiny(ctx, tiny, 'ski', Math.sin(t * 6) > 0 ? 8 : 20, x, y + 10);
      tuileTiny(ctx, tiny, 'ski', Math.sin(t * 6 + 1) > 0 ? 9 : 21, x + 16, y + 10);
      return;
    case 'fontaine': case 'bassin': {
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 3, y + 5, w - 6, h - 8);
      ctx.fillStyle = '#c4cbda'; ctx.fillRect(x + 4, y + 6, w - 8, h - 10);
      ctx.fillStyle = '#59b6d8'; ctx.fillRect(x + 7, y + 9, w - 14, h - 16);
      ctx.fillStyle = '#9fdcef';
      const k = Math.floor(t * 3) % 3;
      ctx.fillRect(x + 10 + k * 4, y + 12, 6, 1); ctx.fillRect(x + w - 18 - k * 3, y + h - 12, 6, 1);
      if (d.id === 'fontaine') { ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + w / 2 - 4, y + h / 2 - 9, 8, 13); ctx.fillStyle = '#c9ccd4'; ctx.fillRect(x + w / 2 - 3, y + h / 2 - 8, 6, 11); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w / 2 - 1, y + h / 2 - 13 - (k % 2), 2, 4); }
      else for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#f39c33' : '#ffffff'; ctx.fillRect(x + 14 + ((t * 10 + i * 13) % (w - 30)), y + 18 + i * 9, 5, 2); }
      return;
    }
    case 'statue': {
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 7, y + 21, 18, 9); ctx.fillRect(x + 12, y + 1, 8, 21);
      ctx.fillStyle = '#7e7c93'; ctx.fillRect(x + 8, y + 22, 16, 7);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + 13, y + 6, 6, 16); ctx.fillRect(x + 10, y + 10, 12, 4); ctx.fillRect(x + 14, y + 2, 4, 4);
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 14, y + 7, 1, 10);
      return;
    }
    case 'tour': {
      piece(ctx, tiny, x, y, w, h, null, 0);
      ctx.fillStyle = 'rgba(38,24,46,0.3)'; ctx.fillRect(x + 18, y + 10, w - 28, h - 12);
      ctx.fillStyle = CONTOUR_TINY; ctx.fillRect(x + 14, y + 4, w - 28, h - 8);
      ctx.fillStyle = '#c9ccd4'; ctx.fillRect(x + 15, y + 5, w - 30, h - 10);
      ctx.fillStyle = '#9fd3ff'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 18, y + 10 + i * 8, w - 36, 4);
      ctx.fillStyle = Math.sin(t * 4) > 0 ? '#e4432d' : '#7a1d12'; ctx.fillRect(x + w / 2 - 2, y + 1, 4, 4);
      return;
    }
    default:
      piece(ctx, tiny, x, y, w, h, [44, 46, 47, 45]);
      return nom();
  }
}

/** Petite image d'un bâtiment pour les menus (data URL), mise en cache. */
const cacheVignettes = new Map();
export function vignetteBatiment(tiny, d) {
  if (cacheVignettes.has(d.id)) return cacheVignettes.get(d.id);
  const c = document.createElement('canvas');
  c.width = d.l * CASE; c.height = d.h * CASE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  dessinerBatiment(ctx, tiny, { id: d.id, niveau: 1 }, d, 0, 0, c.width, c.height, 0);
  const url = c.toDataURL();
  cacheVignettes.set(d.id, url);
  return url;
}

export { effets };
