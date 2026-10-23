# Stellar Derby — jeu Roblox

Un jeu de course inspiré de l'esprit d'*Uma Musume: Pretty Derby* : des
coureuses à oreilles et queue de cheval qui s'entraînent, courent et
finissent sur scène. Univers, noms, musiques et visuels originaux.

Chaque course est calculée par le serveur au moment où elle se court, avec
les commandes des joueuses : rien n'est préenregistré.

- **Ce soir sur ton PC** : [`docs/CE-SOIR.md`](docs/CE-SOIR.md), pas à pas.
- **Les assets gratuits** (modèles, sons) : [`docs/ASSETS.md`](docs/ASSETS.md).
- **Le pourquoi et la suite** : [`docs/CONCEPTION.md`](docs/CONCEPTION.md).
- **Comment c'est construit** : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Le mode Live des streameuses** : [`docs/MODE-LIVE.md`](docs/MODE-LIVE.md).

## Ce qu'il y a dedans

**Le monde.** Un archipel construit par le code : l'**Académie des Vents**
au centre (le hub où l'on apparaît : fontaine, arche, portails, ateliers,
boutique, tableaux des classements, kiosque à musique) et **trois
hippodromes** sur leurs îles — l'Archipel (prairie, cerisiers), la Baie
(plage, lanternes), les Falaises (rochers, sapins). **Douze courses**, de
1 200 à 3 200 m, plusieurs en même temps.

**La course.** Un vrai moteur : vitesse de base selon la distance,
endurance, quatre stratégies (Fusée, Ombre, Vague, Tempête), couloirs,
sillage, blocages, duels, compétences, sprint final, photo-finish au
ralenti, écarts à la japonaise. **Une course libre est égale pour toutes** :
même total de stats, même distance quel que soit le couloir, un numéro de
stalle qui ne pèse rien (mesuré), et des stratégies équilibrées course par
course.

**Les activités.**

| | |
|---|---|
| 🏇 **Courses libres** | une course en boucle sur chaque hippodrome ; le week-end, une sur trois est un Grand Prix qui rapporte double |
| 🎓 **Carrière** | un roguelite de 30 à 45 min : trois années d'entraînement, d'événements et de courses-objectifs, une rivale, puis ta coureuse devient une **Légende** qui inspire les suivantes |
| 🏋️ **Entraînement** | cinq mini-jeux, un par stat (sprint, souffle, départs, rythme, lecture de course) |
| 🎤 **Concert de la victoire** | après la course, les trois premières montent sur scène (jeu de rythme), le public agite son bâton lumineux |
| 🛍️ **Boutique** | robes, tenues portées en course, bâtons lumineux, effets de compétence — des cosmétiques, jamais de stats |
| 🏆 **Classements** | victoires, saison du mois, Légendes ; titres à gagner |
| ⚔️ **Rivales du destin** | celle qui t'a battue d'une encolure revient marquée « RIVALE » |
| ✨ **Cinématiques** | 1,5 s de mise en scène quand ta compétence se déclenche |
| 🎽 **Duo** | une amie qui regarde t'entraîne avec trois ordres au bon moment |
| 🎥 **Mode Live** | sur un serveur privé : le chat du live inscrit ses avatars, vote la course et fait ses pronostics, sans rien miser |
| 🌸 **Tutoriel** | une première course guidée, puis la visite de l'Académie |

**Pensé pour le téléphone** : boutons sous les pouces, textes lisibles, tout
accessible depuis le menu sans marcher. **Sauvegarde** par DataStore, avec
un verrou de session ; dans Studio sans accès aux API, le jeu tourne en
mémoire.

## Ouvrir le jeu dans Roblox Studio

