# Calme — un compagnon pixel pour souffler

Une petite app iOS pour faire redescendre la pression : un chat en pixel art
qu'on caresse, deux décors qui vivent tout seuls, et un guide de respiration.

Inspirée de deux références : une scène de forêt d'automne en parallaxe, et
l'écran de veille « ville pixel » d'une télé Roku.

## Ce qu'il y a dedans

- **Deux scènes** — une forêt d'automne à l'heure dorée (parallaxe sur trois
  plans, feuilles qui tombent, poussières dans le contre-jour) et une ville la
  nuit sous la pluie (gare, néons, bus, câbles, skyline qui clignote, horloge
  à la vraie heure).
- **Un chat** avec un vrai petit squelette : la tête suit ton doigt, il cligne
  des yeux, remue les oreilles, respire, ronronne. Il s'assoit, se met en pain,
  marche, s'étire et finit par s'endormir si on le laisse tranquille.
- **Un guide de respiration** — cohérence cardiaque, respiration carrée, ou
  4-7-8 pour s'endormir.
- **Une ambiance sonore** entièrement synthétisée en Web Audio : pluie, vent,
  ronronnement, oiseaux, carillons. Aucun fichier audio.

### Gestes

| Geste | Effet |
|---|---|
| Toucher le chat | Le caresser — cœurs et ronronnement |
| Maintenir sur le chat | Il s'installe, puis s'endort |
| Toucher ailleurs | Il vient voir |
| Glisser horizontalement | Panoramique sur le décor |

## Aucun asset téléchargé

Tout le pixel art et tous les sons sont **générés par le code**. Il n'y a ni
image ni fichier audio dans le dépôt : les décors sont dessinés pixel par pixel
à chaque image, et l'ambiance est synthétisée en temps réel.

Ce n'était pas le plan de départ — la politique réseau de l'environnement de
développement bloque `opengameart.org`, `itch.io`, `kenney.nl`, `craftpix.net`
et `pixabay.com`, donc aucun pack d'assets libre n'a pu être récupéré. Au
final c'est un avantage : zéro question de licence, l'app pèse quelques
dizaines de kilo-octets, et l'art colle exactement aux références.

## Installer sur l'iPhone

L'app est une PWA : pas besoin de Mac, ni de Xcode, ni de compte développeur.

1. Ouvrir l'URL dans **Safari** (pas Chrome — seul Safari sait installer une
   PWA sur iOS).
2. Bouton **Partager** → **« Sur l'écran d'accueil »**.
3. Elle apparaît avec son icône et s'ouvre en plein écran, sans barre de
   navigateur. Le service worker la rend utilisable sans réseau.

### Servir l'app

N'importe quel serveur de fichiers statiques suffit. En local :

```bash
cd web && python3 -m http.server 8777
```

Puis `http://<ip-de-la-machine>:8777/` depuis l'iPhone sur le même réseau.

> Attention : iOS n'installe une PWA que depuis une origine **HTTPS** (ou
> `localhost`). Sur un serveur local, il faut donc un certificat — un reverse
> proxy Caddy le fait en une ligne, ou un tunnel Cloudflare.

## Structure

```
web/                     l'app
  index.html
  styles.css
  manifest.webmanifest   métadonnées d'installation
  sw.js                  cache hors ligne
  debug-chat.html        planche de contrôle des poses du chat
  icons/                 icônes PNG générées
  js/
    pixel.js             moteur : canvas basse résolution, primitives, trames
    cat.js               le chat : rig, machine à états, interactions
    scene-forest.js      forêt d'automne
    scene-city.js        ville de nuit
    microfont.js         police 3x5 px
    audio.js             ambiance synthétisée
    ui.js                interface, respiration
    main.js              boucle, gestes, sauvegarde
tools/
  gen-icons.mjs          génère les icônes (encodeur PNG sans dépendance)
```

Régénérer les icônes :

```bash
node tools/gen-icons.mjs
```

## Assets : deux Claude, un dépôt

Le rendu procédural n'était pas un choix esthétique au départ mais une
contrainte : l'environnement de développement est derrière un proxy à liste
blanche qui bloque `opengameart.org`, `itch.io`, `kenney.nl`, `craftpix.net`
et `pixabay.com`.

Le travail est donc partagé. Un Claude tourne sur le serveur personnel, qui
a Internet en grand : il télécharge les assets libres et les dépose dans
`web/assets/`. L'autre code. GitHub sert de pont. Le brief complet est dans
[`ASSETS.md`](ASSETS.md).

`web/js/assets.js` lit `web/assets/manifest.json` au démarrage et bascule sur
les images trouvées. Tout y est facultatif :

- une entrée absente ou un fichier illisible → le rendu dessiné reste ;
- une scène dont une seule couche manque est rejetée **en entier**, pour ne
  jamais afficher un décor moitié image moitié dessin ;
- une planche de sprites qui ne couvre pas une posture du chat laisse le
  squelette reprendre la main pour celle-là ;
- une boucle sonore enregistrée remplace le bruit synthétisé de sa scène.

On peut donc remplir le manifeste morceau par morceau sans jamais casser
l'écran.

## État

Fonctionnel de bout en bout. Testé dans Chromium au format iPhone 15,
console sans erreur, les deux scènes et la respiration vérifiées à l'image.

Reste à faire :

- **Coque SwiftUI/WKWebView** pour produire un vrai binaire via Xcode. La
  PWA couvre l'usage quotidien ; ceci ne sert qu'à une éventuelle
  distribution sur l'App Store.
- **Les assets**, en attente du serveur.
- La forêt garde une bande de ciel entre la voûte et les couronnes. C'est
  discutable — ça aère et met le soleil en valeur — mais si on veut la
  fermer, il faut allonger les troncs et descendre le second rang de la
  voûte.
- La grille de fenêtres de l'immeuble au café est très régulière ; elle
  gagnerait à être irrégulière en largeur d'étage.
