/* garage.js — le terrain du garage, ses bâtiments et son personnel.
 *
 * Le terrain est une grille de cases (8 de large, 6 à 14 de long selon les
 * permis). On y pose des bâtiments et du décor ; chaque bâtiment produit
 * quelque chose (voir contenu/base/batiments.js), d'autant mieux que :
 *   - du personnel du bon métier y est affecté, reposé et compétent ;
 *   - du décor l'entoure (ambiance : 100 % au contact, 50 % à une case,
 *     25 % à deux cases) ;
 *   - il forme un combo avec deux voisins.
 * Le personnel coûte un salaire chaque semaine, se fatigue en travaillant,
 * récupère en salle de repos, et progresse grâce aux points de recherche.
 */

import { BATIMENTS } from '../contenu/catalogue.js';
import { COMBOS, PERMIS } from '../contenu/base/batiments.js';
import { METIERS, POTENTIELS, TRAITS, RECRUTEMENTS, PRENOMS, SURNOMS } from '../contenu/base/personnel.js';
import { creerAlea } from './outils.js';

export const COLONNES_TERRAIN = 8;
export const LIGNES_DEPART = 6;
export const JOURS_PAIE = 7;
export { COMBOS, PERMIS, METIERS, TRAITS, RECRUTEMENTS };

export const batiment = (id) => BATIMENTS.find((x) => x.id === id);
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// --- Terrain -----------------------------------------------------------------------

export function terrainDepart() {
  return {
    lignes: LIGNES_DEPART,
    permis: 0,
    batiments: [
      { uid: 'b-pont', id: 'pont', x: 0, y: 0, niveau: 1, personnel: [] },
      { uid: 'b-repos', id: 'repos', x: 6, y: 0, niveau: 1, personnel: [] },
      { uid: 'b-distrib', id: 'distributeur', x: 7, y: 2, niveau: 1, personnel: [] },
      { uid: 'b-arbre', id: 'arbre', x: 2, y: 0, niveau: 1, personnel: [] },
    ],
    combos: {},
    depenses: {},     // uid → argent investi (pour la revente)
  };
}

/** Écart en cases entre deux rectangles (0 = ils se touchent, même par un coin). */
export function ecart(a, b) {
  const da = batiment(a.id), db = batiment(b.id);
  const dx = Math.max(0, b.x - (a.x + da.l), a.x - (b.x + db.l));
  const dy = Math.max(0, b.y - (a.y + da.h), a.y - (b.y + db.h));
  return Math.max(dx, dy);
}

function chevauche(x, y, l, h, o) {
  const d = batiment(o.id);
  return x < o.x + d.l && o.x < x + l && y < o.y + d.h && o.y < y + h;
}

/** Peut-on poser `id` en (x, y) ? Renvoie null si oui, sinon la raison. */
export function raisonPlacement(partie, id, x, y, sauf = null) {
  const def = batiment(id);
  const t = partie.terrain;
  if (x < 0 || y < 0 || x + def.l > COLONNES_TERRAIN || y + def.h > t.lignes) return 'Hors du terrain';
  for (const o of t.batiments) if (o.uid !== sauf && chevauche(x, y, def.l, def.h, o)) return 'Case occupée';
  return null;
}

export function raisonAchat(partie, id) {
  const def = batiment(id);
  if (!def) return 'Inconnu';
  if (partie.rang < def.rang) return `Rang ${def.rang} requis`;
  if (def.condition === 'trophee' && !Object.values(partie.trophees).includes(1)) return 'Gagne un Grand Prix';
  if (partie.argent < def.prix) return 'Pas assez d’argent';
  return null;
}

export function construireBatiment(partie, id, x, y) {
  if (raisonAchat(partie, id) || raisonPlacement(partie, id, x, y)) return null;
  const def = batiment(id);
  partie.argent -= def.prix;
  const b = { uid: uid('b'), id, x, y, niveau: 1, personnel: [] };
  partie.terrain.batiments.push(b);
  partie.terrain.depenses[b.uid] = def.prix;
  partie.saisonStats.installations = (partie.saisonStats.installations || 0) + 1;
  return { batiment: b, combos: decouvrirCombos(partie) };
}

export function deplacerBatiment(partie, buid, x, y) {
  const b = partie.terrain.batiments.find((o) => o.uid === buid);
  if (!b || raisonPlacement(partie, b.id, x, y, buid)) return null;
  b.x = x; b.y = y;
  return { batiment: b, combos: decouvrirCombos(partie) };
}

export const prixRevente = (partie, buid) => Math.round((partie.terrain.depenses[buid] || 0) * 0.5);

