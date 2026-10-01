/* ecrans-garage.js — menus du garage : accueil, construction, fiche bâtiment,
 * équipe et recrutement, et la barre d'onglets du bas.
 *
 * Disposition (zone du pouce) : barre d'état en haut, terrain du garage au
 * milieu (on le touche pour choisir un bâtiment, on le fait glisser pour
 * défiler), action du jour et barre d'onglets en bas : Garage, Construire,
 * Équipe, Voitures, Courses. Chaque fonction est à un ou deux touchers.
 */

import { BATIMENTS } from '../contenu/catalogue.js';
import { STATS_PERSONNEL, POTENTIELS } from '../contenu/base/personnel.js';
import {
  batiment, raisonAchat, effets, ambiance, combosActifs, facteurPersonnel, capacitePersonnel, masseSalariale,
  coutNiveauBatiment, prixRevente, peutTravailler, coutFormation, NIVEAU_PERSONNEL_MAX, COMBOS, PERMIS,
  METIERS, TRAITS, RECRUTEMENTS, JOURS_PAIE,
} from './garage.js';
import { vignetteBatiment } from './scene-garage.js';
import {
  barre, carteVoiture, texteRecompense, ecranAtelier, ecranBoutique, ecranPieces, ecranLabo, ecranPilote, ecranBureau,
  ecranObjectifs, ecranAide, ecranCelebration,
} from './ecrans.js';
import { voitureActive, peutSortir, objectifsActifs } from './partie.js';
import { PERSONNAGES, idPersonnage } from './sprites.js';
import { formatArgent } from './outils.js';

const e = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- Barre d'onglets ----------------------------------------------------------------------

const ONGLETS = [
  ['garage', 'Garage', 'M3 10 L12 3 L21 10 V21 H3 Z M9 21 V14 H15 V21'],
  ['construire', 'Construire', 'M3 21 H21 M5 21 V11 H11 V21 M13 21 V6 H19 V21 M7 14 H9 M15 9 H17 M15 13 H17'],
  ['equipe', 'Équipe', 'M8 11 A3 3 0 1 0 8 5 A3 3 0 1 0 8 11 M2 20 C2 15 14 15 14 20 M16 11 A3 3 0 1 0 16 5 M16 14 C20 14 22 16 22 20'],
  ['voitures', 'Voitures', 'M3 15 L5 9 H19 L21 15 V19 H3 Z M6 19 V21 M18 19 V21 M6 15 H8 M16 15 H18'],
  ['courses', 'Courses', 'M5 21 V3 M5 4 H19 L16 8 L19 12 H5'],
];

export function ongletsBas(actif) {
  return `<nav class="onglets-bas" aria-label="Menu principal">${ONGLETS.map(([id, nom, d]) => `
    <button class="onglet-bas ${id === actif ? 'actif' : ''}" data-action="onglet-${id}" aria-current="${id === actif ? 'page' : 'false'}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${nom}</span></button>`).join('')}</nav>`;
}

export function actionsOnglets(app) {
  return {
    'onglet-garage': () => app.garage(),
    'onglet-construire': () => app.montrer(ecranConstruire(app)),
    'onglet-equipe': () => app.montrer(ecranEquipe(app)),
    'onglet-voitures': () => app.montrer(ecranVoitures(app)),
    'onglet-courses': () => app.montrer(avecOnglets(app, ecranBureau(app, () => app.garage()), 'courses')),
  };
}

/** Remplace le bouton « Retour » du bas d'un écran par la barre d'onglets. */
export function avecOnglets(app, ecran, actif) {
  const html = ecran.html.replace(/<div class="pied">[\s\S]*?<\/div>\s*$/, '') + ongletsBas(actif);
  return { ...ecran, html, actions: { ...ecran.actions, ...actionsOnglets(app) } };
}

// --- Accueil du garage -------------------------------------------------------------------------

