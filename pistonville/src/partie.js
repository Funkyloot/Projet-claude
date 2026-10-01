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
import * as G from './garage.js';
import * as PL from './pilotes.js';

const CLE = 'pistonville.partie.v1';
const VERSION = 3;

/** Plafond des qualités selon la classe de la voiture. */
export const PLAFOND_CLASSE = { D: 62, C: 74, B: 86, A: 95, S: 99 };
/** Réglages d'atelier : au plus 4 crans (+20) par qualité et par voiture. */
export const REGLAGES_MAX = 4;

/** Calendrier : 28 jours par saison, 10 saisons pour une carrière (on peut continuer après). */
export const JOURS_SAISON = 28;
export const SAISONS_CARRIERE = 10;
export const saisonDe = (partie) => Math.floor((partie.jour - 1) / JOURS_SAISON) + 1;
export const jourDeSaison = (partie) => ((partie.jour - 1) % JOURS_SAISON) + 1;
function saisonVide() {
  return { victoires: 0, podiums: 0, fans: 0, drift: 0, trophees: 0, construction: 0, labo: 0, medailles: 0, installations: 0 };
}

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
    labo: 0,                 // niveau de pièces débloqué (0 à 9)
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
    memoireVille: { records: {}, affiches: {} },   // records des défis, affiches trouvées
    sponsor: null,           // contrat en cours
    objectifs: {},           // id → jour où il a été atteint
    collection: {},          // pièces déjà obtenues une fois (album)
    premieres: {},           // circuits déjà gagnés une fois
    stats: { courses: 0, piecesOr: 0, driftMax: 0, departsParfaits: 0, superRares: 0 },
    pilotes: [PL.piloteDepart()],   // pilotes sous contrat (4 au plus)
    titulaire: 'p-lea',      // celui que l'on conduit
    second: null,            // second pilote engagé en course (ou null)
    voitureSecond: null,     // sa voiture
    candidatsPilotes: null,  // dernier recrutement de pilotes
    saisonStats: saisonVide(),
    ceremonie: null,         // cérémonie des Pistons d'Or à montrer
    palmares: [],            // Pistons d'Or gagnés : { saison, prix }
    meilleursTours: {},      // circuit → meilleur tour (s)
    medailles: {},           // circuit → 1 bronze, 2 argent, 3 or
    cadeau: { date: null, n: 0 },
    heritage: 0,             // nombre de carrières terminées (Nouvelle partie+)
    terrain: G.terrainDepart(),   // bâtiments et décor du garage
    personnel: G.personnelDepart(),
    candidats: null,         // dernier recrutement
    carriereFinie: false,
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
  partie.horodatage = Date.now();
  try { localStorage.setItem(CLE, JSON.stringify(partie)); } catch { /* stockage indisponible : la partie continue en mémoire */ }
}

/** Une partie venue d'ailleurs (serveur, code de transfert), mise au format courant. */
export function restaurer(brute) {
  try { return migrer(JSON.parse(JSON.stringify(brute))); } catch { return null; }
}

/** Une manche par soir : la course termine la journée. */
export const peutCourir = (partie) => partie.courseJour !== partie.jour;

/** Code de sauvegarde à copier d'un appareil à l'autre (texte, sans serveur). */
export function exporter(partie) {
  const json = JSON.stringify(partie);
  return `PV1:${btoa(unescape(encodeURIComponent(json)))}`;
}

export function importer(code) {
  try {
    const net = String(code).trim().replace(/\s+/g, '');
    if (!net.startsWith('PV1:')) return null;
    const p = JSON.parse(decodeURIComponent(escape(atob(net.slice(4)))));
    if (!p || !Array.isArray(p.garage) || typeof p.jour !== 'number') return null;
    return migrer(p);
  } catch {
    return null;
  }
}

