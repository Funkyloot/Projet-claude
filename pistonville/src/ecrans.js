/* ecrans.js — les menus, en HTML par-dessus le canevas du jeu.
 *
 * Chaque écran renvoie son HTML et ses actions ; un clic sur un élément
 * portant data-action appelle l'action du même nom, avec ses data-*.
 */

import { VEHICULES, GRANDS_PRIX } from '../contenu/catalogue.js';
import {
  voitureActive, statutGP, coutReparation, fraisDossier, peutAcheter, licenceAuMoins, modele,
  ORDRE_PALIERS, PALIERS,
} from './partie.js';
import { coutAmelioration, evaluerCandidature, SURFACES, kmh, CLASSES } from './regles.js';
import { formatArgent, formatTemps, ordinal } from './outils.js';
import { urlAsset } from './assets.js';
import { THEMES } from './rendu-circuit.js';

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

  montrer({ html, actions = {}, classe = '' }) {
    this.racine.className = classe;
    this.racine.innerHTML = html;
    this.actions = actions;
    this.racine.hidden = !html;
  }

  vider() { this.montrer({ html: '' }); }
}

function barre(partie) {
  const lic = partie.licence ? `Licence ${partie.licence}` : 'Sans licence';
  return `<header class="barre">
    <div class="barre-ligne">
      <span class="jour">JOUR ${partie.jour}</span>
      <span class="argent">${formatArgent(partie.argent)}</span>
    </div>
    <div class="barre-ligne pastilles">
      <span class="pastille bleu">${lic}</span>
      <span class="pastille rouge">${partie.fans} fans</span>
      <span class="pastille sombre">${partie.pointsLicence} pts · ${partie.podiums} podium${partie.podiums > 1 ? 's' : ''}</span>
    </div>
  </header>`;
}

function barreStat(nom, valeur, couleur) {
  return `<div class="stat"><span>${nom}</span><div class="jauge"><i style="width:${valeur}%;background:${couleur}"></i></div><b>${valeur}</b></div>`;
}

const COULEURS_STATS = { vitesse: '#e4432d', acceleration: '#f39c33', maniabilite: '#3fa34d', solidite: '#2f6fdb' };
const NOMS_STATS = { vitesse: 'Vitesse', acceleration: 'Accél.', maniabilite: 'Maniab.', solidite: 'Solidité' };

function carteVoiture(v, avecPrix = false) {
  const stats = Object.entries(v.stats).map(([k, val]) => barreStat(NOMS_STATS[k], val, COULEURS_STATS[k])).join('');
  return `<div class="voiture-carte">
    <div class="voiture-entete"><b>${e(v.nom)}</b><span class="classe classe-${v.classe}">CLASSE ${v.classe}</span></div>
    <div class="voiture-corps">
      <img class="profil" src="${urlAsset(`assets/kenney/profil/${v.profil}.png`)}" alt="">
      <div class="stats">${stats}</div>
    </div>
    ${avecPrix ? '' : `<div class="petit">Pointe ${kmh(v.physique.vmax)} km/h · état ${Math.round((1 - v.usure) * 100)} %</div>`}
  </div>`;
}

// --- Titre --------------------------------------------------------------------

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
      <p class="credits">Version d'essai 0.1 · Graphismes Kenney (CC0) · Police Jersey 10 (OFL)</p>
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
    html: `<div class="ecran">
      <section class="panneau">
        <h2 class="titre-panneau">Comment jouer</h2>
        <div class="contenu texte">
          <p><b>Le jour</b>, au garage : achète ou construis une voiture, améliore-la à l'atelier, inscris-toi aux Grands Prix.</p>
          <p><b>Le soir</b>, la course : la voiture accélère toute seule, tu ne fais que tourner.</p>
          <table class="touches">
            <tr><th>Tourner</th><td>Toucher la moitié gauche ou droite de l'écran · flèches ← → · Q / D</td></tr>
            <tr><th>Nitro</th><td>Bouton NITRO · Espace</td></tr>
            <tr><th>Aura</th><td>Toucher le portrait quand la jauge est pleine · E</td></tr>
            <tr><th>Pause</th><td>Bouton pause · Échap</td></tr>
          </table>
          <p>Garder la direction dans un virage fait drifter : un long drift et chaque dépassement remplissent la jauge d'aura. Pousser un rival dans les barrières rapporte des fans.</p>
          <p>Les 3 Grands Prix ouverts sont accessibles dès que tu as une voiture. Les autres demandent une <b>candidature</b> : points de licence, podiums et classe de voiture. La réponse arrive le lendemain.</p>
        </div>
      </section>
      <button class="btn btn-principal" data-action="retour">Retour</button>
    </div>`,
    actions: { retour: () => (retour === 'titre' ? app.titre() : app.garage()) },
  };
}

