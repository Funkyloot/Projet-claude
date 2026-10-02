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
import { Course, zonesPanneau, HAUTEUR_PANNEAU } from './course.js';
import { SceneGarage } from './scene-garage.js';
import { interieur } from './interieurs.js';
import { definirPlanches, modeleVoiture } from './tiny.js';
import { Ville } from './ville.js';
import { Son } from './son.js';
import { lireReglages, ecrireReglages } from './reglages.js';
import {
  Interface, ecranTitre, ecranGarage, ecranBriefing, ecranChargement, ecranPause, ecranPauseVille, ecranReglages, ecranResultats, ecranFinGP,
  ecranConstruction, ecranRang, texteRecompense, ecranCelebration, ecranCeremonie, ecranFinCarriere, ecranCadeau, ecranBureau, ecranBoutique, ecranPieces, ecranTombola, ecranCafe, ecranFinBalade,
} from './ecrans.js';
import * as P from './partie.js';
import * as G from './garage.js';
import * as PL from './pilotes.js';
import * as Nuage from './nuage.js';
import { ecranPlacement, ecranFicheBatiment, ecranConstruire } from './ecrans-garage.js';

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
    this.reglages = lireReglages();
    this.son.regler(this.reglages);
    // Le bouton Paramètres (engrenage de la barre, écran titre) marche partout et ramène où l'on était.
    this.ui.globales.reglages = () => {
      const ici = this.dernierEcran;
      this.montrer(ecranReglages(this, () => this.montrer(ici)));
    };
    this.partieSauvee = P.charger();
    this.partie = this.partieSauvee || P.nouvellePartie();
    this.course = null;
    this.pause = false;
    this.ecran = 'titre';
    this.pointeurs = new Map();
    this.touches = new Set();
    this.impulsions = { nitro: false, aura: false, action: false };

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
    definirPlanches(this.assets.urbain, this.assets.tiny);   // personnages Kenney RPG Urban
    this.scene = new SceneGarage(this.assets.urbain, this.assets.tiny);
    this.titre();
    this.dernier = performance.now();
    this.accu = 0;
    requestAnimationFrame((t) => this.boucle(t));
    this.brancherSauvegardes();
    // La copie du serveur (s'il y en a une) gagne si elle est plus récente.
    const distante = await Nuage.lire();
    if (distante && (!this.partieSauvee || (distante.horodatage || 0) > (this.partieSauvee.horodatage || 0))) {
      const p = P.restaurer(distante);
      if (p) {
        this.partieSauvee = p;
        if (this.ecran === 'titre') { this.partie = p; this.titre(); }
      }
    }
  }

  /**
   * Sauvegardes de secours : quand le jeu passe en arrière-plan ou se ferme
   * (téléphone verrouillé, appli quittée), et toutes les 15 s au garage.
   */
  brancherSauvegardes() {
    const auSecours = () => {
      if (!this.partie || this.ecran === 'titre') return;
      P.sauver(this.partie);
      this.partieSauvee = this.partie;
      Nuage.ecrireMaintenant(this.partie);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      auSecours();
      // Appel, notification, appli quittée : la course ou la balade se met en pause.
      if ((this.ecran === 'course' || this.ecran === 'ville') && !this.pause) this.basculerPause();
    });
    window.addEventListener('pagehide', auSecours);
    setInterval(() => { if (this.ecran === 'garage' && this.partie === this.partieSauvee) this.sauver(); }, 15000);
  }

  /**
   * Bouton « retour » d'Android (appelé par l'application) : met en pause,
   * ou referme l'écran ouvert. Renvoie false quand il n'y a plus rien à
   * fermer : l'application passe alors en arrière-plan.
   */
  boutonRetour() {
    if ((this.ecran === 'course' || this.ecran === 'ville') && !this.pause && !this.ui.racine.innerHTML) { this.basculerPause(); return true; }
    const r = this.ui.racine;
    const bouton = !r.hidden && r.querySelector('[data-action=retour], [data-action=reprendre], [data-action=annuler], [data-action=suite], [data-action=sortir]');
    if (bouton) { bouton.click(); return true; }
    if (this.ecran !== 'titre' && this.ecran !== 'garage' && this.ecran !== 'course' && this.ecran !== 'ville') { this.garage(); return true; }
    return false;
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

  /** Les réglages ont changé : volumes, vibrations ; on les garde sur l'appareil. */
  appliquerReglages() {
    this.son.regler(this.reglages);
    ecrireReglages(this.reglages);
  }

  boucle(t) {
    // Économie de batterie : une image sur deux (le temps écoulé est rattrapé à la suivante).
    if (this.reglages.economie && (this.imageSautee = !this.imageSautee)) { requestAnimationFrame((tt) => this.boucle(tt)); return; }
    // La musique suit l'écran : un air pour la course, un pour la ville, un pour le reste.
    this.son.musique(this.ecran === 'course' ? 'course' : this.ecran === 'ville' ? 'ville' : 'garage');
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
    } else if (this.ville && this.ecran === 'ville') {
      if (!this.pause) {
        this.accu += dt;
        while (this.accu >= PAS) {
          this.ville.maj(PAS, this.entrees());
          this.accu -= PAS;
        }
      }
      this.ville.dessiner(this.ctx, W, H, secondes);
      if (this.ville.entree && !this.ui.racine.innerHTML) this.entrerBatiment(this.ville.entree);
      if (this.ville.fini && !this.villeFinie) this.finBalade();
    } else if (this.scene) {
      this.scene.maj(dt, this.partie);
      this.scene.dessiner(this.ctx, W, H, secondes, this.partie);
    }
    requestAnimationFrame((tt) => this.boucle(tt));
  }

  // --- Entrées --------------------------------------------------------------------

  brancherEntrees() {
    const clavier = {
      ArrowLeft: 'gauche', KeyA: 'gauche', KeyQ: 'gauche',
      ArrowRight: 'droite', KeyD: 'droite',
      ArrowDown: 'frein', KeyS: 'frein',
      ArrowUp: 'haut', KeyW: 'haut', KeyZ: 'haut',
    };
    window.addEventListener('keydown', (ev) => {
      this.son.reveiller();
      if (this.ecran !== 'course' && this.ecran !== 'ville') return;
      if (clavier[ev.code]) { this.touches.add(clavier[ev.code]); ev.preventDefault(); }
      if (ev.repeat) return;
      if (ev.code === 'Escape' || ev.code === 'KeyP') { this.basculerPause(); return; }
      if (this.ecran === 'ville') {
        // E ou Entrée : descendre de voiture / y remonter.
        if (ev.code === 'KeyE' || ev.code === 'Enter') this.impulsions.action = true;
        return;
      }
      if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW' || ev.code === 'KeyZ') { this.impulsions.nitro = true; ev.preventDefault(); }
      if (ev.code === 'KeyE' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') this.impulsions.aura = true;
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
    // Garage : toucher un bâtiment, faire glisser pour défiler, choisir une case en construction.
    const garageTactile = { id: null, y0: 0, y: 0, glisse: false };
    this.canvas.addEventListener('pointerdown', (ev) => {
      if (this.ecran !== 'garage') return;
      const p = position(ev);
      Object.assign(garageTactile, { id: ev.pointerId, y0: p.y, y: p.y, glisse: false });
      this.canvas.setPointerCapture?.(ev.pointerId);
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (this.ecran !== 'garage' || garageTactile.id !== ev.pointerId) return;
      const p = position(ev);
      if (Math.abs(p.y - garageTactile.y0) > 8) garageTactile.glisse = true;
      if (garageTactile.glisse) this.scene.defiler(garageTactile.y - p.y, this.partie, H - 290);
      garageTactile.y = p.y;
    });
    this.canvas.addEventListener('pointerup', (ev) => {
      if (this.ecran !== 'garage' || garageTactile.id !== ev.pointerId) return;
      garageTactile.id = null;
      if (!garageTactile.glisse) this.toucherGarage(position(ev));
    });
    this.canvas.addEventListener('wheel', (ev) => {
      if (this.ecran === 'garage') { this.scene.defiler(ev.deltaY * 0.5, this.partie, H - 290); ev.preventDefault(); }
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', (ev) => {
      this.son.reveiller();
      if ((this.ecran !== 'course' && this.ecran !== 'ville') || this.pause) return;
      ev.preventDefault();
      const p = position(ev);
      const z = zonesPanneau(W, H);
      if (dans(p, z.pause)) { this.basculerPause(); return; }
      if (this.ecran === 'ville') {
        const aPied = !!this.ville.pieton;
        // DESCENDRE / À PIED (à la place du compteur), et VOITURE au milieu quand on marche.
        if (dans(p, z.action) || dans(p, z.portrait) || (aPied && dans(p, z.centre))) { this.impulsions.action = true; return; }
        // Le bouton du milieu freine (et recule si on le garde) : comme les deux côtés à la fois.
        if (dans(p, z.centre)) p.frein = true;
        // À pied, toucher la carte (au-dessus du panneau) désigne où marcher.
        if (p.y < H - HAUTEUR_PANNEAU) p.carte = true;
        this.canvas.setPointerCapture?.(ev.pointerId);
        this.pointeurs.set(ev.pointerId, p);
        return;
      }
      if (dans(p, z.centre)) { this.impulsions.nitro = true; return; }
      if (dans(p, z.portrait)) { this.impulsions.aura = true; return; }
      this.canvas.setPointerCapture?.(ev.pointerId);
      this.pointeurs.set(ev.pointerId, p);
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      const avant = this.pointeurs.get(ev.pointerId);
      if (avant) this.pointeurs.set(ev.pointerId, { ...position(ev), frein: avant.frein, carte: avant.carte });
    });
    const lacher = (ev) => this.pointeurs.delete(ev.pointerId);
    this.canvas.addEventListener('pointerup', lacher);
    this.canvas.addEventListener('pointercancel', lacher);
    this.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('click', () => this.son.reveiller(), { once: true });
  }

  entrees() {
    let gauche = this.touches.has('gauche'), droite = this.touches.has('droite');
    const aPied = this.ecran === 'ville' && this.ville?.pieton;
    let toucher = null;
    if (aPied) {
      // À pied : les flèches font marcher, le doigt sur la carte désigne où aller.
      for (const p of this.pointeurs.values()) if (p.carte) toucher = { x: p.x, y: p.y };
      const e = { gauche, droite, haut: this.touches.has('haut'), bas: this.touches.has('frein'), toucher, action: this.impulsions.action };
      this.impulsions.action = false;
      return e;
    }
    if (this.touches.has('frein') && this.ecran === 'ville') { gauche = true; droite = true; }
    for (const p of this.pointeurs.values()) {
      if (p.frein) { gauche = true; droite = true; } else if (p.x < W / 2) gauche = true; else droite = true;
    }
    const e = { gauche, droite, nitro: this.impulsions.nitro, aura: this.impulsions.aura, action: this.impulsions.action };
    this.impulsions.nitro = false;
    this.impulsions.aura = false;
    this.impulsions.action = false;
    return e;
  }

  // --- Écrans ---------------------------------------------------------------------

  montrer(ecran) {
    if (ecran?.html) this.dernierEcran = ecran;
    // Dans un lieu de la ville : la vue de la pièce en tête de son menu.
    const lieu = this.ecran === 'ville' && this.ville?.entree?.id;
    const image = lieu && ecran?.html && interieur(lieu, this.assets?.tiny);
    const balise = image && ecran.html.match(/<div class="(?:ecran(?! (?:celebration|chargement))[^"]*|defile)">/);
    if (balise) ecran = { ...ecran, html: ecran.html.replace(balise[0], `${balise[0]}<img class="interieur" src="${image}" alt="">`) };
    this.ui.montrer(ecran);
  }

  toast(texte) {
    this.toastEl.textContent = texte;
    this.toastEl.hidden = false;
    clearTimeout(this.toastMinuteur);
    this.toastMinuteur = setTimeout(() => { this.toastEl.hidden = true; }, 2200);
  }

  sauver() {
    for (const o of P.verifierObjectifs(this.partie)) this.annoncerObjectif(o);
    P.sauver(this.partie);
    this.partieSauvee = this.partie;
    Nuage.ecrire(this.partie);
  }

  /** Bandeau « Objectif atteint » en haut de l'écran, sans bloquer le jeu. */
  annoncerObjectif(o) {
    this.fileObjectifs = this.fileObjectifs || [];
    this.fileObjectifs.push(o);
    if (this.fileObjectifs.length > 1) return;
    const suivant = () => {
      const x = this.fileObjectifs[0];
      if (!x) return;
      const el = document.getElementById('objectif');
      el.innerHTML = `<small>OBJECTIF ATTEINT !</small><b>${x.titre.replace(/</g, '&lt;')}</b><span>${texteRecompense(x.recompense)}</span>`;
      el.hidden = false;
      el.classList.remove('entre'); void el.offsetWidth; el.classList.add('entre');
      this.son.niveau();
      setTimeout(() => {
        el.hidden = true;
        this.fileObjectifs.shift();
        suivant();
      }, 2600);
    };
    suivant();
  }

  /**
   * Bouton « Mettre à jour le jeu » : le serveur cherche la dernière version et
   * l'installe ; on attend qu'il ait fini, puis on recharge la page (la partie,
   * déjà copiée sur le serveur, est retrouvée telle quelle).
   */
  async mettreAJour() {
    const avant = await Nuage.versionServeur();
    if (!avant) { this.toast('Mise à jour impossible ici : le jeu n\'est pas servi par ton serveur Pistonville.'); return; }
    if (this.partie) await Nuage.ecrireMaintenant(this.partie);
    if (!(await Nuage.demanderMiseAJour())) { this.toast('Le serveur n\'a pas répondu. Réessaie dans un instant.'); return; }
    this.montrer(ecranChargement('Le serveur cherche une nouvelle version…'));
    const debut = Date.now();
    let vuEnCours = false;
    while (Date.now() - debut < 4 * 60 * 1000) {
      await new Promise((ok) => setTimeout(ok, 2500));
      const v = await Nuage.versionServeur();   // null pendant que le jeu redémarre
      if (!v) { vuEnCours = true; continue; }
      if (v.version && v.version !== avant.version) {
        this.montrer(ecranChargement('Nouvelle version installée ! Redémarrage…'));
        try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* pas de service worker */ }
        location.reload();
        return;
      }
      if (v.enCours) { vuEnCours = true; continue; }
      // La demande a été traitée et la version n'a pas changé : rien de neuf.
      if (vuEnCours || Date.now() - debut > 20000) {
        this.titre();
        this.toast(`Le jeu est déjà à jour (version ${v.version.slice(0, 7)}).`);
        return;
      }
    }
    this.titre();
    this.toast('Le serveur ne répond pas : la mise à jour automatique (toutes les 10 min) prendra le relais.');
  }

  titre() { this.ecran = 'titre'; this.scene.placement = null; this.scene.selection = null; this.montrer(ecranTitre(this)); }

  nouvellePartie() {
    this.partie = P.nouvellePartie();
    this.sauver();
    this.cadeauPuis(() => this.garage());
  }

  continuer() {
    this.partie = this.partieSauvee;
    // Une course interrompue (onglet fermé) se reprend au briefing.
    this.cadeauPuis(() => {
      if (this.partie.gp) { this.briefing(this.partie.gp.id, true); return; }
      this.garage();
    });
  }

  /** Cadeau du jour (vrai calendrier), puis la suite. */
  cadeauPuis(suite) {
    const c = P.cadeauDuJour(this.partie);
    if (!c) { suite(); return; }
    this.sauver();
    this.ecran = 'garage';
    this.montrer(ecranCadeau(this, c, suite));
  }

  garage() {
    this.ecran = 'garage';
    this.course = null;
    this.ville = null;
    this.scene.placement = null;
    // Fin de saison : la cérémonie passe avant tout.
    if (this.partie.ceremonie) {
      const c = this.partie.ceremonie;
      this.montrer(ecranCeremonie(this, c, () => {
        const rangs = P.recevoirCeremonie(this.partie);
        this.sauver();
        this.apresRangs(rangs, () => this.garage());
      }));
      return;
    }
    if (this.partie.finCarriere) {
      const r = P.terminerCarriere(this.partie);
      this.sauver();
      this.montrer(ecranFinCarriere(this, r, {
        plus: () => { this.partie = P.nouvellePartiePlus(this.partie); this.sauver(); this.garage(); },
        continuer: () => this.garage(),
      }));
      return;
    }
    this.montrer(ecranGarage(this));
  }

  /** Actions de gestion : renvoie vrai si elles ont réussi, puis sauvegarde. */
  action(nom, arg) {
    const f = {
      acheter: P.acheter, ameliorer: P.ameliorer, reparer: P.reparer, peindre: P.peindre,
      inscrire: P.inscrire, candidater: P.deposerCandidature,
      acheterPiece: (p, [id, remise]) => P.acheterPiece(p, id, remise), monter: P.monter, demonter: P.demonter,
      vendrePiece: P.vendrePiece, rechercher: P.rechercher, tirerTombola: P.tirerTombola, boireCafe: P.boireCafe,
      signerSponsor: P.signerSponsor,
      agrandirTerrain: G.agrandirTerrain, ameliorerBatiment: G.ameliorerBatiment, vendreBatiment: G.vendreBatiment,
      affecter: (p, [s, b]) => G.affecter(p, s, b), recruter: G.recruter, embaucher: G.embaucher,
      licencier: G.licencier, former: G.former, ameliorerPiece: P.ameliorerPiece,
      entrainerPilote: PL.entrainer, recruterPilotes: PL.recruterPilotes, engagerPilote: PL.engagerPilote,
      renvoyerPilote: PL.renvoyerPilote, choisirTitulaire: PL.choisirTitulaire, choisirSecond: PL.choisirSecond,
      choisirVoitureSecond: PL.choisirVoitureSecond,
      vendreVoiture: P.vendreVoiture, demonterVoiture: P.demonterVoiture,
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

  /** Enchaîne les écrans de montée de rang, puis `suite`. */
  apresRangs(rangs, suite) {
    if (!rangs || !rangs.length) { suite(); return; }
    const [m, ...reste] = rangs;
    this.sauver();
    this.son.niveau();
    this.montrer(ecranRang(this, m, () => this.apresRangs(reste, suite)));
  }

  /** Construction : la voiture apparaît sur le pont pendant l'animation, puis on passe au lendemain. */
  construireVoiture(idModele, couleur, enVille) {
    const r = P.construire(this.partie, idModele, couleur);
    if (!r) return;
    this.son.caisse();
    this.sauver();
    const brute = this.partie.garage.find((g) => g.uid === r.uid);
    const v = P.decrireVoiture(this.partie, brute);
    if (enVille) {
      // Depuis la ville : la balade s'arrête, on file au garage.
      this.ville = null;
    }
    this.ecran = 'garage';
    this.scene.construire(v, 5.4);
    this.montrer(ecranConstruction(this, v, () => {
      this.scene.finConstruction();
      const nouvelles = P.jourSuivant(this.partie);
      this.partie.nouvelles = [{ titre: 'Voiture terminée', texte: `${v.nom} sort de l'atelier. Une journée de travail !` }, ...nouvelles];
      this.sauver();
      this.garage();
    }));
  }

  // --- Ville -------------------------------------------------------------------------

  sortirEnVille() {
    if (!P.peutSortir(this.partie)) return;
    const v = P.voitureActive(this.partie);
    if (!v) return;
    const pilote = PL.titulaire(this.partie);
    this.ville = new Ville({
      planche: this.assets.urbain, tiny: this.assets.tiny, voiture: v, son: this.son, graine: this.partie.jour * 101 + 7, memoire: this.partie.memoireVille,
      pilote: { nom: pilote?.nom || 'Pilote', tenue: PL.tenuePilote(pilote) },
    });
    this.villeFinie = false;
    this.pause = false;
    this.accu = 0;
    this.pointeurs.clear();
    this.touches.clear();
    this.ecran = 'ville';
    this.ui.vider();
    this.toast('Gare-toi sur une zone jaune pour entrer.');
  }

  entrerBatiment(porte) {
    const retour = () => { this.ville.sortir(); this.pointeurs.clear(); this.touches.clear(); this.ui.vider(); };
    this.pointeurs.clear();
    const ecrans = {
      garage: () => { this.ville.temps = Math.max(this.ville.temps, 1e9); this.ville.entree = null; this.ville.fini = true; return null; },
      bureau: () => ecranBureau(this, retour),
      concession: () => ecranBoutique(this, retour, true),
      pieces: () => ecranPieces(this, { enVille: true, retour }),
      tombola: () => ecranTombola(this, retour),
      cafe: () => ecranCafe(this, retour),
    };
    const ecran = ecrans[porte.id]();
    if (ecran) this.montrer(ecran);
  }

  finBalade() {
    this.villeFinie = true;
    const g = this.ville.bilan();
    const rangs = P.finBalade(this.partie, g);
    this.sauver();
    this.son.fanfare();
    this.montrer(ecranFinBalade(this, g, () => this.apresRangs(rangs, () => this.garage())));
  }

  briefing(gpId, reprise = false) {
    // Partir courir depuis la ville termine la balade (les gains sont gardés).
    if (this.ville && !this.villeFinie) { this.villeFinie = true; P.finBalade(this.partie, this.ville.bilan()); }
    this.ville = null;
    // Une manche par soir : la course termine la journée.
    if (!P.peutCourir(this.partie)) {
      this.toast('Une seule course par soir : la prochaine, c’est demain soir.');
      this.garage();
      return;
    }
    // Le Grand Prix déjà commencé reprend là où il en était.
    if (!(this.partie.gp && this.partie.gp.id === gpId)) P.commencerGP(this.partie, gpId);
    this.sauver();
    const gp = P.grandPrix(gpId);
    const manche = this.partie.gp.manche;
    const def = gp.manches[manche];
    this.circuit = genererCircuit(def, gp.niveau <= 2 ? 150 : 132);
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
    const decor = rendreCircuit(this.circuit, this.assets.urbain, gp.niveau, this.assets.tiny);
    const v = P.voitureActive(this.partie);
    const eng = PL.engagement(this.partie);
    this.adversaires = P.adversaires(gp, this.partie.gp.manche);
    // Le second pilote de l'écurie : sa voiture, décrite avec ses propres qualités de pilote.
    let coequipier = null;
    if (eng.second) {
      const v2 = P.decrireVoiture(this.partie, eng.voitureSecond, eng.second);
      coequipier = {
        physique: v2.physique, couleur: v2.couleur, looks: v2.looks, nom: eng.second.nom, surfaces: v2.surfaces, modele: modeleVoiture(v2.profil, v2.id),
        talent: PL.talentPilote(eng.second) * 0.5, usure: eng.voitureSecond.usure,
      };
    }
    this.course = new Course({
      circuit: this.circuit,
      decor,
      planche: this.assets.urbain,
      tiny: this.assets.tiny,
      tours: def.tours,
      joueur: {
        physique: v.physique, couleur: v.couleur, looks: v.looks, modele: modeleVoiture(v.profil, v.id), pilote: eng.titulaire?.nom || 'Pilote', tenue: PL.tenuePilote(eng.titulaire),
        nitros: v.nitros, nitroDuree: v.nitroDuree, surfaces: v.surfaces,
      },
      adversaires: this.adversaires,
      coequipier,
      aide: this.partie.aide,
      son: this.son,
      niveau: gp.niveau,
    });
    this.course.joueur.durabilite = v.physique.durabiliteMax * (1 - v.usure);
    if (this.course.coequipier) this.course.coequipier.durabilite = coequipier.physique.durabiliteMax * (1 - coequipier.usure);
    this.pause = false;
    this.accu = 0;
    this.pointeurs.clear();
    this.touches.clear();
    this.ecran = 'course';
    this.ui.vider();
  }

  basculerPause() {
    if (this.ecran !== 'course' && this.ecran !== 'ville') return;
    if (this.ecran === 'ville' && (this.ville.entree || this.ville.fini)) return;
    if (this.pause) { this.reprendre(); return; }
    this.pause = true;
    this.pointeurs.clear();
    this.touches.clear();
    this.montrer(this.ecran === 'ville' ? ecranPauseVille(this) : ecranPause(this));
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
    const gain = P.enregistrerManche(this.partie, resultats, c.bilan());
    this.sauver();
    const general = P.classementGP(this.partie, noms);
    this.montrer(ecranResultats(this, { gp, manche: this.partie.gp.manche, resultats, general, gain, depassements: c.depassements, drift: c.drift }));
  }

  noms() {
    const eng = PL.engagement(this.partie);
    const noms = {
      joueur: { nom: eng.titulaire?.nom || 'Pilote', ecurie: 'Garage Piston', couleur: P.voitureActive(this.partie)?.couleur || '#f2c14e' },
      coequipier: { nom: eng.second?.nom || 'Second pilote', ecurie: 'Garage Piston', couleur: eng.voitureSecond?.couleur || '#f2c14e' },
    };
    // Recalculées depuis le Grand Prix : marche aussi après une reprise de partie.
    const gp = this.partie.gp && P.grandPrix(this.partie.gp.id);
    for (const a of (gp ? P.adversaires(gp) : this.adversaires || [])) noms[a.equipe] = { nom: a.nom, ecurie: a.ecurie, couleur: a.couleur };
    return noms;
  }

  /** Après une manche (pas la dernière) : la soirée est finie, on passe au lendemain matin. */
  mancheSuivante() {
    this.course = null;
    const gp = P.grandPrix(this.partie.gp.id);
    P.jourSuivant(this.partie);
    this.partie.nouvelles.unshift({ titre: gp.nom, texte: `Manche ${this.partie.gp.manche + 1} sur ${gp.manches.length} : ce soir ! Prépare la voiture dans la journée.` });
    this.sauver();
    this.garage();
  }

  /** Bouton du garage : courir la manche suivante du Grand Prix en cours. */
  courirCeSoir() {
    if (!this.partie.gp) return;
    this.briefing(this.partie.gp.id, true);
  }

  finGP() {
    const gp = P.grandPrix(this.partie.gp.id);
    const general = P.classementGP(this.partie, this.noms());
    // Le trophée revient à l'écurie : on garde la meilleure de ses deux voitures.
    const place = general.findIndex((x) => x.id === 'joueur' || x.id === 'coequipier') + 1;
    const { gains, fans } = this.partie.gp;
    P.terminerGP(this.partie, place);
    this.sauver();
    this.course = null;
    this.ecran = 'fin';
    if (place === 1) this.son.fanfare();
    this.montrer(ecranFinGP(this, { gp, general, place, gains, fans }));
  }

  // --- Garage : terrain, construction, personnel -------------------------------------

  toucherGarage(pt) {
    const sc = this.scene;
    if (sc.placement) {
      const c = sc.caseA(this.partie, pt.x, pt.y);
      if (!c) return;
      const d = G.batiment(sc.placement.id);
      // La case touchée devient le centre du bâtiment (tant qu'il reste sur le terrain).
      sc.placement.x = Math.max(0, Math.min(G.COLONNES_TERRAIN - d.l, c.x - Math.floor((d.l - 1) / 2)));
      sc.placement.y = Math.max(0, Math.min(this.partie.terrain.lignes - d.h, c.y - Math.floor((d.h - 1) / 2)));
      this.montrer(ecranPlacement(this, sc.placement, G.raisonPlacement(this.partie, sc.placement.id, sc.placement.x, sc.placement.y, sc.placement.sauf)));
      return;
    }
    const b = sc.batimentA(this.partie, pt.x, pt.y);
    if (b) {
      sc.selection = b.uid;
      this.son.clic();
      this.montrer(ecranFicheBatiment(this, b.uid));
    } else if (sc.selection) {
      sc.selection = null;
      this.garage();
    }
  }

  modePlacement(pl) {
    this.ecran = 'garage';
    this.scene.selection = null;
    this.scene.placement = { ...pl };
    this.montrer(ecranPlacement(this, this.scene.placement, null));
  }

  annulerPlacement() {
    const sauf = this.scene.placement?.sauf;
    this.scene.placement = null;
    if (sauf) { this.scene.selection = sauf; this.montrer(ecranFicheBatiment(this, sauf)); return; }
    this.montrer(ecranConstruire(this));
  }

  validerPlacement() {
    const pl = this.scene.placement;
    if (!pl || pl.x === undefined) return;
    const r = pl.sauf ? G.deplacerBatiment(this.partie, pl.sauf, pl.x, pl.y) : G.construireBatiment(this.partie, pl.id, pl.x, pl.y);
    if (!r) { this.toast('Impossible ici.'); return; }
    this.scene.placement = null;
    this.son.caisse();
    this.sauver();
    const suite = () => { this.scene.selection = r.batiment.uid; this.montrer(ecranFicheBatiment(this, r.batiment.uid)); };
    const annoncer = (liste) => {
      if (!liste.length) { suite(); return; }
      const [c, ...reste] = liste;
      this.son.niveau();
      this.montrer(ecranCelebration(this, `COMBO : ${c.nom} !`, c.texte, () => annoncer(reste)));
    };
    annoncer(r.combos);
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
