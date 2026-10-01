/* assets.js — chargement des images et de la police.
 *
 * En développement, les fichiers sont lus dans `assets/`. Dans la version en
 * un seul fichier (dist/pistonville.html), l'outil de construction les range
 * dans window.__PV_ASSETS sous forme d'URL data:, et on les prend là.
 */

export function urlAsset(chemin) {
  return (typeof window !== 'undefined' && window.__PV_ASSETS && window.__PV_ASSETS[chemin]) || chemin;
}

function chargerImage(chemin) {
  return new Promise((ok, erreur) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erreur(new Error(`Image introuvable : ${chemin}`));
    img.src = urlAsset(chemin);
  });
}

export const PROFILS = ['rounded_yellow', 'sedan_blue', 'sports_green', 'sports_red', 'sports_race', 'formula', 'kart', 'buggy', 'suv', 'convertible', 'sports_convertible', 'sports_yellow', 'sedan_vintage'];

export async function chargerAssets() {
  const police = new FontFace('Jersey 10', `url(${urlAsset('assets/police/Jersey10.woff2')})`);
  const resultats = await Promise.all([
    chargerImage('assets/kenney/rpg-urban.png'),
    ...PROFILS.map((p) => chargerImage(`assets/kenney/profil/${p}.png`)),
    // Sans la police, le jeu reste jouable avec la police de secours.
    police.load().then((f) => document.fonts.add(f)).catch(() => null),
  ]);
  const urbain = resultats[0];
  const profilsParNom = {};
  PROFILS.forEach((p, i) => { profilsParNom[p] = resultats[1 + i]; });
  return { urbain, profils: profilsParNom };
}
