/* course.js — une manche de Grand Prix, du feu rouge au drapeau à damier.
 *
 * Le joueur tourne en touchant la moitié gauche ou droite de l'écran (ou les
 * flèches du clavier) ; les adversaires suivent la piste tout seuls. Tours,
 * classement, boosts (nitro, aura, aspiration), chocs et public sont gérés
 * ici, ainsi que l'affichage de la course et de son interface.
 */

import { situer, pointA, courbureDevant, DEMI, BARRIERE } from './circuit.js';
import { Voiture, RAYON_VOITURE } from './voiture.js';
import { SURFACES, kmh, BOOSTS } from './regles.js';
import { spriteVoiture, tuile, idPersonnage, bulle, police } from './sprites.js';
import { clamp, lerp, angleNorm, formatTemps, ordinal, creerAlea } from './outils.js';

export const HAUTEUR_PANNEAU = 112;
const COMPTE_A_REBOURS = 3.2;
const TEXTES_PUBLIC = ['Bravo !', 'Ouah !', 'Allez !', 'Ooh !', 'Vas-y !'];

export class Course {
  /**
   * @param {object} o
   *   circuit, decor (rendreCircuit), planche, tours,
   *   joueur: { physique, couleur, pilote, nitros },
   *   adversaires: [{ physique, couleur, nom, talent }],
   *   aide (aide au pilotage), son, niveau
   */
  constructor(o) {
    this.circuit = o.circuit;
    this.decor = o.decor;
    this.planche = o.planche;
    this.tours = o.tours;
    this.son = o.son;
    this.aide = o.aide !== false;
    this.niveau = o.niveau || 1;
    this.alea = creerAlea(o.circuit.def.graine + 99);
    const surface = SURFACES[o.circuit.def.surface] || SURFACES.asphalte;

    this.voitures = [];
    const nb = o.adversaires.length + 1;
    const placeJoueur = Math.min(nb - 1, Math.floor(nb * 0.6));
    let a = 0;
    for (let i = 0; i < nb; i++) {
      let v;
      if (i === placeJoueur) {
        v = new Voiture({ physique: o.joueur.physique, couleur: o.joueur.couleur, nom: o.joueur.pilote, joueur: true });
        this.joueur = v;
      } else {
        const adv = o.adversaires[a++];
        v = new Voiture({ physique: adv.physique, couleur: adv.couleur, nom: adv.nom, equipe: adv.equipe });
        v.talent = adv.talent || 0;
        v.voie = (this.alea() - 0.5) * 24;
        v.nitroIA = this.niveau >= 2 ? 1 : 0;
        v.prochaineVoie = this.alea() * 2;
      }
      v.adherenceSol = surface.adherence;
      v.vitesseSol = surface.vitesse;
      const s = this.circuit.longueur - 40 - i * 26;
      const lat = i % 2 ? -15 : 15;
      const p = pointA(this.circuit, s, lat);
      v.placer(p.x, p.y, p.angle);
      v.s = ((s % this.circuit.longueur) + this.circuit.longueur) % this.circuit.longueur;
      v.tour = -1;
      v.progres = -40 - i * 26;
      v.dernierContact = -10;
      this.voitures.push(v);
    }

    this.nitros = o.joueur.nitros ?? 2;
    this.jaugeAura = 0;
    this.temps = -COMPTE_A_REBOURS;
    this.etat = 'compte';
    this.fans = 0;
    this.depassements = 0;
    this.particules = [];
    this.messages = [];
    this.classement = this.voitures.slice();
    this.positionJoueur = this.classement.indexOf(this.joueur) + 1;
    this.camera = { x: this.joueur.x, y: this.joueur.y };
    this.terrain = this.decor.canvas.getContext('2d');
    this.dernierBip = 4;
    this.annonceDernierTour = false;
    this.attenteFin = 0;
  }

  // --- Mise à jour -------------------------------------------------------------

