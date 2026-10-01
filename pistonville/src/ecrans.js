/* ecrans.js — les menus, en HTML par-dessus le canevas du jeu.
 *
 * Chaque écran renvoie son HTML et ses actions ; un clic sur un élément
 * portant data-action appelle l'action du même nom, avec ses data-*.
 * `apres(racine)` (facultatif) lance les animations une fois l'écran posé :
 * compteurs qui défilent, jauges qui se remplissent, étoiles qui tombent.
 *
 * Les écrans ouverts depuis la ville reçoivent `retour` : on y revient
 * au lieu du garage.
 */

import { VEHICULES, GRANDS_PRIX, PIECES, SPONSORS } from '../contenu/catalogue.js';
import {
  voitureActive, decrireVoiture, statutGP, coutReparation, fraisDossier, peutAcheter, licenceAuMoins, modele,
  piece, montureDe, peutSortir, prixPiece, promoDuJour, PRIX_CAFE, ORDRE_PALIERS, PALIERS,
  objectifsActifs, objectifsFaits, totalObjectifs, estimerChances, rivalDe, sponsorActif, sponsorDispo,
} from './partie.js';
import {
  coutAmelioration, evaluerCandidature, SURFACES, kmh, CLASSES, EMPLACEMENTS, RARETES, COUT_RECHERCHE,
  QUALITES, PEINTURES, COUT_PEINTURE, expPourRang,
} from './regles.js';
import { formatArgent, formatTemps, ordinal } from './outils.js';
import { urlAsset } from './assets.js';
import { THEMES } from './rendu-circuit.js';
import { spriteVoiture } from './sprites.js';

const e = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Interface {
  constructor(racine) {
    this.racine = racine;
    this.actions = {};
    this.racine.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const f = this.actions[el.dataset.action];
      if (f) { ev.preventDefault(); f(el.dataset); }
    });
  }

  montrer({ html, actions = {}, classe = '', apres = null }) {
    this.racine.className = classe;
    this.racine.innerHTML = html;
    this.actions = actions;
    this.racine.hidden = !html;
    clearTimeout(this.minuteurs);
    if (apres) apres(this.racine);
  }

  vider() { this.montrer({ html: '' }); }
}

// --- Petits morceaux réutilisés -------------------------------------------------------

function barre(partie) {
  const lic = partie.licence ? `Licence ${partie.licence}` : 'Sans licence';
  const besoin = expPourRang(partie.rang);
  return `<header class="barre">
    <div class="barre-ligne">
      <span class="jour">JOUR ${partie.jour}</span>
      <span class="rang" title="Rang de l'équipe">RANG ${partie.rang}
        <span class="jauge-exp"><i style="width:${Math.round((partie.exp / besoin) * 100)}%"></i></span></span>
      <span class="argent">${formatArgent(partie.argent)}</span>
    </div>
    <div class="barre-ligne pastilles">
      <span class="pastille bleu">${lic}</span>
      <span class="pastille rouge">${partie.fans} fans</span>
      <span class="pastille violet">${partie.recherche} PR</span>
      <span class="pastille rose">${partie.tickets} ticket${partie.tickets > 1 ? 's' : ''}</span>
    </div>
  </header>`;
}

function barreStat(nom, valeur, couleur, avant = null) {
  const gain = avant !== null && valeur !== avant ? `<em class="${valeur > avant ? 'ok' : 'ko'}">${valeur > avant ? '+' : ''}${valeur - avant}</em>` : '';
  return `<div class="stat"><span>${nom}</span><div class="jauge"><i style="width:${valeur}%;background:${couleur}"></i></div><b>${valeur}${gain}</b></div>`;
}

const COULEURS_STATS = { vitesse: '#e4432d', acceleration: '#f39c33', maniabilite: '#3fa34d', solidite: '#2f6fdb' };
const NOMS_STATS = { vitesse: 'Vitesse', acceleration: 'Accél.', maniabilite: 'Maniab.', solidite: 'Solidité' };
const COURTS = { vitesse: 'Vit', acceleration: 'Acc', maniabilite: 'Man', solidite: 'Sol' };

const etoiles = (n, max = 5) => `<span class="etoiles">${'★'.repeat(n)}<span>${'★'.repeat(max - n)}</span></span>`;

/** Image de la voiture vue de dessus, avec sa peinture et ses pièces. */
const cacheApercus = new Map();
export function apercuVoiture(couleur, looks = [], echelle = 3) {
  const cle = `${couleur}|${looks.join(',')}|${echelle}`;
  if (cacheApercus.has(cle)) return cacheApercus.get(cle);
  const s = spriteVoiture(couleur, '#f2c14e', looks);
  const c = document.createElement('canvas');
  c.width = s.height * echelle; c.height = s.width * echelle;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.scale(echelle, echelle);
  ctx.drawImage(s, -s.width / 2, -s.height / 2);
  const url = c.toDataURL();
  cacheApercus.set(cle, url);
  return url;
}

function texteBonus(pc) {
  const morceaux = Object.entries(pc.bonus || {}).map(([k, v]) => `${COURTS[k]} ${v > 0 ? '+' : ''}${v}`);
  for (const [s, b] of Object.entries(pc.surfaces || {})) morceaux.push(`${SURFACES[s].nom} +${Math.round(b * 100)} %`);
  if (pc.charges) morceaux.push(`${pc.charges} nitros`);
  if (pc.duree) morceaux.push(`nitro ${pc.duree} s`);
  return morceaux.join(' · ');
}

function carteVoiture(v, { compacte = false } = {}) {
  const stats = Object.entries(v.stats).map(([k, val]) => barreStat(NOMS_STATS[k], val, COULEURS_STATS[k])).join('');
  const image = v.uid
    ? `<img class="dessus" src="${apercuVoiture(v.couleur, v.looks)}" alt="">`
    : `<img class="profil" src="${urlAsset(`assets/kenney/profil/${v.profil}.png`)}" alt="">`;
  return `<div class="voiture-carte">
    <div class="voiture-entete"><b>${e(v.nom)}</b>${v.uid ? etoiles(QUALITES[v.qualite].etoiles) : ''}<span class="classe classe-${v.classe}">CLASSE ${v.classe}</span></div>
    <div class="voiture-corps">${image}<div class="stats">${stats}</div></div>
    ${v.uid && !compacte ? `<div class="petit">Pointe ${kmh(v.physique.vmax)} km/h · état ${Math.round((1 - v.usure) * 100)} % · ${v.nitros} nitro${v.nitros > 1 ? 's' : ''}</div>` : ''}
  </div>`;
}