1. Récupère [`build/StellarDerby.rbxl`](build/StellarDerby.rbxl) sur un
   ordinateur (Roblox Studio n'existe pas sur téléphone).
2. Ouvre-le dans **Roblox Studio** : l'archipel est déjà là.
3. Pour la sauvegarde : **Game Settings → Security → Enable Studio Access
   to API Services** (sinon, le jeu tourne en mémoire, sans rien garder).
4. Appuie sur **Play** (F5). Tu apparais à l'Académie ; la guide te propose
   le tutoriel.
5. À plusieurs : onglet **Test → Clients and Servers**, 2 ou 3 joueurs.

Le pas à pas complet est dans [`docs/CE-SOIR.md`](docs/CE-SOIR.md).

### Pour développer : Rojo

```sh
rojo serve default.project.json        # puis « Connect » dans le plugin Rojo de Studio
rojo build default.project.json -o build/StellarDerby.rbxl
lune run tools/decor build/StellarDerby.rbxl   # enregistre le monde dans la place
```

## Comment on joue

| | Clavier | Manette | Téléphone |
|---|---|---|---|
| Marcher (Académie) | W A S D | stick | stick |
| Changer de couloir | ← → (ou A D) | croix ← → | ◀ ▶ |
| Pousser / économiser | ↑ ↓ (ou W S) | croix ↑ ↓ | Économie · Normal · Pousser |
| Départ, puis sprint | Espace | A | le gros bouton rond |
| Compétence | E | X | le bouton doré quand il apparaît |
| Caméra poursuite / TV | C | Y | 🎥 |
| Concert, sur scène | D F J K | — | les quatre boutons |

- **Au départ**, appuie pile au « PARTEZ ! ». Trop tôt : faux départ.
- **En course**, glisse-toi dans un sillage pour économiser ton souffle, et
  évite de te faire enfermer.
- **En finale**, le bouton passe à « SPRINT ! » quand ton souffle tient
  jusqu'à la ligne.

## Organisation

```
src/shared/Course/   le moteur de course, sans aucune API Roblox
src/shared/Jeu/      la logique de jeu (sauvegarde, économie, carrière, concert…), sans API Roblox
src/shared/          réglages, couleurs, monde, réseau, robes, stalles
src/server/          le monde, les joueurs, les sessions de course, un service par fonctionnalité
src/client/          rendu, caméras, contrôles, HUD, menu de l'Académie, un écran par fonctionnalité
tests/               tests (Lune) : moteur, socle, une suite par fonctionnalité, équilibrage
tools/               décor de la place, essais, outils de développement
docs/                conception, architecture, équilibrage, assets, mode Live, plan pour ce soir
```

Les commentaires et les noms sont en français, comme le reste du dépôt.

## Tests et outils

Tout tourne avec [Lune](https://lune-org.github.io/docs), sans Roblox.
Depuis ce dossier :

```sh
lune run tests/tests          # le moteur de course
lune run tests/jeu            # sauvegarde, économie, saisons, catalogue, titres
lune run tests/entrainement   # et de même : carriere, concert, boutique, classements,
                              # rivales, duo, live, tutoriel
lune run tests/equilibrage 150 --ecrire   # rapport → docs/EQUILIBRAGE.md
lune run tests/reglage 8 90               # auto-réglage des stratégies, course par course (long)
```

`tests/carriere` fait courir des carrières entières pour vérifier la
difficulté ; `tests/live` fait courir trente partantes sur chaque
hippodrome.

## Ce qui a été vérifié, et ce qui reste à voir dans Studio

Le jeu a été écrit sans accès à Roblox Studio. Ce qui a été vérifié :

- **La logique** : 138 tests Lune (moteur, sauvegarde, économie,
  chaque fonctionnalité, entrées absurdes comprises), des centaines de
  courses simulées pour l'équilibrage et l'équité, des carrières entières
  simulées pour la difficulté.
- **Tout le code Roblox** : vérifié en mode `--!strict` par `luau-analyze`
  contre les définitions de l'API Roblox, `require` entre modules compris.
- **Le monde** : réellement construit contre un modèle de données Roblox
  (Lune), d'où le décor déjà présent dans la place.
- **Les sons et les musiques** : chaque identifiant vérifié auprès de la
  Toolbox de Roblox (éditeur et durée) — mais pas écoutés.

Ce qui reste à valider en jouant :

- le rendu et le ressenti (vitesse, caméras, lisibilité sur téléphone) ;
- les interfaces de chaque fonctionnalité (mises en page, superpositions) ;
- les mini-jeux et le jeu de rythme au doigt ;
- les animations par défaut de Roblox, les avatars et les accessoires du
  catalogue ;
- les sons (choisis sans les écouter) ;
- la sauvegarde réelle (DataStore) et le comportement à plusieurs serveurs.
