/* voiture.js — physique arcade d'une voiture vue de dessus.
 *
 * La voiture accélère seule (section 6.7) : on ne commande que la direction.
 * Le cap tourne à une vitesse donnée par la maniabilité ; la vitesse, elle,
 * suit le cap avec un retard qui dépend de l'adhérence. Quand on tourne plus
 * vite que les pneus ne le permettent, la voiture glisse : c'est le drift.
 */

import { BOOSTS } from './regles.js';
import { clamp } from './outils.js';

export const RAYON_VOITURE = 8;

export class Voiture {
  constructor({ physique, couleur, nom, joueur = false, equipe = null }) {
    this.p = physique;
    this.couleur = couleur;
    this.nom = nom;
    this.joueur = joueur;
    this.equipe = equipe;
    this.x = 0; this.y = 0;
    this.angle = 0;            // cap, en radians (0 = vers la droite)
    this.vx = 0; this.vy = 0;
    this.direction = 0;        // -1 gauche, 0 tout droit, +1 droite
    this.frein = 0;            // 0 à 1 (IA seulement)
    this.durabilite = physique.durabiliteMax;
    this.nitro = 0;            // secondes de nitro restantes
    this.aura = 0;             // secondes d'aura restantes
    this.aspiration = false;
    this.horsPiste = 0;        // 0 sur la piste, 1 dans l'herbe
    this.adherenceSol = 1;
    this.vitesseSol = 1;
    this.glisse = 0;           // vitesse latérale (px/s) ; au-delà de 35 : drift
    this.tete = 0;             // tête-à-queue en cours (secondes)
    this.tour = -1;
    this.s = 0;
    this.progres = 0;
    this.fini = false;
    this.tempsArrivee = Infinity;
  }

  get vitesse() { return Math.hypot(this.vx, this.vy); }
  get drift() { return this.glisse > 35; }

  placer(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.vx = 0; this.vy = 0;
  }

  vitesseMax() {
    let v = this.p.vmax * this.vitesseSol;
    if (this.nitro > 0) v *= BOOSTS.nitro.vitesse;
    if (this.aura > 0) v *= BOOSTS.aura.vitesse;
    if (this.aspiration) v *= BOOSTS.aspiration.vitesse;
    if (this.horsPiste > 0) v *= 1 - 0.5 * this.horsPiste;
    // Une voiture très abîmée perd de sa pointe.
    v *= 0.8 + 0.2 * clamp(this.durabilite / this.p.durabiliteMax, 0, 1);
    return v;
  }

  maj(dt, demarre) {
    if (this.nitro > 0) this.nitro = Math.max(0, this.nitro - dt);
    if (this.aura > 0) this.aura = Math.max(0, this.aura - dt);
    if (!demarre) { this.vx = 0; this.vy = 0; return; }

    // 1. Le cap tourne.
    const vitesse = this.vitesse;
    if (this.tete > 0) {
      // Tête-à-queue après un gros choc : la voiture tourne sur elle-même.
      this.tete -= dt;
      this.angle += 7 * dt;
    } else {
      // Le volant agit peu à l'arrêt, pleinement à vitesse moyenne.
      const efficacite = clamp(vitesse / 60, 0, 1) * (1 - 0.18 * clamp(vitesse / this.p.vmax, 0, 1));
      this.angle += this.direction * this.p.rotation * efficacite * dt;
    }

    // 2. La vitesse actuelle, vue depuis le nouveau cap.
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    const lx = -fy, ly = fx;
    let avant = this.vx * fx + this.vy * fy;
    let lateral = this.vx * lx + this.vy * ly;

    // 3. Moteur, frein, terrain.
    if (this.tete > 0) {
      avant *= Math.pow(0.25, dt);
    } else {
      let vmax = this.vitesseMax();
      if (this.direction !== 0) vmax *= 0.94;   // on lève un peu le pied en tournant
      let accel = this.p.accel;
      if (this.nitro > 0) accel *= BOOSTS.nitro.accel;
      if (this.aura > 0) accel *= BOOSTS.aura.accel;
      if (this.frein > 0) avant -= 280 * this.frein * dt;
      else if (avant < vmax) avant = Math.min(vmax, avant + accel * (1 - 0.55 * clamp(avant / vmax, 0, 1)) * dt);
      else avant -= 160 * dt;
    }
    if (this.horsPiste > 0) avant -= 110 * this.horsPiste * dt * clamp(avant / 70, 0, 1);

    // 4. Adhérence : la glisse se résorbe, et glisser coûte de la vitesse.
    const grip = this.p.adherence * this.adherenceSol * (this.horsPiste > 0 ? 0.75 : 1);
    lateral *= Math.exp(-grip * dt);
    this.glisse = Math.abs(lateral);
    avant -= this.glisse * 0.35 * dt;
    avant = Math.max(0, avant);

    this.vx = fx * avant + lx * lateral;
    this.vy = fy * avant + ly * lateral;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