/** Compteurs qui défilent de 0 à leur valeur (data-compte). */
function animerCompteurs(racine, duree = 900) {
  const els = [...racine.querySelectorAll('[data-compte]')];
  const t0 = performance.now();
  const pas = (t) => {
    const a = Math.min(1, (t - t0) / duree);
    for (const el of els) {
      const v = Math.round(Number(el.dataset.compte) * (1 - (1 - a) ** 3));
      el.textContent = `${el.dataset.avant || ''}${v.toLocaleString('fr-FR').replace(/ | /g, ' ')}${el.dataset.apres || ''}`;
    }
    if (a < 1 && racine.isConnected) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

// --- Titre et aide ----------------------------------------------------------------------

export function ecranTitre(app) {
  const reprise = !!app.partieSauvee;
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran titre-ecran">
      <div class="logo"><span>PISTON</span><span>VILLE</span></div>
      <p class="accroche">Ton garage, ton équipe, tes Grands Prix.</p>
      <div class="pile">
        ${reprise ? '<button class="btn btn-principal" data-action="continuer">Continuer la partie</button>' : ''}
        <button class="btn ${reprise ? '' : 'btn-principal'}" data-action="nouvelle">Nouvelle partie</button>
        <button class="btn" data-action="aide">Comment jouer</button>
      </div>
      <p class="credits">Version d'essai 0.2 · Graphismes Kenney (CC0) · Police Jersey 10 (OFL)</p>
    </div>`,
    actions: {
      continuer: () => app.continuer(),
      nouvelle: () => app.nouvellePartie(),
      aide: () => app.montrer(ecranAide(app, 'titre')),
    },
  };
}

export function ecranAide(app, retour) {
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau">
        <h2 class="titre-panneau">Comment jouer</h2>
        <div class="contenu texte">
          <p><b>Le jour</b>, au garage : construis ou achète une voiture, monte des pièces, fais des recherches au labo, inscris-toi aux Grands Prix. Une balade en ville par jour : pièces d'or, disquettes de recherche, fans, et des boutiques.</p>
          <p><b>Le soir</b>, la course : la voiture accélère toute seule, tu ne fais que tourner.</p>
          <table class="touches">
            <tr><th>Tourner</th><td>Toucher la moitié gauche ou droite · flèches ← → · Q / D</td></tr>
            <tr><th>Départ</th><td>Toucher l'écran pile au feu vert : départ parfait</td></tr>
            <tr><th>Nitro</th><td>Bouton NITRO · Espace</td></tr>
            <tr><th>Aura</th><td>Toucher le portrait quand la jauge est pleine · E</td></tr>
            <tr><th>Freiner</th><td>En ville : toucher les deux côtés</td></tr>
          </table>
          <p>Drifter longtemps, doubler, ramasser des pièces : tout rapporte de l'EXP. À chaque rang, l'équipe reçoit de l'argent, des points de recherche et un ticket de tombola.</p>
          <p>Les adversaires progressent avec les paliers : sans bonnes pièces, impossible de gagner les grands Grands Prix.</p>
        </div>
      </section>
      <button class="btn btn-principal" data-action="retour">Retour</button>
    </div>`,
    actions: { retour: () => (retour === 'titre' ? app.titre() : app.garage()) },
  };
}

// --- Garage ------------------------------------------------------------------------------

export function ecranGarage(app) {
  const p = app.partie;
  const v = voitureActive(p);
  const nouvelles = (p.nouvelles || []).map((n) => `<div class="nouvelle ${n.evenement ? 'evenement' : ''}"><b>${e(n.titre)}</b><span>${e(n.texte)}</span></div>`).join('');
  const sansVoiture = !v;
  const sortie = peutSortir(p);
  const obj = objectifsActifs(p, 1)[0];
  const bandeObjectif = obj
    ? `<button class="objectif-bande" data-action="objectifs"><small>OBJECTIF</small><b>${e(obj.titre)}</b>
        <span class="jauge"><i style="width:${Math.round((obj.actuel / obj.but) * 100)}%;background:#3fa34d"></i></span><em>${texteRecompense(obj.recompense)}</em></button>`
    : '';
  return {
    classe: 'garage',
    html: `${barre(p)}${bandeObjectif}
    ${nouvelles ? `<div class="nouvelles" data-action="lu">${nouvelles}<small>Toucher pour fermer</small></div>` : ''}
    <div class="bas">
      ${sansVoiture
        ? `<section class="panneau"><h2 class="titre-panneau">Bienvenue au Garage Piston</h2>
            <div class="contenu texte"><p>Le garage est vide. <b>Construis</b> ta première voiture (moins chère, qualité tirée au sort) ou achète-la à la concession.</p></div></section>`
        : `<section class="panneau">${carteVoiture(v, { compacte: true })}</section>`}
      <nav class="grille-actions" aria-label="Menu du garage">
        <button class="btn" data-action="atelier" ${sansVoiture ? 'disabled' : ''}>Atelier</button>
        <button class="btn ${sansVoiture ? 'btn-principal' : ''}" data-action="boutique">Voitures</button>
        <button class="btn" data-action="pieces">Pièces</button>
        <button class="btn" data-action="labo">Labo</button>
        <button class="btn btn-rouge" data-action="bureau">Courses</button>
        <button class="btn btn-vert" data-action="ville" ${sansVoiture || !sortie ? 'disabled' : ''}>${sortie ? 'Sortir en ville' : 'Ville : demain'}</button>
        <button class="btn btn-sombre large" data-action="jour">Jour suivant</button>
      </nav>
      <div class="petits-liens">
        <button class="lien" data-action="aide">Comment jouer</button>
        <button class="lien" data-action="titre">Menu principal</button>
      </div>
    </div>`,
    actions: {
      lu: () => { p.nouvelles = []; app.garage(); },
      objectifs: () => app.montrer(ecranObjectifs(app)),
      atelier: () => app.montrer(ecranAtelier(app)),
      boutique: () => app.montrer(ecranBoutique(app)),
      pieces: () => app.montrer(ecranPieces(app)),
      labo: () => app.montrer(ecranLabo(app)),
      bureau: () => app.montrer(ecranBureau(app)),
      ville: () => app.sortirEnVille(),
      jour: () => app.jourSuivant(),
      aide: () => app.montrer(ecranAide(app, 'garage')),
      titre: () => app.titre(),
    },
  };
}

// --- Atelier : réglages, pièces montées, peinture -------------------------------------------

export function ecranAtelier(app) {
  const p = app.partie;
  const v = voitureActive(p);
  const lignes = Object.keys(v.stats).map((k) => {
    const niveau = v.ameliorations[k] || 0;
    const cout = coutAmelioration(niveau);
    const max = v.stats[k] >= 99;
    return `<div class="ligne">
      ${barreStat(NOMS_STATS[k], v.stats[k], COULEURS_STATS[k])}
      <button class="btn btn-mini" data-action="ameliorer" data-stat="${k}" ${max || p.argent < cout ? 'disabled' : ''}>+5 · ${formatArgent(cout)}</button>
    </div>`;
  }).join('');
  const emplacements = Object.entries(EMPLACEMENTS).map(([cle, nom]) => {
    const monte = v.pieces.find((x) => x.emplacement === cle);
    return `<button class="emplacement ${monte ? `rarete-${monte.rarete}` : 'vide'}" data-action="monter" data-emplacement="${cle}">
      <small>${nom}</small><b>${monte ? e(monte.nom) : '— vide —'}</b></button>`;
  }).join('');
  const rep = coutReparation(p);
  const autres = p.garage.filter((g) => g.uid !== v.uid);
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <section class="panneau">
        <h2 class="titre-panneau">Atelier<small>${e(v.nom)} · ${QUALITES[v.qualite].nom}</small></h2>
        ${carteVoiture(v)}
      </section>
      <section class="panneau">
        <h2 class="titre-panneau bleu">Pièces montées<small>Toucher un emplacement pour changer la pièce</small></h2>
        <div class="contenu emplacements">${emplacements}</div>
      </section>
      <section class="panneau">
        <h2 class="titre-panneau sombre">Réglages</h2>
        <div class="contenu">${lignes}
          <div class="ligne"><span>État : ${Math.round((1 - v.usure) * 100)} %</span>
            <button class="btn btn-mini" data-action="reparer" ${!rep || p.argent < rep ? 'disabled' : ''}>Réparer · ${formatArgent(rep)}</button></div>
          <div class="ligne"><span>Peinture · ${formatArgent(COUT_PEINTURE)}</span>
            <div class="nuancier">${PEINTURES.map((c) => `<button class="teinte ${c === v.couleur ? 'choisie' : ''}" style="background:${c}" data-action="peindre" data-couleur="${c}" aria-label="Peindre en ${c}" ${p.argent < COUT_PEINTURE ? 'disabled' : ''}></button>`).join('')}</div></div>
          ${autres.length ? `<div class="ligne"><span>Autres voitures</span>${autres.map((a) => `<button class="btn btn-mini" data-action="choisir" data-uid="${a.uid}">${e(modele(a.modele).nom)}</button>`).join('')}</div>` : ''}
        </div>
      </section>
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour au garage</button></div>`,
    actions: {
      ameliorer: (d) => { if (app.action('ameliorer', d.stat)) { app.son.caisse(); app.toast('+5 ! La voiture progresse.'); } app.montrer(ecranAtelier(app)); },
      reparer: () => { if (app.action('reparer')) app.son.caisse(); app.montrer(ecranAtelier(app)); },
      peindre: (d) => { if (app.action('peindre', d.couleur)) app.son.caisse(); app.montrer(ecranAtelier(app)); },
      choisir: (d) => { p.voitureActive = d.uid; app.sauver(); app.montrer(ecranAtelier(app)); },
      monter: (d) => app.montrer(ecranMontage(app, d.emplacement)),
      retour: () => app.garage(),
    },
  };
}

/** Choisir la pièce d'un emplacement parmi l'inventaire, avec l'effet sur les qualités. */
export function ecranMontage(app, emplacement) {
  const p = app.partie;
  const v = voitureActive(p);
  const brute = p.garage.find((g) => g.uid === v.uid);
  const actuelle = brute.pieces[emplacement];
  const stock = p.inventaire.filter((i) => piece(i.piece).emplacement === emplacement);
  const essai = (iuid) => {
    const copie = { ...brute, pieces: { ...brute.pieces } };
    if (iuid) copie.pieces[emplacement] = iuid; else delete copie.pieces[emplacement];
    return decrireVoiture(p, copie);
  };
  const ligne = (inv) => {
    const pc = piece(inv.piece);
    const apres = essai(inv.uid);
    const ailleurs = montureDe(p, inv.uid);
    const ici = inv.uid === actuelle;
    const effet = Object.keys(v.stats).map((k) => {
      const d = apres.stats[k] - v.stats[k];
      return d ? `<span class="${d > 0 ? 'ok' : 'ko'}">${COURTS[k]} ${d > 0 ? '+' : ''}${d}</span>` : '';
    }).join('');
    return `<div class="piece rarete-${pc.rarete}">
      <div class="piece-tete"><b>${e(pc.nom)}</b><span class="rarete">${RARETES[pc.rarete].nom}</span></div>
      <div class="petit">${texteBonus(pc)}</div>
      <div class="ligne"><span class="effet">${ici ? '<span class="etat">Montée</span>' : effet || '<span class="petit">aucun changement</span>'}${ailleurs && !ici ? ' <span class="petit">(sur une autre voiture)</span>' : ''}</span>
        <span>${ici ? '' : `<button class="btn btn-mini btn-vert" data-action="poser" data-uid="${inv.uid}">Monter</button>`}
        <button class="btn btn-mini" data-action="vendre" data-uid="${inv.uid}">Vendre ${formatArgent(Math.round(pc.prix * 0.4))}</button></span></div>
    </div>`;
  };
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">${EMPLACEMENTS[emplacement]}</h2>
      ${stock.length ? stock.map(ligne).join('') : `<section class="panneau"><div class="contenu texte"><p>Aucune pièce de ce type en stock. Achète-en chez Pièces Auto, gagne-les en course ou à la tombola.</p></div></section>`}
    </div>
    <div class="pied pied-double">
      ${actuelle ? '<button class="btn" data-action="enlever">Démonter</button>' : ''}
      <button class="btn btn-principal" data-action="pieces">Acheter des pièces</button>
      <button class="btn" data-action="retour">Retour à l'atelier</button>
    </div>`,
    actions: {
      poser: (d) => { if (app.action('monter', d.uid)) { app.son.disque(); app.toast('Pièce montée !'); } app.montrer(ecranAtelier(app)); },
      vendre: (d) => { const g = app.action('vendrePiece', d.uid); if (g) app.toast(`Vendue : +${formatArgent(g)}`); app.montrer(ecranMontage(app, emplacement)); },
      enlever: () => { app.action('demonter', emplacement); app.montrer(ecranAtelier(app)); },
      pieces: () => app.montrer(ecranPieces(app, { onglet: emplacement, retour: () => app.montrer(ecranMontage(app, emplacement)) })),
      retour: () => app.montrer(ecranAtelier(app)),
    },
  };
}

