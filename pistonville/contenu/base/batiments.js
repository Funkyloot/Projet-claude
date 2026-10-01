/* batiments.js — ce qu'on peut construire sur le terrain du garage.
 *
 * Inspiré des terrains de Grand Prix Story 2 et des combos de Mega Mall Story :
 *   - les bâtiments occupent des cases (l × h), montent de niveau, et
 *     travaillent mieux avec du personnel affecté (`metier`, `places`) ;
 *   - le décor ne fait rien seul mais rend les bâtiments voisins plus
 *     efficaces (`ambiance` : 100 % au contact, 50 % à deux cases) ;
 *   - certains trios de bâtiments voisins forment un combo.
 *
 * `effet` : ce que produit le bâtiment par niveau (voir src/garage.js).
 * `rang` : rang d'équipe nécessaire pour le construire.
 */

const b = (id, nom, l, h, prix, effet, extra = {}) => ({ id, nom, l, h, prix, effet, categorie: 'batiment', niveauMax: 5, places: 0, rang: 1, ...extra });
const d = (id, nom, l, h, prix, ambiance, extra = {}) => ({ id, nom, l, h, prix, ambiance, categorie: 'decor', niveauMax: 1, places: 0, rang: 1, ...extra });

export default [
  // --- Atelier et conception -------------------------------------------------
  b('pont', 'Pont élévateur', 2, 2, 15000, { atelier: 12 },
    { metier: 'mecano', places: 2, couleur: '#7e7c93', texte: 'Les mécaniciens y montent les voitures : meilleures constructions, réparations moins chères.' }),
  b('bureau-etudes', "Bureau d'études", 2, 2, 12000, { conception: 15 },
    { metier: 'ingenieur', places: 1, couleur: '#4f7ddb', rang: 2, texte: 'Plans des voitures : plus de chances de construire 4 ou 5 étoiles.' }),
  b('soufflerie', 'Soufflerie', 2, 2, 22000, { conception: 25 },
    { metier: 'ingenieur', places: 1, couleur: '#9fd3ff', rang: 4, texte: "Essais d'aérodynamique : encore plus d'étoiles à la construction." }),
  b('precision', 'Atelier de précision', 2, 1, 30000, { reglages: 1 },
    { metier: 'mecano', places: 1, couleur: '#c9ccd4', rang: 7, niveauMax: 3, texte: '+1 cran de réglage par qualité et par niveau.' }),

  // --- Recherche -------------------------------------------------------------
  b('banc', "Banc d'essai", 2, 1, 15000, { recherche: 1 },
    { metier: 'ingenieur', places: 1, couleur: '#3fa34d', rang: 2, texte: 'Points de recherche chaque matin.' }),
  b('analyse', "Salle d'analyse", 2, 2, 30000, { recherche: 2 },
    { metier: 'ingenieur', places: 2, couleur: '#8a6ad6', rang: 5, texte: 'Les ingénieurs étudient les courses : beaucoup de points de recherche.' }),

  // --- Équipe ----------------------------------------------------------------
  b('repos', 'Salle de repos', 2, 1, 5000, { capacite: 3, repos: 15 },
    { couleur: '#e86ca6', niveauMax: 3, texte: "+3 places dans l'équipe ; le personnel y récupère son énergie." }),
  b('cafeteria', 'Cafétéria', 2, 1, 9000, { revenu: 400, repos: 8 },
    { metier: 'commercial', places: 1, couleur: '#d08a3e', rang: 2, texte: 'Rapporte un peu chaque jour et redonne de l’énergie à tous.' }),
  b('sport', 'Salle de sport', 2, 1, 12000, { pilote: 15 },
    { couleur: '#e4432d', rang: 3, texte: "EXP de pilote chaque jour." }),

  // --- Fans et argent --------------------------------------------------------
  b('distributeur', 'Distributeur', 1, 1, 2000, { revenu: 150 },
    { couleur: '#2f6fdb', niveauMax: 5, texte: 'Quelques pièces chaque jour, sans personnel.' }),
  b('boutique', 'Boutique de souvenirs', 2, 1, 18000, { boutique: 0.02 },
    { metier: 'commercial', places: 1, couleur: '#f2c14e', rang: 4, texte: 'Rapporte selon le nombre de fans.' }),
  b('tribune', 'Tribune des fans', 2, 2, 30000, { fans: 0.08 },
    { metier: 'commercial', places: 1, couleur: '#c2504d', rang: 6, texte: '+8 % de fans en course par niveau.' }),

  // --- Simulateurs -------------------------------------------------------------
  b('simu-route', 'Simulateur route', 2, 1, 20000, { surfaces: { asphalte: 0.03, paves: 0.03 } },
    { metier: 'ingenieur', places: 1, couleur: '#5c6278', rang: 5, texte: 'Meilleure adhérence sur asphalte et pavés.' }),
  b('simu-terre', 'Simulateur rallye', 2, 1, 20000, { surfaces: { terre: 0.04, sable: 0.04 } },
    { metier: 'ingenieur', places: 1, couleur: '#8a6a4f', rang: 6, texte: 'Meilleure adhérence sur terre et sable.' }),
  b('simu-glace', 'Simulateur neige', 2, 1, 20000, { surfaces: { glace: 0.05, mouille: 0.04 } },
    { metier: 'ingenieur', places: 1, couleur: '#a9c6d8', rang: 8, texte: 'Meilleure adhérence sur glace et mouillé.' }),

  // --- Décor -------------------------------------------------------------------
  d('fleurs', 'Massif de fleurs', 1, 1, 300, 3, { texte: 'Un peu de couleur.' }),
  d('banc-public', 'Banc', 1, 1, 500, 3, { texte: 'Les mécanos aiment s’y poser.' }),
  d('arbre', 'Arbre', 1, 1, 800, 5, { texte: 'De l’ombre l’été.' }),
  d('lampadaire', 'Lampadaire', 1, 1, 1200, 5, { texte: 'Pour les nuits de travail.' }),
  d('drapeaux', 'Mât à drapeaux', 1, 1, 2500, 8, { rang: 3, texte: 'Les couleurs de l’écurie.' }),
  d('fontaine', 'Fontaine', 2, 1, 15000, 18, { rang: 4, texte: 'Le bruit de l’eau détend tout le monde.' }),
  d('statue', 'Statue du champion', 1, 1, 8000, 22, { rang: 5, condition: 'trophee', texte: 'Débloquée par une victoire en Grand Prix.' }),
  d('bassin', 'Bassin aux carpes', 2, 2, 40000, 40, { rang: 8, texte: 'Très chic.' }),
  d('tour', 'Tour panoramique', 2, 2, 120000, 70, { rang: 12, texte: 'On la voit de toute la ville.' }),
];

