/* objectifs.js — pack « Grand Garage » : des caps pour les saisons 5 à 10 et la carrière+.
 * Ils arrivent après ceux du pack de base, dans cet ordre.
 */

const o = (id, titre, but, valeur, recompense) => ({ id, titre, but, valeur, recompense });
const trophees = (p) => Object.values(p.trophees || {}).filter((x) => x === 1).length;
const voituresDifferentes = (p) => new Set((p.garage || []).map((v) => v.modele)).size;

export default [
  o('labo-5', 'Atteins le niveau 5 du labo', 5, (p) => p.labo, { tickets: 3 }),
  o('collection-40', 'Collectionne 40 pièces différentes', 40, (p) => Object.keys(p.collection || {}).length, { recherche: 80 }),
  o('trophees-10', 'Remporte 10 Grands Prix différents', 10, trophees, { argent: 60000 }),
  o('garage-8', 'Possède 8 modèles de voitures différents', 8, voituresDifferentes, { tickets: 4 }),
  o('victoires-25', 'Gagne 25 manches', 25, (p) => p.victoires, { recherche: 150 }),
  o('labo-9', 'Atteins le dernier niveau du labo', 9, (p) => p.labo, { argent: 150000 }),
  o('collection-75', 'Collectionne 75 pièces différentes', 75, (p) => Object.keys(p.collection || {}).length, { tickets: 6 }),
  o('trophees-25', 'Remporte 25 Grands Prix différents', 25, trophees, { argent: 250000 }),
  o('legendes-bronze', 'Remporte le Défi des Légendes : Bronze', 1, (p) => (p.trophees['legendes-bronze'] === 1 ? 1 : 0), { recherche: 300 }),
  o('collection-toutes', 'Complète l’album des pièces', 97, (p) => Object.keys(p.collection || {}).length, { argent: 500000 }),
  o('legendes-or', 'Remporte le Défi des Légendes : Or', 1, (p) => (p.trophees['legendes-or'] === 1 ? 1 : 0), { argent: 1000000 }),
];