// --- Pièces Auto ------------------------------------------------------------------------------

export function ecranPieces(app, o = {}) {
  const p = app.partie;
  const onglet = o.onglet || 'moteur';
  const promo = o.enVille ? promoDuJour(p) : null;
  const retour = o.retour || (() => app.garage());
  const liste = PIECES.filter((x) => x.emplacement === onglet).map((pc) => {
    const verrou = pc.recherche > p.labo;
    const remise = pc.id === promo ? 0.3 : 0;
    const prix = prixPiece(pc, remise);
    const possede = p.inventaire.filter((i) => i.piece === pc.id).length;
    return `<div class="piece rarete-${pc.rarete} ${verrou ? 'verrou' : ''}">
      <div class="piece-tete"><b>${e(pc.nom)}</b><span class="rarete">${RARETES[pc.rarete].nom}</span></div>
      <div class="petit">${texteBonus(pc)}${possede ? ` · en stock : ${possede}` : ''}</div>
      <div class="ligne">${remise ? '<span class="promo">PROMO −30 %</span>' : '<span></span>'}
        ${verrou
          ? `<span class="petit ko">Labo niveau ${pc.recherche} requis</span>`
          : `<button class="btn btn-mini btn-vert" data-action="acheter" data-id="${pc.id}" data-remise="${remise}" ${p.argent < prix ? 'disabled' : ''}>Acheter · ${formatArgent(prix)}</button>`}</div>
    </div>`;
  }).join('');
  const onglets = Object.entries(EMPLACEMENTS).map(([k, nom]) => `<button class="onglet ${k === onglet ? 'actif' : ''}" data-action="onglet" data-id="${k}">${nom}</button>`).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Pièces Auto</h2>
      ${promo ? `<p class="petit clair">Promo du jour en magasin : ${e(piece(promo).nom)} à −30 %.</p>` : ''}
      <div class="onglets">${onglets}</div>
      ${liste}
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour</button></div>`,
    actions: {
      onglet: (d) => app.montrer(ecranPieces(app, { ...o, onglet: d.id })),
      acheter: (d) => {
        const inv = app.action('acheterPiece', [d.id, Number(d.remise)]);
        if (inv) {
          app.son.caisse();
          // Achat : on propose de la monter tout de suite.
          app.montrer(ecranAchatPiece(app, inv, () => app.montrer(ecranPieces(app, o))));
          return;
        }
        app.montrer(ecranPieces(app, o));
      },
      retour,
    },
  };
}

function ecranAchatPiece(app, inv, retour) {
  const pc = piece(inv.piece);
  const v = voitureActive(app.partie);
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau revele rarete-${pc.rarete}">
        <h2 class="titre-panneau">Nouvelle pièce !</h2>
        <div class="contenu texte centre">
          <div class="caisse-ouverte"></div>
          <p class="gros">${e(pc.nom)}</p>
          <p class="rarete">${RARETES[pc.rarete].nom}</p>
          <p class="petit">${texteBonus(pc)}</p>
        </div>
      </section>
      <div class="pile">
        ${v ? '<button class="btn btn-principal" data-action="monter">Monter sur ma voiture</button>' : ''}
        <button class="btn" data-action="retour">Plus tard</button>
      </div>
    </div>`,
    actions: {
      monter: () => { app.action('monter', inv.uid); app.son.disque(); app.toast('Pièce montée !'); retour(); },
      retour,
    },
  };
}

