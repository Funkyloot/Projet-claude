# La mascotte grise

Une petite app web : une mascotte en pixel art qui enchaîne dix activités —
elle joue de la guitare, tape au clavier, fait les courses, peint, cuisine,
lit, roule en planche, jardine, prend un café et finit par faire la sieste.
Tout est en 2D, tout est dessiné par le code.

## La mascotte

La silhouette a été **relevée pixel par pixel** sur la mascotte de référence
(la vidéo fournie), en isolant sa grille de pixels image par image :

| Relevé | Valeur |
|---|---|
| Corps | 18 × 12 px |
| Dos | incliné, un pixel de retrait par palier sur les six premières lignes |
| Yeux | deux fentes de 3 × 2 px, sixième ligne du corps |
| Pattes | quatre, 2 × 4 px, en deux paires décalées (x = 1 et 5, 11 et 15) |

Seule la palette change : **du gris** au lieu de l'orange, du plus clair sur
le dessus au plus sombre sous le ventre.

Elle n'est pas dessinée comme une image figée mais comme un petit squelette —
corps, yeux, quatre pattes indépendantes, deux bras qui pointent vers une
cible. C'est ce qui lui permet de tenir une guitare, un livre ou une tasse
sans qu'il faille redessiner un sprite par activité.

### Une perspective légère

La référence est vue de trois quarts, et tout son volume tient dans une seule
règle : **ce qui s'éloigne est plus sombre**. C'est repris tel quel.

| Élément | Rendu |
|---|---|
| Face du corps | un seul aplat, sans dégradé |
| Flanc arrière | bande de 2 px, un gris plus sombre |
| Pattes du fond | entièrement dans ce gris, décalées vers l'arrière et un pixel plus courtes |
| Pattes de devant | face claire du corps, 1 px d'ombre côté arrière |
| Bras du fond | même gris sombre, épaule reculée d'un cran |

Les bras font **2 px et reprennent la couleur du corps**, comme sur la
référence — ce ne sont pas des bâtons d'une autre teinte posés à côté. Ils
partent du poitrail, pas du museau : c'est ce qui les empêche de se lire
comme une trompe.

### Des bras de longueur réelle

Les deux segments du bras ont une longueur **fixe** : 5 px de l'épaule au
coude, 4 px du coude à la main. Le coude est placé par intersection de deux
cercles (cinématique inverse à deux os) et plie toujours vers le bas. Un bras
ne s'étire donc jamais pour atteindre quelque chose : si une cible sort du
cercle de portée, c'est la main qui s'arrête dessus.

La conséquence, c'est que **ce sont les objets qui viennent à portée**, pas
l'inverse. Chaque scène part de la position de l'épaule et pose ses
accessoires autour : la guitare se construit entre les deux mains, le clavier
se glisse sous les doigts et le bureau se cale dessus, le panier accroche sa
poignée dans la main, le plan de travail arrive à hauteur de poêle, le
guéridon monte à la hauteur où la tasse se prend. Le pinceau, lui, ajoute
6 px de manche : c'est ce qui met toute la toile à portée sans rallonger le
bras.

## La mascotte est la seule chose grise

Le décor, lui, est en couleur : bois, cuivre, émail, tissu, terre cuite.
C'est volontaire et c'est ce qui fait tenir l'image — si tout est gris, le
regard doit trier lui-même le meuble, l'objet et la mascotte, et elle perd
ce qui la détache. Là, le gris ne désigne qu'elle.

Chaque scène a son ambiance de mur, toujours sombre et peu saturée pour que
le gris ressorte devant : violet pour la salle de répète (un clin d'œil à la
bannière d'origine), bleu ardoise au bureau, brun chaud au café, bleu nuit
dans la chambre, vert au jardin.

## Ce qu'elle sait faire

`Guitare` · `Clavier` · `Magasinage` · `Café` · `Peinture` · `Lecture` ·
`Cuisine` · `Planche` · `Jardinage` · `Sieste`

Chaque activité a son décor, son rythme et sa petite histoire qui boucle :
la crêpe retombe toutes les 2,5 s, la toile se remplit puis on repart d'une
toile blanche, la fleur pousse et refleurit, un article tombe dans le panier
toutes les 3 s.

## Utilisation

| Geste | Effet |
|---|---|
| Clic sur une pastille | Choisir l'activité |
| Clic sur la scène | Activité suivante |
| ← → | Activité précédente / suivante |
| Espace | Enchaîner les activités toutes les 12 s |

L'activité en cours est retenue d'une visite à l'autre.

## Servir l'app

Aucune dépendance, aucun fichier d'image ou de son : trois fichiers JS, une
feuille de style, une page.

```bash
cd mascotte && python3 -m http.server 8777
```

## Structure

```
mascotte/
  index.html
  styles.css
  js/
    pixel.js       moteur : canvas basse résolution, primitives sans lissage
    microfont.js   police 3×5 px
    mascotte.js    la mascotte : géométrie relevée, rig, palette grise
    activites.js   les dix décors et leurs animations
    main.js        boucle, fondu tramé, interface
```

Le canvas virtuel fait environ 104 px de large et est agrandi d'un facteur
**entier** vers l'écran, lissage désactivé : les pixels restent carrés à
toutes les tailles.
