/* pieces.js — les pièces détachées du pack de base.
 *
 * Six emplacements par voiture. Chaque pièce ajoute des points aux qualités
 * (1 à 100) ; certaines changent l'adhérence sur une surface, le nombre de
 * charges de nitro, ou l'apparence de la voiture (`look`).
 * `recherche` : niveau de recherche du labo qu'il faut avoir débloqué.
 */

const p = (id, nom, emplacement, rarete, prix, recherche, bonus, extra = {}) =>
  ({ id, nom, emplacement, rarete, prix, recherche, bonus, ...extra });

export default [
  // Moteurs
  p('moteur-4cyl', 'Moteur 4 cylindres', 'moteur', 'commune', 2500, 0, { vitesse: 6, acceleration: 6 }),
  p('moteur-v6', 'Moteur V6', 'moteur', 'commune', 6500, 1, { vitesse: 12, acceleration: 9 }, { look: 'prise' }),
  p('moteur-rotatif', 'Moteur rotatif', 'moteur', 'rare', 15000, 2, { vitesse: 22, acceleration: 10 }, { look: 'prise' }),
  p('moteur-hybride', 'Moteur hybride', 'moteur', 'rare', 16000, 2, { vitesse: 10, acceleration: 24 }, { look: 'prise' }),
  p('turbine', 'Turbine', 'moteur', 'super', 42000, 3, { vitesse: 34, acceleration: 8 }, { look: 'turbine' }),

  // Pneus
  p('pneus-route', 'Pneus route', 'pneus', 'commune', 1800, 0, { maniabilite: 6 }, { surfaces: { asphalte: 0.04 } }),
  p('pneus-tt', 'Pneus tout-terrain', 'pneus', 'commune', 2600, 1, { maniabilite: 4 }, { surfaces: { terre: 0.12, sable: 0.12 }, look: 'larges' }),
  p('pneus-pluie', 'Pneus pluie', 'pneus', 'rare', 7000, 1, { maniabilite: 6 }, { surfaces: { mouille: 0.16, paves: 0.06 } }),
  p('pneus-neige', 'Pneus neige', 'pneus', 'rare', 8000, 2, { maniabilite: 6 }, { surfaces: { glace: 0.22 } }),
  p('pneus-slicks', 'Pneus slicks', 'pneus', 'super', 30000, 3, { maniabilite: 16, vitesse: 4 }, { surfaces: { asphalte: 0.1 }, look: 'larges' }),

  // Boîtes de vitesses
  p('boite-5', 'Boîte 5 vitesses', 'boite', 'commune', 2200, 0, { acceleration: 7 }),
  p('boite-courte', 'Boîte courte', 'boite', 'rare', 9000, 1, { acceleration: 16, vitesse: -3 }),
  p('boite-longue', 'Boîte longue', 'boite', 'rare', 9000, 1, { vitesse: 15, acceleration: -3 }),
  p('boite-seq', 'Boîte séquentielle', 'boite', 'super', 32000, 3, { vitesse: 12, acceleration: 12 }),

  // Ailerons
  p('becquet', 'Becquet', 'aileron', 'commune', 2000, 0, { maniabilite: 5 }, { look: 'becquet' }),
  p('aileron-sport', 'Aileron sport', 'aileron', 'rare', 8500, 1, { maniabilite: 12, vitesse: 2 }, { look: 'aileron' }),
  p('aileron-gt', 'Aileron GT', 'aileron', 'super', 28000, 3, { maniabilite: 20, vitesse: 3 }, { look: 'aileronGT' }),

  // Nitro
  p('nitro-simple', 'Bouteille de nitro', 'nitro', 'commune', 3000, 0, {}, { charges: 2, look: 'nitro1' }),
  p('nitro-double', 'Double bouteille', 'nitro', 'rare', 11000, 2, {}, { charges: 3, look: 'nitro2' }),
  p('nitro-course', 'Kit nitro de course', 'nitro', 'super', 26000, 3, { acceleration: 4 }, { charges: 3, duree: 2.6, look: 'nitro2' }),

  // Châssis
  p('renforts', 'Renforts', 'chassis', 'commune', 2400, 0, { solidite: 10 }),
  p('arceau', 'Arceau de sécurité', 'chassis', 'rare', 9500, 1, { solidite: 20, maniabilite: 2 }, { look: 'arceau' }),
  p('coque-carbone', 'Coque carbone', 'chassis', 'super', 36000, 3, { solidite: 14, vitesse: 6, acceleration: 6 }, { look: 'carbone' }),
];