// --- Labo -----------------------------------------------------------------------------------

export function ecranLabo(app, retour = () => app.garage()) {
  const p = app.partie;
  const suivant = p.labo + 1;
  const max = suivant >= COUT_RECHERCHE.length;
  const cout = COUT_RECHERCHE[suivant];
  const niveaux = COUT_RECHERCHE.map((c, n) => {
    const pieces = PIECES.filter((x) => x.recherche === n).map((x) => `<span class="rarete-${x.rarete}">${e(x.nom)}</span>`).join('');
    return `<div class="niveau-labo ${n <= p.labo ? 'acquis' : ''}"><b>Niveau ${n}${n <= p.labo ? ' ✓' : ` · ${c} PR`}</b><div class="liste-pieces">${pieces}</div></div>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Labo de recherche</h2>
      <section class="panneau">
        <h2 class="titre-panneau violet">Niveau ${p.labo}<small>Les points de recherche (PR) se gagnent en course, en ville et en montant de rang.</small></h2>
        <div class="contenu">
          <div class="jauge grande"><i style="width:${max ? 100 : Math.min(100, Math.round((p.recherche / cout) * 100))}%;background:#8a6ad6"></i></div>
          <div class="ligne"><span>${max ? 'Tout est débloqué !' : `${p.recherche} / ${cout} PR`}</span>
            ${max ? '' : `<button class="btn btn-mini btn-principal" data-action="chercher" ${p.recherche < cout ? 'disabled' : ''}>Rechercher</button>`}</div>
        </div>
      </section>
      <section class="panneau"><h2 class="titre-panneau sombre">Collection de pièces<small>${Object.keys(p.collection).length} / ${PIECES.length} découvertes</small></h2>
        <div class="contenu album">${PIECES.map((x) => (p.collection[x.id] ? `<span class="carte-piece rarete-${x.rarete}">${e(x.nom)}</span>` : '<span class="carte-piece inconnue">?</span>')).join('')}</div></section>
      <section class="panneau"><div class="contenu">${niveaux}</div></section>
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour</button></div>`,
    actions: {
      chercher: () => {
        if (app.action('rechercher')) {
          app.son.niveau();
          app.montrer(ecranCelebration(app, 'Eurêka !', `Labo niveau ${p.labo} : de nouvelles pièces sont en vente.`, () => app.montrer(ecranLabo(app, retour))));
          return;
        }
        app.montrer(ecranLabo(app, retour));
      },
      retour,
    },
  };
}

/** Grand bandeau de fête (rang, recherche, trophée). */
export function ecranCelebration(app, titre, sousTitre, suite, details = '') {
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran celebration">
      <div class="confettis">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="bandeau">${e(titre)}</div>
      <p class="accroche">${e(sousTitre)}</p>
      ${details}
      <button class="btn btn-principal" data-action="suite">Super !</button>
    </div>`,
    actions: { suite },
  };
}

// --- Concession et construction ---------------------------------------------------------------

export function ecranBoutique(app, retour = () => app.garage(), enVille = false) {
  const p = app.partie;
  const cartes = VEHICULES.map((m) => {
    const blocage = peutAcheter(p, m);
    return `<section class="panneau ${blocage ? 'verrouille' : ''}">
      ${carteVoiture(m)}
      <div class="contenu actions-ligne">
        ${blocage ? `<span class="petit">${e(blocage)}</span>` : `
        <button class="btn btn-mini btn-vert" data-action="acheter" data-id="${m.id}" ${p.argent < m.prix ? 'disabled' : ''}>Acheter · ${formatArgent(m.prix)}</button>
        <button class="btn btn-mini btn-principal" data-action="construire" data-id="${m.id}" ${p.argent < m.construction.prix ? 'disabled' : ''}>Construire · ${formatArgent(m.construction.prix)}</button>`}
      </div>
    </section>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">${enVille ? 'Concession' : 'Voitures'}</h2>
      <p class="petit clair">Acheter : prête tout de suite, qualité standard. Construire au garage : moins cher, une journée de travail, et la qualité (1 à 5 étoiles) se joue à l'atelier !</p>
      ${cartes}
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour</button></div>`,
    actions: {
      acheter: (d) => { if (app.action('acheter', d.id)) { app.son.caisse(); app.toast('Voiture achetée ! Elle t\'attend au garage.'); } app.montrer(ecranBoutique(app, retour, enVille)); },
      construire: (d) => app.montrer(ecranCouleur(app, d.id, retour, enVille)),
      retour,
    },
  };
}

function ecranCouleur(app, idModele, retour, enVille) {
  const m = modele(idModele);
  const choix = [m.couleur, ...PEINTURES.filter((c) => c !== m.couleur)];
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau">
        <h2 class="titre-panneau">${e(m.nom)}<small>Choisis la couleur de la carrosserie</small></h2>
        <div class="contenu nuancier grand">${choix.map((c) => `<button class="teinte-voiture" data-action="go" data-couleur="${c}"><img src="${apercuVoiture(c, [], 2)}" alt="${c}"></button>`).join('')}</div>
      </section>
      <button class="btn" data-action="retour">Retour</button>
    </div>`,
    actions: {
      go: (d) => app.construireVoiture(idModele, d.couleur, enVille),
      retour: () => app.montrer(ecranBoutique(app, retour, enVille)),
    },
  };
}