/** Met une ancienne sauvegarde au format courant. */
function migrer(p) {
  // v0.5 → v0.6 : le pilote unique devient le premier pilote de l'écurie.
  if (!p.pilotes) {
    p.pilotes = [PL.piloteDepart({ nom: p.pilote, niveau: p.piloteNiv, exp: p.piloteExp, points: p.pilotePoints, stats: p.piloteStats })];
    p.titulaire = 'p-lea';
  }
  for (const k of ['pilote', 'piloteNiv', 'piloteExp', 'pilotePoints', 'piloteStats']) delete p[k];
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
  p.saisonStats = { ...saisonVide(), ...p.saisonStats };
  for (const i of p.inventaire) if (i.niveau === undefined) i.niveau = 0;
  // v0.3 → v0.4 : les « installations » deviennent de vrais bâtiments posés sur le terrain.
  if (p.installations) {
    const corresp = { soufflerie: 'soufflerie', banc: 'banc', salle: 'tribune', precision: 'precision' };
    for (const [ancien, n] of Object.entries(p.installations)) {
      const id = corresp[ancien];
      if (!id || !n) continue;
      for (let y = 0; y < p.terrain.lignes; y++) {
        let pose = false;
        for (let x = 0; x < G.COLONNES_TERRAIN && !pose; x++) {
          if (!G.raisonPlacement(p, id, x, y)) {
            p.terrain.batiments.push({ uid: `b-${ancien}`, id, x, y, niveau: n, personnel: [] });
            pose = true;
          }
        }
        if (pose) break;
      }
    }
    delete p.installations;
  }
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

export function decrireVoiture(partie, v, pilote = PL.titulaire(partie)) {
  const m = modele(v.modele);
  const q = QUALITES[v.qualite || 0];
  const montees = Object.entries(v.pieces || {})
    .map(([emplacement, iuid]) => {
      const inv = partie.inventaire.find((i) => i.uid === iuid);
      return inv ? { emplacement, uid: iuid, ...pieceNiveau(piece(inv.piece), inv.niveau || 0) } : null;
    })
    .filter(Boolean);
  const stats = {};
  for (const [cle, val] of Object.entries(m.stats)) {
    let s = val + q.bonus + (v.ameliorations[cle] || 0) * GAIN_AMELIORATION;
    for (const pc of montees) s += pc.bonus[cle] || 0;
    // Chaque classe a son plafond : pour aller plus haut, il faut une meilleure voiture.
    stats[cle] = Math.max(1, Math.min(PLAFOND_CLASSE[m.classe] || 99, s));
  }
  const surfaces = { ...(m.surfaces || {}) };
  for (const [k, val] of Object.entries(G.effets(partie).surfaces || {})) surfaces[k] = (surfaces[k] || 0) + val;
  const ps = pilote?.stats || {};
  let nitros = 1, nitroDuree = BOOSTS.nitro.duree;
  const looks = new Set();
  for (const pc of montees) {
    for (const [s, b] of Object.entries(pc.surfaces || {})) surfaces[s] = (surfaces[s] || 0) + b;
    if (pc.charges) nitros = Math.max(nitros, pc.charges);
    if (pc.duree) nitroDuree = pc.duree;
    if (pc.look) looks.add(pc.look);
  }
  // Le pilote compte aussi : technique → adhérence, sang-froid → nitro plus longue.
  const phys = physique(stats);
  phys.adherence *= 1 + 0.012 * (ps.technique || 0);
  nitroDuree += 0.08 * (ps.sangfroid || 0);
  return {
    ...m, uid: v.uid, couleur: v.couleur || m.couleur, qualite: v.qualite || 0, stats,
    ameliorations: v.ameliorations, usure: v.usure, pieces: montees,
    physique: phys, surfaces, nitros, nitroDuree, looks: [...looks],
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
  if (m.rang && partie.rang < m.rang) return `Rang ${m.rang} requis`;
  if (m.victoires && partie.victoires < m.victoires) return `${m.victoires} victoires requises`;
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
  // La soufflerie améliore les chances : on garde le meilleur de plusieurs tirages.
  let qualite = tirerQualite(alea);
  for (let k = 0; k < G.effets(partie).tirages; k++) qualite = Math.max(qualite, tirerQualite(alea));
  if (qualite >= 2) partie.saisonStats.construction += 1;
  const id = ajouterVoiture(partie, idModele, { couleur: couleur || m.couleur, qualite });
  return { uid: id, qualite };
}

export function ameliorer(partie, stat) {
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (!v) return false;
  const niveau = v.ameliorations[stat] || 0;
  if (niveau >= REGLAGES_MAX + G.effets(partie).reglages) return false;
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
  return Math.round(v.usure * v.physique.durabiliteMax * COUT_REPARATION_POINT * (1 - G.effets(partie).reparation));
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
  const inv = { uid: uid('p'), piece: id, niveau: 0 };
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

/** Une pièce améliorée : +20 % d'effet par niveau (jusqu'à +5). */
export const NIVEAU_PIECE_MAX = 5;
export function pieceNiveau(pc, niveau) {
  if (!niveau) return { ...pc, niveau: 0 };
  const k = 1 + 0.2 * niveau;
  const bonus = {};
  for (const [c, val] of Object.entries(pc.bonus || {})) bonus[c] = val > 0 ? Math.round(val * k) : val;
  const surfaces = {};
  for (const [c, val] of Object.entries(pc.surfaces || {})) surfaces[c] = Math.round(val * k * 100) / 100;
  return { ...pc, bonus, surfaces, niveau };
}
export const coutNiveauPiece = (pc, niveau) => ({
  argent: Math.round((pc.prix * 0.5 * (niveau + 1) ** 1.3) / 10) * 10,
  recherche: 2 * (niveau + 1) + { commune: 0, rare: 2, super: 5, legendaire: 9 }[pc.rarete],
});

export function ameliorerPiece(partie, iuid) {
  const inv = partie.inventaire.find((i) => i.uid === iuid);
  if (!inv || (inv.niveau || 0) >= NIVEAU_PIECE_MAX) return false;
  const c = coutNiveauPiece(piece(inv.piece), inv.niveau || 0);
  if (partie.argent < c.argent || partie.recherche < c.recherche) return false;
  partie.argent -= c.argent;
  partie.recherche -= c.recherche;
  inv.niveau = (inv.niveau || 0) + 1;
  return true;
}

export function rechercher(partie) {
  const suivant = partie.labo + 1;
  if (suivant >= COUT_RECHERCHE.length || partie.recherche < COUT_RECHERCHE[suivant]) return false;
  partie.recherche -= COUT_RECHERCHE[suivant];
  partie.labo = suivant;
  partie.saisonStats.labo += 1;
  return true;
}

/** Une pièce au hasard, selon la rareté visée. */
function pieceAuHasard(alea, rarete, laboMax = 3) {
  let choix = PIECES.filter((x) => x.rarete === rarete && x.recherche <= laboMax);
  // Pas encore de légendaire à ce niveau de labo : une super rare à la place.
  if (!choix.length) choix = PIECES.filter((x) => x.rarete === 'super' && x.recherche <= Math.max(3, laboMax));
  return choix[Math.floor(alea() * choix.length)];
}

/** Tombola : argent, points de recherche ou pièce (parfois super rare). */
export function tirerTombola(partie) {
  if (partie.tickets <= 0) return null;
  partie.tickets -= 1;
  const alea = creerAlea((Date.now() * 31 + partie.tickets) >>> 0);
  const r = alea();
  let lot;
  const max = Math.max(3, partie.labo);
  if (r < 0.008 && partie.labo >= 7) lot = { type: 'piece', piece: pieceAuHasard(alea, 'legendaire', max) };
  else if (r < 0.06) lot = { type: 'piece', piece: pieceAuHasard(alea, 'super', max) };
  else if (r < 0.26) lot = { type: 'piece', piece: pieceAuHasard(alea, 'rare', max) };
  else if (r < 0.5) lot = { type: 'piece', piece: pieceAuHasard(alea, 'commune', max) };
  else if (r < 0.75) lot = { type: 'recherche', valeur: 10 + Math.floor(alea() * 21) };
  else lot = { type: 'argent', valeur: 500 * (2 + Math.floor(alea() * 7)) };
  appliquerLot(partie, lot);
  return lot;
}

function appliquerLot(partie, lot) {
  if (lot.type === 'piece') {
    partie.inventaire.push({ uid: uid('p'), piece: lot.piece.id, niveau: 0 });
    lot.nouvelle = !partie.collection[lot.piece.id];
    partie.collection[lot.piece.id] = true;
    if (lot.piece.rarete === 'super' || lot.piece.rarete === 'legendaire') partie.stats.superRares += 1;
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
  // Changement de saison : cérémonie des Pistons d'Or.
  if ((partie.jour - 1) % JOURS_SAISON === 0) {
    partie.ceremonie = ceremonie(partie, saisonDe(partie) - 1);
    partie.saisonStats = saisonVide();
  }
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
  // Le garage travaille : revenus, recherche, fatigue, paie du personnel.
  const g = G.journeeGarage(partie, alea);
  nouvelles.push(...g.nouvelles);
  if (g.pilote) for (const pl of partie.pilotes) PL.gagnerExp(pl, g.pilote);
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
const BASE_NIVEAU = [0, 33, 53, 68, 80, 88, 93];
/** Le rival est un peu plus fort, de plus en plus avec les paliers. */
const bonusRival = (gp) => 0.03 + 0.01 * gp.niveau;

/**
 * Les écuries d'un Grand Prix : toujours les mêmes pour un GP donné. Comme
 * pour nous, une écurie aligne au plus deux pilotes ; plus le Grand Prix est
 * relevé, plus les grosses écuries viennent à deux. Le nombre de voitures
 * adverses reste celui du Grand Prix.
 */
function plateau(gp) {
  const alea = creerAlea([...gp.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0);
  const doubles = Math.min(Math.floor(gp.adversaires / 3), Math.max(0, gp.niveau - 1));
  const equipes = EQUIPES.slice().sort(() => alea() - 0.5).slice(0, gp.adversaires - doubles);
  const parTalent = equipes.slice().sort((a, b) => b.talent - a.talent);
  return { equipes, doublees: new Set(parTalent.slice(0, doubles).map((e) => e.id)) };
}

/** Les adversaires d'une manche : [{ equipe (identifiant unique), nom, ecurie, couleur, talent, rival, physique }]. */
export function adversaires(gp, manche = 0) {
  const { equipes, doublees } = plateau(gp);
  const rival = rivalDe(gp);
  // Dents de scie : la finale d'un Grand Prix est un cran plus dure.
  const finale = manche === gp.manches.length - 1 ? 3 : 0;
  const base = (BASE_NIVEAU[gp.niveau] || 36) + finale;
  const liste = [];
  const voiture = (e, talent) => {
    const b = Math.min(99, base + talent * 70);
    return physique({ vitesse: b, acceleration: b + 4, maniabilite: b + 2, solidite: 50 });
  };
  for (const e of equipes) {
    const talent = e.talent + (e.id === rival.id ? bonusRival(gp) : 0);
    liste.push({ equipe: e.id, nom: e.pilote, ecurie: e.nom, couleur: e.couleur, talent: talent * 0.5, rival: e.id === rival.id, physique: voiture(e, talent) });
    if (doublees.has(e.id)) {
      // Le second pilote d'une écurie est un peu moins rapide que son leader.
      const t2 = talent - 0.03;
      liste.push({ equipe: `${e.id}~2`, nom: e.pilote2 || `${e.pilote} Jr`, ecurie: e.nom, couleur: e.couleur, talent: t2 * 0.5, rival: false, second: true, physique: voiture(e, t2) });
    }
  }
  return liste;
}

/** L'écurie rivale d'un Grand Prix : la plus talentueuse du plateau. */
export function rivalDe(gp) {
  return plateau(gp).equipes.reduce((a, b) => (b.talent > a.talent ? b : a));
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
  const co = resultats.find((r) => r.id === 'coequipier');
  const i = moi.place - 1;
  // L'écurie compte sa meilleure voiture pour les victoires, podiums et points de licence.
  const meilleure = Math.min(moi.place, co?.place ?? 99);
  const pl = PL.titulaire(partie);
  const eng = PL.engagement(partie);
  partie.courseJour = partie.jour;
  const sp = sponsorActif(partie)?.effets || {};
  const prime = Math.round(gp.prix * (PART_PRIX[i] ?? 0.1) * (1 + (sp.prime || 0))) + (sp.argent || 0);
  const licence = POINTS_LICENCE[meilleure - 1] ?? 1;
  const charisme = 0.05 * (pl?.stats.charisme || 0) + (pl?.trait === 'star' ? 0.1 : 0) + G.effets(partie).fans;
  const bonusVoiture = modele(partie.garage.find((g) => g.uid === partie.voitureActive)?.modele)?.fans || 0;
  const fans = Math.round(((FANS_PLACE[i] ?? 2) * gp.niveau + course.fans) * (1 + (sp.fans || 0) + charisme + bonusVoiture));
  const exp = Math.round((EXP_PLACE[i] ?? 8) * gp.niveau + course.depassements * EXP_DEPASSEMENT + course.drift);
  // Première victoire sur ce circuit : bonus de recherche (comme dans GPS2).
  const cleCircuit = `${gp.id}#${partie.gp.manche}`;
  const premiere = moi.place === 1 && !partie.premieres[cleCircuit];
  if (premiere) partie.premieres[cleCircuit] = partie.jour;
  // Meilleur tour et médailles du circuit.
  const medaille = noterTour(partie, cleCircuit, gp.manches[partie.gp.manche], course.meilleurTour);
  const recherche = course.ramasses.recherche + Math.max(0, 4 - i) + (sp.recherche || 0) + (premiere ? 10 : 0) + (medaille?.recherche || 0);
  partie.argent += prime + course.ramasses.argent;
  partie.recherche += recherche;
  partie.stats.courses += 1;
  partie.stats.piecesOr += course.pieces || 0;
  partie.stats.driftMax = Math.max(partie.stats.driftMax, course.driftMax || 0);
  if (course.departParfait) partie.stats.departsParfaits += 1;
  partie.pointsLicence += licence;
  partie.fans += fans;
  const ss = partie.saisonStats;
  ss.fans += fans;
  ss.drift += course.drift || 0;
  if (meilleure <= 3) { partie.podiums += 1; ss.podiums += 1; }
  if (meilleure === 1) ss.victoires += 1;
  if (meilleure === 1) {
    partie.victoires += 1;
    partie.victoiresParPalier[gp.palier] = (partie.victoiresParPalier[gp.palier] || 0) + 1;
  }
  for (const r of resultats) partie.gp.points[r.id] = (partie.gp.points[r.id] || 0) + (POINTS_GP[r.place - 1] ?? 0);
  partie.gp.gains += prime + course.ramasses.argent;
  partie.gp.fans += fans;
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  const soin = (p) => (p?.trait === 'soigneux' ? 0.75 : p?.trait === 'fonceur' ? 1.15 : 1);
  if (v) v.usure = Math.min(0.9, Math.max(v.usure, course.usure * soin(pl)));

  // Le second pilote : sa prime, ses fans, son EXP ; sa voiture s'use aussi.
  let coequipier = null;
  if (co && eng.second) {
    const j = co.place - 1;
    // Le sponsor ne paie qu'en partie la seconde voiture : 60 % de la prime de sa place.
    const primeCo = Math.round(gp.prix * (PART_PRIX[j] ?? 0.1) * 0.6 * (1 + (sp.prime || 0)));
    const fansCo = Math.round((FANS_PLACE[j] ?? 2) * gp.niveau * 0.5 * (1 + 0.05 * eng.second.stats.charisme + (eng.second.trait === 'star' ? 0.1 : 0)));
    const expCo = Math.round((EXP_PLACE[j] ?? 8) * gp.niveau);
    partie.argent += primeCo;
    partie.fans += fansCo;
    ss.fans += fansCo;
    partie.gp.gains += primeCo;
    partie.gp.fans += fansCo;
    if (eng.voitureSecond) eng.voitureSecond.usure = Math.min(0.9, Math.max(eng.voitureSecond.usure, (course.usureCoequipier ?? 0.12) * soin(eng.second)));
    coequipier = { nom: eng.second.nom, place: co.place, prime: primeCo, fans: fansCo, exp: expCo, niveaux: PL.gagnerExp(eng.second, expCo) };
  }

  // Butin : une caisse de pièce, plus souvent quand on gagne.
  const alea = creerAlea((Date.now() ^ (partie.jour * 131 + i)) >>> 0);
  let butin = null;
  const chanceButin = [0.45, 0.3, 0.22][i] ?? 0.1;
  if (alea() < chanceButin) {
    const r = alea();
    // Les Grands Prix des Légendes peuvent donner une pièce légendaire ; le butin suit le labo (un niveau d'avance).
    const rarete = gp.niveau >= 6 && r < 0.05 ? 'legendaire' : r < 0.08 * gp.niveau ? 'super' : r < 0.35 ? 'rare' : 'commune';
    const pc = pieceAuHasard(alea, rarete, Math.min(9, Math.max(3, partie.labo + 1)));
    butin = { type: 'piece', piece: pc };
    appliquerLot(partie, butin);
  }
  const rangs = gagnerExp(partie, exp);
  const niveauxPilote = PL.gagnerExp(pl, exp);
  partie.gp.manche += 1;
  return {
    prime, licence, fans, exp, rangs, butin, place: moi.place, medaille, niveauxPilote, pilote: pl?.nom, coequipier, meilleurTour: course.meilleurTour,
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
  if (placeFinale === 1) partie.saisonStats.trophees += 1;
  partie.gp = null;
  return jourSuivant(partie);
}

// --- Ville --------------------------------------------------------------------------------

export const peutSortir = (partie) => partie.villeJour !== partie.jour;

/** Gains d'une balade : argent, recherche, fans, EXP. */
export function finBalade(partie, gains) {
  partie.villeJour = partie.jour;
  partie.argent = Math.max(0, partie.argent + gains.argent);
  const v = partie.garage.find((g) => g.uid === partie.voitureActive);
  if (v && gains.usure) v.usure = Math.min(0.9, v.usure + gains.usure);
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

// --- Médailles de circuit -------------------------------------------------------------------

/** Temps au tour pour le bronze, l'argent et l'or, d'après la longueur du circuit. */
export function tempsMedailles(def) {
  return [def.longueur / 140, def.longueur / 160, def.longueur / 180].map((t) => Math.round(t * 10) / 10);
}
export const NOMS_MEDAILLES = ['', 'bronze', 'argent', 'or'];

function noterTour(partie, cle, def, tour) {
  if (!tour || !def) return null;
  const record = !partie.meilleursTours[cle] || tour < partie.meilleursTours[cle];
  if (record) partie.meilleursTours[cle] = Math.round(tour * 100) / 100;
  const [b, a, o] = tempsMedailles(def);
  const obtenue = tour <= o ? 3 : tour <= a ? 2 : tour <= b ? 1 : 0;
  const avant = partie.medailles[cle] || 0;
  if (obtenue <= avant) return record ? { record, niveau: avant, nouvelle: false, recherche: 0 } : null;
  partie.medailles[cle] = obtenue;
  partie.saisonStats.medailles += obtenue - avant;
  const recherche = [0, 2, 4, 8].slice(avant + 1, obtenue + 1).reduce((s, x) => s + x, 0);
  return { record, niveau: obtenue, nouvelle: true, recherche };
}
export const totalMedailles = (partie) => Object.values(partie.medailles).reduce((s, x) => s + x, 0);

// --- Pilotes (voir pilotes.js) ----------------------------------------------------------------

export const { expPilote, STATS_PILOTE } = PL;

// --- Saisons : cérémonie des Pistons d'Or -------------------------------------------------------

/**
 * Comme les cérémonies de fin d'année des jeux Kairosoft : cinq prix, des
 * écuries rivales en lice, et des exigences qui montent de saison en saison.
 */
function ceremonie(partie, saison) {
  const st = partie.saisonStats;
  const s = saison;
  const rivaux = EQUIPES.slice().sort((a, b) => b.talent - a.talent);
  const prix = [
    { id: 'ecurie', nom: "Écurie de l'année", ok: st.trophees >= 2 + Math.floor(s / 2), detail: `${st.trophees} Grand${st.trophees > 1 ? 's' : ''} Prix gagné${st.trophees > 1 ? 's' : ''}`, gain: { argent: 4000 * s } },
    { id: 'pilote', nom: "Pilote de l'année", ok: st.victoires >= 6 + 2 * s, detail: `${st.victoires} manche${st.victoires > 1 ? 's' : ''} gagnée${st.victoires > 1 ? 's' : ''}`, gain: { recherche: 15 + 5 * s } },
    { id: 'public', nom: 'Prix du public', ok: st.fans >= Math.round(300 * s ** 1.5), detail: `${st.fans} nouveaux fans`, gain: { tickets: 2 } },
    { id: 'drift', nom: 'Roi du drift', ok: st.drift >= 150 * s, detail: `${st.drift} EXP de drift et de style`, gain: { exp: 50 * s } },
    { id: 'ingenieur', nom: "Ingénieur de l'année", ok: st.construction + st.labo + st.medailles + st.installations >= 3, detail: 'constructions, labo, médailles', gain: { piece: 'rare' } },
  ];
  const alea = creerAlea(saison * 7717);
  for (const p of prix) {
    p.nomines = [rivaux[Math.floor(alea() * 4)], rivaux[4 + Math.floor(alea() * 4)]].map((e) => e.nom);
    p.laureat = p.ok ? 'Garage Piston' : p.nomines[0];
  }
  return { saison, prix, stats: { ...st } };
}

/** Verse les prix gagnés. Renvoie la liste des montées de rang. */
export function recevoirCeremonie(partie) {
  const c = partie.ceremonie;
  partie.ceremonie = null;
  if (!c) return [];
  let rangs = [];
  const alea = creerAlea(c.saison * 31 + 5);
  for (const p of c.prix) {
    if (!p.ok) continue;
    partie.palmares.push({ saison: c.saison, prix: p.nom });
    const g = p.gain;
    if (g.argent) partie.argent += g.argent;
    if (g.recherche) partie.recherche += g.recherche;
    if (g.tickets) partie.tickets += g.tickets;
    if (g.exp) rangs = rangs.concat(gagnerExp(partie, g.exp));
    if (g.piece) appliquerLot(partie, { type: 'piece', piece: pieceAuHasard(alea, g.piece, 3) });
  }
  if (c.saison >= SAISONS_CARRIERE && !partie.carriereFinie) partie.finCarriere = true;
  return rangs;
}

// --- Fin de carrière et Nouvelle partie+ ------------------------------------------------------------

export function scoreCarriere(partie) {
  const victoiresGP = Object.values(partie.trophees).filter((x) => x === 1).length;
  return Math.round(partie.fans + victoiresGP * 2000 + partie.victoires * 300 + partie.rang * 200
    + totalMedailles(partie) * 150 + partie.palmares.length * 1000 + partie.argent / 100);
}

const CLE_PALMARES = 'pistonville.palmares.v1';
export function lirePalmares() {
  try { return JSON.parse(localStorage.getItem(CLE_PALMARES)) || []; } catch { return []; }
}

export function terminerCarriere(partie) {
  partie.carriereFinie = true;
  partie.finCarriere = false;
  const score = scoreCarriere(partie);
  const liste = lirePalmares();
  liste.push({ score, pilote: PL.titulaire(partie)?.nom || 'Garage Piston', heritage: partie.heritage, date: new Date().toISOString().slice(0, 10) });
  liste.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(CLE_PALMARES, JSON.stringify(liste.slice(0, 10))); } catch { /* sans stockage, tant pis */ }
  return { score, rangPalmares: liste.findIndex((x) => x.score === score) + 1 };
}

/** Nouvelle partie+ : on garde le labo, l'album, les médailles, le pilote et un petit héritage. */
export function nouvellePartiePlus(ancienne) {
  const p = nouvellePartie();
  p.heritage = (ancienne.heritage || 0) + 1;
  p.argent += 5000 * p.heritage;
  p.labo = ancienne.labo;
  p.collection = { ...ancienne.collection };
  p.medailles = { ...ancienne.medailles };
  p.meilleursTours = { ...ancienne.meilleursTours };
  p.memoireVille = { records: { ...ancienne.memoireVille?.records }, affiches: { ...ancienne.memoireVille?.affiches } };
  // Les pilotes restent sous contrat, avec leur niveau.
  p.pilotes = JSON.parse(JSON.stringify(ancienne.pilotes || p.pilotes));
  p.titulaire = ancienne.titulaire || p.pilotes[0]?.uid || null;
  p.cadeau = { ...ancienne.cadeau };
  p.terrain.combos = { ...ancienne.terrain?.combos };   // les combos découverts restent dans l'album
  return p;
}

// --- Cadeau quotidien (vrai calendrier) -----------------------------------------------------------

/**
 * Un cadeau par jour réel où l'on joue. Pas de série à perdre : manquer un
 * jour ne remet rien à zéro, le cadeau suivant attend simplement.
 */
export const CADEAUX = [
  { argent: 500 }, { recherche: 5 }, { tickets: 1 }, { argent: 1500 }, { recherche: 10 }, { piece: 'rare' }, { argent: 3000, tickets: 2 },
];
export function cadeauDuJour(partie, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (partie.cadeau.date === aujourdhui) return null;
  const n = partie.cadeau.n % CADEAUX.length;
  const c = CADEAUX[n];
  partie.cadeau = { date: aujourdhui, n: partie.cadeau.n + 1 };
  let piece = null;
  if (c.argent) partie.argent += c.argent;
  if (c.recherche) partie.recherche += c.recherche;
  if (c.tickets) partie.tickets += c.tickets;
  if (c.piece) { piece = pieceAuHasard(creerAlea(Date.now() >>> 0), c.piece, partie.labo); appliquerLot(partie, { type: 'piece', piece }); }
  return { jour: n, cadeau: c, piece };
}

export { ORDRE_PALIERS, PALIERS };
