/* course.js — une manche de Grand Prix, du feu rouge au drapeau à damier.
 *
 * Le joueur tourne en touchant la moitié gauche ou droite de l'écran (ou les
 * flèches du clavier) ; les adversaires suivent la piste tout seuls. Tours,
 * classement, boosts (nitro, aura, aspiration), chocs et public sont gérés
 * ici, ainsi que l'affichage de la course et de son interface.
 */

import { situer, pointA, courbureDevant, DEMI, BARRIERE } from './circuit.js';
import { Voiture, RAYON_VOITURE, DEMI_LONGUEUR, DEMI_LARGEUR } from './voiture.js';
import { SURFACES, kmh, BOOSTS } from './regles.js';
import { bulle, police } from './sprites.js';
import { spriteVoitureTiny, dessinerVoitureTiny, dessinerPerso, spritePerso, tenue } from './tiny.js';

const NOMS_DIRECTION = ['gauche', 'face', 'dos', 'droite'];
import { clamp, lerp, angleNorm, formatTemps, ordinal, creerAlea } from './outils.js';

export const HAUTEUR_PANNEAU = 112;
const COMPTE_A_REBOURS = 3.2;
const TEXTES_PUBLIC = ['Bravo !', 'Ouah !', 'Allez !', 'Ooh !', 'Vas-y !'];
const RAYON_POTEAU = 4;
const ECART_POTEAU = DEMI + 9;