export function ecranGarage(app) {
  const p = app.partie;
  const nouvelles = (p.nouvelles || []).map((n) => `<div class="nouvelle ${n.evenement ? 'evenement' : ''}"><b>${e(n.titre)}</b><span>${e(n.texte)}</span></div>`).join('');
  const obj = objectifsActifs(p, 1)[0];
  const sortie = peutSortir(p) && !!voitureActive(p);
  const sansVoiture = !voitureActive(p);
  return {
    classe: 'garage accueil',
    html: `${barre(p)}
    ${obj ? `<button class="objectif-bande compacte" data-action="objectifs"><small>OBJECTIF</small><b>${e(obj.titre)}</b>
      <span class="jauge"><i style="width:${Math.round((obj.actuel / obj.but) * 100)}%;background:#3fa34d"></i></span><em>${texteRecompense(obj.recompense)}</em></button>` : ''}
    ${nouvelles ? `<div class="nouvelles" data-action="lu">${nouvelles}<small>Toucher pour fermer</small></div>` : ''}
    <div class="espace"></div>
    ${sansVoiture ? '<p class="astuce">Ton garage est vide : onglet <b>Voitures</b> pour construire ta première voiture.</p>' : '<p class="astuce">Touche un bâtiment pour le gérer · fais glisser pour voir tout le terrain</p>'}
    <div class="actions-jour">
      <button class="btn btn-vert" data-action="ville" ${sortie ? '' : 'disabled'}>${peutSortir(p) ? 'En ville' : 'Ville : demain'}</button>
      <button class="btn btn-principal" data-action="jour">Jour suivant ▶</button>
    </div>
    ${ongletsBas('garage')}`,
    actions: {
      ...actionsOnglets(app),
      lu: () => { p.nouvelles = []; app.garage(); },
      objectifs: () => app.montrer(ecranObjectifs(app)),
      ville: () => app.sortirEnVille(),
      jour: () => app.jourSuivant(),
    },
  };
}

// --- Construire ---------------------------------------------------------------------------------

const EFFETS_TEXTE = {
  atelier: (v) => `atelier +${v}`, conception: (v) => `conception +${v}`, reglages: (v) => `+${v} réglage`,
  recherche: (v) => `+${v} PR/jour`, capacite: (v) => `+${v} places`, repos: (v) => `repos +${v}`,
  revenu: (v) => `+${v} G/jour`, pilote: (v) => `+${v} EXP pilote/jour`, boutique: (v) => `${v * 100} G/jour par 100 fans`,
  fans: (v) => `+${Math.round(v * 100)} % fans`, surfaces: () => 'adhérence +',
};
const texteEffet = (def) => (def.categorie === 'decor'
  ? `ambiance +${def.ambiance} autour`
  : Object.entries(def.effet).map(([k, v]) => EFFETS_TEXTE[k]?.(v) || k).join(' · '));

