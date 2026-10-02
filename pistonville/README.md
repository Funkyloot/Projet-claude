# Pistonville — version d'essai 0.6

Jeu mobile de gestion d'écurie et de course en pixel art, inspiré de
*Grand Prix Story* (Kairosoft) et des jeux de poursuite mobiles où l'on tourne
en touchant la gauche ou la droite de l'écran. Le cahier des charges complet
est dans le document « Pistonville — Cahier des charges ».

## Jouer sur téléphone (via ton PC, même hors de la maison)

Voir **`JOUER-SUR-TELEPHONE.md`** : double-clic sur `Lancer-serveur.bat`, puis
Tailscale (privé) ou Cloudflare (lien public) pour y accéder de partout. Le jeu
s'installe sur l'écran d'accueil et marche hors ligne.

## Jouer sur PC

Ouvrir **`dist/pistonville.html`** d'un double-clic (Chrome, Edge ou Firefox).
Tout est dans ce fichier : aucune installation, aucune connexion.

| Action | Clavier | Écran tactile ou souris |
|---|---|---|
| Tourner à gauche / droite | ← → (ou Q / D, A / D) | Boutons Gauche / Droite (ou la moitié gauche / droite de l'écran) |
| Nitro | Espace (ou ↑) | Bouton NITRO |
| Aura (jauge pleine) | E | Toucher le portrait de la pilote |
| Pause | Échap (ou P) | Bouton pause en haut |
| Départ parfait | n'importe quelle touche pile au feu vert | toucher l'écran pile au feu vert |
| Freiner, puis reculer (en ville) | ↓ (ou S), ou ← et → ensemble | Bouton FREIN gardé, ou les deux côtés |

La course et la balade en ville se conduisent pareil, avec le même panneau en
bas de l'écran (pilote, vitesse, état de la voiture, Gauche / Droite) ; au
milieu, NITRO en course et FREIN en ville. La voiture accélère toute seule. Garder la direction dans un virage fait
drifter ; un long drift et chaque dépassement remplissent la jauge d'aura.
L'aide au pilotage (activée par défaut, réglable dans la pause) recentre
doucement la voiture quand on ne touche à rien.

## Ce que contient cette version

**Graphismes 100 % Kenney** : personnages RPG Urban partout (piétons,
personnel, pilotes, public) ; tous les véhicules (voitures de course, karts,
berlines, taxis, police, camions, ambulances, pompiers, tracteurs) viennent
du Car Kit en 3D, rendus sous 32 angles et repeints aux couleurs des écuries ;
en course, tribunes, tentes, murs de pneus et feux de départ du Racing Pack,
sur des pistes de 10 cases de large ; en ville, bâtiments, feux, lampadaires,
bancs et eau de Roguelike Modern City ; à la campagne, maisons, grange, mairie, puits, clôtures et cultures de
Tiny Town et Tiny Farm ; boutique et garage : Pixel Vehicle Pack.

**Nouveau en 0.6** : une grande carte d'environ 5 km de côté, organisée
comme une vraie carte. La ville au centre, en grands pâtés de quatre lots
avec une cour, desservis par des rues et entourée d'un boulevard périphérique
à 2 × 2 voies avec terre-plein ; le lac au fond d'un grand parc ;
la zone d'activités en bordure. Autour, la campagne en grandes parcelles le
long d'une boucle de routes départementales : champs découpés en cultures,
deux fermes, un village avec église, place et marché, prés, vergers, parc
éolien, étang, station-service ; la forêt au bord de la carte. Feux en ville,
STOP à la campagne, tracteurs ; nouveaux défis, radars et affiches. La
voiture attend qu'on touche l'écran pour démarrer. La carte est peinte par
morceaux, à la demande, pour rester fluide sur téléphone. Les pilotes
deviennent une vraie équipe : on les recrute (4 méthodes), on les entraîne,
on les paie, on peut les renvoyer (une semaine d'indemnité). En course, une
écurie aligne au plus deux pilotes : le titulaire, que l'on conduit, et un
second pilote qui court seul sur une autre voiture du garage ; les grosses
écuries adverses viennent aussi à deux.

**Nouveau en 0.5** : nouveau style graphique, celui des packs Kenney « Tiny »
(CC0), et tout est à l'échelle (1 case ≈ 1 m : une personne = 1 case, une
voiture = 2 × 3 cases). Le garage est vu de l'intérieur, façon Tiny Factory ;
chaque lieu de la ville a son intérieur ; la ville a des rues à deux voies,
des passages piétons, des feux sur poteaux et des bâtiments modernes à étages ;
les pistes sont plus larges et les voitures dessinées en vue 3/4. Le contenu
est triplé : 97 pièces (rareté Légendaire, labo sur 10 niveaux), 45 voitures,
55 Grands Prix et 141 circuits, 20 écuries.

**Nouveau en 0.4** : le garage est un terrain à construire, façon Kairosoft :
15 bâtiments à niveaux (ponts, bureau d'études, soufflerie, bancs d'essai,
salle d'analyse, salle de repos, cafétéria, distributeurs, boutique, tribune,
simulateurs…), 9 décors qui boostent les voisins, 8 combos à découvrir,
permis d'agrandissement ; du personnel à recruter (4 méthodes, potentiel,
traits), affecter, former, payer chaque semaine ; menus en barre d'onglets.