export class Course {
  /**
   * @param {object} o
   *   circuit, decor (rendreCircuit), planche, tours,
   *   joueur: { physique, couleur, looks, pilote, nitros, nitroDuree, surfaces },
   *   adversaires: [{ physique, couleur, nom, talent }],
   *   coequipier: { physique, couleur, looks, nom, talent, surfaces } (second pilote de l'écurie, facultatif),
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
    const co = o.coequipier || null;
    const nb = o.adversaires.length + 1 + (co ? 1 : 0);
    const placeJoueur = Math.min(nb - 1, Math.floor(nb * 0.6));
    // Le second pilote de l'écurie part juste devant (ou derrière) son titulaire.
    const placeCo = co ? (placeJoueur > 0 ? placeJoueur - 1 : placeJoueur + 1) : -1;
    let a = 0;
    for (let i = 0; i < nb; i++) {
      let v;
      if (i === placeJoueur) {
        v = new Voiture({ physique: o.joueur.physique, couleur: o.joueur.couleur, nom: o.joueur.pilote, joueur: true });
        v.looks = o.joueur.looks || [];
        this.joueur = v;
      } else if (i === placeCo) {
        v = new Voiture({ physique: co.physique, couleur: co.couleur, nom: co.nom, equipe: 'coequipier' });
        v.looks = co.looks || [];
        v.coequipier = true;
        v.talent = co.talent || 0;
        v.voie = (this.alea() - 0.5) * 36;
        v.nitroIA = 1 + Math.floor(this.niveau / 2);
        v.prochaineVoie = this.alea() * 2;
        this.coequipier = v;
      } else {
        const adv = o.adversaires[a++];
        v = new Voiture({ physique: adv.physique, couleur: adv.couleur, nom: adv.nom, equipe: adv.equipe });
        v.talent = adv.talent || 0;
        v.rival = !!adv.rival;
        v.voie = (this.alea() - 0.5) * 36;
        v.nitroIA = 1 + Math.floor(this.niveau / 2);
        v.prochaineVoie = this.alea() * 2;
      }
      const bonusSol = v.joueur ? (o.joueur.surfaces?.[o.circuit.def.surface] || 0) : v.coequipier ? (co.surfaces?.[o.circuit.def.surface] || 0) : 0;
      v.adherenceSol = surface.adherence + bonusSol;
      v.vitesseSol = Math.min(1, surface.vitesse + bonusSol * 0.3);
      const s = this.circuit.longueur - 50 - i * 54;
      const lat = i % 2 ? -22 : 22;
      const p = pointA(this.circuit, s, lat);
      v.placer(p.x, p.y, p.angle);
      v.s = ((s % this.circuit.longueur) + this.circuit.longueur) % this.circuit.longueur;
      v.tour = -1;
      v.progres = -50 - i * 54;
      v.dernierContact = -10;
      this.voitures.push(v);
    }

    this.tenuePilote = o.joueur.tenue || null;
    this.nitros = o.joueur.nitros ?? 1;
    this.nitroDuree = o.joueur.nitroDuree ?? BOOSTS.nitro.duree;
    this.poteaux = [pointA(this.circuit, 0, -ECART_POTEAU), pointA(this.circuit, 0, ECART_POTEAU)];
    this.bonus = this.semerBonus();
    this.ramasses = { argent: 0, recherche: 0 };
    this.piecesOr = 0;
    this.driftMax = 0;
    this.departReussi = false;
    this.drift = 0;            // EXP gagnée en drift
    this.driftEnCours = 0;     // secondes de drift continu
    this.secousse = 0;
    this.departJoue = false;
    this.appuiAvant = false;
    this.tourBonus = 0;
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
    this.departParfait(entrees);
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
    for (let iter = 0; iter < 2; iter++) this.collisions();
    for (const v of this.voitures) this.poteauxPortique(v);
    this.classer();
    if (demarre) { this.compterDrift(dt); this.ramasser(); }
    this.effets(dt);
    if (this.secousse > 0) this.secousse = Math.max(0, this.secousse - dt * 18);

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
    const cible = pointA(this.circuit, v.s + 50 + v.vitesse * 0.3, 0);
    const ecart = angleNorm(Math.atan2(cible.y - v.y, cible.x - v.x) - v.angle);
    v.direction = clamp(ecart * 1.2, -0.55, 0.55);
  }

  /** Pilote automatique des adversaires (et du joueur une fois arrivé). */
  piloter(v, dt) {
    if (v.prochaineVoie !== undefined) {
      v.prochaineVoie -= dt;
      if (v.prochaineVoie <= 0) {
        v.prochaineVoie = 0.6 + this.alea() * 1.4;
        const devant = this.voitureDevant(v, 110);
        if (devant) v.voie = devant.voieEstimee > 0 ? -24 : 24;
        else v.voie = lerp(v.voie, (this.alea() - 0.5) * 36, 0.5);
      }
    }
    const voie = v.voie || 0;
    const cible = pointA(this.circuit, v.s + 44 + v.vitesse * 0.3, voie);
    const ecart = angleNorm(Math.atan2(cible.y - v.y, cible.x - v.x) - v.angle);
    v.direction = clamp(ecart * 3, -1, 1);

    // Vitesse d'approche des virages, d'après la courbure à venir.
    const k = courbureDevant(this.circuit, v.s + 10, 40 + v.vitesse * 0.8);
    const R = k > 1e-4 ? 1 / k : 1e4;
    const prudence = 0.96 + (v.talent || 0);
    let cibleV = Math.sqrt(52 * R * v.p.adherence * v.adherenceSol) * prudence;
    // Un peu d'élastique pour que la course reste disputée.
    const ecartJoueur = v.progres - this.joueur.progres;
    if (!this.joueur.fini && !v.coequipier) cibleV *= ecartJoueur > 700 ? 0.97 : ecartJoueur < -400 ? 1.06 : 1;
    v.frein = v.vitesse > cibleV + 12 ? clamp((v.vitesse - cibleV) / 60, 0, 1) : 0;

    if (v.nitroIA > 0 && this.etat === 'course' && R > 1500 && this.alea() < dt * 0.2) {
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
      if (avant > 0 && avant < dMin && Math.abs(cote) < 28) {
        dMin = avant; meilleure = autre;
        autre.voieEstimee = cote;
      }
    }
    return meilleure;
  }

