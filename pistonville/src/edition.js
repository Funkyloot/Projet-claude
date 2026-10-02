/* edition.js — quelle édition du jeu tourne.
 *
 * STORE : l'application Android (Google Play). Le jeu y est entièrement sur
 * le téléphone : pas de copie de la sauvegarde sur un serveur, pas de
 * transfert de sauvegarde par code, pas de bouton « Mettre à jour le jeu »
 * (c'est Google Play qui met l'appli à jour). Fixé à la construction par
 * tools/build-pistonville.mjs (esbuild remplace __STORE__).
 */
/* global __STORE__ */
export const STORE = typeof __STORE__ !== 'undefined' && __STORE__ === true;
export const VERSION_JEU = '1.0.0';
