/* scene-garage.js — le terrain du garage vu de dessus, façon Kairosoft.
 *
 * Une grille de cases de 32 px (8 de large) au bord d'une rue. On y voit les
 * bâtiments construits (avec leur niveau), le décor, les voitures sur les
 * ponts élévateurs, et le personnel qui va de son poste à la salle de repos
 * en suivant les allées libres (recherche de chemin sur les cases vides).
 * En mode construction, la grille apparaît et un fantôme vert ou rouge
 * montre où le bâtiment se posera.
 */

import { tuile, objet, idPersonnage, PERSONNAGES, DIRECTION, spriteVoiture, bulle, T } from './sprites.js';
import { texte } from './course.js';
import { decrireVoiture } from './partie.js';
import { batiment, COLONNES_TERRAIN, combosActifs, raisonPlacement, effets } from './garage.js';

export const CASE = 32;
export const X0 = (320 - COLONNES_TERRAIN * CASE) / 2;   // 32 px de marge
const Y0 = 184;                                          // haut du terrain (sous la barre, l’objectif et la rue)
const PAROLES = { mecano: ['Clac !', 'Serré !', 'Huile ?'], ingenieur: ['Eurêka !', 'Hmm…', '3,14'], commercial: ['Merci !', 'Promo !', 'Souriez !'] };

