/* son.js — petits bruitages synthétisés en Web Audio (aucun fichier son).
 *
 * Le contexte audio ne démarre qu'après un premier geste du joueur, comme
 * l'exigent les navigateurs.
 */

export class Son {
  constructor() {
    this.ctx = null;
    this.actif = true;
  }

  reveiller() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try { this.ctx = new AudioContext(); } catch { this.ctx = null; }
  }

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
    o.connect(g).connect(this.ctx.destination);
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
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t);
  }

  bip(freq = 440, duree = 0.15) { this.note(freq, duree, 'square', 0.05); }
  clic() { this.note(660, 0.05, 'square', 0.03); }
  souffle() { this.bruit(0.5, 0.1, 1800); this.note(220, 0.4, 'sawtooth', 0.03, 300); }
  aura() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.note(f, 0.18, 'triangle', 0.05), i * 60)); }
  choc(force) { this.bruit(0.18, Math.min(0.2, 0.05 + force / 1500), 500); }
  fanfare() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.note(f, 0.2, 'square', 0.045), i * 110)); }
  caisse() { [880, 1320].forEach((f, i) => setTimeout(() => this.note(f, 0.12, 'square', 0.04), i * 80)); }
}