  maj(dt, entrees) {
    this.temps += dt;
    const demarre = this.temps >= 0;

    if (this.etat === 'compte') {
      const reste = Math.ceil(-this.temps);
      if (reste < this.dernierBip && reste >= 1) { this.dernierBip = reste; this.son?.bip(440); }
      if (demarre) { this.etat = 'course'; this.son?.bip(880, 0.35); this.message('PARTEZ !', 1.2, '#f2c14e'); }
    }

    const j = this.joueur;
    if (!j.fini) {
      j.direction = (entrees.droite ? 1 : 0) - (entrees.gauche ? 1 : 0);
      if (j.direction === 0 && this.aide && demarre) this.aider(j);
      if (entrees.nitro && demarre) this.declencherNitro();
      if (entrees.aura && demarre) this.declencherAura();
      if (demarre && j.drift) this.jaugeAura = Math.min(1, this.jaugeAura + 0.12 * dt);
    } else {
      this.piloter(j, dt);
    }

    for (const v of this.voitures) if (!v.joueur) this.piloter(v, dt);

    this.aspirations();
    for (const v of this.voitures) {
      v.maj(dt, demarre);
      this.contraindre(v, dt);
      this.suivre(v);
    }
    this.collisions();
    this.classer();
    this.effets(dt);

    if (j.fini && this.etat === 'course') {
      this.etat = 'arrivee';
      this.son?.fanfare();
      this.message(this.positionJoueur === 1 ? 'VICTOIRE !' : 'ARRIVÉE !', 3, '#f2c14e');
    }
    if (this.etat === 'arrivee') {
      this.attenteFin += dt;
      if (this.attenteFin > 3) this.etat = 'fini';
    }
  }

  /** Aide au pilotage : sans doigt posé, la voiture se recentre doucement. */
  aider(v) {
    const cible = pointA(this.circuit, v.s + 30 + v.vitesse * 0.3, 0);
    const ecart = angleNorm(Math.atan2(cible.y - v.y, cible.x - v.x) - v.angle);
    v.direction = clamp(ecart * 1.2, -0.55, 0.55);
  }

  /** Pilote automatique des adversaires (et du joueur une fois arrivé). */
  piloter(v, dt) {
    if (v.prochaineVoie !== undefined) {
      v.prochaineVoie -= dt;
      if (v.prochaineVoie <= 0) {
        v.prochaineVoie = 0.6 + this.alea() * 1.4;
        const devant = this.voitureDevant(v, 70);
        if (devant) v.voie = devant.voieEstimee > 0 ? -16 : 16;
        else v.voie = lerp(v.voie, (this.alea() - 0.5) * 24, 0.5);
      }
    }
    const voie = v.voie || 0;
    const cible = pointA(this.circuit, v.s + 24 + v.vitesse * 0.3, voie);
    const ecart = angleNorm(Math.atan2(cible.y - v.y, cible.x - v.x) - v.angle);
    v.direction = clamp(ecart * 3, -1, 1);

    // Vitesse d'approche des virages, d'après la courbure à venir.
    const k = courbureDevant(this.circuit, v.s + 10, 40 + v.vitesse * 0.8);
    const R = k > 1e-4 ? 1 / k : 1e4;
    const prudence = 0.96 + (v.talent || 0);
    let cibleV = Math.sqrt(52 * R * v.p.adherence * v.adherenceSol) * prudence;
    // Un peu d'élastique pour que la course reste disputée.
    const ecartJoueur = v.progres - this.joueur.progres;
    if (!this.joueur.fini) cibleV *= ecartJoueur > 500 ? 0.94 : ecartJoueur < -500 ? 1.05 : 1;
    v.frein = v.vitesse > cibleV + 12 ? clamp((v.vitesse - cibleV) / 60, 0, 1) : 0;

    if (v.nitroIA > 0 && this.etat === 'course' && R > 1500 && this.alea() < dt * 0.15) {
      v.nitroIA--;
      v.nitro = BOOSTS.nitro.duree;
    }
  }

  voitureDevant(v, portee) {
    const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
    let meilleure = null, dMin = portee;
    for (const autre of this.voitures) {
      if (autre === v) continue;
      const dx = autre.x - v.x, dy = autre.y - v.y;
      const avant = dx * fx + dy * fy;
      const cote = -dx * fy + dy * fx;
      if (avant > 0 && avant < dMin && Math.abs(cote) < 18) {
        dMin = avant; meilleure = autre;
        autre.voieEstimee = cote;
      }
    }
    return meilleure;
  }

  aspirations() {
    for (const v of this.voitures) {
      const devant = this.voitureDevant(v, 46);
      v.aspiration = !!devant && v.vitesse > 90;
    }
  }

