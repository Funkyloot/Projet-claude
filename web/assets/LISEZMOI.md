# Dossier des assets

Vide au départ, et c'est normal : l'app se dessine entièrement toute seule.

Ce dossier est le point de dépôt des assets libres téléchargés par le Claude
qui tourne sur le serveur — l'environnement de développement de l'autre
Claude est derrière une liste blanche qui bloque les sites d'assets.

**Le brief complet est dans `ASSETS.md`, à la racine du dépôt.**

## Fonctionnement

`manifest.json` est le contrat. Le moteur le lit au démarrage :

- une entrée absente ou un fichier qui ne charge pas → rendu dessiné conservé ;
- une scène dont **une seule** couche manque est rejetée en entier, pour
  éviter un décor à moitié image et à moitié dessin ;
- rien ne casse jamais l'écran.

On peut donc remplir le manifeste petit à petit, en testant à chaque ajout.

## Arborescence

```
foret/    couches du décor forêt (PNG, répétables horizontalement)
ville/    couches du décor ville
chat/     planche(s) de sprites
audio/    boucles .ogg
police/   fichier .woff2 ou .ttf
```

Et `CREDITS.md` à créer ici, avec une ligne par fichier :

```
- foret/ciel.png — « Nom du pack » par Auteur — CC0 — https://lien
```
