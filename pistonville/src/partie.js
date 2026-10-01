/* partie.js — l'état d'une partie et tout ce qui le fait évoluer.
 *
 * La sauvegarde ne contient que des identifiants (de voitures, de pièces, de
 * Grands Prix) : ajouter du contenu par une mise à jour ne la casse jamais.
 */

import { VEHICULES, GRANDS_PRIX, EQUIPES, PIECES, OBJECTIFS, SPONSORS, EVENEMENTS } from '../contenu/catalogue.js';
import {
  PALIERS, ORDRE_PALIERS, POINTS_GP, POINTS_LICENCE, PART_PRIX, FANS_PLACE, EXP_PLACE, EXP_DEPASSEMENT,
  coutAmelioration, GAIN_AMELIORATION, COUT_REPARATION_POINT, COUT_RECHERCHE, COUT_PEINTURE, BOOSTS,
  QUALITES, tirerQualite, expPourRang, recompenseRang, evaluerCandidature, physique,
} from './regles.js';
import { creerAlea } from './outils.js';

const CLE = 'pistonville.partie.v1';
const VERSION = 2;

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
    rang: 1,
    exp: 0,
    recherche: 0,            // points de recherche (PR)
    labo: 0,                 // niveau de pièces débloqué (0 à 3)
    tickets: 1,              // tickets de tombola
    garage: [],              // { uid, modele, couleur, qualite, ameliorations, usure, pieces: {emplacement: uid} }
    voitureActive: null,
    inventaire: [],          // { uid, piece }
    constructions: [],       // héritage de la version 1
    inscriptions: {},        // gpId → true (Grands Prix ouverts)
    candidatures: {},        // gpId → { etat, jour, manques }
    trophees: {},            // gpId → meilleure place finale
    gp: null,                // Grand Prix en cours
    villeJour: 0,            // dernier jour de balade en ville
    cafeJour: 0,             // dernier café des pilotes
    sponsor: null,           // contrat en cours
    objectifs: {},           // id → jour où il a été atteint
    collection: {},          // pièces déjà obtenues une fois (album)
    premieres: {},           // circuits déjà gagnés une fois
    stats: { courses: 0, piecesOr: 0, driftMax: 0, departsParfaits: 0, superRares: 0 },
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
    return migrer(JSON.parse(brut));
  } catch {
    return null;
  }
}

export function sauver(partie) {
  try { localStorage.setItem(CLE, JSON.stringify(partie)); } catch { /* stockage indisponible : la partie continue en mémoire */ }
}

/** Met une ancienne sauvegarde au format courant. */
function migrer(p) {
  const base = nouvellePartie();
  for (const cle of Object.keys(base)) if (p[cle] === undefined) p[cle] = base[cle];
  for (const v of p.garage) {
    if (!modele(v.modele)) v.modele = VEHICULES[0].id;
    if (!v.couleur) v.couleur = modele(v.modele).couleur;
    if (v.qualite === undefined) v.qualite = 0;
    if (!v.pieces) v.pieces = {};
  }
  p.inventaire = p.inventaire.filter((i) => piece(i.piece));
  p.stats = { ...base.stats, ...p.stats };
  for (const i of p.inventaire) p.collection[i.piece] = true;
  p.version = VERSION;
  return p;
}