export function vendreBatiment(partie, buid) {
  const t = partie.terrain;
  const b = t.batiments.find((o) => o.uid === buid);
  if (!b) return 0;
  // On garde toujours au moins un pont élévateur : sans lui, plus de voitures.
  if (b.id === 'pont' && t.batiments.filter((o) => o.id === 'pont').length <= 1) return 0;
  const prix = prixRevente(partie, buid);
  partie.argent += prix;
  t.batiments = t.batiments.filter((o) => o !== b);
  delete t.depenses[buid];
  for (const s of partie.personnel) if (s.poste === buid) s.poste = null;
  return prix;
}

export const coutNiveauBatiment = (b) => Math.round(batiment(b.id).prix * 0.8 * b.niveau ** 1.4 / 100) * 100;

export function ameliorerBatiment(partie, buid) {
  const b = partie.terrain.batiments.find((o) => o.uid === buid);
  if (!b) return false;
  const def = batiment(b.id);
  const cout = coutNiveauBatiment(b);
  if (b.niveau >= def.niveauMax || partie.argent < cout) return false;
  partie.argent -= cout;
  b.niveau += 1;
  partie.terrain.depenses[buid] = (partie.terrain.depenses[buid] || 0) + cout;
  return true;
}

export function agrandirTerrain(partie) {
  const t = partie.terrain;
  const prix = PERMIS[t.permis];
  if (prix === undefined || partie.argent < prix) return false;
  partie.argent -= prix;
  t.permis += 1;
  t.lignes += 2;
  return true;
}

// --- Ambiance et combos ---------------------------------------------------------------

const POIDS = [1, 0.5, 0.25];

/** Bonus d'ambiance d'un bâtiment (0,3 = +30 %), d'après le décor qui l'entoure. */
export function ambiance(partie, b) {
  let total = 0;
  for (const o of partie.terrain.batiments) {
    const def = batiment(o.id);
    if (o === b || def.categorie !== 'decor') continue;
    const e = ecart(b, o);
    if (e < POIDS.length) total += def.ambiance * POIDS[e];
  }
  return Math.min(1.5, total / 100);
}

/** Combos formés sur le terrain : trois bâtiments différents qui se touchent en chaîne. */
export function combosActifs(partie) {
  const bs = partie.terrain.batiments;
  const actifs = [];
  for (const c of COMBOS) {
    const [A, B, C] = c.ids.map((id) => bs.filter((o) => o.id === id));
    let trouve = null;
    for (const a of A) for (const b2 of B) for (const c2 of C) {
      const ab = ecart(a, b2) === 0, bc = ecart(b2, c2) === 0, ac = ecart(a, c2) === 0;
      if ((ab && bc) || (ab && ac) || (ac && bc)) { trouve = [a, b2, c2]; break; }
    }
    if (trouve) actifs.push({ ...c, membres: trouve.map((x) => x.uid) });
  }
  return actifs;
}

/** Note les nouveaux combos ; renvoie ceux qu'on vient de découvrir. */
export function decouvrirCombos(partie) {
  const nouveaux = [];
  for (const c of combosActifs(partie)) {
    if (!partie.terrain.combos[c.id]) { partie.terrain.combos[c.id] = partie.jour; nouveaux.push(c); }
  }
  return nouveaux;
}

// --- Personnel -----------------------------------------------------------------------------

const statMetier = (s) => METIERS[s.metier].stat;
export const capacitePersonnel = (partie) => 2 + Math.round(effets(partie).capacite);

export function salaireDe(s) {
  const somme = s.stats.technique + s.stats.analyse + s.stats.charisme;
  let base = 250 + somme * 70 + (s.niveau - 1) * 120;
  base *= { S: 1.4, A: 1.2, B: 1.05, C: 1, D: 0.9 }[s.potentiel];
  if (s.trait === 'econome') base *= 0.8;
  if (s.trait === 'raleur') base *= 0.9;
  return Math.round(base / 10) * 10;
}

/** Une méthode de recrutement : on paie, des candidats se présentent. */
export function recruter(partie, methodeId) {
  const m = RECRUTEMENTS.find((x) => x.id === methodeId);
  if (!m || partie.rang < m.rang || partie.argent < m.prix) return null;
  partie.argent -= m.prix;
  const alea = creerAlea((Date.now() ^ (partie.jour * 9973)) >>> 0);
  const metiers = Object.keys(METIERS);
  const liste = [];
  for (let i = 0; i < m.candidats; i++) {
    const metier = metiers[(i + Math.floor(alea() * 3)) % 3];
    const tire = () => m.stats[0] + Math.floor(alea() * (m.stats[1] - m.stats[0] + 1));
    const stats = { technique: tire() - 1, analyse: tire() - 1, charisme: tire() - 1 };
    stats[METIERS[metier].stat] += 2;     // le métier tire la stat principale vers le haut
    const potentiel = m.potentiels[Math.floor(alea() * m.potentiels.length)];
    const trait = alea() < 0.45 ? TRAITS[Math.floor(alea() * TRAITS.length)].id : null;
    if (trait === 'genie') stats.analyse += 2;
    if (trait === 'bricoleur') stats.technique += 2;
    if (trait === 'star') stats.charisme += 2;
    if (trait === 'raleur') for (const k of Object.keys(stats)) stats[k] += 1;
    for (const k of Object.keys(stats)) stats[k] = Math.max(1, stats[k]);
    const prenom = PRENOMS[Math.floor(alea() * PRENOMS.length)];
    const surnom = alea() < 0.35 ? ` « ${SURNOMS[Math.floor(alea() * SURNOMS.length)]} »` : '';
    const s = { uid: uid('s'), nom: `${prenom}${surnom}`, metier, stats, niveau: 1, potentiel, trait, energie: 100, moral: 70, impayes: 0, poste: null, apparence: Math.floor(alea() * 6) };
    s.salaire = salaireDe(s);
    liste.push(s);
  }
  partie.candidats = { methode: m.id, liste };
  return liste;
}

