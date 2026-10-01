/* partie.js — l'état d'une partie et tout ce qui le fait évoluer.
 *
 * La sauvegarde ne contient que des identifiants (de voitures, de Grands
 * Prix) : ajouter du contenu par une mise à jour ne la casse jamais.
 */

import { VEHICULES, GRANDS_PRIX, EQUIPES } from '../contenu/catalogue.js';
import {
  PALIERS, ORDRE_PALIERS, POINTS_GP, POINTS_LICENCE, PART_PRIX, FANS_PLACE,
  coutAmelioration, GAIN_AMELIORATION, COUT_REPARATION_POINT, evaluerCandidature, physique,
} from './regles.js';
import { creerAlea } from './outils.js';

const CLE = 'pistonville.partie.v1';
const VERSION = 1;

export function nouvellePartie() {
  return {
    version: VERSION,
    jour: 1,
    argent: 12000,
    fans: 0,
    pointsLicence: 0,
    podiums: 0,
    victoires: 0,
    victoiresParPalier: {},
    licence: null,
    garage: [],               // { uid, modele, ameliorations: {…}, usure }
    voitureActive: null,
    constructions: [],        // { modele, pret }
    inscriptions: {},         // gpId → true (Grands Prix ouverts)
    candidatures: {},         // gpId → { etat, jour, manques }
    trophees: {},             // gpId → meilleure place finale
    gp: null,                 // Grand Prix en cours
    pilote: 'Léa',
    aide: true,
    son: true,
    nouvelles: [],
  };
}

export function charger() {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const p = JSON.parse(brut);
    return migrer(p);
  } catch {
    return null;
  }
}

export function sauver(partie) {
  try { localStorage.setItem(CLE, JSON.stringify(partie)); } catch { /* stockage indisponible : la partie continue en mémoire */ }
}

export function effacer() {
  try { localStorage.removeItem(CLE); } catch { /* rien à faire */ }
}

/** Met une ancienne sauvegarde au format courant. */
function migrer(p) {
  const base = nouvellePartie();
  for (const cle of Object.keys(base)) if (p[cle] === undefined) p[cle] = base[cle];
  // Une voiture dont le modèle a disparu d'un pack reste jouable comme citadine.
  for (const v of p.garage) if (!modele(v.modele)) v.modele = VEHICULES[0].id;
  p.version = VERSION;
  return p;
}

export const modele = (id) => VEHICULES.find((v) => v.id === id);
export const grandPrix = (id) => GRANDS_PRIX.find((g) => g.id === id);

/** La voiture active, avec ses qualités améliorées. */
export function voitureActive(partie) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive) || partie.garage[0];
  if (!v) return null;
  const m = modele(v.modele);
  const stats = {};
  for (const [cle, val] of Object.entries(m.stats)) stats[cle] = Math.min(99, val + (v.ameliorations[cle] || 0) * GAIN_AMELIORATION);
  return { ...m, uid: v.uid, stats, ameliorations: v.ameliorations, usure: v.usure, physique: physique(stats) };
}

function ajouterVoiture(partie, idModele) {
  const uid = `${idModele}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
  partie.garage.push({ uid, modele: idModele, ameliorations: { vitesse: 0, acceleration: 0, maniabilite: 0, solidite: 0 }, usure: 0 });
  if (!partie.voitureActive) partie.voitureActive = uid;
  return uid;
}

export function peutAcheter(partie, m) {
  if (m.licence && !licenceAuMoins(partie.licence, m.licence)) return `Licence ${m.licence} requise`;
  return null;
}

export function acheter(partie, idModele) {
  const m = modele(idModele);
  if (peutAcheter(partie, m) || partie.argent < m.prix) return false;
  partie.argent -= m.prix;
  partie.voitureActive = ajouterVoiture(partie, idModele);
  return true;
}

export function construire(partie, idModele) {
  const m = modele(idModele);
  if (peutAcheter(partie, m) || partie.argent < m.construction.prix) return false;
  partie.argent -= m.construction.prix;
  partie.constructions.push({ modele: idModele, pret: partie.jour + m.construction.jours });
  return true;
}

export function ameliorer(partie, stat) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (!v) return false;
  const niveau = v.ameliorations[stat] || 0;
  const cout = coutAmelioration(niveau);
  if (partie.argent < cout) return false;
  partie.argent -= cout;
  v.ameliorations[stat] = niveau + 1;
  return true;
}

export function coutReparation(partie) {
  const v = voitureActive(partie);
  if (!v) return 0;
  return Math.round(v.usure * v.physique.durabiliteMax * COUT_REPARATION_POINT);
}

export function reparer(partie) {
  const cout = coutReparation(partie);
  if (!cout || partie.argent < cout) return false;
  partie.argent -= cout;
  partie.garage.find((g) => g.uid === partie.voitureActive).usure = 0;
  return true;
}

const ORDRE_LICENCES = [null, 'C', 'B', 'A', 'S'];
export const licenceAuMoins = (licence, min) => ORDRE_LICENCES.indexOf(licence) >= ORDRE_LICENCES.indexOf(min);

/** Où en est le joueur avec ce Grand Prix. */
export function statutGP(partie, gp) {
  if (gp.palier === 'ouvert') return partie.inscriptions[gp.id] ? 'inscrit' : 'ouvert';
  const c = partie.candidatures[gp.id];
  return c ? c.etat : 'candidature';
}

export function inscrire(partie, gpId) {
  if (!voitureActive(partie)) return false;
  partie.inscriptions[gpId] = true;
  return true;
}

export function deposerCandidature(partie, gpId) {
  const frais = fraisDossier(grandPrix(gpId));
  if (partie.argent < frais) return false;
  partie.argent -= frais;
  partie.candidatures[gpId] = { etat: 'attente', jour: partie.jour };
  return true;
}

export const fraisDossier = (gp) => Math.round(gp.prix * 0.1);

/** Passe au jour suivant : constructions terminées, réponses aux candidatures. */
export function jourSuivant(partie) {
  partie.jour += 1;
  const nouvelles = [];
  partie.constructions = partie.constructions.filter((c) => {
    if (c.pret > partie.jour) return true;
    ajouterVoiture(partie, c.modele);
    nouvelles.push({ titre: 'Voiture terminée', texte: `${modele(c.modele).nom} sort de l'atelier.` });
    return false;
  });
  const alea = creerAlea(partie.jour * 977);
  for (const [gpId, c] of Object.entries(partie.candidatures)) {
    if (c.etat !== 'attente' && c.etat !== 'liste') continue;
    const gp = grandPrix(gpId);
    const verdict = evaluerCandidature(partie, gp, voitureActive(partie));
    if (verdict.ok || (c.etat === 'liste' && alea() < 0.5)) {
      c.etat = 'acceptee';
      const lic = PALIERS[gp.palier].licence;
      if (lic && !licenceAuMoins(partie.licence, lic)) partie.licence = lic;
      nouvelles.push({ titre: `Candidature acceptée`, texte: `${gp.nom} : vous êtes sur la grille ! Licence ${PALIERS[gp.palier].licence}.` });
    } else if (verdict.presque && c.etat === 'attente') {
      c.etat = 'liste';
      c.manques = verdict.manques;
      nouvelles.push({ titre: `Liste d'attente`, texte: `${gp.nom} : il manque presque rien (${verdict.manques.join(', ')}). Une place peut se libérer.` });
    } else {
      c.etat = 'refusee';
      c.manques = verdict.manques;
      nouvelles.push({ titre: `Candidature refusée`, texte: `${gp.nom} : il manque ${verdict.manques.join(', ')}.` });
    }
  }
  partie.nouvelles = nouvelles;
  return nouvelles;
}

