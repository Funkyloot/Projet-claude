# Brief : récupérer les assets libres

> **Pour le Claude qui tourne sur le serveur.**
> Ce fichier est ta commande de travail. Le Claude qui développe l'app est
> derrière un proxy à liste blanche : `itch.io`, `opengameart.org`,
> `kenney.nl`, `craftpix.net` et `pixabay.com` lui sont tous bloqués. Toi
> non. D'où le partage : tu télécharges, il code.

## Ce qu'on cherche

L'app est une petite scène pixel art anti-stress : un chat qu'on caresse,
deux décors qui vivent (une forêt d'automne à l'heure dorée, une ville la
nuit sous la pluie), et un guide de respiration.

Aujourd'hui **tout est dessiné par le code**. On veut le remplacer par de
vrais assets, plus riches, à condition qu'ils soient libres et cohérents
entre eux.

### 1. Décor « forêt d'automne » — priorité haute

Un fond en **parallaxe multi-couches**, ambiance automne / heure dorée :
ciel chaud, montagnes lointaines, canopées orange et ocre, troncs, sol.

- Couches séparées en PNG transparent (4 à 6 couches)
- **Répétables horizontalement sans couture** — c'est indispensable, la
  scène défile en boucle
- Hauteur ≥ 320 px de préférence

Pistes connues : `ansimuz` (Parallax Forest), `edermunizz` (Free Pixel Art
Forest), `Free-Game-Assets` sur itch.io. Chercher aussi « autumn parallax
pixel art » sur OpenGameArt.

### 2. Décor « ville de nuit » — priorité haute

Même principe : skyline, immeubles, rue, dans une gamme bleu nuit / violet
avec des néons. Idéalement une gare ou des façades à arches.

Pistes : `ansimuz` (Cyberpunk Street Environment), `Free Pixel Art
Cyberpunk`, `anokolisa`.

### 3. Chat animé — priorité haute

Une **planche de sprites** avec au minimum : repos assis, marche, sommeil.
Idéalement aussi : étirement, position « pain de mie ».

- Taille de case entre 24×24 et 48×48 px
- Cases de dimensions **régulières**, disposées en grille
- Vue de côté et/ou de face, peu importe, mais reste cohérent

Chercher « cat sprite sheet pixel art free » sur itch.io et OpenGameArt.

### 4. Sons d'ambiance — priorité moyenne

Trois boucles, en `.ogg` de préférence (sinon `.mp3`) :

- pluie douce (`rain.ogg`)
- forêt / vent dans les feuilles (`forest.ogg`)
- ronronnement de chat (`purr.ogg`)

Chercher sur `freesound.org` (filtrer sur CC0) ou `pixabay.com/sound-effects`.
**Boucles propres, sans claquement au raccord.** Garder chaque fichier sous
1 Mo — l'app doit rester légère et fonctionner hors ligne.

### 5. Police pixel — priorité basse

Une police bitmap lisible en `.ttf` ou `.woff2` : `Press Start 2P`,
`m5x7`, `Silver`, ou équivalent sous licence OFL.

## Règles non négociables

1. **Licence libre et vérifiée** : CC0, CC-BY, OFL, ou « free for
   commercial use » explicite. En cas de doute, on écarte.
2. **Relever la licence exacte et l'auteur** pour chaque fichier. Un asset
   dont tu ne retrouves pas la licence ne rentre pas dans le dépôt.
3. **Rester cohérent** : mieux vaut quatre assets qui vont ensemble que
   douze qui jurent. Vérifie que les palettes se ressemblent.
4. **Pas de fichiers énormes.** Objectif : moins de 5 Mo pour l'ensemble.
   Redimensionne ou recompresse si besoin.

## Où déposer les fichiers

```
web/assets/
  foret/     couches du décor forêt
  ville/     couches du décor ville
  chat/      planche(s) de sprites
  audio/     boucles sonores
  police/    fichier de police
  CREDITS.md attributions
  manifest.json
```

## Le fichier `manifest.json`

C'est le contrat entre toi et le code. Le moteur le lit au démarrage ;
si un fichier manque ou ne charge pas, il retombe automatiquement sur le
dessin procédural existant. **Rien ne casse si le manifeste est incomplet** —
remplis seulement ce que tu as trouvé.

```json
{
  "version": 1,
  "scenes": {
    "foret": {
      "layers": [
        { "file": "foret/ciel.png",      "parallax": 0.00, "ancre": "haut" },
        { "file": "foret/montagnes.png", "parallax": 0.15, "ancre": "sol", "decalageY": -30 },
        { "file": "foret/arbres-loin.png","parallax": 0.35, "ancre": "sol", "decalageY": -10 },
        { "file": "foret/arbres-pres.png","parallax": 0.80, "ancre": "sol", "decalageY": 4 }
      ]
    },
    "ville": { "layers": [] }
  },
  "chat": {
    "planche": "chat/chat.png",
    "largeurCase": 32,
    "hauteurCase": 32,
    "animations": {
      "assis":  { "ligne": 0, "cases": 4, "ips": 6 },
      "marche": { "ligne": 1, "cases": 6, "ips": 10 },
      "dort":   { "ligne": 2, "cases": 2, "ips": 2 }
    }
  },
  "audio": {
    "foret": "audio/forest.ogg",
    "ville": "audio/rain.ogg",
    "ronron": "audio/purr.ogg"
  },
  "police": { "fichier": "police/police.woff2", "nom": "PixelUI" }
}
```

Champs :

| Champ | Sens |
|---|---|
| `parallax` | 0 = fixe au fond, 1 = défile à la vitesse du premier plan |
| `ancre` | `"haut"` (calé en haut de l'écran) ou `"sol"` (calé sur la ligne de sol) |
| `decalageY` | ajustement vertical en pixels, positif vers le bas |
| `ligne` | index de la ligne dans la planche de sprites, à partir de 0 |
| `ips` | images par seconde de l'animation |

## `CREDITS.md`

Une ligne par asset, sans exception :

```
- web/assets/foret/ciel.png — « Nom du pack » par Auteur — CC0 — https://lien-vers-la-page
```

## Pour finir

Commite et pousse sur la branche `claude/ios-stress-relief-app-napo2d` :

```bash
git add web/assets ASSETS.md
git commit -m "Assets libres : décors, chat, sons"
git push origin claude/ios-stress-relief-app-napo2d
```

Puis **résume dans ta réponse** ce que tu as trouvé et ce que tu n'as pas
trouvé — c'est ce résumé que Rudy transmettra à l'autre Claude.

## Ce que tu ne dois PAS faire

- Ne touche pas aux fichiers de `web/js/` — c'est l'autre Claude qui code.
  Vous vous marcheriez dessus dans git.
- Ne supprime pas le rendu procédural existant : il sert de secours.
- N'invente pas de licence. Si tu n'es pas sûr, note-le et écarte l'asset.
