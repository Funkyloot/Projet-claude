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

/** Planches Kenney « Tiny » (16 px, CC0) : intérieurs, campagne. */
export const TINY = ['factory', 'town', 'battle', 'ski', 'farm'];

export async function chargerAssets() {
  const police = new FontFace('Jersey 10', `url(${urlAsset('assets/police/Jersey10.woff2')})`);
  const resultats = await Promise.all([
    chargerImage('assets/kenney/rpg-urban.png'),
    chargerImage('assets/kenney/course.png'),
    chargerImage('assets/kenney/modern-city.png'),
    chargerImage('assets/kenney/voitures-3d.png'),
    chargerImage('assets/kenney/voitures-3d-masque.png'),
    ...PROFILS.map((p) => chargerImage(`assets/kenney/profil/${p}.png`)),
    ...TINY.map((p) => chargerImage(`assets/kenney/tiny-${p}/tilemap_packed.png`)),
    // Sans la police, le jeu reste jouable avec la police de secours.
    police.load().then((f) => document.fonts.add(f)).catch(() => null),
  ]);
  const [urbain, course, ville, voitures, voituresMasque] = resultats;
  const profilsParNom = {};
  PROFILS.forEach((p, i) => { profilsParNom[p] = resultats[5 + i]; });
  const tiny = {};
  TINY.forEach((p, i) => { tiny[p] = resultats[5 + PROFILS.length + i]; });
  // Racing Pack (voitures, décor de course) et Roguelike Modern City (ville) rangés avec les planches Tiny.
  tiny.course = course;
  tiny.city = ville;
  // Car Kit : les véhicules rendus en 3D sous 32 angles, et le masque de leur carrosserie.
  tiny.voitures = voitures;
  tiny.voituresMasque = voituresMasque;
  return { urbain, profils: profilsParNom, tiny };
}
