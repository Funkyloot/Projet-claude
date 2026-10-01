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

// --- Pilotes ----------------------------------------------------------------------------------
//
// Les pilotes font partie de l'équipe : on les recrute, on les entraîne, on les
// paie chaque semaine et on peut les renvoyer. Une écurie engage au plus deux
// pilotes dans une même course : le titulaire (c'est toi qui conduis) et un
// second pilote qui court seul, sur une autre voiture du garage.

export const PILOTES_MAX = 4;

export const TRAITS_PILOTE = [
  { id: 'fondatrice', nom: 'Pilote maison', texte: 'Là depuis le premier jour : ne demande pas de salaire.' },
  { id: 'prodige', nom: 'Prodige', texte: 'Gagne 30 % d’EXP en plus.' },
  { id: 'star', nom: 'Star', texte: '+10 % de fans en course.' },
  { id: 'econome', nom: 'Économe', texte: 'Salaire −20 %.' },
  { id: 'soigneux', nom: 'Soigneux', texte: 'La voiture s’use 25 % moins.' },
  { id: 'fonceur', nom: 'Fonceur', texte: '+2 en sang-froid, mais abîme un peu plus la voiture.' },
  { id: 'virtuose', nom: 'Virtuose', texte: '+2 en technique.' },
];

/** Recrutement de pilotes : plus c'est cher, plus les candidats sont expérimentés. */
export const RECRUTEMENTS_PILOTES = [
  { id: 'karting', nom: 'Club de karting', prix: 2000, rang: 1, candidats: 3, stats: [0, 2], niveau: [1, 2], potentiels: 'DCCBB' },
  { id: 'formule', nom: 'École de pilotage', prix: 15000, rang: 4, candidats: 3, stats: [2, 5], niveau: [3, 6], potentiels: 'CBBAA' },
  { id: 'mercato', nom: 'Mercato des écuries', prix: 80000, rang: 9, candidats: 3, stats: [5, 9], niveau: [8, 14], potentiels: 'BAASS' },
  { id: 'legende', nom: 'Retour d’une légende', prix: 250000, rang: 15, candidats: 2, stats: [9, 13], niveau: [16, 22], potentiels: 'AS' },
];

export const PRENOMS_PILOTES = [
  'Enzo', 'Maëlle', 'Jules', 'Nina', 'Malik', 'Sacha', 'Romy', 'Diego', 'Elsa', 'Tiago', 'Lina',
  'Oscar', 'Jade', 'Kylian', 'Alma', 'Noé', 'Capucine', 'Yanis', 'Manon', 'Ayoub', 'Louna', 'Gaspard', 'Rose',
];
export const NOMS_PILOTES = ['Vitesse', 'Lebrun', 'Martin', 'Diallo', 'Rossi', 'Moreau', 'Nguyen', 'Garcia', 'Benali', 'Leroy', 'Fontaine', 'Costa'];
