# Pistonville — notes de conception (v0.4)

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

## 10. Le garage à construire (v0.4)

Ce que font les jeux de gestion de référence, et ce qu'on en garde :

- **Terrain en cases** (Grand Prix Story 2 : terrain de 11 × 30 cases, bâtiments
  de 1 × 1 à 2 × 2, permis d'agrandissement de plus en plus chers : 5 000 →
  105 000 → 905 000). Ici : 8 colonnes, 6 rangées au départ, +2 rangées par
  permis (8 000 → 400 000 G), jusqu'à 14.
- **Bâtiments qui produisent** (GPS2 : distributeurs et cantine pour l'argent,
  laboratoires pour la recherche, bureau d'études, soufflerie et piste d'essai
  pour la conception, simulateurs par terrain). Ici : 15 bâtiments à niveaux.
- **Décor qui booste les voisins** (GPS2 : 100 % au contact, puis 50, 25,
  10 % ; Hot Springs Story : « les plantes autour augmentent la popularité » ;
  Two Point Hospital : prestige des pièces et attractivité). Ici : 9 décors,
  100 / 50 / 25 % selon la distance.
- **Combos** (Mega Mall Story : trois boutiques précises qui se touchent en
  ligne ; 31 combos à découvrir). Ici : 8 combos, cachés en « ??? » jusqu'à
  leur découverte.
- **Personnel** : métiers et stats (GPS : mécaniciens Tech / Appeal / Analysis,
  payés chaque mois, montés de niveau avec les points de recherche, petits
  gains en travaillant) ; méthodes de recrutement de plus en plus chères et
  mieux remplies (Game Dev Story : bouche-à-oreille 50 K → agent d'Hollywood
  3 500 K ; Hot Springs Story 2 : 5 000 → 500 000 G) ; potentiel S à D (GPS2 :
  « Growth » A à E) ; traits (Two Point Hospital) ; énergie et salle de repos
  qui ajoute 3 places (Hot Springs Story 2) ; salaire qui monte avec le niveau
  (Game Dev Story : ×1,2 par niveau) ; moral, et démission si on ne paie pas.
  Ici : 3 métiers, 4 méthodes, 8 traits, paie chaque semaine.
- **Menus** : barre d'onglets en bas (3 à 5 entrées, dans la zone du pouce),
  tout à un ou deux touchers, cibles tactiles de 44-48 px (Apple, Material
  Design). Le terrain occupe le centre : on touche un bâtiment pour sa fiche,
  on fait glisser pour défiler ; en construction, un fantôme vert ou rouge
  montre où le bâtiment se pose, puis « Construire ici ».

Équilibrage (simulation sur 10 saisons) : la paie devient une vraie dépense
(environ 40 000 G par semaine pour 11 employés en fin de partie), les
bâtiments de recherche concurrencent la formation du personnel pour les
points de recherche, et le terrain s'agrandit vers la saison 4-5.

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
- Structures (Grand Prix Story 2), Staff (Grand Prix Story 1 et 2) — Kairosoft Wiki (kairosoft.wiki.gg)
- Combos et compatibilité des étages (Mega Mall Story) — Kairosoft Wiki ; manuel de Mega Mall Story
- Manuel et personnel de Hot Springs Story 2 — Kairosoft Wiki ; manuel de Burger Bistro Story
- Game Dev Story : bureaux, recrutement, salaires — Kairosoft Wiki, GameFAQs
- Two Point Hospital : moral, traits, prestige des pièces — TheGamer, GameFAQs
- Theme Hospital : personnel et salaires — StrategyWiki
- Bottom navigation (Material Design) ; tailles de cibles tactiles (Apple HIG 44 pt, Material 48 dp)