export const modele = (id) => VEHICULES.find((v) => v.id === id);
export const grandPrix = (id) => GRANDS_PRIX.find((g) => g.id === id);
export const piece = (id) => PIECES.find((x) => x.id === id);
const uid = (prefixe) => `${prefixe}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// --- Voitures ----------------------------------------------------------------------

/**
 * La voiture active, toutes améliorations comprises :
 * qualités = modèle + qualité de construction + pièces + réglages d'atelier.
 */
export function voitureActive(partie) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive) || partie.garage[0];
  return v ? decrireVoiture(partie, v) : null;
}

export function decrireVoiture(partie, v) {
  const m = modele(v.modele);
  const q = QUALITES[v.qualite || 0];
  const montees = Object.entries(v.pieces || {})
    .map(([emplacement, iuid]) => {
      const inv = partie.inventaire.find((i) => i.uid === iuid);
      return inv ? { emplacement, uid: iuid, ...piece(inv.piece) } : null;
    })
    .filter(Boolean);
  const stats = {};
  for (const [cle, val] of Object.entries(m.stats)) {
    let s = val + q.bonus + (v.ameliorations[cle] || 0) * GAIN_AMELIORATION;
    for (const pc of montees) s += pc.bonus[cle] || 0;
    stats[cle] = Math.max(1, Math.min(99, s));
  }
  const surfaces = {};
  let nitros = 1, nitroDuree = BOOSTS.nitro.duree;
  const looks = new Set();
  for (const pc of montees) {
    for (const [s, b] of Object.entries(pc.surfaces || {})) surfaces[s] = (surfaces[s] || 0) + b;
    if (pc.charges) nitros = Math.max(nitros, pc.charges);
    if (pc.duree) nitroDuree = pc.duree;
    if (pc.look) looks.add(pc.look);
  }
  return {
    ...m, uid: v.uid, couleur: v.couleur || m.couleur, qualite: v.qualite || 0, stats,
    ameliorations: v.ameliorations, usure: v.usure, pieces: montees,
    physique: physique(stats), surfaces, nitros, nitroDuree, looks: [...looks],
  };
}

function ajouterVoiture(partie, idModele, extra = {}) {
  const id = uid(idModele);
  partie.garage.push({
    uid: id, modele: idModele, couleur: modele(idModele).couleur, qualite: 0,
    ameliorations: { vitesse: 0, acceleration: 0, maniabilite: 0, solidite: 0 }, usure: 0, pieces: {}, ...extra,
  });
  partie.voitureActive = id;
  return id;
}

export function peutAcheter(partie, m) {
  if (m.licence && !licenceAuMoins(partie.licence, m.licence)) return `Licence ${m.licence} requise`;
  return null;
}

export function acheter(partie, idModele) {
  const m = modele(idModele);
  if (peutAcheter(partie, m) || partie.argent < m.prix) return false;
  partie.argent -= m.prix;
  ajouterVoiture(partie, idModele);
  return true;
}

/**
 * Construit une voiture au garage : moins cher qu'à la concession, la qualité
 * de construction est tirée au sort (de 1 à 5 étoiles), et la journée y passe.
 */
export function construire(partie, idModele, couleur) {
  const m = modele(idModele);
  if (peutAcheter(partie, m) || partie.argent < m.construction.prix) return null;
  partie.argent -= m.construction.prix;
  const alea = creerAlea((Date.now() ^ (partie.jour * 7919)) >>> 0);
  const qualite = tirerQualite(alea);
  const id = ajouterVoiture(partie, idModele, { couleur: couleur || m.couleur, qualite });
  return { uid: id, qualite };
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

export function peindre(partie, couleur) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (!v || partie.argent < COUT_PEINTURE) return false;
  partie.argent -= COUT_PEINTURE;
  v.couleur = couleur;
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

// --- Pièces, labo, tombola -----------------------------------------------------------

export const prixPiece = (pc, remise = 0) => Math.round(pc.prix * (1 - remise) / 10) * 10;

/** La promo du jour chez Pièces Auto (en ville) : une pièce à -30 %. */
export function promoDuJour(partie) {
  const dispo = PIECES.filter((x) => x.recherche <= partie.labo);
  return dispo[(partie.jour * 7 + 3) % dispo.length]?.id;
}

export function acheterPiece(partie, id, remise = 0) {
  const pc = piece(id);
  const prix = pc && prixPiece(pc, remise);
  if (!pc || pc.recherche > partie.labo || partie.argent < prix) return null;
  partie.argent -= prix;
  const inv = { uid: uid('p'), piece: id };
  partie.inventaire.push(inv);
  partie.collection[id] = true;
  return inv;
}

/** Où est montée une pièce de l'inventaire (null si libre). */
export function montureDe(partie, iuid) {
  for (const v of partie.garage) for (const [e, u] of Object.entries(v.pieces || {})) if (u === iuid) return { voiture: v, emplacement: e };
  return null;
}

export function monter(partie, iuid) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  const inv = partie.inventaire.find((i) => i.uid === iuid);
  if (!v || !inv) return false;
  const ailleurs = montureDe(partie, iuid);
  if (ailleurs) delete ailleurs.voiture.pieces[ailleurs.emplacement];
  v.pieces[piece(inv.piece).emplacement] = iuid;
  return true;
}

export function demonter(partie, emplacement) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (!v) return false;
  delete v.pieces[emplacement];
  return true;
}

export function vendrePiece(partie, iuid) {
  const inv = partie.inventaire.find((i) => i.uid === iuid);
  if (!inv) return 0;
  const ailleurs = montureDe(partie, iuid);
  if (ailleurs) delete ailleurs.voiture.pieces[ailleurs.emplacement];
  partie.inventaire = partie.inventaire.filter((i) => i !== inv);
  const prix = Math.round(piece(inv.piece).prix * 0.4);
  partie.argent += prix;
  return prix;
}

export function rechercher(partie) {
  const suivant = partie.labo + 1;
  if (suivant >= COUT_RECHERCHE.length || partie.recherche < COUT_RECHERCHE[suivant]) return false;
  partie.recherche -= COUT_RECHERCHE[suivant];
  partie.labo = suivant;
  return true;
}

/** Une pièce au hasard, selon la rareté visée. */
function pieceAuHasard(alea, rarete, laboMax = 3) {
  const choix = PIECES.filter((x) => x.rarete === rarete && x.recherche <= laboMax);
  return choix[Math.floor(alea() * choix.length)];
}

/** Tombola : argent, points de recherche ou pièce (parfois super rare). */
export function tirerTombola(partie) {
  if (partie.tickets <= 0) return null;
  partie.tickets -= 1;
  const alea = creerAlea((Date.now() * 31 + partie.tickets) >>> 0);
  const r = alea();
  let lot;
  if (r < 0.06) lot = { type: 'piece', piece: pieceAuHasard(alea, 'super') };
  else if (r < 0.26) lot = { type: 'piece', piece: pieceAuHasard(alea, 'rare') };
  else if (r < 0.5) lot = { type: 'piece', piece: pieceAuHasard(alea, 'commune') };
  else if (r < 0.75) lot = { type: 'recherche', valeur: 10 + Math.floor(alea() * 21) };
  else lot = { type: 'argent', valeur: 500 * (2 + Math.floor(alea() * 7)) };
  appliquerLot(partie, lot);
  return lot;
}

function appliquerLot(partie, lot) {
  if (lot.type === 'piece') {
    partie.inventaire.push({ uid: uid('p'), piece: lot.piece.id });
    lot.nouvelle = !partie.collection[lot.piece.id];
    partie.collection[lot.piece.id] = true;
    if (lot.piece.rarete === 'super') partie.stats.superRares += 1;
  }
  if (lot.type === 'recherche') partie.recherche += lot.valeur;
  if (lot.type === 'argent') partie.argent += lot.valeur;
}

// --- Rang de l'équipe ----------------------------------------------------------------

/** Ajoute de l'EXP ; renvoie la liste des rangs gagnés avec leurs récompenses. */
export function gagnerExp(partie, n) {
  partie.exp += Math.round(n);
  const montees = [];
  while (partie.exp >= expPourRang(partie.rang)) {
    partie.exp -= expPourRang(partie.rang);
    partie.rang += 1;
    const r = recompenseRang(partie.rang);
    partie.argent += r.argent;
    partie.recherche += r.recherche;
    partie.tickets += r.tickets;
    montees.push({ rang: partie.rang, ...r });
  }
  return montees;
}

// --- Licence, inscriptions, candidatures ----------------------------------------------

const ORDRE_LICENCES = [null, 'C', 'B', 'A', 'S'];
export const licenceAuMoins = (licence, min) => ORDRE_LICENCES.indexOf(licence) >= ORDRE_LICENCES.indexOf(min);

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

export const fraisDossier = (gp) => Math.round(gp.prix * 0.1);

export function deposerCandidature(partie, gpId) {
  const frais = fraisDossier(grandPrix(gpId));
  if (partie.argent < frais) return false;
  partie.argent -= frais;
  partie.candidatures[gpId] = { etat: 'attente', jour: partie.jour };
  return true;
}

/** Passe au jour suivant : réponses aux candidatures. */
export function jourSuivant(partie) {
  partie.jour += 1;
  const nouvelles = [];
  partie.constructions = (partie.constructions || []).filter((c) => {
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
      nouvelles.push({ titre: 'Candidature acceptée', texte: `${gp.nom} : vous êtes sur la grille ! Licence ${lic}.` });
    } else if (verdict.presque && c.etat === 'attente') {
      c.etat = 'liste';
      c.manques = verdict.manques;
      nouvelles.push({ titre: "Liste d'attente", texte: `${gp.nom} : il ne manque presque rien (${verdict.manques.join(', ')}). Une place peut se libérer.` });
    } else {
      c.etat = 'refusee';
      c.manques = verdict.manques;
      nouvelles.push({ titre: 'Candidature refusée', texte: `${gp.nom} : il manque ${verdict.manques.join(', ')}.` });
    }
  }
  const ev = evenementDuJour(partie, alea);
  if (ev) nouvelles.push(ev);
  partie.nouvelles = nouvelles;
  return nouvelles;
}

/** Une nouvelle du matin, une fois sur trois environ. */
function evenementDuJour(partie, alea) {
  if (partie.garage.length === 0 || alea() > 0.38) return null;
  const outils = {
    piece: (rarete) => { const pc = pieceAuHasard(alea, rarete, partie.labo); appliquerLot(partie, { type: 'piece', piece: pc }); return pc; },
    exp: (n) => gagnerExp(partie, n),
    voiture: () => partie.garage.find((g) => g.uid === partie.voitureActive),
  };
  const possibles = EVENEMENTS.filter((e) => e.si(partie, outils));
  let r = alea() * possibles.reduce((t, e) => t + e.poids, 0);
  for (const e of possibles) {
    r -= e.poids;
    if (r <= 0) return { ...e.effet(partie, outils), evenement: true };
  }
  return null;
}

// --- Grands Prix ------------------------------------------------------------------------

/** Niveau des adversaires par palier : il faut des pièces pour gagner. */
const BASE_NIVEAU = [0, 33, 53, 70, 84, 94];
/** Le rival est un peu plus fort, de plus en plus avec les paliers. */
const bonusRival = (gp) => 0.03 + 0.01 * gp.niveau;

/** Les adversaires d'un Grand Prix : toujours les mêmes écuries pour un GP donné. */
export function adversaires(gp, manche = 0) {
  const alea = creerAlea([...gp.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0);
  const equipes = EQUIPES.slice().sort(() => alea() - 0.5).slice(0, gp.adversaires);
  const rival = rivalDe(gp);
  // Dents de scie : la finale d'un Grand Prix est un cran plus dure.
  const finale = manche === gp.manches.length - 1 ? 3 : 0;
  const base = (BASE_NIVEAU[gp.niveau] || 36) + finale;
  return equipes.map((e) => {
    const talent = e.talent + (e.id === rival.id ? bonusRival(gp) : 0);
    const b = Math.min(99, base + talent * 70);
    const stats = { vitesse: b, acceleration: b + 4, maniabilite: b + 2, solidite: 50 };
    return {
      equipe: e.id, nom: e.pilote, ecurie: e.nom, couleur: e.couleur, talent: talent * 0.5,
      rival: e.id === rival.id, physique: physique(stats),
    };
  });
}

/** L'écurie rivale d'un Grand Prix : la plus talentueuse du plateau. */
export function rivalDe(gp) {
  const alea = creerAlea([...gp.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0);
  const equipes = EQUIPES.slice().sort(() => alea() - 0.5).slice(0, gp.adversaires);
  return equipes.reduce((a, b) => (b.talent > a.talent ? b : a));
}

/**
 * Chances estimées sur un Grand Prix (conseil de GPS2 : courir quand on a au
 * moins une chance sur deux). Compare la moyenne des qualités de conduite
 * à celle du rival.
 */
export function estimerChances(partie, gp) {
  const v = voitureActive(partie);
  if (!v) return null;
  const moi = (v.stats.vitesse + v.stats.acceleration + v.stats.maniabilite) / 3;
  const lui = (BASE_NIVEAU[gp.niveau] || 36) + 2 + (rivalDe(gp).talent + bonusRival(gp)) * 70;
  const ecart = moi - lui;
  if (ecart >= 6) return { niveau: 0, nom: 'Facile', ecart };
  if (ecart >= -3) return { niveau: 1, nom: 'Équilibré', ecart };
  if (ecart >= -10) return { niveau: 2, nom: 'Difficile', ecart };
  return { niveau: 3, nom: 'Très difficile', ecart };
}

export function commencerGP(partie, gpId) {
  partie.gp = { id: gpId, manche: 0, points: {}, gains: 0, fans: 0 };
}

/**
 * Enregistre une manche terminée.
 * `resultats` : [{ id, nom, ecurie, place, temps }] dans l'ordre d'arrivée.
 * `course` : { fans, depassements, drift, ramasses: { argent, recherche }, usure }.
 */
export function enregistrerManche(partie, resultats, course) {
  const gp = grandPrix(partie.gp.id);
  const moi = resultats.find((r) => r.id === 'joueur');
  const i = moi.place - 1;
  const sp = sponsorActif(partie)?.effets || {};
  const prime = Math.round(gp.prix * (PART_PRIX[i] ?? 0.1) * (1 + (sp.prime || 0))) + (sp.argent || 0);
  const licence = POINTS_LICENCE[i] ?? 1;
  const fans = Math.round(((FANS_PLACE[i] ?? 2) * gp.niveau + course.fans) * (1 + (sp.fans || 0)));
  const exp = Math.round((EXP_PLACE[i] ?? 8) * gp.niveau + course.depassements * EXP_DEPASSEMENT + course.drift);
  // Première victoire sur ce circuit : bonus de recherche (comme dans GPS2).
  const cleCircuit = `${gp.id}#${partie.gp.manche}`;
  const premiere = moi.place === 1 && !partie.premieres[cleCircuit];
  if (premiere) partie.premieres[cleCircuit] = partie.jour;
  const recherche = course.ramasses.recherche + Math.max(0, 4 - i) + (sp.recherche || 0) + (premiere ? 10 : 0);
  partie.argent += prime + course.ramasses.argent;
  partie.recherche += recherche;
  partie.stats.courses += 1;
  partie.stats.piecesOr += course.pieces || 0;
  partie.stats.driftMax = Math.max(partie.stats.driftMax, course.driftMax || 0);
  if (course.departParfait) partie.stats.departsParfaits += 1;
  partie.pointsLicence += licence;
  partie.fans += fans;
  if (moi.place <= 3) partie.podiums += 1;
  if (moi.place === 1) {
    partie.victoires += 1;
    partie.victoiresParPalier[gp.palier] = (partie.victoiresParPalier[gp.palier] || 0) + 1;
  }
  for (const r of resultats) partie.gp.points[r.id] = (partie.gp.points[r.id] || 0) + (POINTS_GP[r.place - 1] ?? 0);
  partie.gp.gains += prime + course.ramasses.argent;
  partie.gp.fans += fans;
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (v) v.usure = Math.min(0.9, Math.max(v.usure, course.usure));

  // Butin : une caisse de pièce, plus souvent quand on gagne.
  const alea = creerAlea((Date.now() ^ (partie.jour * 131 + i)) >>> 0);
  let butin = null;
  const chanceButin = [0.45, 0.3, 0.22][i] ?? 0.1;
  if (alea() < chanceButin) {
    const r = alea();
    const pc = pieceAuHasard(alea, r < 0.08 * gp.niveau ? 'super' : r < 0.35 ? 'rare' : 'commune', 3);
    butin = { type: 'piece', piece: pc };
    appliquerLot(partie, butin);
  }
  const rangs = gagnerExp(partie, exp);
  partie.gp.manche += 1;
  return {
    prime, licence, fans, exp, rangs, butin, place: moi.place,
    ramasses: course.ramasses, recherche, premiere, sponsor: sponsorActif(partie)?.nom,
    fini: partie.gp.manche >= gp.manches.length,
  };
}