const ETAPES_CONSTRUCTION = [
  { nom: 'Conception', cri: 'Eurêka !' },
  { nom: 'Soufflerie', cri: 'Quel appui !' },
  { nom: 'Essais sur piste', cri: 'Plein gaz !' },
];

/** La construction en trois étapes, avec les qualités qui montent et les étoiles à la fin. */
export function ecranConstruction(app, v, suite) {
  const q = QUALITES[v.qualite];
  const stats = Object.entries(v.stats).map(([k, val]) => `<div class="stat"><span>${NOMS_STATS[k]}</span><div class="jauge"><i data-cible="${val}" style="width:0;background:${COULEURS_STATS[k]}"></i></div><b data-val="${val}">0</b></div>`).join('');
  return {
    classe: 'transparent',
    html: `<div class="ecran construction">
      <section class="panneau">
        <h2 class="titre-panneau">Construction<small>${e(v.nom)}</small></h2>
        <div class="contenu">
          <ol class="etapes">${ETAPES_CONSTRUCTION.map((x, i) => `<li data-etape="${i}">${x.nom}</li>`).join('')}</ol>
          <div class="cri" aria-live="polite"></div>
          <div class="stats">${stats}</div>
          <div class="verdict" hidden>
            <div class="grosses-etoiles">${Array.from({ length: 5 }, (_, i) => `<i class="${i < q.etoiles ? 'pleine' : ''}" style="--i:${i}">★</i>`).join('')}</div>
            <b class="qualite q${q.etoiles}">${q.nom}${q.bonus ? ` · +${q.bonus} partout` : ''}</b>
          </div>
        </div>
      </section>
      <button class="btn btn-principal" data-action="suite" hidden>Sortir la voiture !</button>
    </div>`,
    actions: { suite },
    apres: (racine) => {
      const etapes = racine.querySelectorAll('[data-etape]');
      const cri = racine.querySelector('.cri');
      const barres = [...racine.querySelectorAll('[data-cible]')];
      const valeurs = [...racine.querySelectorAll('[data-val]')];
      const DUREE = 1500;
      ETAPES_CONSTRUCTION.forEach((x, i) => setTimeout(() => {
        if (!racine.isConnected) return;
        etapes.forEach((el, k) => el.classList.toggle('active', k === i));
        if (i > 0) etapes[i - 1].classList.add('faite');
        cri.textContent = x.cri;
        cri.classList.remove('pop'); void cri.offsetWidth; cri.classList.add('pop');
        app.son.bip(520 + i * 160, 0.12);
        const part = (i + 1) / ETAPES_CONSTRUCTION.length;
        barres.forEach((b, k) => {
          b.style.width = `${Math.round(b.dataset.cible * part)}%`;
          valeurs[k].textContent = Math.round(valeurs[k].dataset.val * part);
        });
      }, 300 + i * DUREE));
      setTimeout(() => {
        if (!racine.isConnected) return;
        etapes.forEach((el) => { el.classList.remove('active'); el.classList.add('faite'); });
        cri.textContent = '';
        racine.querySelector('.verdict').hidden = false;
        racine.querySelector('[data-action="suite"]').hidden = false;
        if (q.etoiles >= 3) app.son.niveau(); else app.son.fanfare();
      }, 300 + ETAPES_CONSTRUCTION.length * DUREE);
    },
  };
}

// --- Ville : tombola, café, sortie ------------------------------------------------------------

export function ecranTombola(app, retour) {
  const p = app.partie;
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau">
        <h2 class="titre-panneau rose">Tombola de Pistonville<small>Un ticket par montée de rang et par podium de Grand Prix.</small></h2>
        <div class="contenu texte centre">
          <div class="tambour"><i></i></div>
          <p class="gros">${p.tickets} ticket${p.tickets > 1 ? 's' : ''}</p>
          <p class="petit">Lots : pièces (parfois super rares), points de recherche, argent.</p>
        </div>
      </section>
      <div class="pile">
        <button class="btn btn-principal" data-action="tirer" ${p.tickets > 0 ? '' : 'disabled'}>Tourner le tambour !</button>
        <button class="btn" data-action="retour">Retour en ville</button>
      </div>
    </div>`,
    actions: {
      tirer: () => {
        const lot = app.action('tirerTombola');
        if (!lot) return;
        const tambour = app.ui.racine.querySelector('.tambour');
        tambour.classList.add('tourne');
        app.ui.racine.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        for (let i = 0; i < 8; i++) setTimeout(() => app.son.roulement(), i * 110);
        setTimeout(() => {
          app.son.caisse();
          const titre = lot.type === 'piece' ? lot.piece.nom : lot.type === 'recherche' ? `+${lot.valeur} PR` : `+${formatArgent(lot.valeur)}`;
          const rare = lot.type === 'piece' ? lot.piece.rarete : 'commune';
          if (rare === 'super') app.son.niveau();
          app.montrer({
            classe: 'fond-sombre',
            html: `<div class="ecran"><section class="panneau revele rarete-${rare}"><h2 class="titre-panneau">${rare === 'super' ? 'SUPER LOT !' : 'Gagné !'}</h2>
              <div class="contenu texte centre"><div class="caisse-ouverte"></div><p class="gros">${e(titre)}</p>
              ${lot.type === 'piece' ? `<p class="rarete">${RARETES[rare].nom}</p><p class="petit">${texteBonus(lot.piece)}</p>` : ''}</div></section>
              <button class="btn btn-principal" data-action="encore">Continuer</button></div>`,
            actions: { encore: () => app.montrer(ecranTombola(app, retour)) },
          });
        }, 1000);
      },
      retour,
    },
  };
}

const CONSEILS = [
  'Appuie pile au feu vert : un départ parfait donne un petit coup de nitro.',
  'Un drift tenu plus d\'une demi-seconde rapporte de l\'EXP. Plus il est long, plus ça paie.',
  'Les pneus tout-terrain changent tout sur la terre et le sable.',
  'Les pneus pluie accrochent sur le mouillé et les pavés.',
  'Pousser un rival dans les barrières, ça plaît au public : des fans en plus.',
  'Les pièces d\'or reviennent à chaque tour : vise les lignes de trois.',
  'Une voiture abîmée perd de la vitesse de pointe. Pense à réparer !',
  'Le labo débloque des pièces rares, puis super rares. Garde tes disquettes.',
  'Chez Pièces Auto, en ville, une pièce est en promo chaque jour.',
  'Une construction 5 étoiles est rare… mais elle ajoute +15 à toutes les qualités.',
  'Les Grands Prix nationaux demandent une voiture de classe B : construis plus gros !',
  'Garder la direction dans un virage remplit la jauge d\'aura : 4 secondes de folie.',
];

export function ecranCafe(app, retour) {
  const p = app.partie;
  const deja = p.cafeJour === p.jour;
  const conseil = CONSEILS[(p.jour * 5 + p.rang) % CONSEILS.length];
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau">
        <h2 class="titre-panneau marron">Café des pilotes<small>On y parle courses, pneus et ragots.</small></h2>
        <div class="contenu texte">
          <p class="citation">« ${e(conseil)} »</p>
          <p class="petit">${deja ? 'Tu as déjà pris ton café aujourd\'hui.' : `Un café avec les pilotes : ${formatArgent(PRIX_CAFE)}, +15 EXP et 3 fans.`}</p>
        </div>
      </section>
      <div class="pile">
        <button class="btn btn-principal" data-action="cafe" ${deja || p.argent < PRIX_CAFE ? 'disabled' : ''}>Prendre un café</button>
        <button class="btn" data-action="retour">Retour en ville</button>
      </div>
    </div>`,
    actions: {
      cafe: () => {
        const rangs = app.action('boireCafe');
        if (rangs) { app.son.caisse(); app.toast('+15 EXP · +3 fans'); }
        app.apresRangs(rangs, () => app.montrer(ecranCafe(app, retour)));
      },
      retour,
    },
  };
}

