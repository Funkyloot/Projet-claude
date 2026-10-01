/* catalogue.js — la liste des packs de contenu, dans l'ordre de chargement.
 *
 * Une mise à jour = un nouveau dossier à côté de `base/` (véhicules, Grands
 * Prix, équipes, pièces : seulement les ajouts) et une ligne ici. Aucun autre fichier
 * du jeu ne change. Un identifiant publié ne disparaît jamais : on le masque
 * avec `masque: true` pour garder les sauvegardes valides.
 */

import vehiculesBase from './base/vehicules.js';
import grandsPrixBase from './base/grands-prix.js';
import equipesBase from './base/equipes.js';
import piecesBase from './base/pieces.js';
import objectifsBase from './base/objectifs.js';
import sponsorsBase from './base/sponsors.js';
import evenementsBase from './base/evenements.js';
import batimentsBase from './base/batiments.js';

const packs = [
  { id: 'base', vehicules: vehiculesBase, grandsPrix: grandsPrixBase, equipes: equipesBase, pieces: piecesBase,
    objectifs: objectifsBase, sponsors: sponsorsBase, evenements: evenementsBase, batiments: batimentsBase },
];

function fusionner(cle) {
  const parId = new Map();
  for (const pack of packs) {
    for (const element of pack[cle] || []) parId.set(element.id, element);
  }
  return [...parId.values()].filter((e) => !e.masque);
}

export const VEHICULES = fusionner('vehicules');
export const GRANDS_PRIX = fusionner('grandsPrix');
export const EQUIPES = fusionner('equipes');
export const PIECES = fusionner('pieces');
export const OBJECTIFS = fusionner('objectifs');
export const SPONSORS = fusionner('sponsors');
export const EVENEMENTS = fusionner('evenements');
export const BATIMENTS = fusionner('batiments');
