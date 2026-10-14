# Les assets : où les trouver gratuitement, et comment s'en servir

Pas besoin d'être graphiste : l'essentiel est déjà réglé par le code et par
le catalogue Roblox. Ce guide dit ce qui est fait, où trouver le reste
gratuitement, et comment l'ajouter au jeu.

## 1. Ce qui est déjà réglé

| Quoi | Comment | Où le changer |
|---|---|---|
| **Oreilles et queues** des coureuses | 10 « robes » (Noir, Bai brun, Alezan, Alezan cuivré, Isabelle, Gris perle, Rose poudré, Framboise, Prune, Bleu nuit), tirées du catalogue Roblox | `src/shared/Robes.luau` |
| **Coiffures** des bots | assorties à leur robe, deux ou trois styles par couleur, catalogue Roblox | `src/shared/Robes.luau` |
| **Tenue** des bots | maillot aux couleurs de leur cadre, collants bleu marine | `src/server/Coureuses.luau` |
| **Ton avatar** | tu cours avec ton propre avatar Roblox, plus les oreilles et la queue de la robe choisie au lobby | — |
| **Terrain** | herbe, collines tout autour, rochers, étang avec plage, taches d'herbe dense | `src/server/Hippodrome.luau` |
| **Hippodrome** | piste, lices, arche, tribune, écran géant, podium, arbres | `src/server/Hippodrome.luau` |
| **Sons** | musique de course, foule à l'arrivée, fanfare au podium | `Config.SONS` dans `src/shared/Config.luau` |

**Pourquoi le catalogue est gratuit ici.** Dans un jeu, on peut habiller
n'importe quel personnage avec un objet public du catalogue (accessoire,
coiffure, vêtement) sans l'acheter. C'est comme ça que fonctionnent les jeux
« catalogue avatar creator ». Ni toi ni les joueurs ne payez quoi que ce soit.

**Si un objet disparaît** (retiré par son créateur ou par la modération), le
jeu ne casse pas : il remet à la place des oreilles et une queue fabriquées
par le code, dans la couleur de la robe.

## 2. Où trouver des assets gratuits

### Dans Roblox Studio : la boutique (Toolbox)

C'est le plus simple, tout est déjà au bon format. Menu **View → Toolbox**.

- **Models** : arbres, rochers, buissons, bâtiments, décors entiers.
- **Audio** : des milliers de musiques et de bruitages **sous licence de
  Roblox** (éditeurs APM, ProSoundEffects…), utilisables gratuitement dans
  tous les jeux. Le bouton ▶ permet d'écouter avant de choisir.
- **Meshes, Images, Plugins**.

Trois règles pour les modèles gratuits :

1. **Créateur vérifié** (badge bleu) et beaucoup de votes positifs.
2. **Jamais dans ServerScriptService.** Un modèle gratuit peut cacher un
   script malveillant (une « backdoor ») qui donne le contrôle du jeu à
   quelqu'un d'autre.
3. **Passe le contrôle** `tools/studio/controle-modeles.lua` après chaque
   insertion (voir [CE-SOIR.md](CE-SOIR.md)). De son côté, le jeu retire
   tout script des modèles qu'il pose à partir de `ServerStorage.Ressources`.

### Sélection déjà vérifiée pour Stellar Derby

Tous de créateurs vérifiés et bien notés, miniatures vérifiées. Pour les
trouver : Toolbox → Models → coller le numéro dans la recherche, ou ouvrir
`https://create.roblox.com/store/asset/<numéro>`.

| Dossier de dépôt | Modèle | Numéro | Créateur | Votes |
|---|---|---|---|---|
| `Ressources/Arbres` | Cherry Blossom Tree (cerisier) | 10586979345 | TheLunar_Mothz | 1 000, 98 % |
| `Ressources/Arbres` | Falling Blossom Cherry Tree | 8651908577 | softlypoetic | 100, 96 % |
| `Ressources/Arbres` | Low Poly Tree | 4893246329 | Abishpc | 1 000, 93 % |
| `Ressources/Arbres` | Low-Poly Tree | 3287226226 | akbarbinta | 600, 95 % |
| `Ressources/Arbres` | Low poly pine tree (sapin) | 5616880673 | smartycar23 | 80, 98 % |
| `Ressources/Buissons` | Pink Flower Bush | 8174229353 | Unlimitens | 400, 97 % |
| `Ressources/Buissons` | Flower Bush | 8344171779 | Woof_HDPlay | 300, 95 % |
| `Ressources/Buissons` | Bush | 8647777369 | Seespotbyte | 2 000, 93 % |
| `Ressources/Buissons` | Fern Bush (fougère) | 7979002756 | TheLegoGuy137 | 70, 96 % |
| `Ressources/Rochers` | Rock | 4038061999 | FinisMaps | 800, 94 % |
| `Ressources/Rochers` | Realistic Rock | 1192366796 | woahitsdylx | 1 000, 94 % |

