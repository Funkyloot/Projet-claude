# Pistonville — notes de conception (v0.3)

Ce que la recherche sur les jeux du genre (Kairosoft, jeux de course mobiles,
littérature de game design) a apporté, et où c'est appliqué dans le code.

## 1. Une boucle courte, une boucle longue

- **Boucle de jeu** (secondes) : tourner, drifter, doubler, ramasser. Chaque
  geste réussi produit un retour immédiat : texte flottant, son, secousse,
  public qui saute (`src/course.js`).
- **Boucle de progression** (jours) : courir → gagner argent, PR, EXP →
  pièces, labo, construction → courir plus fort. C'est la boucle « gagner /
  améliorer / gagner plus » des jeux Kairosoft.
- **Boucle de session** : un jour = un objectif visible, une balade en ville,
  une nouvelle du matin, une course.

## 2. Difficulté en dents de scie

Pas une rampe régulière : montée, puis soulagement, puis montée plus haute.
- Chaque palier de Grand Prix fait un saut de niveau (`BASE_NIVEAU`).
- Dans un Grand Prix, la **finale** est un cran plus dure ; une écurie
  **rivale** est un peu plus forte que les autres, et la dépasser rapporte.
- Le **soulagement** vient des pièces, du labo et des voitures construites :
  on revient sur un palier dominé, et on le sent.
- **Chances estimées** affichées avant de courir (Facile → Très difficile).
  Grand Prix Story 2 conseille de courir à au moins une chance sur deux.
- L'aide des adversaires (« élastique ») a été réduite : elle doit garder la
  course disputée sans tricher contre le joueur.

## 3. Premier contact

Le joueur doit jouer en moins d'une minute et gagner quelque chose tout de
suite. Les objectifs servent de tutoriel : construire ou acheter une voiture,
s'inscrire, finir une manche, monter une pièce, sortir en ville… chaque étape
est récompensée (`contenu/base/objectifs.js`). Le premier palier est réglé
pour qu'une voiture de série soit « Équilibré ».

## 4. Toujours quelque chose à découvrir

- Pièces de trois raretés, dont les effets se voient sur la voiture.
- Album de collection (23 cases, les inconnues en « ? »).
- Labo à niveaux, sponsors débloqués par les fans, voitures de classe
  supérieure, licences.
- Événements du matin tirés au hasard (`contenu/base/evenements.js`).
- Bonus de première victoire sur chaque circuit.

## 5. Récompenses : visibles, mais honnêtes

Les récompenses aléatoires (caisses de butin, tombola) sont puissantes mais
proches des jeux d'argent quand on en abuse. Ici : aucune n'est payante, les
tickets se gagnent en jouant, et les lots possibles sont affichés.

## 6. « Juice »

Compteurs qui défilent, jauges qui se remplissent, étoiles qui tombent,
confettis, caisse qui brille selon la rareté, secousse d'écran sur les chocs,
sons courts synthétisés. Rien de tout cela ne change les règles : ça rend
chaque gain lisible.

## 7. Durée de vie (v0.3)

Repère : *Grand Prix Story* se finit en ~11 h, ~24 h pour tout faire. Les
jeux Kairosoft durent un nombre d'années fixé, notent le joueur à la fin,
laissent continuer, et proposent de recommencer en gardant certains acquis.

- **Carrière de 10 saisons** de 28 jours (~280 jours, ~10-12 h). Au-delà, on
  peut continuer ; ou lancer une **Nouvelle carrière+** qui garde le labo,
  l'album, les médailles, le pilote, et donne un héritage en argent.
- **Cérémonie des Pistons d'Or** à chaque fin de saison : 5 prix, des
  écuries rivales en lice, des exigences qui montent de saison en saison.
- **Médailles de circuit** (bronze, argent, or au meilleur tour) sur
  48 circuits : 144 médailles, la maîtrise se mesure.
- **Pilote** qui monte de niveau ; à chaque niveau, un point à placer
  (technique, sang-froid, charisme) : un style à soi.
