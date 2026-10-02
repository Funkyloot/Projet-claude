/* son.js — bruitages et musique synthétisés en Web Audio (aucun fichier son).
 *
 * Le contexte audio ne démarre qu'après un premier geste du joueur, comme
 * l'exigent les navigateurs. Deux volumes réglables (musique, effets), et les
 * vibrations du téléphone sur les chocs. La musique : trois petits airs façon
 * arcade (voir MORCEAUX), joués par un séquenceur qui programme les notes un
 * peu d'avance.
 */

import { MORCEAUX, frequence } from './musique.js';

export class Son {
  constructor() {
    this.ctx = null;
    this.actif = true;
    this.volumes = { musique: 0.5, effets: 0.8 };
    this.vibrations = true;
    this.morceau = null;      // l'air demandé (joué dès que l'audio est réveillé)
    this.lecture = null;      // { nom, debut, pas } : l'air en cours
  }

  reveiller() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try { this.ctx = new AudioContext(); } catch { this.ctx = null; return; }
    this.gEffets = this.ctx.createGain();
    this.gMusique = this.ctx.createGain();
    this.gEffets.connect(this.ctx.destination);
    this.gMusique.connect(this.ctx.destination);
    this.appliquerVolumes();
    // Une seconde de souffle blanc, réutilisée pour la charleston.
    const n = this.ctx.sampleRate;
    this.souffleBlanc = this.ctx.createBuffer(1, n, n);
    const d = this.souffleBlanc.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // Le téléphone met le jeu en arrière-plan : on coupe tout, on reprend au retour.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx.suspend?.(); else this.ctx.resume?.();
    });
    if (this.morceau) this.musique(this.morceau, true);
  }

  /** Volumes de 0 à 1 ; `effets` à 0 coupe aussi les bruitages. */
  regler({ musique, effets, vibrations }) {
    if (musique !== undefined) this.volumes.musique = musique;
    if (effets !== undefined) { this.volumes.effets = effets; this.actif = effets > 0; }
    if (vibrations !== undefined) this.vibrations = vibrations;
    this.appliquerVolumes();
  }

  appliquerVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.gEffets.gain.setTargetAtTime(this.volumes.effets * 1.4, t, 0.05);
    this.gMusique.gain.setTargetAtTime(this.volumes.musique * 0.9, t, 0.05);
  }

  vibrer(ms) {
    if (this.vibrations && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* refusé */ }
  }

  // --- Musique ----------------------------------------------------------------------------

  /** Joue un air ('garage', 'course', 'ville') en boucle ; null pour arrêter. */
  musique(nom, forcer = false) {
    if (nom === this.morceau && !forcer) return;
    this.morceau = nom;
    if (!this.ctx) return;
    clearInterval(this.minuteur);
    this.lecture = null;
    if (!nom || !MORCEAUX[nom]) return;
    this.lecture = { nom, prochain: this.ctx.currentTime + 0.15, pas: 0 };
    this.minuteur = setInterval(() => this.programmer(), 30);
    this.programmer();
  }

  /** Programme les croches des 0,2 prochaines secondes. */
  programmer() {
    const L = this.lecture;
    if (!L || !this.ctx || this.ctx.state !== 'running') return;
    const m = MORCEAUX[L.nom];
    const croche = 30 / m.tempo;
    // Après une mise en veille, on repart de maintenant au lieu de rattraper le retard.
    if (L.prochain < this.ctx.currentTime - 0.1) L.prochain = this.ctx.currentTime + 0.05;
    while (L.prochain < this.ctx.currentTime + 0.2) {
      this.jouerPas(m, L.pas, L.prochain, croche);
      L.prochain += croche;
      L.pas = (L.pas + 1) % m.melodie.length;
    }
  }

  jouerPas(m, i, t, croche) {
    // Mélodie : une note tient tant qu'elle est suivie de '-'.
    const n = m.melodie[i];
    if (n !== '.' && n !== '-') {
      let duree = 1;
      while (m.melodie[(i + duree) % m.melodie.length] === '-') duree++;
      this.voix(frequence(n), t, duree * croche * 0.92, m.timbre || 'square', 0.055);
    }
    // Basse : la fondamentale de l'accord de la mesure, sur le motif du morceau.
    const accord = m.accords[Math.floor(i / 8) % m.accords.length];
    const b = m.basse[i % 8];
    if (b) this.voix(frequence(accord) * b, t, croche * 0.8, 'triangle', 0.13);
    // Batterie : grosse caisse (k), caisse claire (s), charleston (h).
    const coup = m.batterie[i % m.batterie.length];
    if (coup === 'k' || coup === 'K') this.grosseCaisse(t);
    if (coup === 's') this.caisseClaire(t);
    if (coup === 'h' || coup === 'K') this.charleston(t, 0.025);
  }

  voix(freq, t, duree, type, volume) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.setValueAtTime(volume, t + duree * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g).connect(this.gMusique);
    o.start(t);
    o.stop(t + duree + 0.02);
  }

  grosseCaisse(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.gMusique);
    o.start(t); o.stop(t + 0.17);
  }

  caisseClaire(t) {
    this.souffle_(t, 0.12, 0.09, 'bandpass', 1800);
    this.voix(190, t, 0.07, 'triangle', 0.06);
  }

  charleston(t, volume) { this.souffle_(t, 0.035, volume, 'highpass', 7000); }

  souffle_(t, duree, volume, type, freq) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.souffleBlanc;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    src.connect(f).connect(g).connect(this.gMusique);
    src.start(t, Math.random() * 0.5); src.stop(t + duree + 0.01);
  }

  // --- Bruitages --------------------------------------------------------------------------

  note(freq, duree, type = 'square', volume = 0.06, glisse = 0) {
    if (!this.actif || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glisse) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glisse), t + duree);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g).connect(this.gEffets);
    o.start(t);
    o.stop(t + duree + 0.02);
  }

  bruit(duree, volume = 0.08, frequence = 800) {
    if (!this.actif || !this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * duree);
    const buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = frequence;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(f).connect(g).connect(this.gEffets);
    src.start(t);
  }

  bip(freq = 440, duree = 0.15) { this.note(freq, duree, 'square', 0.05); }
  clic() { this.note(660, 0.05, 'square', 0.03); }
  souffle() { this.bruit(0.5, 0.1, 1800); this.note(220, 0.4, 'sawtooth', 0.03, 300); }
  aura() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.note(f, 0.18, 'triangle', 0.05), i * 60)); }
  choc(force) { this.bruit(0.18, Math.min(0.2, 0.05 + force / 1500), 500); this.vibrer(Math.round(Math.min(80, 15 + force / 4))); }
  fanfare() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.note(f, 0.2, 'square', 0.045), i * 110)); }
  piece() { this.note(988, 0.06, 'square', 0.035); setTimeout(() => this.note(1319, 0.1, 'square', 0.035), 50); }
  disque() { [660, 880, 1175].forEach((f, i) => setTimeout(() => this.note(f, 0.08, 'triangle', 0.05), i * 45)); }
  niveau() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.note(f, 0.16, 'square', 0.045), i * 90)); }
  roulement() { this.note(180 + Math.random() * 60, 0.05, 'square', 0.025); }
  caisse() { [880, 1320].forEach((f, i) => setTimeout(() => this.note(f, 0.12, 'square', 0.04), i * 80)); }
}