export function ecranFinBalade(app, g, suite) {
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau tele">
        <h2 class="titre-panneau">19:00 · Fin de la balade</h2>
        <div class="contenu gains">
          <div><small>Argent ramassé</small><b data-compte="${g.argent}" data-avant="+" data-apres=" G">0</b></div>
          <div><small>Recherche</small><b data-compte="${g.recherche}" data-avant="+" data-apres=" PR">0</b></div>
          <div><small>Fans</small><b data-compte="${g.fans}" data-avant="+">0</b></div>
          <div><small>EXP</small><b data-compte="${g.exp}" data-avant="+">0</b></div>
        </div>
      </section>
      <button class="btn btn-principal" data-action="suite">Retour au garage</button>
    </div>`,
    actions: { suite },
    apres: (r) => animerCompteurs(r),
  };
}

export function texteRecompense(r) {
  return [r.argent && `+${formatArgent(r.argent)}`, r.recherche && `+${r.recherche} PR`, r.tickets && `+${r.tickets} ticket${r.tickets > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
}

export function ecranObjectifs(app) {
  const p = app.partie;
  const actifs = objectifsActifs(p, 3);
  const lignes = actifs.map((o, i) => `<div class="objectif ${i === 0 ? 'premier' : ''}">
    <div class="ligne"><b>${e(o.titre)}</b><span class="petit">${texteRecompense(o.recompense)}</span></div>
    <div class="ligne"><div class="jauge grande" style="flex:1"><i style="width:${Math.round((o.actuel / o.but) * 100)}%;background:#3fa34d"></i></div><span class="num">${o.actuel} / ${o.but}</span></div>
  </div>`).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Objectifs</h2>
      <p class="petit clair">${objectifsFaits(p)} sur ${totalObjectifs()} atteints. Chaque objectif est récompensé dès qu'il est rempli.</p>
      <section class="panneau"><div class="contenu">${lignes || '<p>Tout est accompli. Légende !</p>'}</div></section>
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour au garage</button></div>`,
    actions: { retour: () => app.garage() },
  };
}

export function ecranSponsors(app, retour) {
  const p = app.partie;
  const actif = sponsorActif(p);
  const cartes = SPONSORS.map((s) => {
    const dispo = sponsorDispo(p, s);
    const signe = actif?.id === s.id;
    return `<div class="sponsor ${dispo ? '' : 'verrou'} ${signe ? 'signe' : ''}" style="--sp:${s.couleur}">
      <div class="logo-sponsor">${e(s.nom.split(' ').map((m) => m[0]).join('').slice(0, 3))}</div>
      <div class="sponsor-texte"><b>${e(s.nom)}</b><span class="petit">${e(s.texte)}</span></div>
      ${signe ? '<span class="etat">Sous contrat</span>' : dispo
        ? `<button class="btn btn-mini btn-principal" data-action="signer" data-id="${s.id}">Signer</button>`
        : `<span class="petit ko">${s.fans} fans</span>`}
    </div>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Sponsors</h2>
      <p class="petit clair">Un contrat à la fois. Plus tu as de fans, plus les marques se bousculent.</p>
      <section class="panneau"><div class="contenu">${cartes}</div></section>
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour</button></div>`,
    actions: {
      signer: (d) => { if (app.action('signerSponsor', d.id)) { app.son.caisse(); app.toast('Contrat signé !'); } app.montrer(ecranSponsors(app, retour)); },
      retour,
    },
  };
}

const COULEURS_CHANCES = ['#3fa34d', '#2f6fdb', '#f39c33', '#e4432d'];
function pastilleChances(app, gp) {
  const c = estimerChances(app.partie, gp);
  return c ? `<span class="chances" style="background:${COULEURS_CHANCES[c.niveau]}">${c.nom}</span>` : '';
}

// --- Bureau des courses -------------------------------------------------------------------------

function ligneGP(app, gp) {
  const p = app.partie;
  const v = voitureActive(p);
  const statut = statutGP(p, gp);
  const trophee = p.trophees[gp.id];
  const infos = `${gp.manches.length} manches · 1er prix ${formatArgent(gp.prix)} · niveau ${'●'.repeat(gp.niveau)}${trophee ? ` · meilleur : ${ordinal(trophee)}` : ''}`;
  const coupe = trophee ? `<i class="coupe c${Math.min(trophee, 4)}" title="Meilleure place : ${ordinal(trophee)}"></i>` : '';
  let action = '';
  if (gp.palier === 'ouvert') {
    if (statut === 'inscrit') action = `<button class="btn btn-mini btn-rouge" data-action="briefing" data-id="${gp.id}" ${v ? '' : 'disabled'}>Courir ce soir</button>`;
    else action = `<button class="btn btn-mini" data-action="inscrire" data-id="${gp.id}" ${v ? '' : 'disabled'}>${v ? "S'inscrire" : 'Il faut une voiture'}</button>`;
    return `<div class="gp"><div class="gp-tete"><b>${coupe}${e(gp.nom)}</b>${action}</div><div class="petit">${infos}</div><div class="criteres">${pastilleChances(app, gp)}</div></div>`;
  }
  const c = p.candidatures[gp.id];
  const verdict = evaluerCandidature(p, gp, v);
  const cond = gp.conditions;
  const crit = [
    cond.points && `<span class="${p.pointsLicence >= cond.points ? 'ok' : 'ko'}">${Math.min(p.pointsLicence, cond.points)}/${cond.points} pts</span>`,
    cond.podiums && `<span class="${p.podiums >= cond.podiums ? 'ok' : 'ko'}">${Math.min(p.podiums, cond.podiums)}/${cond.podiums} podiums</span>`,
    cond.victoires && `<span class="${p.victoires >= cond.victoires ? 'ok' : 'ko'}">${Math.min(p.victoires, cond.victoires)}/${cond.victoires} victoire${cond.victoires > 1 ? 's' : ''}</span>`,
    cond.classe && `<span class="${v && CLASSES.indexOf(v.classe) >= CLASSES.indexOf(cond.classe) ? 'ok' : 'ko'}">classe ${cond.classe}+</span>`,
  ].filter(Boolean).join('');
  if (statut === 'acceptee') action = `<button class="btn btn-mini btn-rouge" data-action="briefing" data-id="${gp.id}" ${v ? '' : 'disabled'}>Courir ce soir</button>`;
  else if (statut === 'attente') action = '<span class="etat">Réponse demain</span>';
  else if (statut === 'liste') action = "<span class=\"etat\">Liste d'attente</span>";
  else action = `<button class="btn btn-mini" data-action="candidater" data-id="${gp.id}" ${p.argent < fraisDossier(gp) ? 'disabled' : ''}>Candidater · ${formatArgent(fraisDossier(gp))}</button>`;
  const refus = statut === 'refusee' && c?.manques ? `<div class="petit ko">Refusée : il manquait ${e(c.manques.join(', '))}.</div>` : '';
  return `<div class="gp">
    <div class="gp-tete"><b>${coupe}${e(gp.nom)}</b>${action}</div>
    <div class="petit">${infos}</div>
    <div class="criteres">${pastilleChances(app, gp)}${crit}${verdict.ok && statut !== 'acceptee' ? '<span class="ok">dossier complet</span>' : ''}</div>${refus}
  </div>`;
}

export function ecranBureau(app, retour = () => app.garage()) {
  const p = app.partie;
  const blocs = ORDRE_PALIERS.map((palier) => {
    const gps = GRANDS_PRIX.filter((g) => g.palier === palier);
    if (!gps.length) return '';
    const lic = PALIERS[palier].licence;
    const precedente = PALIERS[ORDRE_PALIERS[ORDRE_PALIERS.indexOf(palier) - 1]]?.licence;
    const sous = palier === 'ouvert' ? 'Sans candidature : il suffit d\'avoir une voiture' : `Sur candidature · donne la licence ${lic}`;
    const atteint = palier === 'ouvert' || palier === 'regional' || licenceAuMoins(p.licence, precedente);
    return `<section class="panneau ${atteint ? '' : 'verrouille'}">
      <h2 class="titre-panneau">${PALIERS[palier].nom}<small>${sous}</small></h2>
      <div class="contenu">${atteint ? gps.map((g) => ligneGP(app, g)).join('') : `<p class="petit">${gps.length} Grand${gps.length > 1 ? 's' : ''} Prix · se débloque avec la licence ${precedente}.</p>`}</div>
    </section>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Bureau des courses</h2>
      <button class="bande-sponsor" data-action="sponsors">${sponsorActif(p) ? `Sponsor : <b>${e(sponsorActif(p).nom)}</b> · ${e(sponsorActif(p).texte)}` : '<b>Aucun sponsor</b> · toucher pour signer un contrat'}</button>
      <p class="petit clair">Chances estimées d'après ta voiture face au rival de chaque Grand Prix.</p>
      ${blocs}
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour</button></div>`,
    actions: {
      inscrire: (d) => { app.action('inscrire', d.id); app.montrer(ecranBureau(app, retour)); },
      candidater: (d) => { if (app.action('candidater', d.id)) app.toast('Dossier déposé : réponse demain matin.'); app.montrer(ecranBureau(app, retour)); },
      briefing: (d) => app.briefing(d.id),
      sponsors: () => app.montrer(ecranSponsors(app, () => app.montrer(ecranBureau(app, retour)))),
      retour,
    },
  };
}

// --- Course -------------------------------------------------------------------------------------

export function ecranBriefing(app, gp, manche, apercu) {
  const def = gp.manches[manche];
  const theme = THEMES[def.theme] || THEMES.parc;
  const v = voitureActive(app.partie);
  const bonusSol = v?.surfaces?.[def.surface];
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau">
        <h2 class="titre-panneau">${e(gp.nom)}<small>Manche ${manche + 1} sur ${gp.manches.length}</small></h2>
        <div class="contenu briefing">
          <img class="apercu" src="${apercu}" alt="Tracé du circuit ${e(def.nom)}">
          <div>
            <h3>${e(def.nom)}</h3>
            <dl>
              <dt>Décor</dt><dd>${theme.nom}</dd>
              <dt>Surface</dt><dd>${SURFACES[def.surface].nom}${bonusSol ? ` <span class="ok">+${Math.round(bonusSol * 100)} %</span>` : ''}</dd>
              <dt>Tours</dt><dd>${def.tours}</dd>
              <dt>Longueur</dt><dd>${Math.round(def.longueur / 16)} cases</dd>
              <dt>Adversaires</dt><dd>${gp.adversaires}</dd>
              <dt>Rival</dt><dd class="ko">${e(rivalDe(gp).nom)}</dd>
              <dt>Chances</dt><dd>${pastilleChances(app, gp)}</dd>
            </dl>
          </div>
        </div>
        ${manche === gp.manches.length - 1 && gp.manches.length > 1 ? '<div class="contenu texte petit ko">Finale : les adversaires sortent le grand jeu !</div>' : ''}
        <div class="contenu texte petit">Touche l'écran pile au feu vert pour un départ parfait. Ramasse les pièces d'or et les disquettes sur la piste !</div>
      </section>
      <div class="pile">
        <button class="btn btn-principal" data-action="depart">Départ !</button>
        <button class="btn" data-action="retour">${manche === 0 ? 'Pas ce soir' : 'Abandonner le Grand Prix'}</button>
      </div>
    </div>`,
    actions: {
      depart: () => app.depart(),
      retour: () => (manche === 0 ? app.annulerGP() : app.abandonnerGP()),
    },
  };
}

