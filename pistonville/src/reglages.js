/* reglages.js — les paramètres du joueur, gardés sur l'appareil (pas dans la partie).
 *
 * musique, effets : volumes de 0 à 1 ; vibrations : sur les chocs ;
 * economie : 30 images par seconde au lieu de 60, pour la batterie.
 * L'aide au pilotage, elle, appartient à la partie (partie.aide).
 */

const CLE = 'pistonville-reglages';
export const DEFAUTS = { musique: 0.5, effets: 0.8, vibrations: true, economie: false };

export function lireReglages() {
  try { return { ...DEFAUTS, ...JSON.parse(localStorage.getItem(CLE) || '{}') }; } catch { return { ...DEFAUTS }; }
}

export function ecrireReglages(r) {
  try { localStorage.setItem(CLE, JSON.stringify(r)); } catch { /* stockage refusé : réglages pour cette session seulement */ }
}
