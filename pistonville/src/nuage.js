/* nuage.js — copie de la sauvegarde sur le serveur qui héberge le jeu.
 *
 * Quand le jeu est servi par tools/serveur-pistonville.py, la partie est
 * aussi gardée sur le serveur : la même partie suit le joueur sur toutes les
 * adresses (maison, Tailscale) et survit à une fermeture brutale du jeu.
 * Ailleurs (fichier ouvert d'un double-clic, autre hébergeur), l'API répond
 * par une erreur et tout continue avec la seule sauvegarde du navigateur.
 */

const URL_API = 'api/sauvegarde';
let actif = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
let minuteur = null;
let derniere = null;

/** La sauvegarde du serveur, ou null (pas de serveur, rien d'enregistré). */
export async function lire() {
  if (!actif) return null;
  try {
    const r = await fetch(URL_API, { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) { actif = false; return null; }
    const p = await r.json();
    return p && Array.isArray(p.garage) ? p : null;
  } catch {
    actif = false;   // pas d'API ici : on n'insiste pas
    return null;
  }
}

function envoyer(json, garder = false) {
  return fetch(URL_API, { method: 'PUT', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: garder && json.length < 60000 })
    .then((r) => { if (r.status === 404 || r.status === 405 || r.status === 501) actif = false; })
    .catch(() => {});
}

/** Envoi groupé : au plus une fois toutes les 1,5 s. */
export function ecrire(partie) {
  if (!actif) return;
  derniere = JSON.stringify(partie);
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { envoyer(derniere); derniere = null; }, 1500);
}

/** Envoi immédiat (le jeu passe en arrière-plan ou se ferme). */
export function ecrireMaintenant(partie) {
  if (!actif) return;
  clearTimeout(minuteur);
  const json = JSON.stringify(partie);
  derniere = null;
  if (navigator.sendBeacon && json.length < 60000) {
    navigator.sendBeacon(URL_API, new Blob([json], { type: 'application/json' }));
  } else envoyer(json, true);
}

// --- Mise à jour du jeu sur le serveur ------------------------------------------------------

/** { version, enCours } du jeu servi, ou null (pas de serveur Pistonville). */
export async function versionServeur() {
  if (!actif) return null;
  try {
    const r = await fetch('api/version', { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v.version === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Demande au serveur de chercher et d'installer la dernière version. */
export async function demanderMiseAJour() {
  try {
    const r = await fetch('api/mise-a-jour', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    return r.ok;
  } catch {
    return false;
  }
}
