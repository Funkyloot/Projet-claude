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
    licence: 'C',
  },
  {
    id: 'kart-pistache', nom: 'Kart Pistache', classe: 'D', prix: 9500,
    construction: { prix: 6500, jours: 1 },
    stats: { vitesse: 28, acceleration: 58, maniabilite: 62, solidite: 25 },
    couleur: '#9fe870', profil: 'kart',
  },
  {
    id: 'buggy-dune', nom: 'Buggy des Dunes', classe: 'C', prix: 26000,
    construction: { prix: 18000, jours: 2 },
    stats: { vitesse: 48, acceleration: 56, maniabilite: 58, solidite: 52 },
    couleur: '#f39c33', profil: 'buggy',
    // Taillé pour la terre et le sable.
    surfaces: { terre: 0.1, sable: 0.12 },
  },
  {
    id: 'tout-terrain-roc', nom: 'Tout-terrain Roc', classe: 'C', prix: 28000,
    construction: { prix: 19500, jours: 2 },
    stats: { vitesse: 50, acceleration: 44, maniabilite: 48, solidite: 72 },
    couleur: '#5c6278', profil: 'suv',
    surfaces: { glace: 0.08, mouille: 0.06 },
  },
  {
    id: 'cabriolet-riviera', nom: 'Cabriolet Riviera', classe: 'B', prix: 68000,
    construction: { prix: 47000, jours: 3 },
    stats: { vitesse: 70, acceleration: 70, maniabilite: 70, solidite: 46 },
    couleur: '#e86ca6', profil: 'convertible', licence: 'C',
  },
  {
    id: 'speedster-zenith', nom: 'Speedster Zénith', classe: 'A', prix: 140000,
    construction: { prix: 98000, jours: 4 },
    stats: { vitesse: 84, acceleration: 78, maniabilite: 76, solidite: 52 },
    couleur: '#2f6fdb', profil: 'sports_convertible', licence: 'B',
  },
  {
    id: 'gt-soleil', nom: 'GT Soleil', classe: 'A', prix: 155000,
    construction: { prix: 108000, jours: 4 },
    stats: { vitesse: 80, acceleration: 84, maniabilite: 82, solidite: 58 },
    couleur: '#f2c14e', profil: 'sports_yellow', licence: 'B',
  },
  {
    id: 'proto-eclipse', nom: 'Proto Éclipse', classe: 'S', prix: 320000,
    construction: { prix: 225000, jours: 5 },
    stats: { vitesse: 92, acceleration: 88, maniabilite: 86, solidite: 60 },
    couleur: '#2a2838', profil: 'sports_race', licence: 'A',
  },
  {
    id: 'formule-piston', nom: 'Formule Piston', classe: 'S', prix: 380000,
    construction: { prix: 265000, jours: 5 },
    stats: { vitesse: 96, acceleration: 92, maniabilite: 92, solidite: 48 },
    couleur: '#e4432d', profil: 'formula', licence: 'A',
  },
  {
    id: 'ancetre-1936', nom: 'Ancêtre 1936', classe: 'D', prix: 15000,
    construction: { prix: 12000, jours: 1 },
    stats: { vitesse: 34, acceleration: 34, maniabilite: 40, solidite: 70 },
    couleur: '#8a5a3b', profil: 'sedan_vintage',
    // Voiture de collection : elle attire le public.
    fans: 0.25,
  },
];
