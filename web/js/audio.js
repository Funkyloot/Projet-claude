/* audio.js — ambiance entièrement synthétisée.
 *
 * Aucun fichier son n'est téléchargé : tout est fabriqué avec l'API Web Audio.
 * L'app pèse donc quelques dizaines de kilo-octets, fonctionne hors ligne, et
 * l'ambiance ne boucle jamais de façon repérable (ce qui, pour du bruit censé
 * détendre, compte beaucoup — l'oreille finit toujours par entendre la boucle).
 *
 * iOS impose que le contexte audio soit démarré depuis un vrai geste de
 * l'utilisateur : d'où `unlock()`, appelé au premier toucher.
 */

/** Une seconde de bruit blanc, rebouclée : la matière première de tout le reste. */
function makeNoiseBuffer(ctx, seconds = 2) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // Léger filtrage passe-bas : le bruit blanc pur est agressif,
    // le bruit brun ressemble davantage à de la pluie ou du vent.
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

export class Ambience {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.6;
    this.scene = null;
    this.nodes = {};
    this.birdTimer = 0;
    this.chimeTimer = 0;
    this.urls = {};        // boucles fournies par les assets, si elles existent
    this.pistes = {};      // éléments <audio> créés à la demande
  }

  /** Déclare les boucles enregistrées disponibles (voir assets.js). */
  setPistes(urls) {
    this.urls = urls || {};
    if (this.ready) this.setScene(this.scene);
  }

  /** Crée ou réutilise l'élément audio d'une boucle. */
  piste(nom) {
    if (!this.urls[nom]) return null;
    if (!this.pistes[nom]) {
      const a = new Audio(this.urls[nom]);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      this.pistes[nom] = a;
    }
    return this.pistes[nom];
  }

  /** À appeler depuis un gestionnaire d'événement tactile. */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ready;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const ctx = this.ctx;
    this.noise = makeNoiseBuffer(ctx, 3);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // --- Lit de bruit : sert à la fois de pluie et de vent ---
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0;

    src.connect(bp).connect(bedGain).connect(this.master);
    src.start();

    // Un LFO très lent module le filtre : c'est ce qui donne
    // l'impression de bouffées de vent ou d'averses qui vont et viennent.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(bp.frequency);
    lfo.start();

    this.nodes = { src, bp, bedGain, lfo, lfoGain };

    // --- Ronronnement : une onde grave hachée à ~26 Hz ---
    const purrOsc = ctx.createOscillator();
    purrOsc.type = 'triangle';
    purrOsc.frequency.value = 52;
    const purrLfo = ctx.createOscillator();
    purrLfo.type = 'sawtooth';
    purrLfo.frequency.value = 26;
    const purrLfoGain = ctx.createGain();
    purrLfoGain.gain.value = 0.5;
    const purrGain = ctx.createGain();
    purrGain.gain.value = 0;
    const purrLp = ctx.createBiquadFilter();
    purrLp.type = 'lowpass';
    purrLp.frequency.value = 220;

    purrLfo.connect(purrLfoGain).connect(purrGain.gain);
    purrOsc.connect(purrLp).connect(purrGain).connect(this.master);
    purrOsc.start(); purrLfo.start();
    this.purrGain = purrGain;
    this.purrDepth = purrLfoGain;

    this.ready = true;
    if (this.scene) this.setScene(this.scene);
    return true;
  }

  setScene(id) {
    this.scene = id;
    if (!this.ready) return;

    // Une vraie prise de son bat toujours le bruit synthétisé : si une
    // boucle existe pour cette scène, on la joue et on coupe le lit de bruit.
    for (const [nom, a] of Object.entries(this.pistes)) {
      if (nom !== id) { a.pause(); a.volume = 0; }
    }
    const enregistree = this.piste(id);
    if (enregistree) {
      enregistree.volume = this.muted ? 0 : this.volume * 0.55;
      enregistree.play().catch(() => { /* lecture refusée : le bruit prend le relais */ });
    }

    const { bp, bedGain, lfo, lfoGain } = this.nodes;
    const now = this.ctx.currentTime;
    if (enregistree && !enregistree.paused) {
      bedGain.gain.setTargetAtTime(0, now, 1.2);
      return;
    }
    if (id === 'ville') {
      // Pluie : bande passante haute, souffle dense et régulier.
      bp.frequency.setTargetAtTime(1500, now, 1.5);
      bp.Q.setTargetAtTime(0.35, now, 1.5);
      lfo.frequency.setTargetAtTime(0.11, now, 1.5);
      lfoGain.gain.setTargetAtTime(500, now, 1.5);
      bedGain.gain.setTargetAtTime(0.22, now, 2);
    } else {
      // Forêt : bande basse, respiration lente dans les feuillages.
      bp.frequency.setTargetAtTime(430, now, 1.5);
      bp.Q.setTargetAtTime(0.8, now, 1.5);
      lfo.frequency.setTargetAtTime(0.05, now, 1.5);
      lfoGain.gain.setTargetAtTime(200, now, 1.5);
      bedGain.gain.setTargetAtTime(0.15, now, 2);
    }
  }

  setPurr(level) {
    if (!this.ready) return;
    const ronron = this.piste('ronron');
    if (ronron) {
      ronron.volume = this.muted ? 0 : Math.min(0.5, level * 0.5) * this.volume;
      if (level > 0.05 && ronron.paused) ronron.play().catch(() => {});
      if (level <= 0.05 && !ronron.paused) ronron.pause();
      return;
    }
    const g = Math.min(0.10, level * 0.10);
    this.purrGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.12);
    this.purrDepth.gain.setTargetAtTime(0.4 + level * 0.3, this.ctx.currentTime, 0.2);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.15);
    // Les boucles enregistrées ne passent pas par le master : elles ont leur
    // propre volume, qu'il faut donc suivre à la main.
    for (const a of Object.values(this.pistes)) if (m) a.volume = 0;
    if (!m) this.setScene(this.scene);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ready && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    for (const [nom, a] of Object.entries(this.pistes)) {
      if (!a.paused && nom !== 'ronron') a.volume = this.muted ? 0 : v * 0.55;
    }
  }

  /** Note douce, gamme pentatonique : n'importe quelle combinaison sonne juste. */
  chime(step = 0, gain = 0.08) {
    if (!this.ready || this.muted) return;
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const semi = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length];
    const freq = 523.25 * Math.pow(2, semi / 12);
    const ctx = this.ctx, now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();  // harmonique, pour l'épaisseur
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.01;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    const g2 = ctx.createGain();
    g2.gain.value = 0.3;

    osc.connect(g);
    osc2.connect(g2).connect(g);
    g.connect(this.master);
    osc.start(now); osc2.start(now);
    osc.stop(now + 2.5); osc2.stop(now + 2.5);
  }

  /** Petit chant d'oiseau : deux blips glissés. */
  bird() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const base = 1800 + Math.random() * 1200;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t = now + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + 0.14);
    }
  }

  /** Passage lointain d'un véhicule : un souffle qui monte et redescend. */
  whoosh() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, now);
    f.frequency.linearRampToValueAtTime(900, now + 1.2);
    f.frequency.linearRampToValueAtTime(320, now + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.09, now + 1.0);
    g.gain.linearRampToValueAtTime(0, now + 2.6);
    src.connect(f).connect(g).connect(this.master);
    src.start(now); src.stop(now + 2.7);
  }

  /** Appelé à chaque image : déclenche les événements sonores occasionnels. */
  update(dt) {
    if (!this.ready || this.muted) return;
    if (this.scene === 'foret') {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) { this.bird(); this.birdTimer = 4 + Math.random() * 11; }
    }
  }
}