**Nouveau en 0.3** : icônes pixel pour chaque pièce, pièces améliorables
(+1 à +5), ville 6 × 6 animée (circulation, feux, piétons, coucher de soleil)
avec défis (sprints, livraisons, arène de drift, radars, affiches cachées) et
contraintes (constats, amendes, piétons), carrière de 10 saisons avec
cérémonie des Pistons d'Or, médailles de circuit, pilote à faire progresser,
installations du garage, cadeau du jour sans pénalité, fin de carrière avec
palmarès et Nouvelle carrière+, 13 voitures, 18 Grands Prix et 48 circuits.


- **Garage animé** : la voiture active et ses pièces sur les ponts, les
  mécaniciens circulent dans les allées, étagère des trophées.
- **Construction** en trois étapes (Conception, Soufflerie, Essais) avec la
  voiture qui se monte sur le pont ; qualité tirée au sort, de 1 à 5 étoiles
  (+0 à +15 sur toutes les qualités). Achat direct possible aussi.
- **Pièces** : 23 pièces, 6 emplacements (moteur, pneus, boîte, aileron,
  nitro, châssis), 3 raretés. Elles changent les qualités, l'adhérence selon
  la surface, le nombre de nitros… et l'apparence de la voiture.
- **Labo** : les points de recherche débloquent les pièces rares et super
  rares. Album de collection.
- **Rang d'équipe** : EXP gagnée en course (place, dépassements, drifts,
  départ parfait, rival dépassé) ; chaque rang donne argent, PR et ticket.
- **Objectifs** : une suite de 26 objectifs récompensés qui sert de tutoriel
  puis de fil conducteur.
- **Sponsors** débloqués par les fans, **événements du matin** (journal,
  colis, visiteurs, imprévus), **tombola**.
- **Courses** : collisions réelles entre voitures (rectangles orientés),
  poteaux du portique solides, pièces d'or et disquettes à ramasser, rival
  désigné, finale plus dure, chances estimées avant de courir.
- **Balade en ville** une fois par jour (une heure de jeu) : tout est solide
  (bâtiments, arbres, lampadaires, boîtes aux lettres, voitures garées) ;
  on se gare sur les zones jaunes pour entrer au Bureau des courses, à la
  Concession, chez Pièces Auto (promo du jour), à la Tombola, au Café des
  pilotes, ou rentrer au garage.
- **Bureau des courses** : 12 Grands Prix, 30 circuits générés, candidatures.
- **Sauvegarde automatique** dans le navigateur.

Les choix de conception (difficulté en dents de scie, objectifs guidés,
récompenses visibles, événements) sont expliqués dans `CONCEPTION.md`.

## Développer

```
npm install                 # une fois, à la racine du dépôt
npm run pistonville:servir  # http://localhost:8778 (les modules demandent un serveur)
npm run pistonville         # reconstruit dist/pistonville.html
```

| Dossier | Contenu |
|---|---|
| `src/` | Le moteur : circuits, rendu, physique, course, menus |
| `contenu/` | Les données : véhicules, Grands Prix, écuries, pièces, objectifs, sponsors, événements. Une mise à jour = un nouveau dossier à côté de `base/` et une ligne dans `catalogue.js` |
| `assets/` | Planche Kenney RPG Urban, voitures de profil Kenney, police Jersey 10 |
| `licences/` | Licences des polices |

## Crédits

- Graphismes : Kenney, RPG Urban Pack et Pixel Vehicle Pack (CC0) — kenney.nl
- Police : Jersey 10, The Soft Type Project Authors (SIL Open Font License 1.1)
