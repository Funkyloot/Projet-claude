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
  peutCourir, objectifsActifs, objectifsFaits, totalObjectifs, estimerChances, rivalDe, sponsorActif, sponsorDispo,
  saisonDe, jourDeSaison, JOURS_SAISON, SAISONS_CARRIERE, pieceNiveau, coutNiveauPiece, NIVEAU_PIECE_MAX,
  tempsMedailles, NOMS_MEDAILLES, totalMedailles, PLAFOND_CLASSE, REGLAGES_MAX, exporter, importer, CADEAUX, lirePalmares, scoreCarriere,
} from './partie.js';
import {
  coutAmelioration, evaluerCandidature, SURFACES, kmh, CLASSES, EMPLACEMENTS, RARETES, COUT_RECHERCHE,
  QUALITES, PEINTURES, COUT_PEINTURE, expPourRang,
} from './regles.js';
import { formatArgent, formatTemps, ordinal } from './outils.js';
import { urlAsset } from './assets.js';
import { THEMES } from './rendu-circuit.js';
import { ALLONGE } from './circuit.js';
import { dessinerVoiture, ANGLE_VITRINE, spritePerso, tenue, modeleVoiture } from './tiny.js';
import { imgPiece } from './icones.js';
import { engagement, pointsAPlacer } from './pilotes.js';

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

export function barre(partie) {
  const lic = partie.licence ? `Licence ${partie.licence}` : 'Sans licence';
  const besoin = expPourRang(partie.rang);
  return `<header class="barre">
    <div class="barre-ligne">
      <span class="jour">S${saisonDe(partie)} · J${jourDeSaison(partie)}/${JOURS_SAISON}</span>
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

/** Image de la voiture à l'échelle (vue 3/4, style Kenney Tiny), avec sa peinture et ses pièces. */
const cacheApercus = new Map();
export function apercuVoiture(couleur, looks = [], echelle = 3, modele = 'sedan') {
  const cle = `${couleur}|${modele}`;
  if (cacheApercus.has(cle)) return cacheApercus.get(cle);
  void looks; void echelle;
  // Vue de trois quarts avant (Car Kit), 60 × 48 px, agrandie en CSS par multiples entiers.
  const c = document.createElement('canvas');
  c.width = 60; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  dessinerVoiture(ctx, modele, couleur, c.width / 2, c.height / 2 + 2, ANGLE_VITRINE);
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

export function carteVoiture(v, { compacte = false } = {}) {
  const stats = Object.entries(v.stats).map(([k, val]) => barreStat(NOMS_STATS[k], val, COULEURS_STATS[k])).join('');
  const image = v.uid
    ? `<img class="dessus" src="${apercuVoiture(v.couleur, v.looks, 3, modeleVoiture(v.profil, v.id))}" alt="">`
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
        ${reprise ? `<button class="btn btn-principal reprise" data-action="continuer">Continuer la partie<small>${resumeReprise(app.partieSauvee)}</small></button>` : ''}
        <button class="btn ${reprise ? '' : 'btn-principal'}" data-action="nouvelle">Nouvelle partie</button>
        <button class="btn" data-action="aide">Comment jouer</button>
        <button class="lien" data-action="sauvegarde">Transférer ma sauvegarde (PC ↔ téléphone)</button>
        ${/^https?:$/.test(location.protocol) ? '<button class="lien" data-action="maj">Mettre à jour le jeu</button>' : ''}
      </div>
      <p class="credits">Version d'essai 0.6 · Graphismes Kenney (CC0) · Police Jersey 10 (OFL)</p>
    </div>`,
    actions: {
      continuer: () => app.continuer(),
      nouvelle: () => app.nouvellePartie(),
      aide: () => app.montrer(ecranAide(app, 'titre')),
      sauvegarde: () => app.montrer(ecranSauvegarde(app)),
      maj: () => app.mettreAJour(),
    },
  };
}

