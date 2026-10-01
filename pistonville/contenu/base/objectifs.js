/* objectifs.js — la suite d'objectifs qui guide la partie.
 *
 * Trois objectifs sont proposés à la fois, dans l'ordre de la liste : les
 * premiers servent de tutoriel (on apprend en jouant), les suivants donnent
 * toujours un cap à moyen terme. Chacun est récompensé dès qu'il est atteint.
 * `valeur(p)` lit la sauvegarde ; l'objectif est atteint quand elle vaut `but`.
 */

const o = (id, titre, but, valeur, recompense) => ({ id, titre, but, valeur, recompense });
const licence = (p, l) => ([null, 'C', 'B', 'A', 'S'].indexOf(p.licence) >= [null, 'C', 'B', 'A', 'S'].indexOf(l) ? 1 : 0);
const stat = (p, cle) => (p.stats && p.stats[cle]) || 0;

export default [
  o('premiere-voiture', 'Construis ou achète ta première voiture', 1, (p) => p.garage.length, { argent: 1000 }),
  o('inscription', 'Inscris-toi à un Grand Prix ouvert', 1, (p) => Object.keys(p.inscriptions).length, { recherche: 5 }),
  o('premiere-course', 'Termine ta première manche', 1, (p) => stat(p, 'courses'), { argent: 800 }),
  o('monter-piece', 'Monte une pièce sur ta voiture', 1, (p) => (p.garage.some((v) => Object.keys(v.pieces || {}).length) ? 1 : 0), { tickets: 1 }),
  o('balade', 'Fais une balade en ville', 1, (p) => (p.villeJour > 0 ? 1 : 0), { recherche: 5 }),
  o('podium', 'Monte sur un podium', 1, (p) => p.podiums, { argent: 1500 }),
  o('drift', 'Tiens un drift pendant 2 secondes', 2, (p) => Math.floor(stat(p, 'driftMax') * 10) / 10, { recherche: 10 }),
  o('depart-parfait', 'Réussis un départ parfait', 1, (p) => stat(p, 'departsParfaits'), { tickets: 1 }),
  o('or-50', "Ramasse 50 pièces d'or en course", 50, (p) => stat(p, 'piecesOr'), { argent: 2000 }),
  o('labo-1', 'Atteins le niveau 1 du labo', 1, (p) => p.labo, { tickets: 1 }),
  o('rang-3', "Fais monter l'équipe au rang 3", 3, (p) => p.rang, { argent: 3000 }),
  o('victoire', 'Gagne une manche', 1, (p) => p.victoires, { recherche: 15 }),
  o('trophee', 'Remporte un Grand Prix', 1, (p) => (Object.values(p.trophees).includes(1) ? 1 : 0), { argent: 5000 }),
  o('licence-c', 'Obtiens la licence C', 1, (p) => licence(p, 'C'), { recherche: 20 }),
  o('trois-etoiles', 'Construis une voiture 3 étoiles ou plus', 1, (p) => (p.garage.some((v) => (v.qualite || 0) >= 2) ? 1 : 0), { tickets: 2 }),
  o('sponsor', 'Signe un contrat de sponsor', 1, (p) => (p.sponsor ? 1 : 0), { argent: 1000 }),
  o('collection-10', 'Collectionne 10 pièces différentes', 10, (p) => Object.keys(p.collection || {}).length, { recherche: 30 }),
  o('fans-500', 'Rassemble 500 fans', 500, (p) => p.fans, { tickets: 2 }),
  o('super-rare', 'Obtiens une pièce super rare', 1, (p) => stat(p, 'superRares'), { argent: 10000 }),
  o('licence-b', 'Obtiens la licence B', 1, (p) => licence(p, 'B'), { recherche: 50 }),
  o('rang-10', "Fais monter l'équipe au rang 10", 10, (p) => p.rang, { argent: 20000 }),
  o('fans-3000', 'Rassemble 3 000 fans', 3000, (p) => p.fans, { tickets: 3 }),
  o('licence-a', 'Obtiens la licence A', 1, (p) => licence(p, 'A'), { recherche: 80 }),
  o('legendaire', 'Construis une voiture légendaire (5 étoiles)', 1, (p) => (p.garage.some((v) => (v.qualite || 0) >= 4) ? 1 : 0), { argent: 50000 }),
  o('licence-s', 'Obtiens la licence S', 1, (p) => licence(p, 'S'), { recherche: 150 }),
  o('mondial', 'Remporte le Grand Prix Mondial', 1, (p) => (p.trophees['gp-mondial'] === 1 ? 1 : 0), { argent: 200000 }),
];