Les sons déjà choisis (bibliothèque Roblox, gratuits pour tous) :

| Moment | Titre | Numéro |
|---|---|---|
| Pendant la course | Here Comes The Winner 2 (APM) | 1845636153 |
| Arrivée de la gagnante | Crowd Cheer And Applause 1 (ProSoundEffects) | 9112766176 |
| Podium | Victory Fanfare (APM) | 1836490503 |

Je ne les ai pas écoutés : écoute-les dans la Toolbox ce soir et remplace
ceux qui ne te plaisent pas.

### Sur le site Roblox : le catalogue d'avatar

[roblox.com/catalog](https://www.roblox.com/catalog) : accessoires, coiffures
et vêtements. Pour changer une oreille, une queue ou une coiffure, ouvre
l'objet et copie le numéro de son adresse
(`roblox.com/catalog/123456789/...`) dans `src/shared/Robes.luau`.

**Attention aux objets au nom d'un personnage d'Uma Musume** (« Special
Week », « Tokai Teio »…) : ce sont des créations de fans qui utilisent une
marque protégée, et ils peuvent être retirés à tout moment. Ceux qu'on
utilise portent des noms génériques (« Horse Ears », « Horse Tail »).

### Plus tard, pour un style unique : les sites de ressources libres

Ces sites proposent des modèles 3D, des textures et des sons qu'on peut
utiliser gratuitement, même dans un jeu qui rapporte de l'argent :

| Site | Contenu | Licence |
|---|---|---|
| [Kenney](https://kenney.nl/assets) | kits 3D low-poly (nature, course, villes), interfaces, sons | CC0 : tout permis, rien à citer |
| [Quaternius](https://quaternius.com) | modèles low-poly (nature, animaux, personnages) | CC0 |
| [Poly Haven](https://polyhaven.com) | textures, ciels, modèles réalistes | CC0 |
| [ambientCG](https://ambientcg.com) | textures (herbe, terre, sable…) | CC0 |
| [Freesound](https://freesound.org) | bruitages | **à vérifier son par son** : CC0, ou CC-BY (il faut alors citer l'auteur) |
| [OpenGameArt](https://opengameart.org) | de tout | **à vérifier objet par objet** |

Pour les faire entrer dans Roblox :

- **Modèles 3D** (.fbx, .obj, .gltf) : Studio → **File → Import 3D**.
- **Images et textures** : Studio → **Asset Manager → Import**. Une texture
  d'herbe peut devenir un `MaterialVariant` pour la piste.
- **Sons** : Asset Manager, ou create.roblox.com. Les envois de sons sont
  limités chaque mois.

## 3. Deux règles de Roblox à connaître

- **Animations** : un jeu ne peut jouer que les animations de Roblox ou
  celles qui appartiennent au créateur du jeu (toi ou ton groupe). Une
  animation gratuite trouvée dans la Toolbox doit donc être republiée sous
  ton compte. Stellar Derby utilise les animations par défaut de Roblox,
  autorisées partout.
- **Sons** : seuls les sons publics de la bibliothèque Roblox, ou ceux que tu
  envoies toi-même, sont jouables dans ton jeu.

## 4. Les licences, en résumé

| Licence | Ce qu'on peut faire | Ce qu'on doit faire |
|---|---|---|
| **CC0** | tout, même vendre | rien |
| **CC-BY** | tout, même vendre | citer l'auteur (un écran « Crédits ») |
| **CC-BY-NC** | usage non commercial seulement | à éviter si le jeu vend des cosmétiques |
| **Boutique Roblox** | l'utiliser dans un jeu Roblox | rien |
| **Catalogue Roblox** | en habiller les personnages du jeu | rien |