export function ecranConstruire(app, onglet = 'batiment') {
  const p = app.partie;
  const planche = app.assets?.urbain;
  const liste = BATIMENTS.filter((d) => d.categorie === onglet).map((d) => {
    const raison = raisonAchat(p, d.id);
    const verrou = raison && raison !== 'Pas assez d’argent';
    const combien = p.terrain.batiments.filter((b) => b.id === d.id).length;
    return `<button class="carte-batiment ${verrou ? 'verrou' : ''}" data-action="choisir" data-id="${d.id}" ${raison ? 'disabled' : ''}>
      <img src="${planche ? vignetteBatiment(planche, d) : ''}" alt="" style="aspect-ratio:${d.l}/${d.h}">
      <span class="cb-texte"><b>${e(d.nom)}</b>
        <small>${d.l}×${d.h} cases · ${e(texteEffet(d))}${d.places ? ` · ${d.places} poste${d.places > 1 ? 's' : ''} ${METIERS[d.metier].nom.toLowerCase()}` : ''}</small>
        <small class="petit">${e(d.texte || '')}</small></span>
      <span class="cb-prix">${verrou ? e(raison) : formatArgent(d.prix)}${combien ? `<small>×${combien}</small>` : ''}</span>
    </button>`;
  }).join('');
  const prochainPermis = PERMIS[p.terrain.permis];
  const terrain = `<section class="panneau"><h2 class="titre-panneau marron">Terrain<small>${p.terrain.lignes} rangées sur ${p.terrain.lignes + (PERMIS.length - p.terrain.permis) * 2} possibles</small></h2>
    <div class="contenu"><div class="ligne"><span>Permis d'agrandissement : +2 rangées</span>
    ${prochainPermis !== undefined ? `<button class="btn btn-mini btn-principal" data-action="agrandir" ${p.argent < prochainPermis ? 'disabled' : ''}>${formatArgent(prochainPermis)}</button>` : '<span class="etat">Terrain au maximum</span>'}</div></div></section>`;
  const combos = COMBOS.map((c) => {
    const vu = p.terrain.combos[c.id];
    return `<div class="combo ${vu ? 'vu' : ''}"><b>${vu ? e(c.nom) : '???'}</b><small>${vu ? `${c.ids.map((id) => e(batiment(id).nom)).join(' + ')} · ${e(c.texte)}` : 'Trois bâtiments voisins… à découvrir'}</small></div>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Construire</h2>
      <div class="onglets">
        <button class="onglet ${onglet === 'batiment' ? 'actif' : ''}" data-action="cat" data-id="batiment">Bâtiments</button>
        <button class="onglet ${onglet === 'decor' ? 'actif' : ''}" data-action="cat" data-id="decor">Décor</button>
        <button class="onglet ${onglet === 'terrain' ? 'actif' : ''}" data-action="cat" data-id="terrain">Terrain et combos</button>
      </div>
      ${onglet === 'terrain' ? `${terrain}<section class="panneau"><h2 class="titre-panneau">Combos<small>${Object.keys(p.terrain.combos).length} / ${COMBOS.length} découverts. Trois bâtiments qui se touchent.</small></h2><div class="contenu">${combos}</div></section>` : liste}
      ${onglet === 'decor' ? '<p class="petit clair">Le décor rend les bâtiments voisins plus efficaces : 100 % au contact, 50 % à une case, 25 % à deux cases.</p>' : ''}
    </div>${ongletsBas('construire')}`,
    actions: {
      ...actionsOnglets(app),
      cat: (d) => app.montrer(ecranConstruire(app, d.id)),
      choisir: (d) => app.modePlacement({ id: d.id }),
      agrandir: () => {
        if (app.action('agrandirTerrain')) {
          app.son.niveau();
          app.montrer(ecranCelebration(app, 'Terrain agrandi !', `Ton garage fait maintenant ${p.terrain.lignes} rangées.`, () => app.garage()));
          return;
        }
        app.montrer(ecranConstruire(app, 'terrain'));
      },
    },
  };
}

/** Barre du bas pendant qu'on choisit l'emplacement d'un bâtiment. */
export function ecranPlacement(app, pl, raison) {
  const d = batiment(pl.id);
  const choisi = pl.x !== undefined;
  return {
    classe: 'garage accueil placement',
    html: `<div class="espace"></div>
    <div class="barre-placement">
      <div><b>${e(d.nom)}</b> ${pl.sauf ? '(déplacement)' : `· ${formatArgent(d.prix)}`}
        <small>${choisi ? (raison ? `<span class="ko">${e(raison)}</span>` : 'Bon emplacement !') : 'Touche une case du terrain'}</small></div>
      <div class="ligne">
        <button class="btn btn-mini" data-action="annuler">Annuler</button>
        <button class="btn btn-mini btn-principal" data-action="poser" ${choisi && !raison ? '' : 'disabled'}>${pl.sauf ? 'Déplacer ici' : 'Construire ici'}</button>
      </div>
    </div>`,
    actions: {
      annuler: () => app.annulerPlacement(),
      poser: () => app.validerPlacement(),
    },
  };
}

// --- Fiche d'un bâtiment ----------------------------------------------------------------------------

export function ecranFicheBatiment(app, buid) {
  const p = app.partie;
  const b = p.terrain.batiments.find((x) => x.uid === buid);
  if (!b) return ecranGarage(app);
  const d = batiment(b.id);
  const amb = Math.round(ambiance(p, b) * 100);
  const combos = combosActifs(p).filter((c) => c.membres.includes(b.uid));
  const equipe = p.personnel.filter((s) => s.poste === b.uid);
  const facteur = facteurPersonnel(p, b);
  const cout = coutNiveauBatiment(b);
  const candidats = p.personnel.filter((s) => s.poste !== b.uid && peutTravailler(s, b));
  const postes = d.places ? `
    <div class="petit">Postes : ${equipe.length}/${d.places} ${METIERS[d.metier].nom.toLowerCase()}${d.places > 1 ? 's' : ''} · efficacité ${Math.round(facteur * 100)} %</div>
    ${equipe.map((s) => `<div class="ligne"><span>${avatar(app, s)} ${e(s.nom)} ${s.auRepos ? '<span class="petit">(au repos)</span>' : ''}</span><button class="btn btn-mini" data-action="retirer" data-uid="${s.uid}">Retirer</button></div>`).join('')}
    ${equipe.length < d.places ? (candidats.length
      ? `<div class="ligne"><span class="petit">Affecter :</span>${candidats.slice(0, 4).map((s) => `<button class="btn btn-mini" data-action="affecter" data-uid="${s.uid}">${e(s.nom.split(' ')[0])} · ${s.stats[METIERS[s.metier].stat]}</button>`).join('')}</div>`
      : `<div class="petit ko">Personne de libre pour ce poste : recrute un ${METIERS[d.metier].nom.toLowerCase()} (onglet Équipe).</div>`) : ''}` : '';
  return {
    classe: 'garage accueil fiche',
    html: `<div class="espace"></div>
    <section class="panneau fiche-batiment">
      <h2 class="titre-panneau" style="background:${d.categorie === 'decor' ? '#3fa34d' : d.couleur}">${e(d.nom)}<small>${d.niveauMax > 1 ? `Niveau ${b.niveau} / ${d.niveauMax}` : 'Décor'}${amb ? ` · ambiance +${amb} %` : ''}</small></h2>
      <div class="contenu">
        <div class="petit">${e(d.texte || '')}</div>
        <div class="petit">${e(texteEffet(d))}${d.categorie === 'batiment' && d.niveauMax > 1 ? ' (par niveau)' : ''}</div>
        ${combos.map((c) => `<div class="combo vu"><b>Combo : ${e(c.nom)}</b><small>${e(c.texte)}</small></div>`).join('')}
        ${postes}
        <div class="ligne actions-fiche">
          ${b.niveau < d.niveauMax ? `<button class="btn btn-mini btn-principal" data-action="niveau" ${p.argent < cout ? 'disabled' : ''}>Niveau ${b.niveau + 1} · ${formatArgent(cout)}</button>` : ''}
          <button class="btn btn-mini" data-action="deplacer">Déplacer</button>
          <button class="btn btn-mini" data-action="vendre">Vendre · ${formatArgent(prixRevente(p, b.uid))}</button>
          <button class="btn btn-mini" data-action="fermer">Fermer</button>
        </div>
      </div>
    </section>`,
    actions: {
      fermer: () => { app.scene.selection = null; app.garage(); },
      niveau: () => { if (app.action('ameliorerBatiment', b.uid)) { app.son.niveau(); app.toast(`${d.nom} niveau ${b.niveau} !`); } app.montrer(ecranFicheBatiment(app, buid)); },
      deplacer: () => app.modePlacement({ id: b.id, sauf: b.uid }),
      vendre: () => {
        const g = app.action('vendreBatiment', b.uid);
        if (g) { app.son.caisse(); app.toast(`Vendu : +${formatArgent(g)}`); app.scene.selection = null; app.garage(); }
        else app.toast(b.id === 'pont' ? 'Il faut garder au moins un pont élévateur.' : 'Impossible.');
      },
      affecter: (x) => { if (!app.action('affecter', [x.uid, b.uid])) app.toast('Poste complet ou métier différent.'); app.montrer(ecranFicheBatiment(app, buid)); },
      retirer: (x) => { app.action('affecter', [x.uid, null]); app.montrer(ecranFicheBatiment(app, buid)); },
    },
  };
}

// --- Équipe ----------------------------------------------------------------------------------------

const cacheAvatars = new Map();
function avatar(app, s, grand = false) {
  const planche = app.assets?.urbain;
  if (!planche) return '';
  const cle = `${s.apparence}-${grand}`;
  if (!cacheAvatars.has(cle)) {
    const t = grand ? 3 : 2;
    const c = document.createElement('canvas');
    c.width = 16 * t; c.height = 16 * t;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const id = idPersonnage(PERSONNAGES[s.apparence % PERSONNAGES.length], 1, 0);
    ctx.drawImage(planche, (id % 27) * 16, Math.floor(id / 27) * 16, 16, 16, 0, 0, 16 * t, 16 * t);
    cacheAvatars.set(cle, c.toDataURL());
  }
  return `<img class="avatar ${grand ? 'grand' : ''}" src="${cacheAvatars.get(cle)}" alt="">`;
}

function jaugeMini(val, couleur) {
  return `<span class="jauge-mini"><i style="width:${Math.max(0, Math.min(100, val))}%;background:${couleur}"></i></span>`;
}

function carteEmploye(app, s, { candidat = false } = {}) {
  const p = app.partie;
  const poste = p.terrain.batiments.find((b) => b.uid === s.poste);
  const trait = TRAITS.find((x) => x.id === s.trait);
  const stats = Object.entries(STATS_PERSONNEL).map(([k, nom]) => `<span class="${k === METIERS[s.metier].stat ? 'principale' : ''}">${nom} <b>${s.stats[k]}</b></span>`).join('');
  const f = coutFormation(s);
  return `<div class="employe">
    <div class="employe-tete">${avatar(app, s, true)}<div>
      <b>${e(s.nom)}</b>
      <small>${METIERS[s.metier].nom} · niv. ${s.niveau} · potentiel <span class="potentiel p${s.potentiel}">${s.potentiel}</span>${trait ? ` · <span class="trait" title="${e(trait.texte)}">${e(trait.nom)}</span>` : ''}</small>
      <small>${formatArgent(s.salaire)} / semaine${candidat ? '' : ` · ${poste ? `poste : ${e(batiment(poste.id).nom)}` : 'sans poste'}`}</small>
    </div></div>
    <div class="stats-employe">${stats}</div>
    ${trait ? `<div class="petit">${e(trait.texte)}</div>` : ''}
    ${candidat ? `<div class="ligne"><span></span><button class="btn btn-mini btn-vert" data-action="embaucher" data-uid="${s.uid}">Embaucher</button></div>` : `
    <div class="ligne petit"><span>Énergie ${jaugeMini(s.energie, s.energie < 30 ? '#e4432d' : '#5ad16a')}</span><span>Moral ${jaugeMini(s.moral, s.moral < 30 ? '#e4432d' : '#f2c14e')}</span></div>
    <div class="ligne">
      <button class="btn btn-mini btn-principal" data-action="former" data-uid="${s.uid}" ${s.niveau >= NIVEAU_PERSONNEL_MAX || p.recherche < f.recherche || p.argent < f.argent ? 'disabled' : ''}>Former · ${f.recherche} PR · ${formatArgent(f.argent)}</button>
      <button class="btn btn-mini" data-action="licencier" data-uid="${s.uid}">Renvoyer</button>
    </div>`}
  </div>`;
}

export function ecranEquipe(app) {
  const p = app.partie;
  const cap = capacitePersonnel(p);
  const liste = p.personnel.map((s) => carteEmploye(app, s)).join('') || '<p class="petit">Personne pour l’instant.</p>';
  const prochaine = JOURS_PAIE - (p.jour % JOURS_PAIE);
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Équipe</h2>
      <section class="panneau"><div class="contenu gains-clairs">
        <div><small>Effectif</small><b>${p.personnel.length} / ${cap}</b></div>
        <div><small>Salaires / semaine</small><b>${formatArgent(masseSalariale(p))}</b></div>
        <div><small>Prochaine paie</small><b>dans ${prochaine} j</b></div>
        <div><small>Recettes / jour</small><b>${formatArgent(effets(p).revenu)}</b></div>
      </div></section>
      <div class="pile">
        <button class="btn btn-principal" data-action="recruter" ${p.personnel.length >= cap ? 'disabled' : ''}>${p.personnel.length >= cap ? 'Équipe complète : construis une salle de repos' : 'Recruter'}</button>
        <button class="btn" data-action="pilote">Pilote : ${e(p.pilote)}${p.pilotePoints ? ` <span class="badge">${p.pilotePoints}</span>` : ''}</button>
      </div>
      <p class="petit clair">Pour affecter quelqu'un, touche son bâtiment sur le terrain. Un employé épuisé part se reposer tout seul ; un employé mal payé finit par démissionner.</p>
      ${liste}
    </div>${ongletsBas('equipe')}`,
    actions: {
      ...actionsOnglets(app),
      recruter: () => app.montrer(ecranRecrutement(app)),
      pilote: () => app.montrer(avecOnglets(app, ecranPilote(app), 'equipe')),
      former: (d) => {
        const g = app.action('former', d.uid);
        if (g) { app.son.niveau(); app.toast(`Formation réussie : ${Object.entries(g).map(([k, v]) => `${STATS_PERSONNEL[k]} +${v}`).join(', ') || 'expérience'}`); }
        app.montrer(ecranEquipe(app));
      },
      licencier: (d) => { app.action('licencier', d.uid); app.montrer(ecranEquipe(app)); },
    },
  };
}

export function ecranRecrutement(app) {
  const p = app.partie;
  const methodes = RECRUTEMENTS.map((m) => `<button class="carte-batiment sans-image" data-action="methode" data-id="${m.id}" ${p.rang < m.rang || p.argent < m.prix ? 'disabled' : ''}>
      <span class="cb-texte"><b>${e(m.nom)}</b><small>${m.candidats} candidats · potentiels ${[...new Set(m.potentiels)].join(', ')}</small></span>
      <span class="cb-prix">${p.rang < m.rang ? `Rang ${m.rang}` : formatArgent(m.prix)}</span></button>`).join('');
  const cands = p.candidats?.liste?.length
    ? `<h3 class="titre-section petit-titre">Candidats</h3>${p.candidats.liste.map((s) => carteEmploye(app, s, { candidat: true })).join('')}`
    : '';
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Recruter</h2>
      <p class="petit clair">Plus l'annonce coûte cher, meilleurs sont les candidats. Le potentiel (S à D) dit à quelle vitesse ils progresseront en formation.</p>
      ${methodes}
      ${cands}
    </div>${ongletsBas('equipe')}`,
    actions: {
      ...actionsOnglets(app),
      methode: (d) => { if (app.action('recruter', d.id)) app.son.caisse(); app.montrer(ecranRecrutement(app)); },
      embaucher: (d) => {
        if (app.action('embaucher', d.uid)) { app.son.niveau(); app.toast('Bienvenue dans l’équipe ! Touche un bâtiment pour lui donner un poste.'); }
        else app.toast('Plus de place : construis une salle de repos.');
        app.montrer(ecranRecrutement(app));
      },
    },
  };
}

