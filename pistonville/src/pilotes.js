/* pilotes.js — les pilotes de l'écurie.
 *
 * Comme le reste du personnel, un pilote se recrute, s'entraîne, touche un
 * salaire chaque semaine et peut être renvoyé (ou démissionner s'il n'est
 * pas payé). Il gagne de l'EXP en course ; chaque niveau donne un point à
 * placer en technique, sang-froid ou charisme.
 *
 * En course, une écurie aligne au plus deux pilotes : le titulaire, que l'on
 * conduit soi-même, et un second pilote qui court seul sur une autre voiture
 * du garage. Les écuries adverses suivent la même règle.
 */

import { POTENTIELS } from '../contenu/base/personnel.js';
import { PILOTES_MAX, TRAITS_PILOTE, RECRUTEMENTS_PILOTES, PRENOMS_PILOTES, NOMS_PILOTES } from '../contenu/base/personnel.js';
import { creerAlea } from './outils.js';
import { tenue } from './tiny.js';

export { PILOTES_MAX, TRAITS_PILOTE, RECRUTEMENTS_PILOTES };

export const STATS_PILOTE = {
  technique: { nom: 'Technique', texte: '+1,2 % d\'adhérence par point' },
  sangfroid: { nom: 'Sang-froid', texte: '+0,08 s de nitro par point' },
  charisme: { nom: 'Charisme', texte: '+5 % de fans par point' },
};

