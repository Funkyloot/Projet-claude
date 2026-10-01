/* sponsors.js — les sponsors, débloqués par le nombre de fans.
 *
 * Un seul contrat à la fois. Effets appliqués à chaque manche courue :
 *   prime : part en plus sur la prime de course (0,15 = +15 %)
 *   fans : part en plus sur les fans gagnés
 *   recherche : points de recherche en plus
 *   argent : somme fixe versée à chaque manche
 */

export default [
  { id: 'boulangerie', nom: 'Boulangerie du Coin', couleur: '#d08a3e', fans: 0, effets: { argent: 300 }, texte: '+300 G à chaque manche' },
  { id: 'soda-turbo', nom: 'Soda Turbo', couleur: '#e4432d', fans: 60, effets: { prime: 0.15 }, texte: '+15 % sur les primes' },
  { id: 'radio', nom: 'Radio Pistonville', couleur: '#2f6fdb', fans: 150, effets: { fans: 0.3 }, texte: '+30 % de fans' },
  { id: 'labotech', nom: 'LaboTech', couleur: '#7a5ac8', fans: 300, effets: { recherche: 2 }, texte: '+2 PR à chaque manche' },
  { id: 'gomme', nom: 'Pneus Gomme+', couleur: '#2a2838', fans: 700, effets: { prime: 0.25, recherche: 1 }, texte: '+25 % de primes, +1 PR' },
  { id: 'mega-auto', nom: 'Méga Auto', couleur: '#f2c14e', fans: 1600, effets: { prime: 0.4, fans: 0.2 }, texte: '+40 % de primes, +20 % de fans' },
  { id: 'orbital', nom: 'Orbital Énergie', couleur: '#4fc3d8', fans: 4000, effets: { prime: 0.6, fans: 0.3, recherche: 3 }, texte: '+60 % de primes, +30 % de fans, +3 PR' },
];