export function classementGP(partie, noms) {
  return Object.entries(partie.gp.points)
    .map(([id, points]) => ({ id, points, ...noms[id] }))
    .sort((a, b) => b.points - a.points);
}

/** Fin de Grand Prix : trophée, ticket de tombola si podium, jour suivant. */
export function terminerGP(partie, placeFinale) {
  const id = partie.gp.id;
  const avant = partie.trophees[id];
  if (!avant || placeFinale < avant) partie.trophees[id] = placeFinale;
  if (placeFinale <= 3) partie.tickets += 1;
  partie.gp = null;
  return jourSuivant(partie);
}

// --- Ville --------------------------------------------------------------------------------

export const peutSortir = (partie) => partie.villeJour !== partie.jour;

/** Gains d'une balade : argent, recherche, fans, EXP. */
export function finBalade(partie, gains) {
  partie.villeJour = partie.jour;
  partie.argent += gains.argent;
  partie.recherche += gains.recherche;
  partie.fans += gains.fans;
  return gagnerExp(partie, gains.exp);
}

/** Café des pilotes : un conseil et un peu d'EXP, une fois par jour. */
export const PRIX_CAFE = 300;
export function boireCafe(partie) {
  if (partie.cafeJour === partie.jour || partie.argent < PRIX_CAFE) return null;
  partie.cafeJour = partie.jour;
  partie.argent -= PRIX_CAFE;
  partie.fans += 3;
  return gagnerExp(partie, 15);
}