// --- Garage ---------------------------------------------------------------------

export function ecranGarage(app) {
  const p = app.partie;
  const v = voitureActive(p);
  const nouvelles = (p.nouvelles || []).map((n) => `<div class="nouvelle"><b>${e(n.titre)}</b><span>${e(n.texte)}</span></div>`).join('');
  const sansVoiture = !v;
  return {
    classe: 'garage',
    html: `${barre(p)}
    ${nouvelles ? `<div class="nouvelles" data-action="lu">${nouvelles}<small>Toucher pour fermer</small></div>` : ''}
    <div class="bas">
      ${sansVoiture
        ? `<section class="panneau"><h2 class="titre-panneau">Bienvenue au Garage Piston</h2>
            <div class="contenu texte"><p>Ton garage est vide. Pour courir les Grands Prix ouverts, il te faut une voiture : achète-la toute prête, ou construis-la ici (moins cher, prête demain).</p></div></section>`
        : `<section class="panneau">${carteVoiture(v)}</section>`}
      <nav class="grille-actions" aria-label="Menu du garage">
        <button class="btn" data-action="atelier" ${sansVoiture ? 'disabled' : ''}>Atelier</button>
        <button class="btn ${sansVoiture ? 'btn-principal' : ''}" data-action="boutique">Boutique</button>
        <button class="btn btn-rouge" data-action="bureau">Courses</button>
        <button class="btn btn-sombre" data-action="jour">Jour suivant</button>
      </nav>
      <div class="petits-liens">
        <button class="lien" data-action="aide">Comment jouer</button>
        <button class="lien" data-action="titre">Menu principal</button>
      </div>
    </div>`,
    actions: {
      lu: () => { p.nouvelles = []; app.garage(); },
      atelier: () => app.montrer(ecranAtelier(app)),
      boutique: () => app.montrer(ecranBoutique(app)),
      bureau: () => app.montrer(ecranBureau(app)),
      jour: () => app.jourSuivant(),
      aide: () => app.montrer(ecranAide(app, 'garage')),
      titre: () => app.titre(),
    },
  };
}

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
  const rep = coutReparation(p);
  const autres = p.garage.filter((g) => g.uid !== v.uid);
  return {
    classe: 'garage',
    html: `${barre(p)}<div class="bas">
      <section class="panneau">
        <h2 class="titre-panneau">Atelier · ${e(v.nom)}</h2>
        <div class="contenu">${lignes}
          <div class="ligne"><span>État de la voiture : ${Math.round((1 - v.usure) * 100)} %</span>
            <button class="btn btn-mini" data-action="reparer" ${!rep || p.argent < rep ? 'disabled' : ''}>Réparer · ${formatArgent(rep)}</button></div>
          ${autres.length ? `<div class="ligne"><span>Autres voitures</span>${autres.map((a) => `<button class="btn btn-mini" data-action="choisir" data-uid="${a.uid}">${e(modele(a.modele).nom)}</button>`).join('')}</div>` : ''}
        </div>
      </section>
      <button class="btn" data-action="retour">Retour au garage</button>
    </div>`,
    actions: {
      ameliorer: (d) => { if (app.action('ameliorer', d.stat)) app.son.caisse(); app.montrer(ecranAtelier(app)); },
      reparer: () => { app.action('reparer'); app.montrer(ecranAtelier(app)); },
      choisir: (d) => { p.voitureActive = d.uid; app.sauver(); app.montrer(ecranAtelier(app)); },
      retour: () => app.garage(),
    },
  };
}

