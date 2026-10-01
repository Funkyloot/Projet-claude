/* main.js — assemblage : boucle, entrées, enchaînement des écrans.
 *
 * Le canevas fait toujours 320 × 568 pixels de jeu (format portrait) et
 * s'agrandit pour remplir la fenêtre sans lissage. Les menus HTML sont posés
 * par-dessus, à la même échelle.
 *
 * Commandes en course :
 *   tourner  : toucher la moitié gauche / droite · ← → · Q D · A D
 *   nitro    : bouton NITRO · Espace · ↑
 *   aura     : toucher le portrait · E
 *   pause    : bouton pause · Échap · P
 */

import { chargerAssets } from './assets.js';
import { genererCircuit } from './circuit.js';
import { rendreCircuit, miniCarte } from './rendu-circuit.js';
import { Course } from './course.js';
import { SceneGarage } from './scene-garage.js';
import { Son } from './son.js';
import {
  Interface, ecranTitre, ecranGarage, ecranBriefing, ecranChargement, ecranPause, ecranResultats, ecranFinGP,
} from './ecrans.js';
import * as P from './partie.js';

const W = 320, H = 568;
const PAS = 1 / 60;

class App {
  constructor() {
    this.canvas = document.getElementById('jeu');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = W;
    this.canvas.height = H;
    this.cadre = document.getElementById('cadre');
    this.ui = new Interface(document.getElementById('interface'));
    this.toastEl = document.getElementById('toast');
    this.son = new Son();
    this.partieSauvee = P.charger();
    this.partie = this.partieSauvee || P.nouvellePartie();
    this.son.actif = this.partie.son;
    this.course = null;
    this.pause = false;
    this.ecran = 'titre';
    this.pointeurs = new Map();
    this.touches = new Set();
    this.impulsions = { nitro: false, aura: false };

    this.redimensionner();
    window.addEventListener('resize', () => this.redimensionner());
    this.brancherEntrees();
  }

  async demarrer() {
    this.montrer(ecranChargement('Chargement…'));
    try {
      this.assets = await chargerAssets();
    } catch (err) {
      this.montrer(ecranChargement(`Impossible de charger les images (${err.message}).`));
      return;
    }
    this.scene = new SceneGarage(this.assets.urbain);
    this.titre();
    this.dernier = performance.now();
    this.accu = 0;
    requestAnimationFrame((t) => this.boucle(t));
  }

  redimensionner() {
    const echelle = Math.min(window.innerWidth / W, window.innerHeight / H);
    const w = Math.floor(W * echelle), h = Math.floor(H * echelle);
    this.cadre.style.width = `${w}px`;
    this.cadre.style.height = `${h}px`;
    this.cadre.style.setProperty('--u', `${w / W}px`);
    this.echelle = w / W;
  }

  // --- Boucle --------------------------------------------------------------------

  boucle(t) {
    const dt = Math.min(0.1, (t - this.dernier) / 1000);
    this.dernier = t;
    const secondes = t / 1000;
    if (this.course && this.ecran === 'course') {
      if (!this.pause) {
        this.accu += dt;
        while (this.accu >= PAS) {
          this.course.maj(PAS, this.entrees());
          this.accu -= PAS;
        }
      }
      this.course.dessiner(this.ctx, W, H, secondes);
      if (this.course.etat === 'fini' && !this.pause) this.finManche();
    } else if (this.scene) {
      this.scene.maj(dt);
      this.scene.dessiner(this.ctx, W, H, secondes, this.partie, P.voitureActive(this.partie));
    }
    requestAnimationFrame((tt) => this.boucle(tt));
  }

  // --- Entrées --------------------------------------------------------------------