/** Copier la partie d'un appareil à l'autre avec un code texte. */
export function ecranSauvegarde(app, message = '') {
  const code = app.partieSauvee ? exporter(app.partieSauvee) : '';
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau">
        <h2 class="titre-panneau">Transférer ma sauvegarde<small>La partie est rangée dans le navigateur : chaque appareil (et chaque adresse) a la sienne.</small></h2>
        <div class="contenu texte">
          <p><b>1. Sur l'appareil qui a la partie</b> : copie ce code.</p>
          ${code ? `<textarea class="code-sauvegarde" readonly rows="4">${e(code)}</textarea>
          <button class="btn btn-mini btn-principal" data-action="copier">Copier le code</button>` : '<p class="petit">Aucune partie sur cet appareil.</p>'}
          <p><b>2. Sur l'autre appareil</b> : colle le code ici, puis « Charger ».</p>
          <textarea class="code-sauvegarde" id="code-import" rows="4" placeholder="PV1:…"></textarea>
          <button class="btn btn-mini btn-vert" data-action="charger">Charger cette partie</button>
          ${message ? `<p class="${message.startsWith('Partie') ? 'ok' : 'ko'}">${e(message)}</p>` : ''}
          <p class="petit">Le code contient toute ta partie : envoie-le-toi (message, mail), pas à n'importe qui.</p>
        </div>
      </section>
      <button class="btn" data-action="retour">Retour</button>
    </div>`,
    actions: {
      copier: () => {
        const zone = app.ui.racine.querySelector('.code-sauvegarde');
        const fini = () => app.toast('Code copié !');
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(fini, () => { zone.select(); document.execCommand?.('copy'); fini(); });
        else { zone.select(); document.execCommand?.('copy'); fini(); }
      },
      charger: () => {
        const p = importer(app.ui.racine.querySelector('#code-import').value);
        if (!p) { app.montrer(ecranSauvegarde(app, 'Code illisible : vérifie qu\'il est complet (il commence par PV1:).')); return; }
        app.partie = p;
        app.sauver();
        app.montrer(ecranSauvegarde(app, `Partie chargée : saison ${saisonDe(p)}, jour ${jourDeSaison(p)}.`));
      },
      retour: () => app.titre(),
    },
  };
}

/** Ce qui attend le joueur quand il revient : les boucles ouvertes. */
function resumeReprise(p) {
  const morceaux = [`Saison ${saisonDe(p)}, jour ${jourDeSaison(p)}`];
  if (p.gp) morceaux.push(`Grand Prix en cours : manche ${p.gp.manche + 1}`);
  const attente = Object.values(p.candidatures || {}).filter((c) => c.etat === 'attente').length;
  if (attente) morceaux.push(`${attente} candidature${attente > 1 ? 's' : ''} en attente`);
  const obj = objectifsActifs(p, 1)[0];
  if (obj) morceaux.push(`Objectif : ${obj.titre} (${obj.actuel}/${obj.but})`);
  const pts = pointsAPlacer(p);
  if (pts) morceaux.push(`${pts} point${pts > 1 ? 's' : ''} de pilote à répartir`);
  return morceaux.map(e).join(' · ');
}

export function ecranAide(app, retour) {
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau">
        <h2 class="titre-panneau">Comment jouer</h2>
        <div class="contenu texte">
          <p><b>Le jour</b>, au garage : construis tes bâtiments sur le terrain (onglet Construire), recrute et affecte ton équipe (onglet Équipe), construis ou achète tes voitures et monte des pièces (onglet Voitures), inscris-toi aux Grands Prix (onglet Courses). Une balade en ville par jour.</p>
          <p>Touche un bâtiment pour le gérer. Le décor rend ses voisins plus efficaces ; trois bâtiments précis qui se touchent forment un combo. Le personnel est payé chaque semaine.</p>
          <p><b>Les pilotes</b> (onglet Équipe) : recrute-les, entraîne-les, renvoie-les. En course, l'écurie aligne au plus deux pilotes : le titulaire, que tu conduis, et un second pilote qui court seul sur une autre voiture du garage. Ses points comptent pour le Grand Prix.</p>
          <p><b>La ville</b> est entourée de campagne : champs, fermes, bois, étangs et éoliennes. Défis, radars et affiches cachées t'y attendent. À la campagne, pas de feux : STOP sur les routes nord-sud.</p>
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

export { ecranGarage } from './ecrans-garage.js';

// --- Atelier : réglages, pièces montées, peinture -------------------------------------------

export function ecranAtelier(app) {
  const p = app.partie;
  const v = voitureActive(p);
  const lignes = Object.keys(v.stats).map((k) => {
    const niveau = v.ameliorations[k] || 0;
    const cout = coutAmelioration(niveau);
    const max = niveau >= REGLAGES_MAX || v.stats[k] >= PLAFOND_CLASSE[v.classe];
    return `<div class="ligne">
      ${barreStat(NOMS_STATS[k], v.stats[k], COULEURS_STATS[k])}
      ${max ? `<span class="etat">${niveau >= REGLAGES_MAX ? 'Réglé au max' : `Plafond classe ${v.classe}`}</span>` : `<button class="btn btn-mini" data-action="ameliorer" data-stat="${k}" ${p.argent < cout ? 'disabled' : ''}>+5 · ${formatArgent(cout)}</button>`}
    </div>`;
  }).join('');
  const emplacements = Object.entries(EMPLACEMENTS).map(([cle, nom]) => {
    const monte = v.pieces.find((x) => x.emplacement === cle);
    return `<button class="emplacement ${monte ? `rarete-${monte.rarete}` : 'vide'}" data-action="monter" data-emplacement="${cle}">
      ${imgPiece(monte || cle, monte ? '' : 'fantome')}<span><small>${nom}</small><b>${monte ? `${e(monte.nom)}${monte.niveau ? ` +${monte.niveau}` : ''}` : '— vide —'}</b></span></button>`;
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
    const base = piece(inv.piece);
    const niv = inv.niveau || 0;
    const pc = pieceNiveau(base, niv);
    const cout = niv < NIVEAU_PIECE_MAX ? coutNiveauPiece(base, niv) : null;
    const apres = essai(inv.uid);
    const ailleurs = montureDe(p, inv.uid);
    const ici = inv.uid === actuelle;
    const effet = Object.keys(v.stats).map((k) => {
      const d = apres.stats[k] - v.stats[k];
      return d ? `<span class="${d > 0 ? 'ok' : 'ko'}">${COURTS[k]} ${d > 0 ? '+' : ''}${d}</span>` : '';
    }).join('');
    return `<div class="piece rarete-${pc.rarete}">
      <div class="piece-tete">${imgPiece(pc)}<b>${e(pc.nom)}${niv ? ` <span class="niveau-piece">+${niv}</span>` : ''}</b><span class="rarete">${RARETES[pc.rarete].nom}</span></div>
      <div class="petit">${texteBonus(pc)}</div>
      <div class="ligne"><span class="etoiles-niveau">${'◆'.repeat(niv)}<span>${'◆'.repeat(NIVEAU_PIECE_MAX - niv)}</span></span>
        ${cout ? `<button class="btn btn-mini btn-principal" data-action="niveau" data-uid="${inv.uid}" ${p.argent < cout.argent || p.recherche < cout.recherche ? 'disabled' : ''}>Améliorer +${niv + 1} · ${formatArgent(cout.argent)} · ${cout.recherche} PR</button>` : '<span class="etat">Niveau max</span>'}</div>
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
      niveau: (d) => {
        if (app.action('ameliorerPiece', d.uid)) { app.son.niveau(); app.toast('Pièce améliorée !'); }
        app.montrer(ecranMontage(app, emplacement));
      },
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
      <div class="piece-tete">${imgPiece(pc)}<b>${e(pc.nom)}</b><span class="rarete">${RARETES[pc.rarete].nom}</span></div>
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
          ${imgPiece(pc, 'grande')}
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
        <div class="contenu album">${PIECES.map((x) => (p.collection[x.id] ? `<span class="carte-piece rarete-${x.rarete}">${imgPiece(x)}${e(x.nom)}</span>` : `<span class="carte-piece inconnue">${imgPiece(x, 'silhouette')}?</span>`)).join('')}</div></section>
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
        <div class="contenu nuancier grand">${choix.map((c) => `<button class="teinte-voiture" data-action="go" data-couleur="${c}"><img src="${apercuVoiture(c, [], 2, modeleVoiture(m.profil, m.id))}" alt="${c}"></button>`).join('')}</div>
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
          if (rare === 'super' || rare === 'legendaire') app.son.niveau();
          app.montrer({
            classe: 'fond-sombre',
            html: `<div class="ecran"><section class="panneau revele rarete-${rare}"><h2 class="titre-panneau">${rare === 'legendaire' ? 'LÉGENDAIRE !' : rare === 'super' ? 'SUPER LOT !' : 'Gagné !'}</h2>
              <div class="contenu texte centre">${lot.type === 'piece' ? imgPiece(lot.piece, 'grande') : '<div class="caisse-ouverte"></div>'}<p class="gros">${e(titre)}</p>
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
  const journal = (g.journal || []).map((l) => `<li>${e(l)}</li>`).join('');
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau tele">
        <h2 class="titre-panneau">19:00 · Fin de la balade</h2>
        <div class="contenu gains">
          <div><small>Argent (net)</small><b data-compte="${Math.abs(g.argent)}" data-avant="${g.argent < 0 ? '−' : '+'}" data-apres=" G">0</b></div>
          <div><small>Recherche</small><b data-compte="${g.recherche}" data-avant="+" data-apres=" PR">0</b></div>
          <div><small>Fans</small><b data-compte="${Math.abs(g.fans)}" data-avant="${g.fans < 0 ? '−' : '+'}">0</b></div>
          <div><small>EXP</small><b data-compte="${g.exp}" data-avant="+">0</b></div>
        </div>
        ${g.amendes ? `<p class="petit-clair contenu">Amendes et constats : −${formatArgent(g.amendes)}${g.usure ? ` · voiture abîmée (−${Math.round(g.usure * 100)} % d'état)` : ''}</p>` : ''}
        ${journal ? `<ul class="journal contenu">${journal}</ul>` : ''}
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
      <section class="panneau"><h2 class="titre-panneau sombre">Carrière<small>Saison ${saisonDe(p)} sur ${SAISONS_CARRIERE}</small></h2>
        <div class="contenu gains-clairs">
          <div><small>Médailles de circuit</small><b>${totalMedailles(p)} / ${GRANDS_PRIX.reduce((s, g) => s + g.manches.length * 3, 0)}</b></div>
          <div><small>Pistons d'Or</small><b>${p.palmares.length}</b></div>
          <div><small>Affiches Piston</small><b>${Object.keys(p.memoireVille?.affiches || {}).length} / 8</b></div>
          <div><small>Album de pièces</small><b>${Object.keys(p.collection).length} / ${PIECES.length}</b></div>
          <div><small>Score de carrière</small><b>${scoreCarriere(p).toLocaleString('fr-FR')}</b></div>
          <div><small>Grands Prix gagnés</small><b>${Object.values(p.trophees).filter((x) => x === 1).length} / ${GRANDS_PRIX.length}</b></div>
        </div></section>
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

/** « Courir ce soir », sauf si la soirée est déjà prise ou qu'un autre Grand Prix est en cours. */
function boutonCourir(p, gp, v) {
  if (p.gp && p.gp.id !== gp.id) return '<span class="etat">Autre Grand Prix en cours</span>';
  if (!peutCourir(p)) return '<span class="etat">Demain soir</span>';
  const libelle = p.gp ? `Manche ${p.gp.manche + 1} ce soir` : 'Courir ce soir';
  return `<button class="btn btn-mini btn-rouge" data-action="briefing" data-id="${gp.id}" ${v ? '' : 'disabled'}>${libelle}</button>`;
}

function ligneGP(app, gp) {
  const p = app.partie;
  const v = voitureActive(p);
  const statut = statutGP(p, gp);
  const trophee = p.trophees[gp.id];
  const med = gp.manches.reduce((s, _, i) => s + (p.medailles[`${gp.id}#${i}`] || 0), 0);
  const infos = `${gp.manches.length} manches · 1er prix ${formatArgent(gp.prix)} · niveau ${'●'.repeat(gp.niveau)}${trophee ? ` · meilleur : ${ordinal(trophee)}` : ''} · médailles ${med}/${gp.manches.length * 3}`;
  const coupe = trophee ? `<i class="coupe c${Math.min(trophee, 4)}" title="Meilleure place : ${ordinal(trophee)}"></i>` : '';
  let action = '';
  if (gp.palier === 'ouvert') {
    if (statut === 'inscrit') action = boutonCourir(p, gp, v);
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
  if (statut === 'acceptee') action = boutonCourir(p, gp, v);
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
  const p = app.partie;
  const eng = engagement(p);
  const autresVoitures = p.garage.filter((g) => g.uid !== v?.uid);
  const puce = (action, id, nom, actif, extra = '') => `<button class="choix ${actif ? 'active' : ''}" data-action="${action}" data-id="${id}" ${extra}>${e(nom)}</button>`;
  const ecurie = `<section class="panneau">
        <h2 class="titre-panneau">Écurie engagée<small>2 pilotes au plus par écurie</small></h2>
        <div class="contenu engagement">
          ${p.pilotes.length ? `
          <div class="petit">Au volant (c'est toi qui conduis) · ${e(v ? v.nom : 'aucune voiture')}</div>
          <div class="choix-liste">${p.pilotes.map((x) => puce('titulaire', x.uid, `${x.nom} · niv. ${x.niveau}`, eng.titulaire === x)).join('')}</div>
          <div class="petit">Second pilote (il court seul, sur une autre voiture)</div>
          <div class="choix-liste">${puce('second', '', 'Aucun', !eng.second)}${p.pilotes.filter((x) => x !== eng.titulaire).map((x) => puce('second', x.uid, `${x.nom} · niv. ${x.niveau}`, eng.second === x, autresVoitures.length ? '' : 'disabled')).join('')}</div>
          ${eng.second ? `<div class="petit">Sa voiture</div><div class="choix-liste">${autresVoitures.map((g) => puce('voiture2', g.uid, `${modele(g.modele).nom}${g.usure > 0.3 ? ` · usée ${Math.round(g.usure * 100)} %` : ''}`, eng.voitureSecond === g)).join('')}</div>` : ''}
          ${p.pilotes.length > 1 && !autresVoitures.length ? '<div class="petit ko">Pour aligner un second pilote, il faut une deuxième voiture au garage.</div>' : ''}
          ${p.pilotes.length < 2 ? '<div class="petit">Recrute un second pilote (onglet Équipe) pour marquer deux fois plus de points.</div>' : ''}`
    : '<div class="petit ko">Aucun pilote sous contrat : recrute-en un dans l\'onglet Équipe.</div>'}
        </div>
      </section>`;
  const redessiner = () => app.montrer(ecranBriefing(app, gp, manche, apercu));
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
              <dt>Longueur</dt><dd>${Math.round((def.longueur * ALLONGE) / 16)} cases</dd>
              <dt>Adversaires</dt><dd>${gp.adversaires}</dd>
              <dt>Record</dt><dd>${(() => { const cle = `${gp.id}#${manche}`; const r = app.partie.meilleursTours[cle]; const m = app.partie.medailles[cle] || 0; return `${r ? `${r.toFixed(1)} s` : '—'} ${m ? `<span class="medaille m${m}">${NOMS_MEDAILLES[m]}</span>` : ''}`; })()}</dd>
              <dt>Médailles</dt><dd class="petit">${tempsMedailles(def).map((t, i) => `<span class="medaille m${i + 1}">${t} s</span>`).join(' ')}</dd>
              <dt>Rival</dt><dd class="ko">${e(rivalDe(gp).nom)}</dd>
              <dt>Chances</dt><dd>${pastilleChances(app, gp)}</dd>
            </dl>
          </div>
        </div>
        ${manche === gp.manches.length - 1 && gp.manches.length > 1 ? '<div class="contenu texte petit ko">Finale : les adversaires sortent le grand jeu !</div>' : ''}
        <div class="contenu texte petit">Touche l'écran pile au feu vert pour un départ parfait. Ramasse les pièces d'or et les disquettes sur la piste !</div>
      </section>
      ${ecurie}
      <div class="pile">
        <button class="btn btn-principal" data-action="depart" ${eng.titulaire ? '' : 'disabled'}>Départ !</button>
        <button class="btn" data-action="retour">${manche === 0 ? 'Pas ce soir' : 'Abandonner le Grand Prix'}</button>
      </div>
    </div>`,
    actions: {
      depart: () => app.depart(),
      retour: () => (manche === 0 ? app.annulerGP() : app.abandonnerGP()),
      titulaire: (d) => { app.action('choisirTitulaire', d.id); redessiner(); },
      second: (d) => { app.action('choisirSecond', d.id || null); redessiner(); },
      voiture2: (d) => { app.action('choisirVoitureSecond', d.id); redessiner(); },
    },
  };
}

export function ecranChargement(texte) {
  return { classe: 'fond-sombre', html: `<div class="ecran chargement"><p>${e(texte)}</p></div>`, actions: {} };
}

/** Pause pendant la balade : reprendre, le son, ou rentrer au garage (les gains sont gardés). */
export function ecranPauseVille(app) {
  const p = app.partie;
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau"><h2 class="titre-panneau">Pause</h2>
        <div class="contenu">
          <div class="ligne"><span>Son</span><button class="btn btn-mini" data-action="son">${p.son ? 'Activé' : 'Coupé'}</button></div>
          <p class="petit">Rentrer maintenant termine la balade : ce que tu as gagné est gardé.</p>
        </div>
      </section>
      <div class="pile">
        <button class="btn btn-principal" data-action="reprendre">Reprendre</button>
        <button class="btn" data-action="rentrer">Rentrer au garage</button>
      </div>
    </div>`,
    actions: {
      reprendre: () => app.reprendre(),
      son: () => { p.son = !p.son; app.son.actif = p.son; app.sauver(); app.montrer(ecranPauseVille(app)); },
      rentrer: () => { app.reprendre(); app.ville.fini = true; },
    },
  };
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
  const lignes = r.resultats.map((x) => `<tr class="${x.id === 'joueur' ? 'moi' : x.id === 'coequipier' ? 'moi second' : ''}">
      <td>${ordinal(x.place)}</td><td><i class="puce" style="background:${x.couleur}"></i>${e(x.nom)}</td><td class="petit">${e(x.ecurie)}</td><td class="num">${x.place === 1 ? formatTemps(x.temps) : `+${x.ecart.toFixed(1)} s`}</td></tr>`).join('');
  const general = r.general.map((x, i) => `<tr class="${x.id === 'joueur' ? 'moi' : x.id === 'coequipier' ? 'moi second' : ''}"><td>${ordinal(i + 1)}</td><td>${e(x.nom)}</td><td class="num">${x.points} pts</td></tr>`).join('');
  const p = app.partie;
  const besoin = expPourRang(p.rang);
  const butin = g.butin
    ? `<section class="panneau revele rarete-${g.butin.piece.rarete} retarde"><h2 class="titre-panneau">Caisse de pièces !</h2>
        <div class="contenu texte centre">${imgPiece(g.butin.piece, 'grande')}<p class="gros">${e(g.butin.piece.nom)}</p>${g.butin.nouvelle ? '<p class="nouveau">NOUVEAU !</p>' : ''}<p class="rarete">${RARETES[g.butin.piece.rarete].nom}</p><p class="petit">${texteBonus(g.butin.piece)}</p></div></section>`
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
          ${g.meilleurTour ? `<p class="petit-clair">Meilleur tour : ${g.meilleurTour.toFixed(1)} s${g.medaille?.record ? ' · RECORD' : ''}</p>` : ''}
          ${g.medaille?.nouvelle ? `<p class="premiere medaille-gagnee m${g.medaille.niveau}">MÉDAILLE ${NOMS_MEDAILLES[g.medaille.niveau].toUpperCase()} ! +${g.medaille.recherche} PR</p>` : ''}
          ${g.niveauxPilote?.length ? `<p class="premiere">${e(g.pilote || 'Le pilote')} passe niveau ${g.niveauxPilote.at(-1)} ! Point à répartir</p>` : ''}
          ${g.coequipier ? `<p class="petit-clair">Second pilote · ${e(g.coequipier.nom)} : ${ordinal(g.coequipier.place)} · +${formatArgent(g.coequipier.prime)} · +${g.coequipier.fans} fans · +${g.coequipier.exp} EXP</p>` : ''}
          ${g.coequipier?.niveaux?.length ? `<p class="premiere">${e(g.coequipier.nom)} passe niveau ${g.coequipier.niveaux.at(-1)} ! Point à répartir</p>` : ''}
        </div>
      </section>
      ${butin}
      <section class="panneau"><h2 class="titre-panneau">Arrivée</h2><div class="contenu"><table class="classement">${lignes}</table></div></section>
      <section class="panneau"><h2 class="titre-panneau">Classement du Grand Prix</h2><div class="contenu"><table class="classement">${general}</table></div></section>
      <button class="btn btn-principal" data-action="suite">${g.fini ? 'Fin du Grand Prix' : 'Fin de la soirée (manche suivante demain)'}</button>
    </div>`,
    actions: { suite: () => app.apresRangs(g.rangs, () => (g.fini ? app.finGP() : app.mancheSuivante())) },
    apres: (racine) => {
      animerCompteurs(racine, 1100);
      if (g.butin) setTimeout(() => app.son.disque(), 1300);
    },
  };
}

export function ecranFinGP(app, f) {
  const lignes = f.general.map((x, i) => `<tr class="${x.id === 'joueur' ? 'moi' : x.id === 'coequipier' ? 'moi second' : ''}"><td>${ordinal(i + 1)}</td><td>${e(x.nom)}</td><td class="petit">${e(x.ecurie)}</td><td class="num">${x.points} pts</td></tr>`).join('');
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

// --- Cérémonie des Pistons d'Or -------------------------------------------------------------------

export function ecranCeremonie(app, c, suite) {
  const lignes = c.prix.map((x, i) => `<div class="prix-or ${x.ok ? 'gagne' : ''}" style="--i:${i}">
      <div class="statuette ${x.ok ? '' : 'grise'}"></div>
      <div class="prix-texte"><b>${e(x.nom)}</b>
        <span class="petit">En lice : Garage Piston, ${e(x.nomines.join(', '))}</span>
        <span class="laureat">${x.ok ? 'Lauréat : GARAGE PISTON !' : `Lauréat : ${e(x.laureat)}`}</span>
        <span class="petit">${e(x.detail)}${x.ok ? ` · ${texteGain(x.gain)}` : ''}</span></div>
    </div>`).join('');
  const gagnes = c.prix.filter((x) => x.ok).length;
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran ceremonie">
      ${gagnes ? `<div class="confettis">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>` : ''}
      <div class="bandeau petit-bandeau">PISTONS D'OR</div>
      <p class="accroche">Cérémonie de fin de saison ${c.saison}</p>
      <section class="panneau"><div class="contenu">${lignes}</div></section>
      <p class="accroche">${gagnes === 0 ? 'Pas de statuette cette année… la saison prochaine sera la bonne !' : `${gagnes} Piston${gagnes > 1 ? 's' : ''} d'Or pour le garage !`}</p>
      <button class="btn btn-principal" data-action="suite">Saison ${c.saison + 1} : c'est parti !</button>
    </div>`,
    actions: { suite },
    apres: () => { if (gagnes) app.son.fanfare(); },
  };
}

function texteGain(g) {
  if (g.piece) return `pièce ${g.piece}`;
  return [g.argent && `+${formatArgent(g.argent)}`, g.recherche && `+${g.recherche} PR`, g.tickets && `+${g.tickets} tickets`, g.exp && `+${g.exp} EXP`].filter(Boolean).join(' ');
}

export function ecranFinCarriere(app, r, actions) {
  const p = app.partie;
  const palmares = lirePalmares().map((x, i) => `<tr class="${x.score === r.score ? 'moi' : ''}"><td>${i + 1}</td><td>${e(x.pilote)}${x.heritage ? ` (carrière ${x.heritage + 1})` : ''}</td><td class="num">${x.score.toLocaleString('fr-FR')}</td></tr>`).join('');
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <div class="confettis">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="bandeau petit-bandeau">FIN DE CARRIÈRE</div>
      <p class="accroche">${SAISONS_CARRIERE} saisons au Garage Piston. Merci, ${e(p.pilote)} !</p>
      <section class="panneau tele"><div class="contenu gains">
        <div><small>Score</small><b data-compte="${r.score}">0</b></div>
        <div><small>Classement</small><b>${r.rangPalmares}e</b></div>
        <div><small>Grands Prix gagnés</small><b>${Object.values(p.trophees).filter((x) => x === 1).length}</b></div>
        <div><small>Pistons d'Or</small><b>${p.palmares.length}</b></div>
      </div></section>
      <section class="panneau"><h2 class="titre-panneau">Palmarès</h2><div class="contenu"><table class="classement">${palmares}</table></div></section>
      <div class="pile">
        <button class="btn btn-principal" data-action="plus">Nouvelle carrière+ (on garde labo, album, médailles, pilote)</button>
        <button class="btn" data-action="continuer">Continuer cette partie</button>
      </div>
    </div>`,
    actions,
    apres: (racine) => animerCompteurs(racine, 1600),
  };
}

// --- Cadeau du jour --------------------------------------------------------------------------------

export function ecranCadeau(app, c, suite) {
  const cases = CADEAUX.map((x, i) => `<div class="case-cadeau ${i < c.jour ? 'pris' : i === c.jour ? 'aujourdhui' : ''}">
      <small>Jour ${i + 1}</small><b>${x.piece ? 'Pièce rare' : texteGain(x)}</b></div>`).join('');
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran">
      <section class="panneau">
        <h2 class="titre-panneau rose">Cadeau du jour<small>Un cadeau chaque jour où tu passes au garage. Rien n'est perdu si tu sautes un jour.</small></h2>
        <div class="contenu cadeaux">${cases}</div>
        <div class="contenu texte centre">${c.piece ? imgPiece(c.piece, 'grande') : '<div class="caisse-ouverte"></div>'}
          <p class="gros">${c.piece ? e(c.piece.nom) : texteGain(c.cadeau)}</p></div>
      </section>
      <button class="btn btn-principal" data-action="suite">Merci !</button>
    </div>`,
    actions: { suite },
    apres: () => app.son.caisse(),
  };
}