export function embaucher(partie, suid) {
  const c = partie.candidats?.liste.find((x) => x.uid === suid);
  if (!c || partie.personnel.length >= capacitePersonnel(partie)) return false;
  partie.personnel.push({ ...c, embauche: partie.jour });
  partie.candidats.liste = partie.candidats.liste.filter((x) => x !== c);
  return true;
}

export function licencier(partie, suid) {
  const avant = partie.personnel.length;
  partie.personnel = partie.personnel.filter((s) => s.uid !== suid);
  return partie.personnel.length < avant;
}

export const peutTravailler = (s, b) => {
  const def = batiment(b.id);
  return def.places > 0 && (s.trait === 'polyvalent' || def.metier === s.metier);
};

export function affecter(partie, suid, buid) {
  const s = partie.personnel.find((x) => x.uid === suid);
  if (!s) return false;
  if (!buid) { s.poste = null; return true; }
  const b = partie.terrain.batiments.find((o) => o.uid === buid);
  if (!b || !peutTravailler(s, b)) return false;
  const occupes = partie.personnel.filter((x) => x.poste === buid && x !== s).length;
  if (occupes >= batiment(b.id).places) return false;
  s.poste = buid;
  return true;
}

export const coutFormation = (s) => ({ recherche: 4 * s.niveau, argent: 500 * s.niveau });
export const NIVEAU_PERSONNEL_MAX = 20;

/** Formation : on monte d'un niveau, les stats progressent selon le potentiel. */
export function former(partie, suid) {
  const s = partie.personnel.find((x) => x.uid === suid);
  if (!s || s.niveau >= NIVEAU_PERSONNEL_MAX) return null;
  const c = coutFormation(s);
  if (partie.recherche < c.recherche || partie.argent < c.argent) return null;
  partie.recherche -= c.recherche;
  partie.argent -= c.argent;
  s.niveau += 1;
  const alea = creerAlea((Date.now() ^ s.niveau * 31) >>> 0);
  const gains = {};
  const principal = statMetier(s);
  const pot = POTENTIELS[s.potentiel];
  for (const k of Object.keys(s.stats)) {
    const g = Math.floor((k === principal ? 1.2 : 0.4) * pot + alea());
    if (g > 0) { s.stats[k] += g; gains[k] = g; }
  }
  s.salaire = salaireDe(s);
  s.moral = Math.min(100, s.moral + 10);
  return gains;
}

/** Contribution d'une personne à son bâtiment. */
function contribution(s) {
  if (s.auRepos) return 0;
  let c = 0.6 + 0.08 * s.stats[statMetier(s)];
  if (s.energie < 30) c *= 0.5;
  if (s.moral < 30) c *= 0.7;
  if (s.trait === 'rapide') c *= 1.15;
  return c;
}

/** Efficacité d'un bâtiment selon son personnel (1 = normal ; 0,25 si personne). */
export function facteurPersonnel(partie, b) {
  const def = batiment(b.id);
  if (!def.places) return 1;
  const equipe = partie.personnel.filter((s) => s.poste === b.uid);
  if (!equipe.length) return 0.25;
  return Math.max(0.25, equipe.reduce((t, s) => t + contribution(s), 0) / def.places);
}

// --- Effets du garage -------------------------------------------------------------------------