  aspirations() {
    for (const v of this.voitures) {
      const devant = this.voitureDevant(v, 90);
      v.aspiration = !!devant && v.vitesse > 90;
    }
  }

  declencherNitro() {
    if (this.nitros <= 0 || this.joueur.nitro > 0) return;
    this.nitros--;
    this.joueur.nitro = this.nitroDuree;
    this.secousse = Math.max(this.secousse, 2);
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
    v.horsPiste = clamp((sit.d - DEMI + 4) / 18, 0, 1);
    const nx = sit.nx * sit.cote, ny = sit.ny * sit.cote;
    // Étendue de la voiture (rectangle orienté) vers la barrière.
    const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
    const etendue = DEMI_LONGUEUR * Math.abs(fx * nx + fy * ny) + DEMI_LARGEUR * Math.abs(-fy * nx + fx * ny);
    const limite = BARRIERE - 1 - etendue;
    if (sit.d > limite) {
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
          if (v.joueur) { this.son?.choc(choc); this.secousse = Math.max(this.secousse, Math.min(5, choc / 40)); }
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
      if (v.joueur) {
        // Chrono au tour : le premier passage de la ligne lance le chrono.
        if (this.debutTour !== undefined) {
          const tour = this.temps - this.debutTour;
          if (!this.meilleurTour || tour < this.meilleurTour) {
            if (this.meilleurTour) this.message(`MEILLEUR TOUR ${tour.toFixed(1)} s`, 1.2, '#7dd3fc');
            this.meilleurTour = tour;
          }
        }
        this.debutTour = this.temps;
      }
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

  /**
   * Chocs entre voitures : deux rectangles orientés (12 × 21 px), séparés
   * selon l'axe de moindre recouvrement (théorème des axes séparateurs).
   * Le choc fait aussi pivoter un peu les voitures, selon le point d'impact.
   */
  collisions() {
    const vs = this.voitures;
    for (let i = 0; i < vs.length; i++) for (let k = i + 1; k < vs.length; k++) {
      const a = vs[i], b = vs[k];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > 54 * 54) continue;
      const c = recouvrement(a, b);
      if (!c) continue;
      const { nx, ny, prof } = c;
      a.x -= nx * prof / 2; a.y -= ny * prof / 2;
      b.x += nx * prof / 2; b.y += ny * prof / 2;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel >= 0) continue;
      const imp = -rel * 0.6;
      a.vx -= nx * imp; a.vy -= ny * imp;
      b.vx += nx * imp; b.vy += ny * imp;
      // Pivot : le point de contact est entre les deux coins les plus avancés.
      const pa = coinVers(a, nx, ny), pb = coinVers(b, -nx, -ny);
      const cx = (pa.x + pb.x) / 2, cy = (pa.y + pb.y) / 2;
      a.angle += clamp(((cx - a.x) * -ny - (cy - a.y) * -nx) * imp * 0.0003, -0.12, 0.12);
      b.angle += clamp(((cx - b.x) * ny - (cy - b.y) * nx) * imp * 0.0003, -0.12, 0.12);
      a.durabilite = Math.max(0, a.durabilite - imp / 30);
      b.durabilite = Math.max(0, b.durabilite - imp / 30);
      if (a.joueur) b.dernierContact = this.temps;
      if (b.joueur) a.dernierContact = this.temps;
      if (a.joueur || b.joueur) {
        if (imp > 25) this.son?.choc(imp);
        if (imp > 40) { this.secousse = Math.max(this.secousse, Math.min(4, imp / 35)); this.etincelles(cx, cy, imp); }
        const autre = a.joueur ? b : a;
        if (imp > 90 && !autre.joueur && autre.tete <= 0) {
          autre.tete = 0.5;
          this.fans += 5;
          this.message('BAM ! +5 fans', 1, '#ffe066', autre);
        }
      }
    }
  }