export function ecranChargement(texte) {
  return { classe: 'fond-sombre', html: `<div class="ecran chargement"><p>${e(texte)}</p></div>`, actions: {} };
}

export function ecranPause(app) {
  const p = app.partie;
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau"><h2 class="titre-panneau">Pause</h2>
        <div class="contenu">
          <div class="ligne"><span>Aide au pilotage (la voiture se recentre seule)</span><button class="btn btn-mini" data-action="aide">${p.aide ? 'Activée' : 'Coupée'}</button></div>
          <div class="ligne"><span>Son</span><button class="btn btn-mini" data-action="son">${p.son ? 'Activé' : 'Coupé'}</button></div>
        </div>
      </section>
      <div class="pile">
        <button class="btn btn-principal" data-action="reprendre">Reprendre</button>
        <button class="btn" data-action="abandon">Abandonner la course</button>
      </div>
    </div>`,
    actions: {
      reprendre: () => app.reprendre(),
      aide: () => { p.aide = !p.aide; if (app.course) app.course.aide = p.aide; app.sauver(); app.montrer(ecranPause(app)); },
      son: () => { p.son = !p.son; app.son.actif = p.son; app.sauver(); app.montrer(ecranPause(app)); },
      abandon: () => app.abandonnerCourse(),
    },
  };
}

export function ecranResultats(app, r) {
  const g = r.gain;
  const lignes = r.resultats.map((x) => `<tr class="${x.id === 'joueur' ? 'moi' : ''}">
      <td>${ordinal(x.place)}</td><td><i class="puce" style="background:${x.couleur}"></i>${e(x.nom)}</td><td class="petit">${e(x.ecurie)}</td><td class="num">${x.place === 1 ? formatTemps(x.temps) : `+${x.ecart.toFixed(1)} s`}</td></tr>`).join('');
  const general = r.general.map((x, i) => `<tr class="${x.id === 'joueur' ? 'moi' : ''}"><td>${ordinal(i + 1)}</td><td>${e(x.nom)}</td><td class="num">${x.points} pts</td></tr>`).join('');
  const p = app.partie;
  const besoin = expPourRang(p.rang);
  const butin = g.butin
    ? `<section class="panneau revele rarete-${g.butin.piece.rarete} retarde"><h2 class="titre-panneau">Caisse de pièces !</h2>
        <div class="contenu texte centre"><div class="caisse-ouverte"></div><p class="gros">${e(g.butin.piece.nom)}</p>${g.butin.nouvelle ? '<p class="nouveau">NOUVEAU !</p>' : ''}<p class="rarete">${RARETES[g.butin.piece.rarete].nom}</p><p class="petit">${texteBonus(g.butin.piece)}</p></div></section>`
    : '';
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau tele">
        <h2 class="titre-panneau">PISTON TV<small>${e(r.gp.nom)} · manche ${r.manche}</small></h2>
        <div class="podium-titre ${g.place <= 3 ? 'podium' : ''}">${ordinal(g.place)}</div>
        <div class="contenu gains">
          <div><small>Prime</small><b data-compte="${g.prime}" data-avant="+" data-apres=" G">0</b></div>
          <div><small>Ramassé</small><b data-compte="${g.ramasses.argent}" data-avant="+" data-apres=" G">0</b></div>
          <div><small>Recherche</small><b data-compte="${g.recherche}" data-avant="+" data-apres=" PR">0</b></div>
          <div><small>Fans</small><b data-compte="${g.fans}" data-avant="+">0</b></div>
          <div><small>Licence</small><b data-compte="${g.licence}" data-avant="+" data-apres=" pts">0</b></div>
          <div><small>EXP</small><b data-compte="${g.exp}" data-avant="+">0</b></div>
        </div>
        <div class="contenu">
          <div class="ligne petit-clair"><span>Rang ${p.rang}</span><span>${p.exp} / ${besoin} EXP</span></div>
          <div class="jauge grande"><i class="remplir" style="--w:${Math.round((p.exp / besoin) * 100)}%;background:#f2c14e"></i></div>
          <p class="petit-clair">${r.depassements} dépassement${r.depassements > 1 ? 's' : ''} · ${r.drift} EXP bonus (drift, départ, rival)${g.sponsor ? ` · sponsor ${e(g.sponsor)}` : ''}</p>
          ${g.premiere ? '<p class="premiere">PREMIÈRE VICTOIRE SUR CE CIRCUIT · +10 PR</p>' : ''}
        </div>
      </section>
      ${butin}
      <section class="panneau"><h2 class="titre-panneau">Arrivée</h2><div class="contenu"><table class="classement">${lignes}</table></div></section>
      <section class="panneau"><h2 class="titre-panneau">Classement du Grand Prix</h2><div class="contenu"><table class="classement">${general}</table></div></section>
      <button class="btn btn-principal" data-action="suite">${g.fini ? 'Fin du Grand Prix' : 'Manche suivante'}</button>
    </div>`,
    actions: { suite: () => app.apresRangs(g.rangs, () => (g.fini ? app.finGP() : app.mancheSuivante())) },
    apres: (racine) => {
      animerCompteurs(racine, 1100);
      if (g.butin) setTimeout(() => app.son.disque(), 1300);
    },
  };
}