  declencherNitro() {
    if (this.nitros <= 0 || this.joueur.nitro > 0) return;
    this.nitros--;
    this.joueur.nitro = BOOSTS.nitro.duree;
    this.son?.souffle();
    this.message('NITRO !', 0.9, '#ffe066', this.joueur);
  }

  declencherAura() {
    if (this.jaugeAura < 1 || this.joueur.aura > 0) return;
    this.jaugeAura = 0;
    this.joueur.aura = BOOSTS.aura.duree;
    this.son?.aura();
    this.message('AURA !', 1.2, '#f472b6', this.joueur);
    this.applaudir(this.joueur, 260);
  }

  /** Piste, herbe, barrières. */
  contraindre(v) {
    const sit = situer(this.circuit, v.x, v.y);
    if (!sit) return;
    v.situation = sit;
    v.horsPiste = clamp((sit.d - DEMI + 2) / 14, 0, 1);
    const limite = BARRIERE - RAYON_VOITURE + 2;
    if (sit.d > limite) {
      const nx = sit.nx * sit.cote, ny = sit.ny * sit.cote;
      v.x = sit.px + nx * limite;
      v.y = sit.py + ny * limite;
      const choc = v.vx * nx + v.vy * ny;
      if (choc > 0) {
        v.vx -= nx * choc * 1.35;
        v.vy -= ny * choc * 1.35;
        v.vx *= 0.7; v.vy *= 0.7;
        v.durabilite = Math.max(0, v.durabilite - choc / 9);
        if (choc > 40) {
          this.etincelles(v.x + nx * 8, v.y + ny * 8, choc);
          if (v.joueur) this.son?.choc(choc);
        }
        if (!v.joueur && choc > 85) {
          v.tete = 0.7;
          if (this.temps - v.dernierContact < 1.6) {
            this.fans += 10;
            this.message('BOUM ! +10 fans', 1.2, '#ffe066', v);
            this.applaudir(v, 220);
            this.son?.choc(150);
          }
        } else if (v.joueur && choc > 150) {
          v.tete = 0.45;
        }
      }
    }
  }

  /** Abscisse, tours et arrivée. */
  suivre(v) {
    const sit = v.situation;
    if (!sit) return;
    const L = this.circuit.longueur;
    const ds = sit.s - v.s;
    if (ds < -L / 2) {
      v.tour++;
      if (v.joueur && v.tour === this.tours - 1 && this.tours > 1 && !this.annonceDernierTour) {
        this.annonceDernierTour = true;
        this.message('DERNIER TOUR !', 1.6, '#f2c14e');
        this.son?.bip(660, 0.2);
      }
    } else if (ds > L / 2) v.tour--;
    v.s = sit.s;
    v.progres = v.tour * L + v.s;
    if (!v.fini && v.tour >= this.tours) {
      v.fini = true;
      v.tempsArrivee = this.temps;
    }
  }