  /** Les deux poteaux du portique de départ sont solides. */
  poteauxPortique(v) {
    for (const p of this.poteaux) {
      const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
      const rx = p.x - v.x, ry = p.y - v.y;
      // Point du rectangle le plus proche du poteau.
      const u = clamp(rx * fx + ry * fy, -DEMI_LONGUEUR, DEMI_LONGUEUR);
      const w = clamp(-rx * fy + ry * fx, -DEMI_LARGEUR, DEMI_LARGEUR);
      const qx = v.x + fx * u - fy * w, qy = v.y + fy * u + fx * w;
      let nx = qx - p.x, ny = qy - p.y;
      let d = Math.hypot(nx, ny);
      if (d >= RAYON_POTEAU) continue;
      if (d < 1e-3) { nx = v.x - p.x; ny = v.y - p.y; d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d; d = 0; } else { nx /= d; ny /= d; }
      const prof = RAYON_POTEAU - d;
      v.x += nx * prof; v.y += ny * prof;
      const choc = -(v.vx * nx + v.vy * ny);
      if (choc > 0) {
        v.vx += nx * choc * 1.4; v.vy += ny * choc * 1.4;
        v.vx *= 0.6; v.vy *= 0.6;
        v.durabilite = Math.max(0, v.durabilite - choc / 8);
        this.etincelles(p.x, p.y, choc);
        if (v.joueur) { this.son?.choc(choc); this.secousse = Math.max(this.secousse, 4); }
      }
    }
  }

  // --- Bonus sur la piste, drift, départ parfait -------------------------------

  /** Pièces d'or (argent) et disquettes (points de recherche), en lignes de 3. */
  semerBonus() {
    const L = this.circuit.longueur;
    const alea = creerAlea(this.circuit.def.graine * 13 + 5);
    const bonus = [];
    for (let s = 260; s < L - 160; s += 200 + alea() * 120) {
      const voie = [-28, 0, 28][Math.floor(alea() * 3)];
      if (alea() < 0.16) {
        const p = pointA(this.circuit, s, voie);
        bonus.push({ type: 'disque', x: p.x, y: p.y, pris: false });
      } else {
        for (let k = 0; k < 3; k++) {
          const p = pointA(this.circuit, s + k * 22, voie);
          bonus.push({ type: 'piece', x: p.x, y: p.y, pris: false });
        }
      }
    }
    return bonus;
  }

  ramasser() {
    const j = this.joueur;
    if (j.fini) return;
    // Les bonus réapparaissent à chaque nouveau tour.
    if (j.tour !== this.tourBonus) { this.tourBonus = j.tour; for (const b of this.bonus) b.pris = false; }
    for (const b of this.bonus) {
      if (b.pris) continue;
      const dx = b.x - j.x, dy = b.y - j.y;
      if (dx * dx + dy * dy > 20 * 20) continue;
      b.pris = true;
      if (b.type === 'piece') {
        const valeur = 10 * this.niveau;
        this.ramasses.argent += valeur;
        this.piecesOr += 1;
        this.message(`+${valeur} G`, 0.7, '#ffe066', b);
        this.son?.piece();
      } else {
        this.ramasses.recherche += 1;
        this.message('+1 PR', 0.9, '#7dd3fc', b);
        this.son?.disque();
      }
    }
  }

  /** Un drift tenu longtemps rapporte de l'EXP, affichée à la sortie du virage. */
  compterDrift(dt) {
    const j = this.joueur;
    if (j.drift && !j.fini && j.vitesse > 70) {
      this.driftEnCours += dt;
      return;
    }
    this.driftMax = Math.max(this.driftMax, this.driftEnCours);
    if (this.driftEnCours > 0.5) {
      const gain = Math.round(this.driftEnCours * 6);
      this.drift += gain;
      this.message(`DRIFT ! +${gain} EXP`, 1, '#c4b5fd', j);
      this.applaudir(j, 160);
    }
    this.driftEnCours = 0;
  }

