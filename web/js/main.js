/* main.js — assemblage : boucle de rendu, gestes, sauvegarde.
 *
 * Gestes reconnus :
 *   toucher le chat          → caresse (cœurs, ronronnement)
 *   maintenir sur le chat    → il s'installe puis s'endort
 *   toucher ailleurs         → il vient voir
 *   glisser horizontalement  → panoramique sur le décor
 */

import { PixelScreen, clamp, lerp } from './pixel.js';
import { Cat, PELAGES } from './cat.js';
import { ForestScene } from './scene-forest.js';
import { CityScene } from './scene-city.js';
import { Ambience } from './audio.js';
import { UI } from './ui.js';

const CLE = 'calme.reglages.v1';

class App {
  constructor() {
    this.canvas = document.getElementById('vue');
    this.screen = new PixelScreen(this.canvas, { targetWidth: 190 });

    this.scenes = { foret: new ForestScene(), ville: new CityScene() };
    this.scene = this.scenes.foret;

    this.cat = new Cat();
    this.cat.onPurr = (v) => this.ambience.setPurr(v);
    this.cat.onPet = () => {
      // Une note toutes les ~0,6 s pendant la caresse : assez pour
      // récompenser le geste, assez peu pour ne pas devenir un jingle.
      const now = performance.now();
      if (now - (this._lastChime || 0) > 600) {
        this._lastChime = now;
        this.ambience.chime(this._chimeStep = (this._chimeStep || 0) + 1, 0.05);
      }
    };

    this.ambience = new Ambience();
    this.ui = new UI(this);

    this.calme = 0;
    this.minutes = 0;
    this.son = true;
    this.pelage = 'roux';
    this.input = { panVX: 0 };
    this.paused = false;

    this.charger();
    this.setScene(this.sceneId || 'foret', true);
    this.setPelage(this.pelage, true);
    this.ui.setSon(this.son);

    this.bindGestes();
    this.bindCycleDeVie();

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ---------- Réglages persistés ---------- */

  charger() {
    try {
      const s = JSON.parse(localStorage.getItem(CLE) || '{}');
      this.son = s.son ?? true;
      this.pelage = PELAGES[s.pelage] ? s.pelage : 'roux';
      this.sceneId = this.scenes[s.scene] ? s.scene : 'foret';
      this.minutes = s.minutes ?? 0;
      this.calme = clamp(s.calme ?? 0, 0, 1);
      this.volume = clamp(s.volume ?? 0.6, 0, 1);
      this.ui.breathType = s.breath || 'coherence';
    } catch { /* premier lancement, ou stockage indisponible */ }
    this.ui.el.volume.value = String(Math.round((this.volume ?? 0.6) * 100));
    this.ambience.setVolume(this.volume ?? 0.6);
    this.ui.syncBreathChoix();
    this.cat.bonheur = this.calme;
  }

  sauver() {
    try {
      localStorage.setItem(CLE, JSON.stringify({
        son: this.son, pelage: this.pelage, scene: this.scene.id,
        minutes: this.minutes, calme: this.calme,
        volume: this.volume, breath: this.ui.breathType,
      }));
    } catch { /* mode privé : on continue sans sauvegarder */ }
  }

  /* ---------- Commandes ---------- */

  setScene(id, silencieux) {
    const s = this.scenes[id];
    if (!s) return;
    this.scene = s;
    this.ui.setSceneActive(id);
    this.ambience.setScene(s.ambience);
    if (!silencieux) {
      this.ambience.chime(2, 0.06);
      this.sauver();
    }
    // On replace le chat sur le sol de la nouvelle scène.
    if (s.built) {
      this.cat.y = s.groundY;
      this.cat.x = clamp(this.cat.x, s.bounds.left + 12, s.bounds.right - 12);
      this.cat.targetX = this.cat.x;
    }
  }

  setPelage(id, silencieux) {
    if (!PELAGES[id]) return;
    this.pelage = id;
    this.cat.pelage = id;
    this.ui.setPelageActive(id);
    if (!silencieux) this.sauver();
  }

  setVolume(v) {
    this.volume = v;
    this.ambience.setVolume(v);
    if (v > 0 && !this.son) this.toggleSon();
    this.sauver();
  }

  toggleSon() {
    this.son = !this.son;
    this.ambience.setMuted(!this.son);
    this.ui.setSon(this.son);
    this.sauver();
  }

  /* ---------- Gestes ---------- */

  bindGestes() {
    const c = this.canvas;
    let actif = null;

    const debloquer = () => {
      // iOS n'autorise le son qu'à partir d'un vrai geste utilisateur.
      this.ambience.unlock().then((ok) => {
        if (ok) { this.ambience.setMuted(!this.son); this.ambience.setScene(this.scene.ambience); }
      });
    };

    const pos = (e) => {
      const t = e.touches ? e.touches[0] : e;
      return this.screen.toVirtual(t.clientX, t.clientY);
    };

    const down = (e) => {
      e.preventDefault();
      debloquer();
      const p = pos(e);
      actif = {
        x0: p.x, y0: p.y, x: p.x, y: p.y, lastX: p.x,
        t0: performance.now(), mode: this.cat.contains(p.x, p.y) ? 'caresse' : 'indecis',
        bouge: 0,
      };
      if (actif.mode === 'caresse') this.cat.caresser(p.x, p.y);
    };

    const move = (e) => {
      if (!actif) return;
      e.preventDefault();
      const p = pos(e);
      const dx = p.x - actif.lastX;
      actif.bouge += Math.abs(p.x - actif.x) + Math.abs(p.y - actif.y);
      actif.x = p.x; actif.y = p.y;

      if (actif.mode === 'caresse') {
        this.cat.caresser(p.x, p.y);
      } else {
        if (actif.mode === 'indecis' && Math.abs(p.x - actif.x0) > 5) actif.mode = 'pano';
        if (actif.mode === 'pano') this.input.panVX = -dx * 0.9;
        // On peut attraper le chat en cours de glissement.
        if (this.cat.contains(p.x, p.y)) { actif.mode = 'caresse'; this.cat.caresser(p.x, p.y); }
      }
      actif.lastX = p.x;
    };

    const up = (e) => {
      if (!actif) return;
      if (e.cancelable) e.preventDefault();
      const duree = performance.now() - actif.t0;
      if (actif.mode === 'indecis' && duree < 400 && actif.bouge < 8) {
        this.cat.appeler(actif.x);
      }
      actif = null;
    };

    c.addEventListener('touchstart', down, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', up, { passive: false });
    c.addEventListener('touchcancel', up, { passive: false });
    c.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);

    this.getActif = () => actif;
  }

  bindCycleDeVie() {
    window.addEventListener('resize', () => this.screen.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.screen.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (document.hidden) { this.sauver(); this.ambience.setMuted(true); }
      else { this.last = performance.now(); this.ambience.setMuted(!this.son); }
    });
    // Sauvegarde régulière : sur iOS, l'app peut être tuée sans prévenir.
    setInterval(() => this.sauver(), 15000);
  }