export const expPilote = (niv) => Math.round(70 * niv ** 1.3);
const uid = () => `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export function salairePilote(p) {
  if (p.trait === 'fondatrice') return 0;
  const somme = p.stats.technique + p.stats.sangfroid + p.stats.charisme;
  let base = 400 + somme * 110 + (p.niveau - 1) * 90;
  base *= { S: 1.4, A: 1.2, B: 1.05, C: 1, D: 0.9 }[p.potentiel] || 1;
  if (p.trait === 'econome') base *= 0.8;
  return Math.round(base / 10) * 10;
}

/** La pilote du premier jour : Léa, qui ne demande pas de salaire. */
export function piloteDepart(ancien = {}) {
  const p = {
    uid: 'p-lea', nom: ancien.nom || 'Léa', niveau: ancien.niveau || 1, exp: ancien.exp || 0, points: ancien.points || 0,
    stats: { technique: 0, sangfroid: 0, charisme: 0, ...(ancien.stats || {}) },
    potentiel: 'B', trait: 'fondatrice', moral: 90, impayes: 0, apparence: 4, casque: '#e4432d', embauche: 1,
  };
  p.salaire = salairePilote(p);
  return p;
}

const CASQUES = ['#e4432d', '#2f6fdb', '#3fa34d', '#f2c14e', '#8a6ad6', '#f39c33', '#e86ca6', '#f4f6fb', '#2a2838', '#4fc3d8'];

// --- Qui court ---------------------------------------------------------------------------------

export const titulaire = (partie) => partie.pilotes.find((p) => p.uid === partie.titulaire) || partie.pilotes[0] || null;

/** Le second pilote engagé, s'il est valide (un autre pilote, sur une autre voiture). */
export function engagement(partie) {
  const t = titulaire(partie);
  const s = partie.pilotes.find((p) => p.uid === partie.second && p !== t) || null;
  const actif = partie.garage.find((g) => g.uid === partie.voitureActive) || partie.garage[0];
  const v = s && partie.garage.find((g) => g.uid === partie.voitureSecond && g !== actif);
  return { titulaire: t, second: s && v ? s : null, voitureSecond: s && v ? v : null };
}

export function choisirTitulaire(partie, puid) {
  if (!partie.pilotes.some((p) => p.uid === puid)) return false;
  if (partie.second === puid) partie.second = partie.titulaire;
  partie.titulaire = puid;
  return true;
}

/** Engage (ou retire, avec null) le second pilote ; choisit au besoin une voiture libre. */
export function choisirSecond(partie, puid) {
  if (!puid) { partie.second = null; return true; }
  const t = titulaire(partie);
  if (!t || t.uid === puid || !partie.pilotes.some((p) => p.uid === puid)) return false;
  partie.second = puid;
  const actif = partie.garage.find((g) => g.uid === partie.voitureActive) || partie.garage[0];
  if (!partie.garage.some((g) => g.uid === partie.voitureSecond && g !== actif)) {
    partie.voitureSecond = partie.garage.find((g) => g !== actif)?.uid || null;
  }
  return true;
}

export function choisirVoitureSecond(partie, vuid) {
  const actif = partie.garage.find((g) => g.uid === partie.voitureActive) || partie.garage[0];
  if (!partie.garage.some((g) => g.uid === vuid && g !== actif)) return false;
  partie.voitureSecond = vuid;
  return true;
}

// --- Recrutement et départs ------------------------------------------------------------------

export function recruterPilotes(partie, methodeId) {
  const m = RECRUTEMENTS_PILOTES.find((x) => x.id === methodeId);
  if (!m || partie.rang < m.rang || partie.argent < m.prix) return null;
  partie.argent -= m.prix;
  const alea = creerAlea((Date.now() ^ (partie.jour * 7703)) >>> 0);
  const tire = ([a, b]) => a + Math.floor(alea() * (b - a + 1));
  const liste = [];
  for (let i = 0; i < m.candidats; i++) {
    const stats = { technique: tire(m.stats), sangfroid: tire(m.stats), charisme: tire(m.stats) };
    const potentiel = m.potentiels[Math.floor(alea() * m.potentiels.length)];
    const traits = TRAITS_PILOTE.filter((t) => t.id !== 'fondatrice');
    const trait = alea() < 0.5 ? traits[Math.floor(alea() * traits.length)].id : null;
    if (trait === 'fonceur') stats.sangfroid += 2;
    if (trait === 'virtuose') stats.technique += 2;
    const nom = `${PRENOMS_PILOTES[Math.floor(alea() * PRENOMS_PILOTES.length)]} ${NOMS_PILOTES[Math.floor(alea() * NOMS_PILOTES.length)]}`;
    const p = {
      uid: uid() + i, nom, niveau: tire(m.niveau), exp: 0, points: 0, stats, potentiel, trait,
      moral: 75, impayes: 0, apparence: Math.floor(alea() * 60), casque: CASQUES[Math.floor(alea() * CASQUES.length)],
    };
    p.salaire = salairePilote(p);
    liste.push(p);
  }
  partie.candidatsPilotes = { methode: m.id, liste };
  return liste;
}

export function engagerPilote(partie, puid) {
  const c = partie.candidatsPilotes?.liste.find((x) => x.uid === puid);
  if (!c || partie.pilotes.length >= PILOTES_MAX) return false;
  partie.pilotes.push({ ...c, embauche: partie.jour });
  partie.candidatsPilotes.liste = partie.candidatsPilotes.liste.filter((x) => x !== c);
  if (!partie.titulaire || !partie.pilotes.some((p) => p.uid === partie.titulaire)) partie.titulaire = c.uid;
  return true;
}

/** Remet le titulaire et le second pilote d'aplomb après un départ. */
function recaler(partie) {
  if (!partie.pilotes.some((p) => p.uid === partie.titulaire)) partie.titulaire = partie.pilotes[0]?.uid || null;
  if (partie.second === partie.titulaire || !partie.pilotes.some((p) => p.uid === partie.second)) partie.second = null;
}

/** Renvoyer un pilote : il part avec une semaine de salaire. */
export const indemnitePilote = (p) => p.salaire;
export function renvoyerPilote(partie, puid) {
  const p = partie.pilotes.find((x) => x.uid === puid);
  if (!p || partie.gp) return false;     // pas pendant un Grand Prix
  const indemnite = indemnitePilote(p);
  if (partie.argent < indemnite) return false;
  partie.argent -= indemnite;
  partie.pilotes = partie.pilotes.filter((x) => x !== p);
  recaler(partie);
  return true;
}

/** Démissions (salaires impayés, moral à zéro) : appelé le jour de paie. */
export function departsPilotes(partie, partis) {
  partie.pilotes = partie.pilotes.filter((x) => !partis.includes(x));
  recaler(partie);
}

// --- Progression -----------------------------------------------------------------------------

/** EXP gagnée par un pilote ; renvoie les niveaux atteints. */
export function gagnerExp(p, n) {
  if (!p) return [];
  p.exp += Math.round(n * (p.trait === 'prodige' ? 1.3 : 1) * (0.85 + 0.15 * (POTENTIELS[p.potentiel] || 1)));
  const niveaux = [];
  while (p.exp >= expPilote(p.niveau)) {
    p.exp -= expPilote(p.niveau);
    p.niveau += 1;
    p.points += 1;
    niveaux.push(p.niveau);
  }
  if (niveaux.length) p.salaire = salairePilote(p);
  return niveaux;
}

export function entrainer(partie, [puid, stat]) {
  const p = partie.pilotes.find((x) => x.uid === puid);
  if (!p || p.points <= 0 || !(stat in STATS_PILOTE)) return false;
  p.points -= 1;
  p.stats[stat] += 1;
  p.salaire = salairePilote(p);
  return true;
}

export const pointsAPlacer = (partie) => partie.pilotes.reduce((t, p) => t + p.points, 0);

/** Pour l'IA : un pilote plus doué prend les virages un peu plus vite. */
export const talentPilote = (p) => -0.04 + 0.006 * p.stats.technique + 0.004 * p.stats.sangfroid + 0.002 * p.niveau;

/** La tenue d'un pilote : combinaison blanche et casque à sa couleur. */
export const tenuePilote = (p) => ({ ...tenue(p?.apparence ?? 4), casque: p?.casque || '#e4432d', haut: '#f4f1e8' });