// --- Voitures (hub) ---------------------------------------------------------------------------------

export function ecranVoitures(app) {
  const p = app.partie;
  const v = voitureActive(p);
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Voitures</h2>
      ${v ? `<section class="panneau">${carteVoiture(v)}</section>` : '<section class="panneau"><div class="contenu texte"><p>Aucune voiture. Construis-en une (moins chère, qualité tirée au sort) ou achète-la.</p></div></section>'}
      <nav class="grille-actions">
        <button class="btn ${v ? '' : 'btn-principal'}" data-action="boutique">Construire / acheter</button>
        <button class="btn" data-action="atelier" ${v ? '' : 'disabled'}>Atelier</button>
        <button class="btn" data-action="pieces">Pièces</button>
        <button class="btn" data-action="labo">Labo</button>
      </nav>
      <div class="petits-liens"><button class="lien" data-action="aide">Comment jouer</button><button class="lien" data-action="titre">Menu principal</button></div>
    </div>${ongletsBas('voitures')}`,
    actions: {
      ...actionsOnglets(app),
      boutique: () => app.montrer(ecranBoutique(app, () => app.montrer(ecranVoitures(app)))),
      atelier: () => app.montrer(ecranAtelier(app)),
      pieces: () => app.montrer(ecranPieces(app, { retour: () => app.montrer(ecranVoitures(app)) })),
      labo: () => app.montrer(ecranLabo(app, () => app.montrer(ecranVoitures(app)))),
      aide: () => app.montrer(ecranAide(app, 'garage')),
      titre: () => app.titre(),
    },
  };
}

export { POTENTIELS };
