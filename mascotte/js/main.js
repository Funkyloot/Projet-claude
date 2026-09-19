/* main.js — boucle, transitions, interface.
 *
 * L'app tient en une boucle : on efface, on demande à l'activité courante
 * de se dessiner, on agrandit le canvas virtuel vers l'écran. Le
 * changement d'activité passe par un fondu tramé (pas de flou : on ne
 * mélange que des pixels francs).
 */

import { PixelScreen, rect, clamp } from './pixel.js';
import { majMascotte } from './mascotte.js';
import { ACTIVITES } from './activites.js';

const canvas = document.getElementById('scene');
const ecran = new PixelScreen(canvas, { targetWidth: 104, maxScale: 16 });

const barre = document.getElementById('activites');
const indice = document.getElementById('indice');
const boutonAuto = document.getElementById('auto');

const CLE = 'mascotte-grise:activite';
let index = Math.max(0, ACTIVITES.findIndex((a) => a.id === localStorage.getItem(CLE)));
let suivant = index;
let transition = 0;          // 0 = stable, sinon progression du fondu
let auto = false;
let depuisChangement = 0;
let t = 0;

const DUREE_AUTO = 12;
const DUREE_FONDU = 0.5;

/* ---------- Interface ---------- */

const boutons = ACTIVITES.map((a, i) => {
  const b = document.createElement('button');
  b.className = 'puce';
  b.textContent = a.nom;
  b.addEventListener('click', () => aller(i));
  barre.appendChild(b);
  return b;
});

function majInterface() {
  boutons.forEach((b, i) => b.setAttribute('aria-current', i === index ? 'true' : 'false'));
  indice.textContent = ACTIVITES[index].indice;
  document.title = `${ACTIVITES[index].nom} — la mascotte grise`;
  boutonAuto.setAttribute('aria-pressed', auto ? 'true' : 'false');
  boutonAuto.textContent = auto ? 'Enchaînement : oui' : 'Enchaînement : non';
}

function aller(i) {
  const cible = (i + ACTIVITES.length) % ACTIVITES.length;
  if (cible === index && transition === 0) return;
  suivant = cible;
  transition = DUREE_FONDU;
  depuisChangement = 0;
}

boutonAuto.addEventListener('click', () => { auto = !auto; depuisChangement = 0; majInterface(); });
canvas.addEventListener('pointerdown', () => aller(index + 1));

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') aller(index + 1);
  else if (e.key === 'ArrowLeft') aller(index - 1);
  else if (e.key === ' ') { auto = !auto; depuisChangement = 0; majInterface(); e.preventDefault(); }
});

window.addEventListener('resize', () => ecran.resize());

/* ---------- Fondu tramé ---------- */

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

function voile(ctx, l, h, force) {
  if (force <= 0) return;
  const seuil = force * 17;
  ctx.fillStyle = '#101216';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      if (BAYER[y & 3][x & 3] < seuil) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/* ---------- Boucle ---------- */

let dernier = performance.now();

function image(maintenant) {
  const dt = clamp((maintenant - dernier) / 1000, 0, 0.05);
  dernier = maintenant;
  t += dt;
  depuisChangement += dt;
  majMascotte(dt);

  if (transition > 0) {
    const avant = transition;
    transition = Math.max(0, transition - dt);
    // À mi-parcours, l'écran est noir : c'est là qu'on bascule d'activité.
    if (avant > DUREE_FONDU / 2 && transition <= DUREE_FONDU / 2) {
      index = suivant;
      localStorage.setItem(CLE, ACTIVITES[index].id);
      majInterface();
    }
  } else if (auto && depuisChangement > DUREE_AUTO) {
    aller(index + 1);
  }

  ecran.resize();
  const ctx = ecran.ctx;
  const env = { ctx, l: ecran.w, h: ecran.h, sol: Math.round(ecran.h * 0.8), t };

  rect(ctx, 0, 0, env.l, env.h, '#1a1c20');
  ACTIVITES[index].dessiner(env);

  // Fondu : 1 au milieu de la transition, 0 aux extrémités.
  const p = transition / DUREE_FONDU;          // 1 -> 0
  const force = p > 0.5 ? (1 - p) * 2 : p * 2; // triangle
  voile(ctx, env.l, env.h, transition > 0 ? force : 0);

  ecran.present();
  requestAnimationFrame(image);
}

majInterface();
requestAnimationFrame(image);
