/* regles.js — les règles chiffrées du jeu, en un seul endroit.
 *
 * Tout ce qu'on voudra équilibrer après les premiers essais est ici :
 * conversion des qualités en physique, points, primes, candidatures.
 */

export const CLASSES = ['D', 'C', 'B', 'A', 'S'];
export const classeAuMoins = (classe, minimum) =>
  CLASSES.indexOf(classe) >= CLASSES.indexOf(minimum);

export const PALIERS = {
  ouvert: { nom: 'Ouvert', licence: null },
  regional: { nom: 'Régional', licence: 'C' },
  national: { nom: 'National', licence: 'B' },
  continental: { nom: 'Continental', licence: 'A' },
  mondial: { nom: 'Mondial', licence: 'S' },
};
export const ORDRE_PALIERS = ['ouvert', 'regional', 'national', 'continental', 'mondial'];

/** Adhérence (1 = asphalte sec) et vitesse de pointe relative par surface. */
export const SURFACES = {
  asphalte: { nom: 'Asphalte', adherence: 1.0, vitesse: 1.0, couleur: '#5c6278' },
  paves: { nom: 'Pavés', adherence: 0.9, vitesse: 0.97, couleur: '#6e6a7c' },
  terre: { nom: 'Terre', adherence: 0.8, vitesse: 0.93, couleur: '#8a6a4f' },
  mouille: { nom: 'Mouillé', adherence: 0.75, vitesse: 0.97, couleur: '#4d566e' },
  sable: { nom: 'Sable', adherence: 0.7, vitesse: 0.9, couleur: '#c9b07a' },
  glace: { nom: 'Glace', adherence: 0.55, vitesse: 0.95, couleur: '#a9c6d8' },
};

/** Barèmes par place (index 0 = 1er). Points de Grand Prix et primes : Kairosoft. */
export const POINTS_GP = [13, 10, 8, 6, 5, 4, 3, 2, 1, 0];
export const POINTS_LICENCE = [10, 7, 5, 3, 2, 1, 1, 1, 1, 1];
export const PART_PRIX = [1, 0.5, 0.3, 0.2, 0.15, 0.136, 0.127, 0.118, 0.109, 0.1];
export const FANS_PLACE = [60, 40, 30, 20, 15, 10, 8, 6, 4, 2];

/**
 * Qualités (1 à 100) → grandeurs physiques, en pixels du monde.
 * 16 px = 1 case ; l'affichage en km/h vaut px/s × 0,8.
 */
export function physique(stats) {
  return {
    vmax: 135 + 1.5 * stats.vitesse,
    accel: 70 + 1.3 * stats.acceleration,
    rotation: 2.0 + 0.018 * stats.maniabilite,
    adherence: 3.5 + 0.06 * stats.maniabilite,
    durabiliteMax: 60 + stats.solidite,
  };
}
export const kmh = (pxParSeconde) => Math.round(pxParSeconde * 0.8);

/** Boosts (section 6.6 du cahier des charges). */
export const BOOSTS = {
  nitro: { vitesse: 1.4, accel: 1.8, duree: 2 },
  aura: { vitesse: 1.25, accel: 1.4, duree: 4 },
  aspiration: { vitesse: 1.08 },
};

/** Pièces : emplacements et raretés. */
export const EMPLACEMENTS = {
  moteur: 'Moteur', pneus: 'Pneus', boite: 'Boîte', aileron: 'Aileron', nitro: 'Nitro', chassis: 'Châssis',
};
export const RARETES = {
  commune: { nom: 'Commune', couleur: '#8a94a6' },
  rare: { nom: 'Rare', couleur: '#2f6fdb' },
  super: { nom: 'Super rare', couleur: '#d69a12' },
};

/** Labo : points de recherche pour débloquer chaque niveau de pièces. */
export const COUT_RECHERCHE = [0, 30, 90, 220];

/** Construction : tirage de la qualité, ajoutée à chaque qualité de la voiture. */
export const QUALITES = [
  { nom: 'Correcte', bonus: 0, etoiles: 1, chance: 0.34 },
  { nom: 'Bonne', bonus: 3, etoiles: 2, chance: 0.34 },
  { nom: 'Excellente', bonus: 6, etoiles: 3, chance: 0.2 },
  { nom: 'Remarquable', bonus: 10, etoiles: 4, chance: 0.09 },
  { nom: 'Légendaire', bonus: 15, etoiles: 5, chance: 0.03 },
];
export function tirerQualite(alea) {
  let r = alea();
  for (let i = 0; i < QUALITES.length; i++) {
    if (r < QUALITES[i].chance) return i;
    r -= QUALITES[i].chance;
  }
  return 0;
}

/** Rang de l'équipe : EXP à atteindre pour passer au rang suivant. */
export const expPourRang = (rang) => Math.round(90 * rang ** 1.35);
export const recompenseRang = (rang) => ({ argent: 700 * rang, recherche: 6 + 2 * rang, tickets: 1 });
export const EXP_PLACE = [60, 45, 36, 28, 22, 18, 15, 12, 10, 8];
export const EXP_DEPASSEMENT = 4;
export const COUT_PEINTURE = 600;
export const PEINTURES = ['#f2c14e', '#e4432d', '#2f6fdb', '#3fa34d', '#f4f1e8', '#2a2838', '#e86ca6', '#8a6ad6', '#f39c33', '#4fc3d8'];

/** Atelier : chaque amélioration ajoute 5 points à une qualité. */
export const coutAmelioration = (niveau) => 1500 * (1 + niveau);
export const GAIN_AMELIORATION = 5;
export const COUT_REPARATION_POINT = 20;

/**
 * Juge une candidature. Renvoie ce qui manque, en mots lisibles.
 * `presque` : il ne manque presque rien → liste d'attente.
 */
export function evaluerCandidature(partie, gp, voiture) {
  const cond = gp.conditions || {};
  const manques = [];
  let ecart = 0;
  if (cond.points && partie.pointsLicence < cond.points) {
    const m = cond.points - partie.pointsLicence;
    manques.push(`${m} point${m > 1 ? 's' : ''} de licence`);
    ecart += m / cond.points;
  }
  if (cond.podiums && partie.podiums < cond.podiums) {
    const m = cond.podiums - partie.podiums;
    manques.push(`${m} podium${m > 1 ? 's' : ''}`);
    ecart += m / cond.podiums;
  }
  if (cond.victoires && partie.victoires < cond.victoires) {
    const m = cond.victoires - partie.victoires;
    manques.push(`${m} victoire${m > 1 ? 's' : ''}`);
    ecart += m / cond.victoires;
  }
  if (cond.classe && !(voiture && classeAuMoins(voiture.classe, cond.classe))) {
    manques.push(`une voiture de classe ${cond.classe} ou plus`);
    ecart += 1;
  }
  return { ok: manques.length === 0, manques, presque: manques.length > 0 && ecart <= 0.2 };
}
