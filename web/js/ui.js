/* ui.js — l'interface par-dessus la scène.
 *
 * Volontairement pauvre : deux pastilles de scène, trois boutons, un
 * exercice de respiration. Une app censée faire baisser la tension ne doit
 * pas ressembler à un tableau de bord.
 */

const RESPIRATIONS = {
  coherence: {
    nom: 'Cohérence',
    detail: '5 s / 5 s',
    phases: [
      { label: 'Inspire', dur: 5, to: 1 },
      { label: 'Expire', dur: 5, to: 0 },
    ],
  },
  carre: {
    nom: 'Carrée',
    detail: '4 · 4 · 4 · 4',
    phases: [
      { label: 'Inspire', dur: 4, to: 1 },
      { label: 'Retiens', dur: 4, to: 1 },
      { label: 'Expire', dur: 4, to: 0 },
      { label: 'Retiens', dur: 4, to: 0 },
    ],
  },
  '478': {
    nom: 'Endormissement',
    detail: '4 · 7 · 8',
    phases: [
      { label: 'Inspire', dur: 4, to: 1 },
      { label: 'Retiens', dur: 7, to: 1 },
      { label: 'Expire', dur: 8, to: 0 },
    ],
  },
};

export class UI {
  constructor(app) {
    this.app = app;
    this.breathing = false;
    this.breathType = 'coherence';
    this.phase = 0;
    this.phaseT = 0;
    this.cycles = 0;
    this.el = {};
    this.bind();
  }

  bind() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('ui'),
      calme: $('calme-fill'),
      calmeLabel: $('calme-label'),
      btnSon: $('btn-son'),
      btnSouffle: $('btn-souffle'),
      btnReglages: $('btn-reglages'),
      scenes: $('scenes'),
      souffle: $('souffle'),
      souffleCercle: $('souffle-cercle'),
      souffleLabel: $('souffle-label'),
      souffleCompte: $('souffle-compte'),
      souffleCycles: $('souffle-cycles'),
      souffleFin: $('souffle-fin'),
      reglages: $('reglages'),
      reglagesFermer: $('reglages-fermer'),
      pelages: $('pelages'),
      volume: $('volume'),
      breathChoix: $('breath-choix'),
      total: $('total-calme'),
      installe: $('installe'),
      toast: $('toast'),
    };

    this.el.btnSon.addEventListener('click', () => this.app.toggleSon());
    this.el.btnSouffle.addEventListener('click', () => this.toggleSouffle());
    this.el.btnReglages.addEventListener('click', () => this.ouvrirReglages(true));
    this.el.reglagesFermer.addEventListener('click', () => this.ouvrirReglages(false));
    this.el.souffleFin.addEventListener('click', () => this.toggleSouffle(false));

    this.el.scenes.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => this.app.setScene(b.dataset.scene));
    });
    this.el.pelages.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => this.app.setPelage(b.dataset.pelage));
    });
    this.el.breathChoix.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        this.breathType = b.dataset.breath;
        this.phase = 0; this.phaseT = 0;
        this.syncBreathChoix();
      });
    });
    this.el.volume.addEventListener('input', () => {
      this.app.setVolume(Number(this.el.volume.value) / 100);
    });

    // L'app tourne en plein écran sur l'écran d'accueil : on ne montre le
    // mode d'emploi d'installation que si ce n'est pas encore le cas.
    const standalone = window.navigator.standalone ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) this.el.installe.hidden = true;

    this.syncBreathChoix();
  }

  syncBreathChoix() {
    this.el.breathChoix.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('actif', b.dataset.breath === this.breathType);
    });
    const r = RESPIRATIONS[this.breathType];
    this.el.souffleCycles.textContent = `${r.nom} · ${r.detail}`;
  }

  setSceneActive(id) {
    this.el.scenes.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('actif', b.dataset.scene === id);
      b.setAttribute('aria-pressed', String(b.dataset.scene === id));
    });
  }

  setPelageActive(id) {
    this.el.pelages.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('actif', b.dataset.pelage === id);
    });
  }

  setSon(on) {
    this.el.btnSon.classList.toggle('coupe', !on);
    this.el.btnSon.textContent = on ? '♪' : '×';
    this.el.btnSon.setAttribute('aria-label', on ? 'Couper le son' : 'Activer le son');
  }

  ouvrirReglages(v) {
    this.el.reglages.classList.toggle('ouvert', v);
    this.el.reglages.setAttribute('aria-hidden', String(!v));
  }

  toggleSouffle(force) {
    const v = force === undefined ? !this.breathing : force;
    this.breathing = v;
    this.phase = 0; this.phaseT = 0; this.cycles = 0;
    this.el.souffle.classList.toggle('ouvert', v);
    this.el.souffle.setAttribute('aria-hidden', String(!v));
    this.el.btnSouffle.classList.toggle('actif', v);
    if (v) this.ouvrirReglages(false);
  }

  /** Fait avancer l'exercice de respiration. Renvoie l'ouverture 0..1
   *  pour que la scène puisse pulser doucement en rythme. */
  update(dt) {
    if (!this.breathing) return null;
    const r = RESPIRATIONS[this.breathType];
    const ph = r.phases[this.phase];
    this.phaseT += dt;

    if (this.phaseT >= ph.dur) {
      this.phaseT -= ph.dur;
      this.phase = (this.phase + 1) % r.phases.length;
      if (this.phase === 0) {
        this.cycles++;
        this.app.ambience.chime(this.cycles);
      }
    }

    const cur = r.phases[this.phase];
    const from = this.phase === 0
      ? r.phases[r.phases.length - 1].to
      : r.phases[this.phase - 1].to;
    const k = this.phaseT / cur.dur;
    // Courbe en S : la respiration guidée doit être douce aux extrémités,
    // sinon on a l'impression d'être tiré plutôt qu'accompagné.
    const eased = k * k * (3 - 2 * k);
    const ouverture = from + (cur.to - from) * eased;

    const scale = 0.45 + ouverture * 0.55;
    this.el.souffleCercle.style.transform = `scale(${scale.toFixed(3)})`;
    this.el.souffleLabel.textContent = cur.label;
    this.el.souffleCompte.textContent = String(Math.ceil(cur.dur - this.phaseT));

    return ouverture;
  }

  setCalme(v, minutes) {
    this.el.calme.style.width = `${Math.round(v * 100)}%`;
    this.el.calmeLabel.textContent = `${Math.round(v * 100)}%`;
    if (minutes !== undefined) {
      const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
      this.el.total.textContent = h > 0 ? `${h} h ${m} min` : `${m} min`;
    }
  }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('visible'), 2600);
  }
}

export { RESPIRATIONS };
