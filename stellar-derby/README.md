# Stellar Derby — prototype Roblox

Un jeu de course inspiré de l'esprit d'*Uma Musume: Pretty Derby* : des
coureuses à oreilles et queue de cheval qui s'affrontent sur un hippodrome,
avec un vrai moteur de course derrière. Univers, noms et visuels originaux.

C'est la **phase 1** de la feuille de route : la course elle-même. Le pourquoi
et la suite sont dans [`docs/CONCEPTION.md`](docs/CONCEPTION.md).

**Voir une course sans Roblox** : des rediffusions calculées par le vrai
moteur sont visibles dans le navigateur, téléphone compris (page générée par
`tools/apercu.luau`, voir plus bas).

## Ce qu'il y a dedans

- **Un hippodrome entier, construit par le code** : piste en gazon tondu,
  lices, arche d'arrivée, poteaux de distance, tribune, écran géant, podium,
  étang, cerisiers. Aucun asset à importer.
- **Un moteur de course** : vitesse de base selon la distance, endurance,
  quatre stratégies, couloirs et virages, sillage, blocages, duels,
  compétences, sprint final, photo-finish au ralenti, écarts à la japonaise.
- **Des bots** qui disposent des mêmes leviers que les joueuses, et qui
  complètent toujours le peloton à 12.
- **Une partie complète** : lobby (stratégie, profil, « Prête ! »),
  présentation des partantes dans les stalles, départ au signal, course,
  podium et classement, puis la course suivante.
- **Une interface pensée pour le téléphone** : boutons sous les pouces,
  mini-carte, commentateur, indice de sprint (« Souffle pour 320 m · reste
  450 m »).
- **Ton avatar Roblox** en course, avec le kit oreilles + queue et un dossard
  aux couleurs de ton cadre.

## Ouvrir le jeu dans Roblox Studio

### Le plus simple : le fichier tout prêt

1. Récupère [`build/StellarDerby.rbxl`](build/StellarDerby.rbxl) sur un
   ordinateur (Windows ou Mac ; Roblox Studio n'existe pas sur téléphone).
2. Ouvre-le dans **Roblox Studio**. L'hippodrome est déjà là, en mode édition.
3. Appuie sur **Play** (F5). Tu apparais devant la tribune, le lobby s'ouvre,
   la course part au bout de 10 s.
4. Pour tester à plusieurs : onglet **Test → Clients and Servers**, 2 ou
   3 joueurs.

Pour le publier : **File → Publish to Roblox**, puis, dans les paramètres
du jeu, activer **Allow HTTP Requests** seulement le jour où le mode Live
arrivera (inutile aujourd'hui).

### Pour développer : Rojo

Le code vit dans `src/` et se synchronise avec Studio par
[Rojo](https://rojo.space) :

```sh
rojo serve default.project.json        # puis « Connect » dans le plugin Rojo de Studio
rojo build default.project.json -o build/StellarDerby.rbxl
lune run tools/decor build/StellarDerby.rbxl   # enregistre l'hippodrome dans la place
```

## Comment on joue

| | Clavier | Manette | Téléphone |
|---|---|---|---|
| Changer de couloir | ← → (ou A D) | croix ← → | ◀ ▶ |
| Pousser / économiser | ↑ ↓ (ou W S) | croix ↑ ↓ | Économie · Normal · Pousser |
| Départ, puis sprint | Espace | A | le gros bouton rond |
| Compétence | E | X | le bouton doré quand il apparaît |
| Caméra poursuite / TV | C | Y | 🎥 |

- **Au départ**, appuie pile au « PARTEZ ! » : départ parfait. Trop tôt :
  faux départ.
- **En course**, colle à la corde dans les virages (c'est plus court),
  profite du sillage des autres pour économiser, et évite de te faire
  enfermer.
- **En finale**, le bouton passe à « SPRINT ! » quand ton souffle te permet
  de tenir jusqu'à la ligne. Trop tôt, tu finis à bout ; trop tard, tu
  laisses des longueurs.

## Organisation

```
src/shared/Course/   le moteur de course, sans aucune API Roblox
src/shared/          réglages, couleurs, conversion mètres → studs, réseau
src/server/          boucle de partie, hippodrome, modèles, lumière
src/client/          rendu, caméras, contrôles, HUD, lobby, résultats
tests/               tests et équilibrage (Lune)
tools/               décor, rediffusions, page d'aperçu
docs/                document de conception, rapport d'équilibrage
```

Les commentaires et les noms sont en français, comme le reste du dépôt.

## Tests et outils

Tout tourne avec [Lune](https://lune-org.github.io/docs), sans Roblox.
Depuis ce dossier :

```sh
lune run tests/tests                      # 19 tests du moteur
lune run tests/equilibrage 150 --ecrire   # rapport → docs/EQUILIBRAGE.md (~5 min)
lune run tests/reglage 7 30               # auto-réglage des stratégies
lune run tools/rediffusion build/rediffusion.json
lune run tools/apercu build/rediffusion.json build/apercu.html
```

Le moteur (`src/shared/Course`) est écrit pour tourner à l'identique dans
Roblox et dans Lune : le harnais `tests/harnais.luau` reconstitue
`script.Parent:WaitForChild(...)` à partir des fichiers.

## Ce qui a été vérifié, et ce qui reste à voir dans Studio

Le prototype a été écrit sans accès à Roblox Studio. Ce qui a été vérifié :

- **Le moteur** : 19 tests (géométrie, déterminisme, absence de
  chevauchement, sprint, départs, compétences, réseau, commentaire), et des
  centaines de courses simulées pour l'équilibrage.
- **Tout le code Roblox** : vérifié en mode `--!strict` par `luau-analyze`
  contre les définitions de l'API Roblox, `require` entre modules compris.
  Cette vérification a corrigé deux API dépréciées et plusieurs erreurs de
  typage.
- **Le constructeur d'hippodrome** : réellement exécuté contre un modèle de
  données Roblox (Lune), d'où le décor déjà présent dans la place.
- **La place** : construite par Rojo, chaque script est au bon endroit et du
  bon type.

Ce qui reste à valider en jouant, dans Studio :

- le rendu et le ressenti (vitesse apparente, caméras, lisibilité du HUD sur
  téléphone) ;
- les identifiants d'animation par défaut de Roblox (dans `Config`) ;
- le chargement des avatars des joueurs (`CreateHumanoidModelFromDescriptionAsync`) ;
- le comportement réseau réel (latence, joueurs qui arrivent en cours de
  course).
