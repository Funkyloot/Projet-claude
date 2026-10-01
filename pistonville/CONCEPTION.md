# Pistonville — notes de conception (v0.2)

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