// --- Grands Prix ----------------------------------------------------------------

const BASE_NIVEAU = [0, 28, 46, 62, 77, 90];

/** Les adversaires d'un Grand Prix : toujours les mêmes écuries pour un GP donné. */
export function adversaires(gp) {
  const alea = creerAlea([...gp.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0);
  const equipes = EQUIPES.slice().sort(() => alea() - 0.5).slice(0, gp.adversaires);
  const base = BASE_NIVEAU[gp.niveau] || 30;
  return equipes.map((e) => {
    const b = base + e.talent * 60;
    const stats = { vitesse: b, acceleration: b + 6, maniabilite: b + 4, solidite: 50 };
    return { equipe: e.id, nom: e.pilote, ecurie: e.nom, couleur: e.couleur, talent: e.talent * 0.5, physique: physique(stats) };
  });
}

export function commencerGP(partie, gpId) {
  partie.gp = { id: gpId, manche: 0, points: {}, gains: 0, fans: 0 };
}

/**
 * Enregistre une manche terminée.
 * `resultats` : [{ id, nom, ecurie, place, temps }] dans l'ordre d'arrivée.
 * `usure` : état de la voiture à l'arrivée (0 = neuve, 1 = détruite).
 */
export function enregistrerManche(partie, resultats, fansCourse, usure) {
  const gp = grandPrix(partie.gp.id);
  const moi = resultats.find((r) => r.id === 'joueur');
  const i = moi.place - 1;
  const prime = Math.round(gp.prix * (PART_PRIX[i] ?? 0.1));
  const licence = POINTS_LICENCE[i] ?? 1;
  const fans = Math.round((FANS_PLACE[i] ?? 2) * gp.niveau + fansCourse);
  partie.argent += prime;
  partie.pointsLicence += licence;
  partie.fans += fans;
  if (moi.place <= 3) partie.podiums += 1;
  if (moi.place === 1) {
    partie.victoires += 1;
    partie.victoiresParPalier[gp.palier] = (partie.victoiresParPalier[gp.palier] || 0) + 1;
  }
  for (const r of resultats) partie.gp.points[r.id] = (partie.gp.points[r.id] || 0) + (POINTS_GP[r.place - 1] ?? 0);
  partie.gp.gains += prime;
  partie.gp.fans += fans;
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (v) v.usure = Math.min(0.9, Math.max(v.usure, usure));
  partie.gp.manche += 1;
  return { prime, licence, fans, place: moi.place, fini: partie.gp.manche >= gp.manches.length };
}

/** Classement général du Grand Prix en cours. */
export function classementGP(partie, noms) {
  return Object.entries(partie.gp.points)
    .map(([id, points]) => ({ id, points, ...noms[id] }))
    .sort((a, b) => b.points - a.points);
}

export function terminerGP(partie, placeFinale) {
  const id = partie.gp.id;
  const avant = partie.trophees[id];
  if (!avant || placeFinale < avant) partie.trophees[id] = placeFinale;
  partie.gp = null;
  return jourSuivant(partie);
}

export { ORDRE_PALIERS, PALIERS };