/**
 * Combos : trois bâtiments différents qui se touchent (en chaîne). Ils se
 * découvrent en jouant ; l'album les garde.
 */
export const COMBOS = [
  { id: 'pause-cafe', nom: 'Pause café', ids: ['repos', 'cafeteria', 'distributeur'], texte: 'Récupération d’énergie +50 %', bonus: { repos: 0.5 } },
  { id: 'cellule-rd', nom: 'Cellule R&D', ids: ['bureau-etudes', 'soufflerie', 'banc'], texte: 'Conception +40 %', bonus: { conception: 0.4 } },
  { id: 'labo-total', nom: 'Labo total', ids: ['banc', 'analyse', 'bureau-etudes'], texte: 'Recherche +40 %', bonus: { recherche: 0.4 } },
  { id: 'village-fans', nom: 'Village des fans', ids: ['boutique', 'tribune', 'fontaine'], texte: 'Fans +10 %, boutique +50 %', bonus: { fans: 0.1, boutique: 0.5 } },
  { id: 'preparation', nom: 'Préparation physique', ids: ['sport', 'repos', 'banc-public'], texte: 'EXP de pilote +50 %', bonus: { pilote: 0.5 } },
  { id: 'atelier-pro', nom: 'Atelier pro', ids: ['pont', 'precision', 'lampadaire'], texte: 'Atelier +30 %', bonus: { atelier: 0.3 } },
  { id: 'circuit-virtuel', nom: 'Circuit virtuel', ids: ['simu-route', 'simu-terre', 'simu-glace'], texte: 'Simulateurs ×2', bonus: { surfaces: 1 } },
  { id: 'jardin', nom: 'Jardin d’hiver', ids: ['arbre', 'fleurs', 'bassin'], texte: 'Tout le garage +5 %', bonus: { tout: 0.05 } },
];

/** Agrandir le terrain : deux rangées de plus à chaque permis. */
export const PERMIS = [8000, 40000, 150000, 400000];