  collisions() {
    const vs = this.voitures;
    const r2 = RAYON_VOITURE * 2;
    for (let i = 0; i < vs.length; i++) for (let k = i + 1; k < vs.length; k++) {
      const a = vs[i], b = vs[k];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= r2 || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const recouvrement = (r2 - d) / 2;
      a.x -= nx * recouvrement; a.y -= ny * recouvrement;
      b.x += nx * recouvrement; b.y += ny * recouvrement;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -rel * 0.65;
        a.vx -= nx * imp; a.vy -= ny * imp;
        b.vx += nx * imp; b.vy += ny * imp;
        if (a.joueur) b.dernierContact = this.temps;
        if (b.joueur) a.dernierContact = this.temps;
        if ((a.joueur || b.joueur) && imp > 25) this.son?.choc(imp);
      }
    }
  }

  classer() {
    const avant = this.positionJoueur;
    this.classement = this.voitures.slice().sort((a, b) => {
      if (a.fini && b.fini) return a.tempsArrivee - b.tempsArrivee;
      if (a.fini) return -1;
      if (b.fini) return 1;
      return b.progres - a.progres;
    });
    this.positionJoueur = this.classement.indexOf(this.joueur) + 1;
    if (this.etat !== 'course' || this.joueur.fini) return;
    if (this.positionJoueur < avant) {
      this.depassements++;
      this.fans += 2;
      this.jaugeAura = Math.min(1, this.jaugeAura + 0.22);
      this.applaudir(this.joueur, 200);
      this.message(`${ordinal(this.positionJoueur)} !`, 0.9, '#9fe870', this.joueur);
    } else if (this.positionJoueur > avant) {
      this.jaugeAura = Math.min(1, this.jaugeAura + 0.08);
    }
  }

  // --- Effets ----------------------------------------------------------------

  effets(dt) {
    for (const v of this.voitures) {
      if (v.drift || (v.horsPiste > 0.3 && v.vitesse > 40)) this.traces(v);
      if (v.nitro > 0 || v.aura > 0) {
        const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
        this.particules.push({
          x: v.x - fx * 11 + (Math.random() - 0.5) * 3, y: v.y - fy * 11 + (Math.random() - 0.5) * 3,
          vx: -fx * 40 + (Math.random() - 0.5) * 20, vy: -fy * 40 + (Math.random() - 0.5) * 20,
          vie: 0.3, max: 0.3, couleur: v.aura > 0 ? '#f472b6' : Math.random() < 0.5 ? '#ff8a00' : '#ffe066', taille: 2,
        });
      }
      if (v.horsPiste > 0.4 && v.vitesse > 60 && Math.random() < 0.5) {
        this.particules.push({ x: v.x, y: v.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vie: 0.5, max: 0.5, couleur: '#c9bf96', taille: 3 });
      }
      if (v.tete > 0 && Math.random() < 0.6) {
        this.particules.push({ x: v.x, y: v.y, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, vie: 0.7, max: 0.7, couleur: '#9aa0b5', taille: 4 });
      }
    }
    for (const p of this.particules) { p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt; }
    this.particules = this.particules.filter((p) => p.vie > 0);
    for (const m of this.messages) m.vie -= dt;
    this.messages = this.messages.filter((m) => m.vie > 0);
    for (const s of this.decor.spectateurs) if (s.bulle) { s.bulle.vie -= dt; if (s.bulle.vie <= 0) s.bulle = null; }
  }

  /** Traces de pneus, dessinées directement sur le terrain. */
  traces(v) {
    const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
    const lx = -fy, ly = fx;
    this.terrain.fillStyle = v.horsPiste > 0.3 ? 'rgba(90,70,50,0.25)' : 'rgba(30,28,40,0.32)';
    for (const c of [-4, 4]) {
      this.terrain.fillRect(Math.round(v.x - fx * 7 + lx * c), Math.round(v.y - fy * 7 + ly * c), 1, 1);
    }
  }

  etincelles(x, y, force) {
    for (let i = 0; i < Math.min(10, force / 12); i++) {
      this.particules.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, vie: 0.25, max: 0.25, couleur: '#ffe066', taille: 1 });
    }
  }

  applaudir(pres, rayon) {
    const r2 = rayon * rayon;
    for (const s of this.decor.spectateurs) {
      const dx = s.x - pres.x, dy = s.y - pres.y;
      if (dx * dx + dy * dy < r2) {
        s.joie = 1.5;
        if (!s.bulle && Math.random() < 0.12) s.bulle = { texte: TEXTES_PUBLIC[Math.floor(Math.random() * TEXTES_PUBLIC.length)], vie: 1.3 };
      }
    }
  }

  message(texte, duree, couleur, ancre = null) {
    this.messages.push({ texte, vie: duree, max: duree, couleur, ancre: ancre ? { x: ancre.x, y: ancre.y } : null });
  }

  // --- Fin de course -----------------------------------------------------------

  /** Classement final : les voitures pas encore arrivées sont estimées. */
  resultats() {
    const L = this.circuit.longueur;
    const liste = this.voitures.map((v) => {
      let temps = v.tempsArrivee;
      if (!v.fini) {
        const reste = this.tours * L - v.progres;
        temps = this.temps + reste / Math.max(60, v.p.vmax * 0.8);
      }
      return { voiture: v, temps };
    });
    liste.sort((a, b) => a.temps - b.temps);
    const t0 = liste[0].temps;
    return liste.map((r, i) => ({ ...r, place: i + 1, ecart: r.temps - t0 }));
  }

  // --- Dessin ------------------------------------------------------------------

  /** Zones tactiles du panneau, en coordonnées d'écran. */
  zones(W, H) {
    const y0 = H - HAUTEUR_PANNEAU;
    return {
      portrait: { x: 10, y: y0 + 8, w: 36, h: 36 },
      nitro: { x: W / 2 - 34, y: y0 + 50, w: 68, h: 54 },
      gauche: { x: 8, y: y0 + 50, w: W / 2 - 46, h: 54 },
      droite: { x: W / 2 + 38, y: y0 + 50, w: W / 2 - 46, h: 54 },
      pause: { x: W / 2 - 14, y: 6, w: 28, h: 22 },
    };
  }

  dessiner(ctx, W, H, t) {
    const j = this.joueur;
    const hVue = H - HAUTEUR_PANNEAU;
    // Caméra : un peu en avant de la voiture, dans le sens de la marche.
    const cibleX = j.x + j.vx * 0.45, cibleY = j.y + j.vy * 0.45;
    this.camera.x = lerp(this.camera.x, cibleX, 0.12);
    this.camera.y = lerp(this.camera.y, cibleY, 0.12);
    const cw = this.decor.canvas.width, ch = this.decor.canvas.height;
    const camX = Math.round(clamp(this.camera.x - W / 2, 0, cw - W));
    const camY = Math.round(clamp(this.camera.y - hVue / 2, 0, ch - hVue));

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.decor.canvas, camX, camY, W, hVue, 0, 0, W, hVue);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, hVue); ctx.clip();
    ctx.translate(-camX, -camY);

    // Public : il se lève et saute quand ça bouge près de lui.
    const visibles = this.decor.spectateurs.filter((s) => s.x > camX - 16 && s.x < camX + W + 16 && s.y > camY - 16 && s.y < camY + hVue + 24);
    for (const s of visibles) {
      if (s.joie > 0) s.joie -= 1 / 60;
      const saute = s.joie > 0 && Math.sin(t * 14 + s.phase) > 0;
      const pas = saute ? 1 : 0;
      tuile(ctx, this.planche, idPersonnage(s.base, s.dir, pas), s.x - 8, s.y - 12 - (saute ? 2 : 0));
    }

    // Ombres puis voitures.
    for (const v of this.voitures) {
      ctx.fillStyle = 'rgba(30,28,40,0.28)';
      ctx.save(); ctx.translate(Math.round(v.x) + 2, Math.round(v.y) + 2); ctx.rotate(v.angle + Math.PI / 2);
      ctx.fillRect(-6, -10, 12, 21); ctx.restore();
    }
    for (const v of this.voitures) {
      const sprite = spriteVoiture(v.couleur, v.joueur ? '#f2c14e' : '#f4f1e8');
      ctx.save();
      ctx.translate(Math.round(v.x), Math.round(v.y));
      ctx.rotate(v.angle + Math.PI / 2);
      if (v.aura > 0) {
        ctx.fillStyle = `rgba(244,114,182,${0.25 + 0.15 * Math.sin(t * 20)})`;
        ctx.fillRect(-9, -13, 18, 27);
      }
      ctx.drawImage(sprite, -Math.floor(sprite.width / 2), -Math.floor(sprite.height / 2));
      ctx.restore();
    }

    // Repère au-dessus du joueur : une flèche jaune qui rebondit.
    const bx = Math.round(j.x), by = Math.round(j.y) - 24 + (Math.sin(t * 6) > 0 ? 1 : 0);
    ctx.fillStyle = '#1a1626';
    for (let i = 0; i < 6; i++) ctx.fillRect(bx - 6 + i, by + i - 1, 13 - i * 2, 2);
    ctx.fillStyle = '#f2c14e';
    for (let i = 0; i < 5; i++) ctx.fillRect(bx - 4 + i, by + i, 9 - i * 2, 1);

    this.dessinerPortique(ctx);

    for (const p of this.particules) {
      ctx.globalAlpha = clamp(p.vie / p.max, 0, 1);
      ctx.fillStyle = p.couleur;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.taille, p.taille);
    }
    ctx.globalAlpha = 1;

    for (const s of visibles) if (s.bulle) bulle(ctx, s.x, s.y - 14, s.bulle.texte);
    for (const m of this.messages) if (m.ancre) {
      const a = 1 - m.vie / m.max;
      texte(ctx, m.texte, m.ancre.x, m.ancre.y - 24 - a * 16, 10, m.couleur, 'center');
    }
    ctx.restore();

    this.dessinerInterface(ctx, W, H, t);
  }

  dessinerPortique(ctx) {
    const a = pointA(this.circuit, 0, -(DEMI + 9));
    const b = pointA(this.circuit, 0, DEMI + 9);
    ctx.fillStyle = 'rgba(30,28,40,0.3)';
    ctx.fillRect(Math.round(a.x) - 2, Math.round(a.y), 6, 6);
    ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y), 6, 6);
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(Math.round(a.x) - 3, Math.round(a.y) - 3, 6, 6);
    ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 3, 6, 6);
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(a.x, a.y - 10);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = '#2a2838'; ctx.fillRect(0, -4, l, 8);
    ctx.fillStyle = '#5c6278'; ctx.fillRect(1, -3, l - 2, 6);
    const feux = 5;
    const allumes = this.etat === 'compte' ? clamp(Math.floor((this.temps + COMPTE_A_REBOURS) / (COMPTE_A_REBOURS / feux)) + 1, 0, feux) : 0;
    for (let i = 0; i < feux; i++) {
      let c = '#3a3550';
      if (this.etat === 'compte' && i < allumes) c = '#e4432d';
      if (this.etat !== 'compte' && this.temps < 2) c = '#5ad16a';
      ctx.fillStyle = c;
      ctx.fillRect(l / 2 - feux * 4 + i * 8 + 1, -2, 5, 4);
    }
    ctx.restore();
  }

  dessinerInterface(ctx, W, H, t) {
    const j = this.joueur;
    // Haut : tour, place, chrono.
    const tourAffiche = clamp(j.tour + 1, 1, this.tours);
    pastille(ctx, 6, 6, `TOUR ${tourAffiche}/${this.tours}`, '#1f2a44');
    pastille(ctx, 6, 26, `${ordinal(this.positionJoueur)} / ${this.voitures.length}`, '#c2504d');
    pastille(ctx, 6, 46, formatTemps(Math.max(0, this.temps)), '#1f2a44');

    // Pause.
    const z = this.zones(W, H);
    ctx.fillStyle = 'rgba(31,42,68,0.85)';
    ctx.fillRect(z.pause.x, z.pause.y, z.pause.w, z.pause.h);
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(z.pause.x + 9, z.pause.y + 6, 3, 10); ctx.fillRect(z.pause.x + 16, z.pause.y + 6, 3, 10);

    // Mini-carte.
    const mc = this.decor.minicarte;
    const mx = W - mc.canvas.width - 6, my = 6;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(mx - 4, my - 4, mc.canvas.width + 8, mc.canvas.height + 8);
    ctx.fillStyle = '#1f2a44';
    ctx.fillRect(mx - 2, my - 2, mc.canvas.width + 4, mc.canvas.height + 4);
    ctx.drawImage(mc.canvas, mx, my);
    for (const v of this.voitures) {
      const x = mx + (v.x - mc.minX) * mc.echelle + mc.decalage;
      const y = my + (v.y - mc.minY) * mc.echelle + mc.decalage;
      ctx.fillStyle = v.joueur ? '#ffffff' : '#2a2838';
      ctx.fillRect(Math.round(x) - (v.joueur ? 3 : 2), Math.round(y) - (v.joueur ? 3 : 2), v.joueur ? 6 : 4, v.joueur ? 6 : 4);
      ctx.fillStyle = v.couleur;
      ctx.fillRect(Math.round(x) - (v.joueur ? 2 : 1), Math.round(y) - (v.joueur ? 2 : 1), v.joueur ? 4 : 2, v.joueur ? 4 : 2);
    }

    // Messages centraux (départ, dernier tour, arrivée).
    const hVue = H - HAUTEUR_PANNEAU;
    if (this.etat === 'compte') {
      const n = Math.ceil(-this.temps);
      texte(ctx, n > 3 ? '' : String(n), W / 2, hVue * 0.38, 36, '#ffffff', 'center');
    }
    for (const m of this.messages) if (!m.ancre) {
      const echelle = 1 + 0.3 * clamp((m.vie - m.max + 0.2) / 0.2, 0, 1);
      texte(ctx, m.texte, W / 2, hVue * 0.38, Math.round(22 * echelle), m.couleur, 'center');
    }

    // Panneau du bas.
    const y0 = H - HAUTEUR_PANNEAU;
    ctx.fillStyle = '#1f2a44'; ctx.fillRect(0, y0, W, HAUTEUR_PANNEAU);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, y0, W, 3);

    // Portrait du pilote = bouton d'aura.
    const pr = z.portrait;
    const pleine = this.jaugeAura >= 1;
    ctx.fillStyle = pleine ? (Math.sin(t * 10) > 0 ? '#f472b6' : '#db2777') : '#3a4a6b';
    ctx.fillRect(pr.x - 2, pr.y - 2, pr.w + 4, pr.h + 4);
    ctx.fillStyle = '#fff6e0'; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.save(); ctx.translate(pr.x + 18, pr.y + 18); ctx.scale(2, 2);
    tuile(ctx, this.planche, idPersonnage(104, 1, 0), -8, -8);
    ctx.restore();

    texte(ctx, j.nom, 54, y0 + 16, 11, '#f4f1e8', 'left');
    texte(ctx, `${kmh(j.vitesse)}`, W - 52, y0 + 22, 20, '#ffe066', 'right');
    texte(ctx, 'km/h', W - 10, y0 + 22, 9, '#ffe066', 'right');

    // Jauge d'aura.
    texte(ctx, pleine ? 'AURA PRÊTE' : 'Aura', 54, y0 + 33, 9, pleine ? '#f472b6' : '#9fb3d9', 'left');
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = this.jaugeAura * 6 > i ? '#ec4899' : '#3a4a6b';
      ctx.fillRect(112 + i * 13, y0 + 29, 11, 6);
    }
    // Durabilité.
    const dur = j.durabilite / j.p.durabiliteMax;
    texte(ctx, 'Voiture', W - 92, y0 + 38, 8, '#9fb3d9', 'left');
    ctx.fillStyle = '#3a4a6b'; ctx.fillRect(W - 54, y0 + 34, 44, 5);
    ctx.fillStyle = dur > 0.5 ? '#5ad16a' : dur > 0.25 ? '#f2c14e' : '#e4432d';
    ctx.fillRect(W - 54, y0 + 34, Math.round(44 * dur), 5);

    // Zones de direction et nitro.
    for (const [cle, fleche] of [['gauche', -1], ['droite', 1]]) {
      const r = z[cle];
      ctx.fillStyle = '#2a3654'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#9fb3d9';
      for (let i = r.x; i < r.x + r.w; i += 6) { ctx.fillRect(i, r.y, 3, 1); ctx.fillRect(i, r.y + r.h - 1, 3, 1); }
      for (let i = r.y; i < r.y + r.h; i += 6) { ctx.fillRect(r.x, i, 1, 3); ctx.fillRect(r.x + r.w - 1, i, 1, 3); }
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2 - 6;
      ctx.fillStyle = '#f4f1e8';
      for (let i = 0; i < 7; i++) ctx.fillRect(Math.round(cx - fleche * 8 + fleche * i * 2), Math.round(cy - i), 2, i * 2 + 1);
      ctx.fillRect(Math.round(cx - (fleche > 0 ? 12 : -4)), Math.round(cy - 2), 10, 4);
      texte(ctx, fleche < 0 ? 'Gauche' : 'Droite', cx, r.y + r.h - 9, 9, '#f4f1e8', 'center');
    }
    const n = z.nitro;
    const dispo = this.nitros > 0 && j.nitro <= 0;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(n.x - 2, n.y - 2, n.w + 4, n.h + 4);
    ctx.fillStyle = dispo ? '#2f6fdb' : '#3a4a6b'; ctx.fillRect(n.x, n.y, n.w, n.h);
    texte(ctx, 'NITRO', n.x + n.w / 2, n.y + 22, 13, '#ffffff', 'center');
    texte(ctx, `${this.nitros} restant${this.nitros > 1 ? 's' : ''}`, n.x + n.w / 2, n.y + 40, 9, '#cfe0ff', 'center');
  }
}

// --- Petits outils de dessin d'interface ---------------------------------------

export function texte(ctx, chaine, x, y, taille, couleur, align = 'left') {
  ctx.font = police(taille);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.round(taille / 5));
  ctx.strokeStyle = '#1a1626';
  ctx.strokeText(chaine, Math.round(x), Math.round(y));
  ctx.fillStyle = couleur;
  ctx.fillText(chaine, Math.round(x), Math.round(y));
}

function pastille(ctx, x, y, chaine, fond) {
  ctx.font = police(10);
  const w = Math.ceil(ctx.measureText(chaine).width) + 10;
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x, y, w + 2, 16);
  ctx.fillStyle = fond; ctx.fillRect(x + 1, y + 1, w, 14);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(chaine, x + 6, y + 8.5);
}