export function ecranFinGP(app, f) {
  const lignes = f.general.map((x, i) => `<tr class="${x.id === 'joueur' ? 'moi' : ''}"><td>${ordinal(i + 1)}</td><td>${e(x.nom)}</td><td class="petit">${e(x.ecurie)}</td><td class="num">${x.points} pts</td></tr>`).join('');
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      ${f.place <= 3 ? `<div class="confettis">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>` : ''}
      <section class="panneau tele">
        <h2 class="titre-panneau">${e(f.gp.nom)}<small>Classement final</small></h2>
        <div class="podium-titre ${f.place <= 3 ? 'podium' : ''}">${f.place === 1 ? 'Trophée !' : ordinal(f.place)}</div>
        ${f.place <= 3 ? `<div class="trophee-grand c${f.place}"></div>` : ''}
        <div class="contenu gains">
          <div><small>Gains du Grand Prix</small><b data-compte="${f.gains}" data-avant="+" data-apres=" G">0</b></div>
          <div><small>Nouveaux fans</small><b data-compte="${f.fans}" data-avant="+">0</b></div>
          ${f.place <= 3 ? '<div><small>Tombola</small><b>+1 ticket</b></div>' : ''}
        </div>
      </section>
      <section class="panneau"><div class="contenu"><table class="classement">${lignes}</table></div></section>
      <button class="btn btn-principal" data-action="garage">Retour au garage (jour suivant)</button>
    </div>`,
    actions: { garage: () => app.garage() },
    apres: (r) => animerCompteurs(r, 1200),
  };
}

/** Montée de rang : bandeau, récompenses. */
export function ecranRang(app, m, suite) {
  return ecranCelebration(app, `RANG ${m.rang} !`, "L'équipe monte en grade.", suite,
    `<div class="recompenses"><span>+${formatArgent(m.argent)}</span><span>+${m.recherche} PR</span><span>+${m.tickets} ticket</span></div>`);
}
