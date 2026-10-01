/* personnel.js — métiers, traits et méthodes de recrutement.
 *
 * Comme dans Game Dev Story et Hot Springs Story 2 : plus la méthode de
 * recrutement coûte cher, meilleurs sont les candidats ; chacun a un
 * potentiel (S à D, la vitesse à laquelle il progresse) et parfois un trait
 * (façon Two Point Hospital). Le salaire est versé chaque semaine.
 */

export const METIERS = {
  mecano: { nom: 'Mécanicien', stat: 'technique', texte: 'Ponts élévateurs, atelier de précision.' },
  ingenieur: { nom: 'Ingénieur', stat: 'analyse', texte: "Bureau d'études, soufflerie, bancs d'essai, simulateurs." },
  commercial: { nom: 'Commercial', stat: 'charisme', texte: 'Cafétéria, boutique, tribune.' },
};

export const STATS_PERSONNEL = { technique: 'Technique', analyse: 'Analyse', charisme: 'Charisme' };

export const POTENTIELS = { S: 1.6, A: 1.35, B: 1.15, C: 1, D: 0.85 };

export const TRAITS = [
  { id: 'infatigable', nom: 'Infatigable', texte: 'Se fatigue deux fois moins.' },
  { id: 'genie', nom: 'Génie', texte: '+2 en analyse.' },
  { id: 'bricoleur', nom: 'Bricoleur', texte: '+2 en technique.' },
  { id: 'star', nom: 'Star', texte: '+2 en charisme, attire des fans.' },
  { id: 'rapide', nom: 'Rapide', texte: 'Travaille 15 % plus vite.' },
  { id: 'econome', nom: 'Économe', texte: 'Salaire −20 %.' },
  { id: 'polyvalent', nom: 'Polyvalent', texte: 'Peut travailler dans tous les bâtiments.' },
  { id: 'raleur', nom: 'Râleur', texte: 'Perd vite le moral, mais très doué (+1 partout).' },
];

/** Méthodes de recrutement : prix, rang requis, nombre de candidats, niveau des stats, potentiels possibles. */
export const RECRUTEMENTS = [
  { id: 'bouche', nom: 'Bouche-à-oreille', prix: 1000, rang: 1, candidats: 3, stats: [1, 4], potentiels: 'DDCCB' },
  { id: 'annonce', nom: 'Petite annonce', prix: 6000, rang: 3, candidats: 3, stats: [2, 6], potentiels: 'DCCBBA' },
  { id: 'ecole', nom: "École d'ingénieurs", prix: 25000, rang: 6, candidats: 4, stats: [4, 8], potentiels: 'CBBAAS' },
  { id: 'chasseur', nom: 'Chasseur de têtes', prix: 120000, rang: 12, candidats: 3, stats: [7, 11], potentiels: 'BAASS' },
];

export const PRENOMS = [
  'Marcel', 'Josiane', 'Kevin', 'Fatou', 'Bruno', 'Yasmine', 'Gégé', 'Nadia', 'Hugo', 'Lucie', 'Samir', 'Agathe',
  'Paulo', 'Mireille', 'Tonio', 'Chloé', 'Rachid', 'Inès', 'Dédé', 'Margaux', 'Ibrahim', 'Solène', 'Jojo', 'Awa',
  'Bernard', 'Léon', 'Zoé', 'Moussa', 'Odile', 'Titouan', 'Aïcha', 'Raymond',
];
export const SURNOMS = ['la Clé', 'Turbo', 'Boulon', 'Piston', 'Calcul', 'Pneu', 'Micro', 'Volt', 'Chrono', 'Sourire', 'Graisse', 'Radar'];