  /* ---------- Boucle ---------- */

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (this.paused) { this.last = now; return; }

    // Plafonné à 50 ms : après un retour d'arrière-plan, un dt énorme
    // ferait téléporter le chat et pleuvoir d'un coup.
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.screen.resize();
    const { ctx, w: W, h: H } = this.screen;

    // Appui maintenu sur le chat : il s'installe, puis s'endort.
    const actif = this.getActif && this.getActif();
    if (actif && actif.mode === 'caresse' && performance.now() - actif.t0 > 1100 && actif.bouge < 30) {
      this.cat.bercer();
    }

    const ouverture = this.ui.update(dt);

    this.scene.update(dt, W, H, this.input);
    this.input.panVX *= 0.86;   // le panoramique s'arrête en douceur

    this.cat.y = this.scene.groundY;
    this.cat.update(dt, this.scene.bounds);
    this.ambience.update(dt);

    // Le calme monte quand on s'occupe du chat ou qu'on respire.
    const gagne = (this.cat.petting > 0 ? 0.035 : 0) + (this.ui.breathing ? 0.02 : 0);
    if (gagne > 0) {
      this.calme = clamp(this.calme + gagne * dt, 0, 1);
      this.minutes += dt / 60;
    } else {
      this.calme = Math.max(0, this.calme - dt * 0.004);
    }
    this.ui.setCalme(this.calme, this.minutes);

    // Rendu
    this.scene.draw(ctx, W, H);
    this.cat.draw(ctx);
    this.scene.drawForeground(ctx, W, H);

    // Pendant la respiration, la scène s'éclaircit à l'inspiration.
    if (ouverture !== null && ouverture !== undefined) {
      ctx.globalAlpha = 0.10 + (1 - ouverture) * 0.16;
      ctx.fillStyle = '#0c0a18';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    this.screen.present();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__calme = new App();

  // Service worker : c'est lui qui rend l'app utilisable sans réseau une
  // fois posée sur l'écran d'accueil.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne, tant pis */ });
  }
});
