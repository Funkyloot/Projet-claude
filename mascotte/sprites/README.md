# Les planches de sprites

Tout le dessin de l'app est **tracé par le code**, il n'existait donc aucune
image. Ces planches sont un export : le code est rejoué dans un canvas
logiciel (`tools/rendu.mjs`) et chaque objet est rendu **à l'échelle 1:1,
fond transparent**, prêt à être repris dans un éditeur de pixel art.

```bash
node tools/gen-sprites.mjs      # régénère tout le dossier
```

## Ce qu'il y a dedans

| Dossier | Contenu |
|---|---|
| `mascotte/` | ses poses et ses animations, dans les deux sens |
| `objets/` | chaque objet du décor, avec ses images d'animation |
| `palette/` | les 30 couleurs de l'app, une case par teinte |
| `scenes/` | les dix scènes complètes, 8 images de 104×59 empilées |
| `apercu/` | les mêmes planches, agrandies ×6 et légendées — pour relire, pas pour éditer |

`sprites.json` donne pour chaque planche la **taille de case**, le nombre de
colonnes et de lignes, et la légende de chaque case. Toutes les cases d'une
planche font la même taille : la grille est régulière, sans marge.

## La mascotte

| Planche | Grille | Contenu |
|---|---|---|
| `debout-droite` / `-gauche` | 4 lignes × 8 colonnes, cases 26×22 | un cycle de respiration complet (≈ 3 s) pour chaque regard : ouvert, mi-clos, content, fermé |
| `marche-droite` / `-gauche` | 1 × 8, cases 26×22 | le cycle de marche complet |
| `assis-droite` / `-gauche` | 1 × 4, cases 26×22 | assise, un regard par case |
| `couche-droite` / `-gauche` | 1 × 4, cases 26×22 | couchée, la respiration du sommeil |
| `bras` | 2 × 12, cases 34×22 | le bras tendu dans douze directions : ligne 1 le bras proche, ligne 2 celui du fond |

Sa géométrie, relevée sur la référence : corps **18 × 12**, dos incliné d'un
pixel par palier sur six lignes, yeux **3 × 2**, quatre pattes **2 × 4** en
deux paires (x = 1 et 4, 11 et 14), épaule à 8 px du sol. Les bras font
5 px + 4 px, longueur fixe.

## Les objets

Un fichier par objet, une colonne par image d'animation :

`guitare` (8 images de grattage) · `ampli` (diode) · `clavier` (touche
allumée) · `ecran` (code qui défile) · `bureau` · `tabouret` · `gueridon` ·
`fauteuil` (dossier + assise) · `lit` · `couverture` · `tasse` (fumée) ·
`chariot` (article qui tombe) · `rayon` (3 variantes) · `livre` (page
tournée) · `chevalet` (8 étapes de remplissage) · `palette` ·
`plan-cuisson` (flamme) · `etagere-bocaux` · `casserole` (vapeur) · `poele`
(saut de la crêpe) · `pot-fleur` (8 étapes de pousse) · `arrosoir` (droit /
incliné) · `lampe-salon` · `lampadaire` · `voiture` · `fenetre` (pluie) ·
`note`.

## Après retouche

L'app dessine encore ces objets par le code : elle ne lit pas ces PNG. Une
fois les planches finalisées, il faut ajouter un chargeur qui les affiche à
la place du tracé procédural — les fonctions de dessin sont déjà isolées et
exportées une par une dans `js/activites.js`, donc chacune peut être
remplacée par un `drawImage` sans toucher au reste.