// --- Sponsors ---------------------------------------------------------------------------------

export const sponsorActif = (partie) => SPONSORS.find((s) => s.id === partie.sponsor) || null;
export const sponsorDispo = (partie, s) => partie.fans >= s.fans;

export function signerSponsor(partie, id) {
  const s = SPONSORS.find((x) => x.id === id);
  if (!s || !sponsorDispo(partie, s)) return false;
  partie.sponsor = id;
  return true;
}

// --- Objectifs --------------------------------------------------------------------------------

/** Les trois prochains objectifs, avec leur avancement. */
export function objectifsActifs(partie, nb = 3) {
  return OBJECTIFS.filter((o) => !partie.objectifs[o.id]).slice(0, nb)
    .map((o) => ({ ...o, actuel: Math.min(o.but, o.valeur(partie)) }));
}

/** Valide les objectifs atteints et verse leurs récompenses. Renvoie la liste. */
export function verifierObjectifs(partie) {
  const faits = [];
  for (const o of objectifsActifs(partie, 3)) {
    if (o.valeur(partie) < o.but) continue;
    partie.objectifs[o.id] = partie.jour;
    const r = o.recompense;
    partie.argent += r.argent || 0;
    partie.recherche += r.recherche || 0;
    partie.tickets += r.tickets || 0;
    faits.push(o);
  }
  return faits;
}

export const objectifsFaits = (partie) => Object.keys(partie.objectifs).length;
export const totalObjectifs = () => OBJECTIFS.length;

export { ORDRE_PALIERS, PALIERS };
