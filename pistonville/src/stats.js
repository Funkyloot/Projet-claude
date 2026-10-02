/* stats.js — statistiques de jeu (Google Analytics pour Firebase), dans l'appli Android.
 *
 * Le jeu signale quelques moments clés (course terminée, balade, bonus vidéo,
 * Pack du fondateur, onglet ouvert, progression) ; l'application les
 * transmet à Firebase, qui ajoute de lui-même le temps de jeu, les sessions
 * et la fidélisation. Aucune donnée personnelle : pas de nom, pas de partie
 * entière, seulement des compteurs et des catégories. Le joueur peut couper
 * les statistiques dans les paramètres ; en Europe, elles suivent son choix
 * de consentement. Dans la version web, rien n'est envoyé.
 *
 * Noms d'événements : lettres minuscules et « _ », 40 caractères au plus ;
 * paramètres : 25 au plus, valeurs courtes (règles de Firebase).
 */

const pont = () => (typeof window !== 'undefined' && window.PistonvilleAndroid) || null;

export function signaler(nom, params = {}) {
  const p = pont();
  if (!p?.evenement) return;
  const propres = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    propres[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'boolean' ? (v ? 1 : 0) : String(v).slice(0, 100);
  }
  try { p.evenement(nom, JSON.stringify(propres)); } catch { /* l'appli n'écoute pas : tant pis */ }
}

/** Active ou coupe l'envoi (réglage du joueur). */
export function activer(oui) {
  try { pont()?.statistiques?.(!!oui); } catch { /* rien */ }
}