export class SceneGarage {
  constructor(planche) {
    this.planche = planche;
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

  dessiner(ctx, W, H, t, partie) {
    const p = this.planche;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#38cbab';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 6; x < W; x += 12) {
      if ((x * 7 + y * 13) % 17 < 2) { ctx.fillStyle = '#33bdae'; ctx.fillRect(x, y, 2, 2); }
    }
    if (!partie?.terrain) return;
    const o = this.origine();
    const L = partie.terrain.lignes;
    const largeur = COLONNES_TERRAIN * CASE, hauteur = L * CASE;

    // Rue et trottoir au-dessus du terrain, voiture qui passe.
    const yRue = o.y - 52;
    for (let x = 0; x < W; x += T) { tuile(ctx, p, 441, x, yRue); tuile(ctx, p, 441, x, yRue + T); tuile(ctx, p, 36, x, yRue + 2 * T); }
    ctx.fillStyle = '#d9d6e6';
    for (let x = 4; x < W; x += 24) ctx.fillRect(x, yRue + 15, 12, 2);
    const passante = spriteVoiture('#4f7ddb');
    ctx.save(); ctx.translate(Math.round(this.passant), yRue + 10); ctx.rotate(Math.PI / 2);
    ctx.drawImage(passante, -Math.floor(passante.width / 2), -Math.floor(passante.height / 2)); ctx.restore();

    // Sol du terrain, clôture, portail.
    for (let y = 0; y < hauteur; y += T) for (let x = 0; x < largeur; x += T) tuile(ctx, p, 36, o.x + x, o.y + y);
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(o.x - 4, o.y - 4, 4, hauteur + 8); ctx.fillRect(o.x + largeur, o.y - 4, 4, hauteur + 8);
    ctx.fillRect(o.x - 4, o.y + hauteur, largeur + 8, 4);
    ctx.fillRect(o.x - 4, o.y - 4, largeur / 2 - 28, 4); ctx.fillRect(o.x + largeur / 2 + 32, o.y - 4, largeur / 2 - 28, 4);
    ctx.fillStyle = '#1f2a44'; ctx.fillRect(W / 2 - 62, o.y - 26, 124, 18);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(W / 2 - 60, o.y - 24, 120, 14);
    texte(ctx, 'GARAGE PISTON', W / 2, o.y - 17, 10, '#1f2a44', 'center');

    // Grille en mode construction.
    if (this.placement) {
      ctx.fillStyle = 'rgba(31,42,68,0.25)';
      for (let x = 0; x <= COLONNES_TERRAIN; x++) ctx.fillRect(o.x + x * CASE, o.y, 1, hauteur);
      for (let y = 0; y <= L; y++) ctx.fillRect(o.x, o.y + y * CASE, largeur, 1);
    }

    // Bâtiments et décor, triés de haut en bas.
    const combos = combosActifs(partie);
    const enCombo = new Set(combos.flatMap((c) => c.membres));
    const tries = partie.terrain.batiments.slice().sort((a, b) => a.y + batiment(a.id).h - (b.y + batiment(b.id).h));
    const ponts = tries.filter((b) => b.id === 'pont');
    const voitures = this.voituresSurPonts(partie, ponts.length);
    for (const b of tries) {
      if (this.placement?.sauf === b.uid) continue;
      const d = batiment(b.id);
      const x = o.x + b.x * CASE, y = o.y + b.y * CASE, w = d.l * CASE, h = d.h * CASE;
      if (y + h < 0 || y > H) continue;
      dessinerBatiment(ctx, p, b, d, x, y, w, h, t);
      if (b.id === 'pont') {
        const i = ponts.indexOf(b);
        if (i === 0 && this.construction) this.dessinerChantier(ctx, x + w / 2, y + h / 2, t);
        else if (voitures[i]) {
          const s = spriteVoiture(voitures[i].couleur, voitures[i].active ? '#f2c14e' : '#f4f1e8', voitures[i].looks);
          ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.drawImage(s, -Math.floor(s.width / 2), -Math.floor(s.height / 2)); ctx.restore();
        }
      }
      if (enCombo.has(b.uid)) { ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ffe066' : '#f39c33'; ctx.fillRect(x + w - 7, y + 2, 5, 5); }
      if (this.selection === b.uid) {
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
    }

    for (const e of this.etincelles) { ctx.fillStyle = e.vie > 0.2 ? '#ffe066' : '#f39c33'; ctx.fillRect(Math.round(e.x), Math.round(e.y), 2, 2); }

    // Personnel.
    const persos = partie.personnel.map((s) => ({ s, m: this.marcheurs.get(s.uid) })).filter((x) => x.m)
      .map((x) => ({ ...x, pos: x.m.dedans || x.m })).sort((a, b) => a.pos.y - b.pos.y);
    for (const { s, m, pos } of persos) {
      const px = o.x + pos.x * CASE + 16, py = o.y + pos.y * CASE + 24;
      const pas = m.marche ? (Math.floor(t * 6) % 2) + 1 : (Math.floor(t * 3) % 4 === 0 ? 1 : 0);
      tuile(ctx, p, idPersonnage(PERSONNAGES[s.apparence % PERSONNAGES.length], m.dir, pas), px - 8, py - 14);
      if (s.auRepos) { ctx.fillStyle = '#7dd3fc'; ctx.fillRect(px + 5, py - 16, 3, 3); }
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
      dessinerBatiment(ctx, p, { id: d.id, niveau: 1 }, d, x, y, d.l * CASE, d.h * CASE, t);
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

  /** La voiture se monte de l'avant vers l'arrière, puis reçoit sa peinture. */
  dessinerChantier(ctx, cx, cy, t) {
    const c = this.construction;
    const avance = Math.min(1, c.t / c.duree);
    const brute = spriteVoiture('#9ea3ac', '#c9ccd4', []);
    const finie = spriteVoiture(c.voiture.couleur, '#f2c14e', c.voiture.looks || []);
    const s = avance > 0.85 ? finie : brute;
    const h = Math.ceil(s.height * Math.min(1, avance / 0.8));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.5, 1.5);
    const ox = -Math.floor(s.width / 2), oy = -Math.floor(s.height / 2);
    ctx.fillStyle = 'rgba(31,42,68,0.35)';
    for (let y = 0; y < s.height; y += 2) ctx.fillRect(ox + 1, oy + y, s.width - 2, 1);
    ctx.drawImage(s, 0, 0, s.width, h, ox, oy, s.width, h);
    if (avance < 0.85) { ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ffe066' : '#ffffff'; ctx.fillRect(ox, oy + h - 1, s.width, 1); }
    ctx.restore();
  }
}

// --- Dessin des bâtiments ---------------------------------------------------------------------

function toit(ctx, x, y, w, h, couleur) {
  ctx.fillStyle = 'rgba(42,40,56,0.3)'; ctx.fillRect(x + 3, y + 3, w - 2, h - 2);
  ctx.fillStyle = '#3a3550'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = couleur; ctx.fillRect(x + 2, y + 2, w - 4, h - 12);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 2, y + 2, w - 4, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = y + 6; i < y + h - 12; i += 5) ctx.fillRect(x + 3, i, w - 6, 1);
  // Façade avec porte.
  ctx.fillStyle = '#d6d4af'; ctx.fillRect(x + 2, y + h - 10, w - 4, 8);
  ctx.fillStyle = '#836a62'; ctx.fillRect(x + w / 2 - 3, y + h - 9, 6, 7);
  ctx.fillStyle = '#9fd3ff'; ctx.fillRect(x + 5, y + h - 8, 4, 4); ctx.fillRect(x + w - 9, y + h - 8, 4, 4);
}

function etiquette(ctx, x, y, w, nom, niveau, max) {
  const court = nom.length > 14 && w < 64 ? `${nom.slice(0, 11)}.` : nom;
  texte(ctx, court, x + w / 2, y + 9, 7, '#ffffff', 'center');
  if (max > 1) texte(ctx, '◆'.repeat(niveau), x + w / 2, y + 19, 6, '#ffe066', 'center');
}

/** Dessine un bâtiment ou un décor dans son rectangle (en pixels d'écran). */
export function dessinerBatiment(ctx, planche, b, d, x, y, w, h, t = 0) {
  const n = b.niveau || 1;
  switch (d.id) {
    case 'pont': {
      ctx.fillStyle = '#7e7c93'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = '#9896ab'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.fillStyle = '#f2c14e';
      for (const [a, c] of [[4, 4], [w - 12, 4], [4, h - 10], [w - 12, h - 10]]) ctx.fillRect(x + a, y + c, 8, 6);
      texte(ctx, '◆'.repeat(n), x + w / 2, y + h - 5, 6, '#ffe066', 'center');
      return;
    }
    case 'distributeur': {
      ctx.fillStyle = '#1a1626'; ctx.fillRect(x + 7, y + 3, 18, 26);
      ctx.fillStyle = d.couleur; ctx.fillRect(x + 8, y + 4, 16, 24);
      ctx.fillStyle = '#9fd3ff'; ctx.fillRect(x + 10, y + 6, 8, 12);
      ctx.fillStyle = '#e4432d'; ctx.fillRect(x + 11, y + 8, 2, 3); ctx.fillStyle = '#ffe066'; ctx.fillRect(x + 14, y + 12, 2, 3);
      ctx.fillStyle = '#c9ccd4'; ctx.fillRect(x + 19, y + 7, 3, 6);
      return;
    }
    case 'fleurs': {
      ctx.fillStyle = '#5a3a24'; ctx.fillRect(x + 4, y + 10, 24, 14);
      ctx.fillStyle = '#3fa34d'; ctx.fillRect(x + 5, y + 11, 22, 12);
      const cs = ['#e86ca6', '#f2c14e', '#ffffff', '#e4432d'];
      for (let i = 0; i < 8; i++) { ctx.fillStyle = cs[i % 4]; ctx.fillRect(x + 7 + (i % 4) * 5, y + 13 + Math.floor(i / 4) * 5, 3, 3); }
      return;
    }
    case 'arbre': objet(ctx, planche, 'arbreRond', x + 16, y + 30); return;
    case 'banc-public': objet(ctx, planche, 'banc', x + 16, y + 26); return;
    case 'lampadaire': objet(ctx, planche, 'lampadaire', x + 16, y + 30); return;
    case 'drapeaux': {
      ctx.fillStyle = '#3a3550'; ctx.fillRect(x + 15, y + 4, 2, 26);
      const f = Math.sin(t * 6) > 0 ? 1 : 0;
      ctx.fillStyle = '#e4432d'; ctx.fillRect(x + 17, y + 5 + f, 10, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 17, y + 8 + f, 10, 3);
      ctx.fillStyle = '#2f6fdb'; ctx.fillRect(x + 17, y + 11 + f, 10, 3);
      return;
    }
    case 'fontaine': case 'bassin': {
      ctx.fillStyle = '#7e7c93'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      ctx.fillStyle = '#59b6d8'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      ctx.fillStyle = '#9fdcef';
      const k = Math.floor(t * 3) % 3;
      ctx.fillRect(x + 10 + k * 4, y + 10, 6, 1); ctx.fillRect(x + w - 18 - k * 3, y + h - 12, 6, 1);
      if (d.id === 'fontaine') { ctx.fillStyle = '#c9ccd4'; ctx.fillRect(x + w / 2 - 3, y + h / 2 - 6, 6, 10); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w / 2 - 1, y + h / 2 - 10 - (k % 2), 2, 4); }
      else for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#f39c33' : '#ffffff'; ctx.fillRect(x + 14 + ((t * 10 + i * 13) % (w - 30)), y + 18 + i * 9, 5, 2); }
      return;
    }
    case 'statue': {
      ctx.fillStyle = '#7e7c93'; ctx.fillRect(x + 8, y + 22, 16, 8);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + 13, y + 6, 6, 16); ctx.fillRect(x + 10, y + 10, 12, 4); ctx.fillRect(x + 14, y + 2, 4, 4);
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 14, y + 7, 1, 10);
      return;
    }
    case 'tour': {
      ctx.fillStyle = 'rgba(42,40,56,0.3)'; ctx.fillRect(x + 8, y + 8, w - 10, h - 10);
      ctx.fillStyle = '#3a3550'; ctx.fillRect(x + 14, y + 4, w - 28, h - 8);
      ctx.fillStyle = '#c9ccd4'; ctx.fillRect(x + 16, y + 6, w - 32, h - 12);
      ctx.fillStyle = '#9fd3ff'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 18, y + 10 + i * 8, w - 36, 4);
      ctx.fillStyle = Math.sin(t * 4) > 0 ? '#e4432d' : '#7a1d12'; ctx.fillRect(x + w / 2 - 2, y + 1, 4, 4);
      return;
    }
    default:
      toit(ctx, x, y, w, h, d.couleur || '#9896ab');
      // Nom et niveau seulement sur le terrain (pas sur les vignettes des menus).
      if (b.uid) etiquette(ctx, x, y, w, d.nom, n, d.niveauMax);
  }
}

/** Petite image d'un bâtiment pour les menus (data URL), mise en cache. */
const cacheVignettes = new Map();
export function vignetteBatiment(planche, d) {
  if (cacheVignettes.has(d.id)) return cacheVignettes.get(d.id);
  const c = document.createElement('canvas');
  c.width = d.l * CASE; c.height = d.h * CASE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  dessinerBatiment(ctx, planche, { id: d.id, niveau: 1 }, d, 0, 0, c.width, c.height, 0);
  const url = c.toDataURL();
  cacheVignettes.set(d.id, url);
  return url;
}

export { effets };
