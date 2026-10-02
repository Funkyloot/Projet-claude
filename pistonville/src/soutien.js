/* soutien.js — le Pack du fondateur et les bonus vidéo, dans l'application Android.
 *
 * Le jeu reste entièrement jouable sans payer et sans regarder de publicité :
 *   - bonus vidéo (facultatifs) : après une course ou une balade, regarder une
 *     courte publicité double la prime ou les gains ;
 *   - Pack du fondateur (achat unique, prix fixé dans la Play Console) : pour
 *     soutenir le jeu ; il donne les bonus vidéo sans publicité, une peinture
 *     or exclusive, 25 000 G et 3 tickets de tombola.
 * Les publicités et l'achat passent par l'application (android/, objet
 * PistonvilleAndroid) ; dans la version web, rien de tout cela n'apparaît.
 */

export const OR_FONDATEUR = '#d4a640';
export const CADEAU_FONDATEUR = { argent: 25000, tickets: 3 };

const pont = () => (typeof window !== 'undefined' && window.PistonvilleAndroid) || null;
const appel = (nom, ...args) => { try { return pont()?.[nom]?.(...args); } catch { return undefined; } };

/** L'application Android est là (achats et publicités possibles). */
export const dansLAppli = () => !!pont();
/** Une publicité récompensée est chargée et prête. */
export const pubPrete = () => !!appel('pubPrete');
/** Prix du pack tel que l'affiche Google Play (« 4,00 € »), ou null. */
export const prixFondateur = () => appel('prixFondateur') || null;
/** Le joueur doit pouvoir revoir ses choix de consentement (Europe). */
export const confidentialiteModifiable = () => !!appel('confidentialiteRequise');
export const ouvrirConfidentialite = () => appel('ouvrirConfidentialite');
export const acheterFondateur = () => appel('acheterFondateur');

let attentePub = null;
/** Montre une publicité récompensée ; la promesse dit si la récompense est gagnée. */
export function regarderPub() {
  return new Promise((ok) => {
    if (!pubPrete()) { ok(false); return; }
    attentePub = ok;
    appel('montrerPub');
  });
}

/** Réponses de l'application (appelée par app.evenementAndroid). */
export function recevoir(type, valeur) {
  if (type === 'pub' && attentePub) { const ok = attentePub; attentePub = null; ok(valeur === true || valeur === 'true'); }
}