/** Tout ce que le garage apporte, recalculé à la demande. */
export function effets(partie) {
  const e = {
    atelier: 0, conception: 0, reglages: 0, recherche: 0, capacite: 0, repos: 0, revenu: 0, pilote: 0,
    boutique: 0, fans: 0, surfaces: {}, ponts: 0,
  };
  if (!partie.terrain) return { ...e, tirages: 0, reparation: 0 };
  const combos = combosActifs(partie);
  const bonusCombo = (cle) => combos.reduce((t, c) => t + (c.bonus[cle] || 0), 0) + combos.reduce((t, c) => t + (c.bonus.tout || 0), 0);
  for (const b of partie.terrain.batiments) {
    const def = batiment(b.id);
    if (def.categorie !== 'batiment') continue;
    if (b.id === 'pont') e.ponts += 1;
    const mult = facteurPersonnel(partie, b) * (1 + ambiance(partie, b));
    for (const [cle, val] of Object.entries(def.effet)) {
      if (cle === 'surfaces') {
        for (const [s, v] of Object.entries(val)) e.surfaces[s] = (e.surfaces[s] || 0) + v * b.niveau * mult * (1 + bonusCombo('surfaces'));
      } else if (cle === 'capacite') {
        e.capacite += val;                      // une salle = 3 places, quel que soit son niveau
      } else if (cle === 'reglages') {
        e.reglages += facteurPersonnel(partie, b) >= 0.6 ? val * b.niveau : 0;
      } else {
        e[cle] += val * b.niveau * mult * (1 + bonusCombo(cle));
      }
    }
  }
  // Une étoile de plus possible à la construction tous les paliers de conception et d'atelier.
  const points = e.conception + e.atelier * 0.5;
  e.tirages = [20, 60, 120, 200].filter((s) => points >= s).length;
  e.reparation = Math.min(0.6, e.atelier / 200);
  e.revenu = Math.round(e.revenu);
  return e;
}

// --- Journée et paie ------------------------------------------------------------------------------

/**
 * Une journée au garage : revenus, recherche, fatigue et repos, petits progrès
 * en travaillant ; le jour de paie, les salaires. Renvoie des nouvelles.
 */
export function journeeGarage(partie, alea) {
  const nouvelles = [];
  const e = effets(partie);
  const boutique = Math.round(partie.fans * e.boutique);
  partie.argent += e.revenu + boutique;
  partie.recherche += Math.floor(e.recherche + alea() * (e.recherche % 1));
  const recup = 20 + e.repos;
  for (const s of partie.personnel) {
    // Épuisé : il file en salle de repos et n'en ressort qu'en forme.
    if (s.energie < 25) s.auRepos = true;
    if (s.auRepos && s.energie >= 80) s.auRepos = false;
    if (s.poste && !s.auRepos) {
      s.energie = Math.max(0, s.energie - (s.trait === 'infatigable' ? 6 : 12) + e.repos * 0.4);
      // En travaillant, on apprend un peu (comme les mécaniciens de Grand Prix Story).
      if (alea() < 0.06) { s.stats[statMetier(s)] += 1; s.salaire = salaireDe(s); }
    } else {
      s.energie = Math.min(100, s.energie + recup);
    }
    s.energie = Math.min(100, s.energie);
  }
  if (partie.jour % JOURS_PAIE === 0 && partie.personnel.length) {
    const total = partie.personnel.reduce((t, s) => t + s.salaire, 0);
    if (partie.argent >= total) {
      partie.argent -= total;
      for (const s of partie.personnel) { s.moral = Math.min(100, s.moral + (s.trait === 'raleur' ? 2 : 6)); s.impayes = 0; }
      nouvelles.push({ titre: 'Jour de paie', texte: `Salaires versés : −${total.toLocaleString('fr-FR')} G.` });
    } else {
      for (const s of partie.personnel) { s.moral = Math.max(0, s.moral - 35); s.impayes += 1; }
      nouvelles.push({ titre: 'Paie impossible !', texte: `Il manque de quoi payer ${total.toLocaleString('fr-FR')} G. L'équipe grogne.` });
    }
    const partis = partie.personnel.filter((s) => s.impayes >= 2 || s.moral <= 0);
    for (const s of partis) nouvelles.push({ titre: 'Démission', texte: `${s.nom} quitte le garage.` });
    partie.personnel = partie.personnel.filter((s) => !partis.includes(s));
  }
  if (boutique + e.revenu > 0 && partie.jour % JOURS_PAIE === 1) {
    nouvelles.push({ titre: 'Recettes du garage', texte: `+${(boutique + e.revenu).toLocaleString('fr-FR')} G par jour (distributeurs, cafétéria, boutique).` });
  }
  return { nouvelles, pilote: e.pilote };
}

/** Coût hebdomadaire de l'équipe. */
export const masseSalariale = (partie) => partie.personnel.reduce((t, s) => t + s.salaire, 0);

/** Premier employé offert au début : un mécanicien modeste. */
export function personnelDepart() {
  const s = { uid: 's-depart', nom: 'Gégé « la Clé »', metier: 'mecano', stats: { technique: 4, analyse: 1, charisme: 2 }, niveau: 1, potentiel: 'C', trait: 'bricoleur', energie: 100, moral: 80, impayes: 0, poste: 'b-pont', apparence: 3, embauche: 1 };
  s.salaire = salaireDe(s);
  return [s];
}