- **Niveaux de pièces** (+1 à +5), **plafond par classe** de voiture,
  **installations du garage** : des dépenses ambitieuses pour la fin de partie,
  sinon l'argent s'entasse et plus rien n'a de valeur (économie des jeux de
  gestion : des « puits » à chaque étape).
- **13 voitures** de D à S, **18 Grands Prix**.

Équilibrage vérifié par simulation (`simu.mjs`, un joueur faible, moyen et
fort sur 10 saisons) : elle a trouvé un **blocage** (une voiture B exigeait la
licence B, qui exigeait une voiture B) et l'absence de voitures A et S, tous
deux corrigés. Joueur moyen : licence C en saison 1, B en saison 2-3, A en
saison 4-5, S en saison 6-7 ; environ la moitié des Pistons d'Or.

## 8. Donner envie de revenir

- **Boucles ouvertes** (effet Zeigarnik) : l'écran titre résume ce qui
  attend (Grand Prix en cours, candidatures, objectif à moitié fait, points
  de pilote à placer).
- **Cadeau du jour** sur 7 jours, au vrai calendrier, **sans série à
  perdre** : manquer un jour ne remet rien à zéro. Le modèle Octalysis range
  la peur de perdre dans les leviers « chapeau noir » qui épuisent les
  joueurs ; on reste du côté « chapeau blanc » (progrès, création,
  possession).
- Objectifs, médailles, album, affiches de la ville : toujours une case vide
  à remplir.

## 9. La ville (v0.3)

Plus grande (6 × 6 pâtés, centre, résidentiel, parcs, port) et vivante :
circulation à droite avec feux décalés, voitures qui s'arrêtent derrière les
autres et klaxonnent, piétons, coucher de soleil, lampadaires. Comme dans
*Burnout Paradise*, on lance un défi en roulant dessus : sprints à points de
contrôle, livraisons de colis fragiles, arène de drift avec médailles, radars
de vitesse (records), affiches cachées. Les contraintes : le temps (une heure
de jeu), les constats d'accrochage qui abîment la voiture avant la course du
soir, les amendes des caméras de feu rouge, les fans perdus quand on fonce
sur les piétons. Un point d'intérêt toutes les 60 à 120 secondes de route,
comme le conseillent les guides de conception de mondes ouverts.

## Sources consultées

- Kairosoft Games: Progression Mastered — entertainmentanalytical.blog
- Curves are the real game design language — dev.to
- Difficulty curves: how to get the right balance — gamedeveloper.com
- Flow Theory in Game Design — medium.com
- Compulsion loop — Wikipedia ; Reward Schedules and When to Use Them — gamedeveloper.com
- Juice it or Lose it (Jonasson, Purho, 2012) — résumés en ligne
- Grand Prix Story / Grand Prix Story 2 — guides LevelWinner, Pocket Gamer, wikis Kairosoft
- Smashy Road — fiches et analyses de jeu
- First-Time User Experience in Mobile Games — Udonis, Supersonic
- Self-Determination Theory (Ryan, Rigby, Przybylski 2006)
- Endgame — Kairosoft Wiki (kairosoft.wiki.gg) ; Grand Prix Story, durées — dekudeals
- Mobile Game Retention (AppFollow) ; Retention benchmarks D1/D7/D30
- Octalysis Framework (Yu-kai Chou) ; Hooked (Nir Eyal) ; How Hooked Model Shapes Game Habits (Adrian Crook)
- The Zeigarnik Effect and Quest Logs (Psychology of Games) ; Why we play again (guul.games)
- Economy Design in Simulation Games (Althera Games) ; game economy sinks and faucets
- Designing New Game Plus (Red Hare Games) ; Grand Prix Story reviews (JayIsGames, Gamezebo)
- How Burnout Paradise made open-world racing irresistible (Traxion) ; Open World Design: Pacing (StraySpark)
- Building a Traffic Simulator (Rob Righter)
