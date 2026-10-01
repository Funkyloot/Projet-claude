/* evenements.js — les petites nouvelles du matin, tirées au hasard.
 *
 * Comme dans les jeux Kairosoft, la ville vit : visiteurs, journaux, imprévus.
 * `poids` : fréquence relative. `si(p)` : condition. `effet(p, outils)` change
 * la partie et renvoie le texte de la nouvelle.
 * outils : { piece(rarete) → pièce ajoutée, exp(n), voiture() → voiture active (brute) }
 */

export default [
  {
    id: 'journal', poids: 3, si: (p) => p.fans >= 20,
    effet: (p) => { const n = 10 + Math.min(150, Math.round(p.fans * 0.02)); p.fans += n; return { titre: 'Le Pistonville Matin', texte: `Un article sur ton équipe ! +${n} fans.` }; },
  },
  {
    id: 'colis', poids: 2, si: () => true,
    effet: (p, o) => { const pc = o.piece('commune'); return { titre: 'Un colis devant le garage', texte: `Un fan t'offre : ${pc.nom} !` }; },
  },
  {
    id: 'colis-rare', poids: 1, si: (p) => p.rang >= 4,
    effet: (p, o) => { const pc = o.piece('rare'); return { titre: 'Cadeau d\'un collectionneur', texte: `Il te confie : ${pc.nom} (rare) !` }; },
  },
  {
    id: 'pub', poids: 2, si: (p) => p.fans >= 40,
    effet: (p) => { const n = 500 * p.rang; p.argent += n; return { titre: 'Publicité', texte: `Une marque de soda achète une pub sur ta voiture : +${n} G.` }; },
  },
  {
    id: 'etudiant', poids: 2, si: () => true,
    effet: (p) => { p.recherche += 5; return { titre: 'Un étudiant ingénieur', texte: 'Il partage ses notes de cours : +5 PR.' }; },
  },
  {
    id: 'ticket', poids: 1, si: () => true,
    effet: (p) => { p.tickets += 1; return { titre: 'Trouvaille', texte: 'Un ticket de tombola oublié dans une boîte à gants !' }; },
  },
  {
    id: 'heures-sup', poids: 2, si: (p, o) => (o.voiture()?.usure || 0) > 0.15,
    effet: (p, o) => { o.voiture().usure = 0; return { titre: 'Heures sup', texte: 'Les mécanos ont réparé la voiture pendant la nuit. Gratuit !' }; },
  },
  {
    id: 'legende', poids: 1, si: (p) => p.rang >= 2,
    effet: (p, o) => { o.exp(30); return { titre: 'Visite d\'une légende', texte: 'Un ancien champion de rallye passe au garage : +30 EXP.' }; },
  },
  {
    id: 'orage', poids: 1, si: (p) => p.argent > 4000,
    effet: (p) => { p.argent -= 400; return { titre: 'Orage', texte: 'Une gouttière a lâché sur l\'établi : −400 G de réparations.' }; },
  },
];