  /** Appuyer pile au feu vert (ni trop tôt, ni trop tard) lance la voiture. */
  departParfait(entrees) {
    const appui = entrees.gauche || entrees.droite || entrees.nitro;
    const nouveau = appui && !this.appuiAvant;
    this.appuiAvant = appui;
    if (this.departJoue || !nouveau) return;
    if (this.temps < -0.5) return;                     // trop tôt pour compter
    this.departJoue = true;
    if (this.temps < -0.12) {
      this.message('Trop tôt !', 1, '#fca5a5', this.joueur);
      this.joueur.calage = 0.6;
    } else if (this.temps < 0.3) {
      this.joueur.nitro = Math.max(this.joueur.nitro, 1.2);
      this.message('DÉPART PARFAIT !', 1.4, '#9fe870');
      this.departReussi = true;
      this.drift += 10;
      this.son?.aura();
      this.secousse = 3;
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
    const rival = this.voitures.find((v) => v.rival);
    if (rival) {
      const devant = this.classement.indexOf(this.joueur) < this.classement.indexOf(rival);
      if (devant && this.rivalDerriere === false) { this.drift += 10; this.message('RIVAL DÉPASSÉ ! +10 EXP', 1.3, '#ff8a80'); this.son?.aura(); }
      this.rivalDerriere = devant;
    }
    if (this.positionJoueur < avant) {
      this.depassements++;
      this.fans += 2;
      this.jaugeAura = Math.min(1, this.jaugeAura + 0.22);
      this.applaudir(this.joueur, 200);
      this.message(`${ordinal(this.positionJoueur)} ! +4 EXP`, 0.9, '#9fe870', this.joueur);
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
          x: v.x - fx * 24 + (Math.random() - 0.5) * 6, y: v.y - fy * 24 + (Math.random() - 0.5) * 6,
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
    for (const c of [-10, 10]) {
      this.terrain.fillRect(Math.round(v.x - fx * 15 + lx * c), Math.round(v.y - fy * 15 + ly * c), 2, 2);
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

  /** Ce que la manche rapporte en plus de la place (pour partie.enregistrerManche). */
  bilan() {
    return {
      fans: this.fans, depassements: this.depassements, drift: this.drift,
      ramasses: { ...this.ramasses },
      pieces: this.piecesOr, driftMax: this.driftMax, departParfait: this.departReussi, meilleurTour: this.meilleurTour,
      usure: 1 - this.joueur.durabilite / this.joueur.p.durabiliteMax,
      usureCoequipier: this.coequipier ? 1 - this.coequipier.durabilite / this.coequipier.p.durabiliteMax : undefined,
    };
  }

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
    const sx = this.secousse > 0 ? (Math.random() - 0.5) * this.secousse : 0;
    const sy = this.secousse > 0 ? (Math.random() - 0.5) * this.secousse : 0;
    const camX = Math.round(clamp(this.camera.x - W / 2 + sx, 0, cw - W));
    const camY = Math.round(clamp(this.camera.y - hVue / 2 + sy, 0, ch - hVue));

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
      dessinerPerso(ctx, tenue(Math.floor(s.phase * 7) + s.base), s.x, s.y + 3 - (saute ? 3 : 0), NOMS_DIRECTION[s.dir] || 'face', saute ? 1 : 0);
    }

    // Bonus : pièces qui tournent, disquettes qui flottent.
    for (const b of this.bonus) {
      if (b.pris || b.x < camX - 8 || b.x > camX + W + 8 || b.y < camY - 8 || b.y > camY + hVue + 8) continue;
      dessinerBonus(ctx, b, t);
    }

    // Voitures à l'échelle (vue 3/4 : ombre, flanc, dessus), de haut en bas de l'écran.
    const ordre = this.voitures.slice().sort((a, b) => a.y - b.y);
    for (const v of ordre) {
      if (v.x < camX - 40 || v.x > camX + W + 40 || v.y < camY - 40 || v.y > camY + hVue + 40) continue;
      if (v.aura > 0) {
        ctx.fillStyle = `rgba(244,114,182,${0.22 + 0.14 * Math.sin(t * 20)})`;
        ctx.beginPath(); ctx.ellipse(v.x, v.y + 2, 30, 24, v.angle, 0, Math.PI * 2); ctx.fill();
      }
      if (v.nitro > 0) {
        const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
        const l = 10 + Math.random() * 8;
        for (const [k, c] of [[1, '#ffe066'], [0.6, '#ff8a00']]) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(v.x - fx * 23 - fy * 7 * k, v.y - fy * 23 + fx * 7 * k + 3);
          ctx.lineTo(v.x - fx * (23 + l * k), v.y - fy * (23 + l * k) + 3);
          ctx.lineTo(v.x - fx * 23 + fy * 7 * k, v.y - fy * 23 - fx * 7 * k + 3);
          ctx.fill();
        }
      }
      const sprite = spriteVoitureTiny(v.couleur, v.joueur ? '#f2c14e' : v.coequipier ? '#f4f6fb' : null, v.looks || []);
      dessinerVoitureTiny(ctx, sprite, v.x, v.y, v.angle);
    }

    for (const v of this.voitures) if (v.rival) texte(ctx, 'RIVAL', v.x, v.y - 30, 7, '#ff8a80', 'center');
    if (this.coequipier) texte(ctx, `ÉQUIPE · ${this.coequipier.nom.split(' ')[0]}`, this.coequipier.x, this.coequipier.y - 30, 7, '#ffe066', 'center');

    // Repère au-dessus du joueur : une flèche jaune qui rebondit.
    const bx = Math.round(j.x), by = Math.round(j.y) - 34 + (Math.sin(t * 6) > 0 ? 1 : 0);
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

    for (const s of visibles) if (s.bulle) bulle(ctx, s.x, s.y - 16, s.bulle.texte);
    for (const m of this.messages) if (m.ancre) {
      const a = 1 - m.vie / m.max;
      texte(ctx, m.texte, m.ancre.x, m.ancre.y - 38 - a * 16, 10, m.couleur, 'center');
    }
    ctx.restore();

    this.dessinerInterface(ctx, W, H, t);
  }

  /** Portique de départ en vue 3/4 : deux poteaux posés au sol, la poutre et ses feux en hauteur. */
  dessinerPortique(ctx) {
    const H = 30;   // hauteur de la poutre au-dessus du sol, en pixels d'écran
    const a = pointA(this.circuit, 0, -(DEMI + 12));
    const b = pointA(this.circuit, 0, DEMI + 12);
    for (const p of [a, b]) {
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = 'rgba(38,24,46,0.3)'; ctx.fillRect(x - 3, y - 1, 9, 4);
      ctx.fillStyle = '#26182e'; ctx.fillRect(x - 3, y - H, 6, H + 1);
      ctx.fillStyle = '#c0cbdc'; ctx.fillRect(x - 2, y - H + 1, 4, H - 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - H + 1, 1, H - 1);
    }
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(a.x, a.y - H);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = '#26182e'; ctx.fillRect(-2, -6, l + 4, 12);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(-1, -5, l + 2, 10);
    for (let x = 0; x < l; x += 8) { ctx.fillStyle = (x / 8) % 2 ? '#26182e' : '#ffffff'; ctx.fillRect(x, 3, 8, 2); }
    const feux = 5;
    const allumes = this.etat === 'compte' ? clamp(Math.floor((this.temps + COMPTE_A_REBOURS) / (COMPTE_A_REBOURS / feux)) + 1, 0, feux) : 0;
    for (let i = 0; i < feux; i++) {
      let c = '#3a3550';
      if (this.etat === 'compte' && i < allumes) c = '#e4432d';
      if (this.etat !== 'compte' && this.temps < 2) c = '#5ad16a';
      ctx.fillStyle = '#26182e'; ctx.fillRect(l / 2 - feux * 5 + i * 10, -4, 8, 7);
      ctx.fillStyle = c; ctx.fillRect(l / 2 - feux * 5 + i * 10 + 1, -3, 6, 5);
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
    pastille(ctx, 6, 66, `${this.ramasses.argent} G · ${this.ramasses.recherche} PR`, '#7a5a12');
    if (this.driftEnCours > 0.5) texte(ctx, `DRIFT ${(this.driftEnCours * 6).toFixed(0)}`, W / 2, 44, 14, '#c4b5fd', 'center');

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
      ctx.fillStyle = v.joueur ? '#ffffff' : v.coequipier ? '#ffe066' : '#2a2838';
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
    ctx.drawImage(spritePerso(this.tenuePilote || { ...tenue(4), casque: '#e4432d', haut: '#f4f1e8' }, 'face', 0), -8, -8);
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
      // Flèche pointée vers le côté où l'on tourne : pointe à l'extérieur, tige vers le centre.
      for (let i = 0; i < 7; i++) ctx.fillRect(Math.round(cx + fleche * 8 - fleche * i * 2), Math.round(cy - i), 2, i * 2 + 1);
      ctx.fillRect(Math.round(fleche > 0 ? cx - 14 : cx + 4), Math.round(cy - 2), 10, 4);
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

/** Coin de la voiture le plus avancé dans la direction (nx, ny). */
function coinVers(v, nx, ny) {
  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  const sf = Math.sign(fx * nx + fy * ny) || 1, sl = Math.sign(-fy * nx + fx * ny) || 1;
  return { x: v.x + fx * DEMI_LONGUEUR * sf - fy * DEMI_LARGEUR * sl, y: v.y + fy * DEMI_LONGUEUR * sf + fx * DEMI_LARGEUR * sl };
}

/** Recouvrement de deux voitures (rectangles orientés) : normale de a vers b et profondeur. */
export function recouvrement(a, b) {
  const axes = [];
  for (const v of [a, b]) {
    const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
    axes.push([fx, fy], [-fy, fx]);
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  let meilleur = null;
  for (const [nx, ny] of axes) {
    const ra = etendue(a, nx, ny), rb = etendue(b, nx, ny);
    const d = dx * nx + dy * ny;
    const prof = ra + rb - Math.abs(d);
    if (prof <= 0) return null;
    if (!meilleur || prof < meilleur.prof) meilleur = { nx: d < 0 ? -nx : nx, ny: d < 0 ? -ny : ny, prof };
  }
  return meilleur;
}

function etendue(v, nx, ny) {
  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  return DEMI_LONGUEUR * Math.abs(fx * nx + fy * ny) + DEMI_LARGEUR * Math.abs(-fy * nx + fx * ny);
}

function dessinerBonus(ctx, b, t) {
  const x = Math.round(b.x), y = Math.round(b.y);
  if (b.type === 'piece') {
    // Pièce qui tourne : sa largeur varie.
    const w = Math.max(1, Math.round(Math.abs(Math.cos(t * 5 + b.x * 0.05)) * 3));
    ctx.fillStyle = 'rgba(30,28,40,0.3)'; ctx.fillRect(x - w, y + 4, w * 2 + 1, 2);
    ctx.fillStyle = '#7a5a12'; ctx.fillRect(x - w - 1, y - 4, w * 2 + 3, 9);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - w, y - 3, w * 2 + 1, 7);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x - w, y - 3, 1, 3);
  } else {
    const f = Math.sin(t * 4 + b.y) > 0 ? 1 : 0;
    ctx.fillStyle = 'rgba(30,28,40,0.3)'; ctx.fillRect(x - 4, y + 5, 9, 2);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(x - 5, y - 6 - f, 11, 11);
    ctx.fillStyle = '#2f6fdb'; ctx.fillRect(x - 4, y - 5 - f, 9, 9);
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(x - 2, y - 5 - f, 5, 3);
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x - 3, y + 0 - f, 7, 3);
  }
}
