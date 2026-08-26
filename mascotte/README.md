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
