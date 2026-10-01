/* vehicules.js — les voitures du pack de base.
 *
 * Qualités notées de 1 à 100. `profil` est l'image vue de côté (Kenney Pixel
 * Vehicle Pack) montrée en boutique ; en course, la voiture est dessinée vue
 * de dessus dans `couleur`.
 */

export default [
  {
    id: 'citadine-piston',
    nom: 'Citadine Piston',
    classe: 'D',
    prix: 8000,
    construction: { prix: 5000, jours: 1 },
    stats: { vitesse: 30, acceleration: 45, maniabilite: 50, solidite: 40 },
    couleur: '#f2c14e',
    profil: 'rounded_yellow',
  },
  {
    id: 'berline-boulevard',
    nom: 'Berline Boulevard',
    classe: 'D',
    prix: 11000,
    construction: { prix: 7500, jours: 1 },
    stats: { vitesse: 38, acceleration: 38, maniabilite: 42, solidite: 60 },
    couleur: '#4f7ddb',
    profil: 'sedan_blue',
  },
  {
    id: 'coupe-eclair',
    nom: 'Coupé Éclair',
    classe: 'C',
    prix: 22000,
    construction: { prix: 15000, jours: 2 },
    stats: { vitesse: 55, acceleration: 50, maniabilite: 45, solidite: 45 },
    couleur: '#3fa34d',
    profil: 'sports_green',
  },
  {
    id: 'roadster-nova',
    nom: 'Roadster Nova',
    classe: 'B',
    prix: 60000,
    construction: { prix: 42000, jours: 3 },
    stats: { vitesse: 72, acceleration: 66, maniabilite: 64, solidite: 50 },
    couleur: '#d6453b',
    profil: 'sports_red',
    licence: 'B',
  },
];