export function ecranBoutique(app) {
  const p = app.partie;
  const cartes = VEHICULES.map((m) => {
    const blocage = peutAcheter(p, m);
    const enConstruction = p.constructions.some((c) => c.modele === m.id);
    return `<section class="panneau ${blocage ? 'verrouille' : ''}">
      ${carteVoiture(m, true)}
      <div class="contenu actions-ligne">
        ${blocage ? `<span class="petit">${e(blocage)}</span>` : `
        <button class="btn btn-mini btn-vert" data-action="acheter" data-id="${m.id}" ${p.argent < m.prix ? 'disabled' : ''}>Acheter · ${formatArgent(m.prix)}</button>
        <button class="btn btn-mini" data-action="construire" data-id="${m.id}" ${p.argent < m.construction.prix || enConstruction ? 'disabled' : ''}>${enConstruction ? 'En construction' : `Construire · ${formatArgent(m.construction.prix)} · ${m.construction.jours} j`}</button>`}
      </div>
    </section>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Boutique</h2>
      <p class="petit clair">Acheter : la voiture est prête tout de suite. Construire : moins cher, prête après quelques jours.</p>
      ${cartes}
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour au garage</button></div>`,
    actions: {
      acheter: (d) => { if (app.action('acheter', d.id)) { app.son.caisse(); app.toast('Voiture achetée !'); } app.montrer(ecranBoutique(app)); },
      construire: (d) => { if (app.action('construire', d.id)) { app.son.caisse(); app.toast('Construction lancée : prête demain ou plus tard.'); } app.montrer(ecranBoutique(app)); },
      retour: () => app.garage(),
    },
  };
}

// --- Bureau des courses ------------------------------------------------------------

function ligneGP(app, gp) {
  const p = app.partie;
  const v = voitureActive(p);
  const statut = statutGP(p, gp);
  const trophee = p.trophees[gp.id];
  const infos = `${gp.manches.length} manches · 1er prix ${formatArgent(gp.prix)}${trophee ? ` · meilleur : ${ordinal(trophee)}` : ''}`;
  let action = '';
  if (gp.palier === 'ouvert') {
    if (statut === 'inscrit') action = `<button class="btn btn-mini btn-rouge" data-action="briefing" data-id="${gp.id}" ${v ? '' : 'disabled'}>Courir ce soir</button>`;
    else action = `<button class="btn btn-mini" data-action="inscrire" data-id="${gp.id}" ${v ? '' : 'disabled'}>${v ? "S'inscrire" : 'Il faut une voiture'}</button>`;
  } else {
    const c = p.candidatures[gp.id];
    const verdict = evaluerCandidature(p, gp, v);
    const conditions = gp.conditions;
    const crit = [
      conditions.points && `<span class="${p.pointsLicence >= conditions.points ? 'ok' : 'ko'}">${Math.min(p.pointsLicence, conditions.points)}/${conditions.points} pts</span>`,
      conditions.podiums && `<span class="${p.podiums >= conditions.podiums ? 'ok' : 'ko'}">${Math.min(p.podiums, conditions.podiums)}/${conditions.podiums} podiums</span>`,
      conditions.victoires && `<span class="${p.victoires >= conditions.victoires ? 'ok' : 'ko'}">${Math.min(p.victoires, conditions.victoires)}/${conditions.victoires} victoire${conditions.victoires > 1 ? 's' : ''}</span>`,
      conditions.classe && `<span class="${v && CLASSES.indexOf(v.classe) >= CLASSES.indexOf(conditions.classe) ? 'ok' : 'ko'}">classe ${conditions.classe}+</span>`,
    ].filter(Boolean).join('');
    if (statut === 'acceptee') action = `<button class="btn btn-mini btn-rouge" data-action="briefing" data-id="${gp.id}" ${v ? '' : 'disabled'}>Courir ce soir</button>`;
    else if (statut === 'attente') action = '<span class="etat">Réponse demain</span>';
    else if (statut === 'liste') action = "<span class=\"etat\">Liste d'attente</span>";
    else action = `<button class="btn btn-mini" data-action="candidater" data-id="${gp.id}" ${p.argent < fraisDossier(gp) ? 'disabled' : ''}>Candidater · ${formatArgent(fraisDossier(gp))}</button>`;
    const refus = statut === 'refusee' && c?.manques ? `<div class="petit ko">Refusée : il manquait ${e(c.manques.join(', '))}.</div>` : '';
    return `<div class="gp">
      <div class="gp-tete"><b>${e(gp.nom)}</b>${action}</div>
      <div class="petit">${infos}</div>
      <div class="criteres">${crit}${verdict.ok && statut !== 'acceptee' ? '<span class="ok">dossier complet</span>' : ''}</div>${refus}
    </div>`;
  }
  return `<div class="gp"><div class="gp-tete"><b>${e(gp.nom)}</b>${action}</div><div class="petit">${infos}</div></div>`;
}

export function ecranBureau(app) {
  const p = app.partie;
  const blocs = ORDRE_PALIERS.map((palier) => {
    const gps = GRANDS_PRIX.filter((g) => g.palier === palier);
    if (!gps.length) return '';
    const lic = PALIERS[palier].licence;
    const sous = palier === 'ouvert' ? 'Sans candidature : il suffit d\'avoir une voiture' : `Sur candidature · donne la licence ${lic}`;
    const atteint = palier === 'ouvert' || palier === 'regional' || licenceAuMoins(p.licence, PALIERS[ORDRE_PALIERS[ORDRE_PALIERS.indexOf(palier) - 1]].licence);
    return `<section class="panneau ${atteint ? '' : 'verrouille'}">
      <h2 class="titre-panneau">${PALIERS[palier].nom}<small>${sous}</small></h2>
      <div class="contenu">${atteint ? gps.map((g) => ligneGP(app, g)).join('') : `<p class="petit">${gps.length} Grand${gps.length > 1 ? 's' : ''} Prix · se débloque avec la licence ${PALIERS[ORDRE_PALIERS[ORDRE_PALIERS.indexOf(palier) - 1]].licence}.</p>`}</div>
    </section>`;
  }).join('');
  return {
    classe: 'garage plein',
    html: `${barre(p)}<div class="defile">
      <h2 class="titre-section">Bureau des courses</h2>
      ${blocs}
    </div>
    <div class="pied"><button class="btn" data-action="retour">Retour au garage</button></div>`,
    actions: {
      inscrire: (d) => { app.action('inscrire', d.id); app.montrer(ecranBureau(app)); },
      candidater: (d) => { if (app.action('candidater', d.id)) app.toast('Dossier déposé : réponse demain matin.'); app.montrer(ecranBureau(app)); },
      briefing: (d) => app.briefing(d.id),
      retour: () => app.garage(),
    },
  };
}

// --- Course -------------------------------------------------------------------------

export function ecranBriefing(app, gp, manche, apercu) {
  const def = gp.manches[manche];
  const theme = THEMES[def.theme] || THEMES.parc;
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
              <dt>Surface</dt><dd>${SURFACES[def.surface].nom}</dd>
              <dt>Tours</dt><dd>${def.tours}</dd>
              <dt>Longueur</dt><dd>${Math.round(def.longueur / 16)} cases</dd>
              <dt>Adversaires</dt><dd>${gp.adversaires}</dd>
            </dl>
          </div>
        </div>
        <div class="contenu texte petit">← → ou toucher la moitié gauche / droite pour tourner · Espace : nitro · E : aura</div>
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
  const lignes = r.resultats.map((x) => `<tr class="${x.id === 'joueur' ? 'moi' : ''}">
      <td>${ordinal(x.place)}</td><td><i class="puce" style="background:${x.couleur}"></i>${e(x.nom)}</td><td class="petit">${e(x.ecurie)}</td><td class="num">${x.place === 1 ? formatTemps(x.temps) : `+${x.ecart.toFixed(1)} s`}</td></tr>`).join('');
  const general = r.general.map((x, i) => `<tr class="${x.id === 'joueur' ? 'moi' : ''}"><td>${ordinal(i + 1)}</td><td>${e(x.nom)}</td><td class="num">${x.points} pts</td></tr>`).join('');
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau tele">
        <h2 class="titre-panneau">PISTON TV<small>${e(r.gp.nom)} · manche ${r.manche}</small></h2>
        <div class="podium-titre ${r.gain.place <= 3 ? 'podium' : ''}">${ordinal(r.gain.place)}</div>
        <div class="contenu gains">
          <div><small>Prime</small><b>+${formatArgent(r.gain.prime)}</b></div>
          <div><small>Points de licence</small><b>+${r.gain.licence}</b></div>
          <div><small>Fans</small><b>+${r.gain.fans}</b></div>
          <div><small>Dépassements</small><b>${r.depassements}</b></div>
        </div>
      </section>
      <section class="panneau"><h2 class="titre-panneau">Arrivée</h2><div class="contenu"><table class="classement">${lignes}</table></div></section>
      <section class="panneau"><h2 class="titre-panneau">Classement du Grand Prix</h2><div class="contenu"><table class="classement">${general}</table></div></section>
      <button class="btn btn-principal" data-action="suite">${r.gain.fini ? 'Fin du Grand Prix' : 'Manche suivante'}</button>
    </div>`,
    actions: { suite: () => (r.gain.fini ? app.finGP() : app.mancheSuivante()) },
  };
}

export function ecranFinGP(app, f) {
  const lignes = f.general.map((x, i) => `<tr class="${x.id === 'joueur' ? 'moi' : ''}"><td>${ordinal(i + 1)}</td><td>${e(x.nom)}</td><td class="petit">${e(x.ecurie)}</td><td class="num">${x.points} pts</td></tr>`).join('');
  return {
    classe: 'fond-sombre',
    html: `<div class="ecran defile-ecran">
      <section class="panneau tele">
        <h2 class="titre-panneau">${e(f.gp.nom)}<small>Classement final</small></h2>
        <div class="podium-titre ${f.place <= 3 ? 'podium' : ''}">${f.place === 1 ? 'Trophée !' : ordinal(f.place)}</div>
        <div class="contenu gains">
          <div><small>Gains du Grand Prix</small><b>+${formatArgent(f.gains)}</b></div>
          <div><small>Nouveaux fans</small><b>+${f.fans}</b></div>
        </div>
      </section>
      <section class="panneau"><div class="contenu"><table class="classement">${lignes}</table></div></section>
      <button class="btn btn-principal" data-action="garage">Retour au garage (jour suivant)</button>
    </div>`,
    actions: { garage: () => app.garage() },
  };
}