  brancherEntrees() {
    const clavier = {
      ArrowLeft: 'gauche', KeyA: 'gauche', KeyQ: 'gauche',
      ArrowRight: 'droite', KeyD: 'droite',
    };
    window.addEventListener('keydown', (ev) => {
      this.son.reveiller();
      if (this.ecran !== 'course') return;
      if (clavier[ev.code]) { this.touches.add(clavier[ev.code]); ev.preventDefault(); }
      if (ev.repeat) return;
      if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW' || ev.code === 'KeyZ') { this.impulsions.nitro = true; ev.preventDefault(); }
      if (ev.code === 'KeyE' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') this.impulsions.aura = true;
      if (ev.code === 'Escape' || ev.code === 'KeyP') this.basculerPause();
    });
    window.addEventListener('keyup', (ev) => {
      if (clavier[ev.code]) this.touches.delete(clavier[ev.code]);
    });
    window.addEventListener('blur', () => { this.touches.clear(); this.pointeurs.clear(); });

    const position = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
    };
    const dans = (p, z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
    this.canvas.addEventListener('pointerdown', (ev) => {
      this.son.reveiller();
      if (this.ecran !== 'course' || this.pause) return;
      ev.preventDefault();
      const p = position(ev);
      const z = this.course.zones(W, H);
      if (dans(p, z.pause)) { this.basculerPause(); return; }
      if (dans(p, z.nitro)) { this.impulsions.nitro = true; return; }
      if (dans(p, z.portrait)) { this.impulsions.aura = true; return; }
      this.canvas.setPointerCapture?.(ev.pointerId);
      this.pointeurs.set(ev.pointerId, p);
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (this.pointeurs.has(ev.pointerId)) this.pointeurs.set(ev.pointerId, position(ev));
    });
    const lacher = (ev) => this.pointeurs.delete(ev.pointerId);
    this.canvas.addEventListener('pointerup', lacher);
    this.canvas.addEventListener('pointercancel', lacher);
    this.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('click', () => this.son.reveiller(), { once: true });
  }

  entrees() {
    let gauche = this.touches.has('gauche'), droite = this.touches.has('droite');
    for (const p of this.pointeurs.values()) {
      if (p.x < W / 2) gauche = true; else droite = true;
    }
    const e = { gauche, droite, nitro: this.impulsions.nitro, aura: this.impulsions.aura };
    this.impulsions.nitro = false;
    this.impulsions.aura = false;
    return e;
  }

  // --- Écrans ---------------------------------------------------------------------

  montrer(ecran) { this.ui.montrer(ecran); }

  toast(texte) {
    this.toastEl.textContent = texte;
    this.toastEl.hidden = false;
    clearTimeout(this.toastMinuteur);
    this.toastMinuteur = setTimeout(() => { this.toastEl.hidden = true; }, 2200);
  }

  sauver() { P.sauver(this.partie); this.partieSauvee = this.partie; }

  titre() { this.ecran = 'titre'; this.montrer(ecranTitre(this)); }

  nouvellePartie() {
    this.partie = P.nouvellePartie();
    this.son.actif = this.partie.son;
    this.sauver();
    this.garage();
  }

  continuer() {
    this.partie = this.partieSauvee;
    // Une course interrompue (onglet fermé) se reprend au briefing.
    if (this.partie.gp) { this.briefing(this.partie.gp.id, true); return; }
    this.garage();
  }

  garage() {
    this.ecran = 'garage';
    this.course = null;
    this.montrer(ecranGarage(this));
  }

  /** Actions de gestion : renvoie vrai si elles ont réussi, puis sauvegarde. */
  action(nom, arg) {
    const f = {
      acheter: P.acheter, construire: P.construire, ameliorer: P.ameliorer, reparer: P.reparer,
      inscrire: P.inscrire, candidater: P.deposerCandidature,
    }[nom];
    const ok = f(this.partie, arg);
    if (ok) this.sauver();
    return ok;
  }

  jourSuivant() {
    const nouvelles = P.jourSuivant(this.partie);
    this.sauver();
    this.garage();
    if (!nouvelles.length) this.toast(`Jour ${this.partie.jour} : rien de neuf au garage.`);
  }

  briefing(gpId, reprise = false) {
    if (!reprise || !this.partie.gp) P.commencerGP(this.partie, gpId);
    this.sauver();
    const gp = P.grandPrix(gpId);
    const manche = this.partie.gp.manche;
    const def = gp.manches[manche];
    this.circuit = genererCircuit(def, gp.niveau <= 2 ? 100 : 88);
    const apercu = miniCarte(this.circuit, 150, 150).canvas.toDataURL();
    this.ecran = 'briefing';
    this.montrer(ecranBriefing(this, gp, manche, apercu));
  }

  depart() {
    this.montrer(ecranChargement('Préparation du circuit…'));
    // Laisse le message s'afficher avant le calcul du décor (une demi-seconde).
    setTimeout(() => this.lancerCourse(), 30);
  }

  lancerCourse() {
    const gp = P.grandPrix(this.partie.gp.id);
    const def = gp.manches[this.partie.gp.manche];
    const decor = rendreCircuit(this.circuit, this.assets.urbain, gp.niveau);
    const v = P.voitureActive(this.partie);
    this.adversaires = P.adversaires(gp);
    this.course = new Course({
      circuit: this.circuit,
      decor,
      planche: this.assets.urbain,
      tours: def.tours,
      joueur: { physique: v.physique, couleur: v.couleur, pilote: this.partie.pilote, nitros: 2 },
      adversaires: this.adversaires,
      aide: this.partie.aide,
      son: this.son,
      niveau: gp.niveau,
    });
    this.course.joueur.durabilite = v.physique.durabiliteMax * (1 - v.usure);
    this.pause = false;
    this.accu = 0;
    this.pointeurs.clear();
    this.touches.clear();
    this.ecran = 'course';
    this.ui.vider();
  }

  basculerPause() {
    if (!this.course) return;
    if (this.pause) { this.reprendre(); return; }
    this.pause = true;
    this.montrer(ecranPause(this));
  }

  reprendre() {
    this.pause = false;
    this.pointeurs.clear();
    this.ui.vider();
  }

  abandonnerCourse() {
    // Abandon : dernière place, la voiture garde son usure.
    this.pause = false;
    const c = this.course;
    c.joueur.progres = -1e9;
    c.joueur.fini = false;
    c.joueur.tempsArrivee = Infinity;
    this.finManche(true);
  }

  finManche(abandon = false) {
    const c = this.course;
    if (!c || this.ecran !== 'course') return;
    this.ecran = 'resultats';
    const gp = P.grandPrix(this.partie.gp.id);
    const noms = this.noms();
    let res = c.resultats();
    if (abandon) {
      res = res.filter((r) => !r.voiture.joueur).concat(res.filter((r) => r.voiture.joueur));
      res.forEach((r, i) => { r.place = i + 1; });
    }
    const resultats = res.map((r) => {
      const id = r.voiture.joueur ? 'joueur' : r.voiture.equipe;
      return { id, ...noms[id], place: r.place, temps: r.temps, ecart: r.ecart };
    });
    const usure = 1 - c.joueur.durabilite / c.joueur.p.durabiliteMax;
    const gain = P.enregistrerManche(this.partie, resultats, c.fans, usure);
    this.sauver();
    const general = P.classementGP(this.partie, noms);
    this.montrer(ecranResultats(this, { gp, manche: this.partie.gp.manche, resultats, general, gain, depassements: c.depassements }));
  }

  noms() {
    const noms = { joueur: { nom: this.partie.pilote, ecurie: 'Garage Piston', couleur: P.voitureActive(this.partie).couleur } };
    for (const a of this.adversaires) noms[a.equipe] = { nom: a.nom, ecurie: a.ecurie, couleur: a.couleur };
    return noms;
  }

  mancheSuivante() {
    this.course = null;
    this.briefing(this.partie.gp.id, true);
  }

  finGP() {
    const gp = P.grandPrix(this.partie.gp.id);
    const general = P.classementGP(this.partie, this.noms());
    const place = general.findIndex((x) => x.id === 'joueur') + 1;
    const { gains, fans } = this.partie.gp;
    P.terminerGP(this.partie, place);
    this.sauver();
    this.course = null;
    this.ecran = 'fin';
    if (place === 1) this.son.fanfare();
    this.montrer(ecranFinGP(this, { gp, general, place, gains, fans }));
  }

  annulerGP() {
    this.partie.gp = null;
    this.sauver();
    this.montrer(ecranGarage(this));
    this.ecran = 'garage';
  }

  abandonnerGP() {
    this.partie.gp = null;
    this.sauver();
    this.garage();
  }
}

const app = new App();
app.demarrer();
window.pistonville = app;
