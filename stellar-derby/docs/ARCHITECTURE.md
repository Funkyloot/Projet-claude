# Stellar Derby — architecture du jeu complet

Ce document décrit comment le jeu est construit et comment y brancher une
fonctionnalité. Pour la vision et les règles du jeu, voir
[`CONCEPTION.md`](CONCEPTION.md).

## 1. Vue d'ensemble

**Le monde** est un archipel :
- **l'Académie** (le hub) au centre, où l'on apparaît ;
- **trois hippodromes** sur leurs îles :
  - l'Archipel (prairie, cerisiers, étang) ;
  - la Baie (plage, palmiers, lanternes) ;
  - les Falaises (rochers, sapins).
- **la mer** autour de tout.

Tout est bâti par le code (`server/Academie`, `server/Hippodrome`). L'outil
`tools/decor` l'enregistre dans la place pour qu'on le voie dans Studio.

**Les courses** sont des *sessions* (`server/Sessions`), et plusieurs
tournent en même temps :

| Session | Qui la crée | Particularité |
|---|---|---|
| Course libre | `CoursesPubliques`, une en boucle par hippodrome | égale pour toutes (3 000 points de stats) |
| Carrière | `ServiceCarriere` | contre des bots du niveau de la coureuse |
| Tutoriel | `ServiceTutoriel` | première course guidée |
| Live | `ModeLive` | serveur privé de streamer, jusqu'à 30 partantes |

Le moteur (`shared/Course`) est inchangé : une simulation par session, à
30 pas par seconde, sur le serveur.

**Ce que voit un joueur** : la session qu'il regarde (attribut `Session`),
ou rien s'il est à l'Académie.
- Les modèles des coureuses sont publiés dans le dossier de la session
  (`ReplicatedStorage.Reseau.Sessions.<id>.Modeles`), hors du monde.
- Chaque client qui regarde en fait une copie locale et la fait courir.
- Deux courses sur le même hippodrome ne se voient donc pas.
- Les stalles et la lumière (météo) sont aussi bâties ou appliquées par
  le client.

**Les données** : une sauvegarde par joueur (`shared/Jeu/Schema`), chargée
par `server/Donnees`, avec un verrou de session. `server/Profils` la tient
pendant la partie, l'envoie au client et branche les requêtes.

## 2. Arborescence

```
src/shared/            (ReplicatedStorage.Partage)
  Course/              moteur pur (aucune API Roblox) : Piste, Pistes (les 3 hippodromes),
                       Courses (12 courses), Formules, Strategies, Competences, Simulation,
                       IA, Peloton, Paquet, Commentaire, Aleatoire
  Jeu/                 logique de jeu pure (aucune API Roblox), testée avec Lune :
                       Schema (sauvegarde), Economie, Saisons, + une par fonctionnalité
  Ambiance             lumière selon la météo (appliquée par le client)
  Config, Couleurs     réglages, palette
  Construction         briques de décor (pièces, étiquettes, invites)
  Monde                repères des hippodromes (mètres → studs), Académie
  Reseau               canaux, types partagés
  Robes                robes du catalogue
  Stalles              stalles de départ (bâties par le client)
src/server/            (ServerScriptService.Serveur)
  Principal.server     démarrage
  Academie, Hippodrome, Habillage, Lieux       le monde
  Donnees, Profils, Recompenses                les joueurs
  Sessions, CoursesPubliques, Coureuses        les courses
  Service*, Classements, ModeLive              les fonctionnalités
src/client/            (StarterPlayer.StarterPlayerScripts.Client)
  Principal.client     démarrage
  Etat, Rendu, Camera, Controles, Hud, MiniCarte, Commentateur, Lobby, Resultats,
  Ecran, Effets, Sons                          la course
  Menu, EcranCourses, Profil, Requetes, Notifications, Interactions, Ui   l'Académie
  Ecran*, Tutoriel, Cinematique, PanneauLive   les fonctionnalités
tests/                 tests Lune : tests (moteur), jeu (socle), <fonctionnalité>.luau
tools/                 decor (bâtit le monde dans la place), essai-habillage, outils de dev
```

## 3. Conventions

**Langue et style**
- Noms et commentaires en **français**.
- `--!strict` dans `src/`, `--!nocheck` dans `tests/` et `tools/`.
- Tabulations, 120 colonnes (`stylua`).

**`require`**
- Toujours par une chaîne de `WaitForChild`.
- Dans le même dossier : `require(script.Parent:WaitForChild("X"))`.
- Le partagé : `ReplicatedStorage:WaitForChild("Partage")`, puis
  `:WaitForChild("X")`.
- Modules client tous à plat dans `src/client/`.

**Logique pure**
- `shared/Course/` et `shared/Jeu/` n'utilisent **aucune API Roblox** : ni
  `game`, ni `Instance`, ni `Vector3`, ni `Color3`, ni `task`.
- Ils sont testés avec Lune par le harnais `tests/harnais.luau`.
- Une fonctionnalité met sa logique là, et ses tests dans
  `tests/<fonctionnalite>.luau`. Le fichier finit par
  `if not H.bilan() then error("des tests ont échoué") end`.

**Le serveur décide de tout**
- Le client n'envoie que des intentions :
  - les commandes de course ;
  - les requêtes.
- Chaque requête vérifie ses arguments (types, bornes, possession) et
  répond `{ ok = true, … }` ou `{ ok = false, erreur = "…" }`. Les messages
  d'erreur sont en français, lisibles par un joueur.

**Équité**
- Une course libre est égale pour toutes :
  - 3 000 points de stats ;
  - aucun bonus acheté, gagné ou prêté.
- Les bonus (stats entraînées, ordres de l'entraîneuse) n'existent qu'en
  carrière, contre l'IA.
- **Jamais de stats à acheter.**

**Univers original** : aucun nom, visuel ou musique d'*Uma Musume*, aucun
nom de vrai cheval.

## 4. Le serveur

### Profils — `server/Profils`

```lua
Profils.obtenir(joueur): Schema.Donnees?                  -- lecture seule
Profils.modifier(joueur, function(d) ... end): boolean   -- toute écriture passe par là
Profils.crediter(joueur, etoiles, xp, raison?): boolean  -- + notification, vrai si niveau franchi
Profils.attendre(joueur, delai?): Schema.Donnees?
Profils.surChargement(function(joueur, d) end)
Profils.avantDepart(function(joueur) end)                -- au départ, avant la dernière sauvegarde (sans attendre)
Profils.sauverMaintenant(joueur): boolean               -- sauvegarde tout de suite (achat en Robux)
Profils.surRequete("nom.action", function(joueur, args) return { ok = true } end)
Profils.notifier(joueur, texte, genre?)                  -- genre : info, gain, niveau, alerte, titre
Profils.notifierTous(texte, genre?)
Profils.signal(joueur, nom, donnees)                     -- message de fonctionnalité au client
```

**Noms de requêtes** : `<fonctionnalité>.<action>`, par exemple
`boutique.acheter`, `carriere.entrainer`. Chaque nom est unique (sinon,
erreur au démarrage).

**Requêtes du socle** :

| Requête | Effet |
|---|---|
| `profil.reglages` | réglages du joueur |
| `course.rejoindre { piste, regarder? }` | rejoindre une course libre |
| `course.participer { participer }` | s'inscrire ou non au lobby |
| `course.quitter` | quitter la course libre |
| `lieu.academie` | revenir à l'Académie |

### Sessions — `server/Sessions`

```lua
local session = Sessions.creer({
	genre = "carriere",              -- "publique" | "carriere" | "tutoriel" | "live"
	titre = "Carrière de Lune · Objectif : top 3",
	piste = "baie",
	course = Courses.parId("embruns"),
	participants = { { joueur = joueur, definition = def, robe = "nuit", tenue = "academie", marque = nil } },
	bots = { ... },                  -- bots imposés (Peloton.Definition), une rivale qui revient…
	marques = { ["Brise Lunaire"] = "RIVALE" },
	taille = 12, totalBots = 2400,   -- carrière : bots au niveau de la coureuse
	concert = true,                  -- concert de la victoire après la course
	surFin = function(session, resultats) ... end,
	libererALaFin = true,            -- rendre les spectateurs à l'Académie à la fin
})
Sessions.regarder(joueur, session)   -- ce joueur regarde (et commande sa coureuse s'il en a une)
Sessions.regarder(joueur, nil)       -- retour à l'Académie (interface)
Sessions.attendre(session)           -- attend la fin
Sessions.terminer(session)           -- arrête tout de suite
Sessions.deJoueur(joueur)            -- la session regardée
Sessions.participe(session, joueur)
Sessions.changerPhase(session, phase, duree?)
Sessions.diffuser(session, nom, donnees)          -- Profils.signal à tous les spectateurs
Sessions.surFin(function(session, resultats) end)  -- après chaque course
Sessions.surCommande("genre", function(session, joueur, valeur) end)  -- commande nouvelle
Sessions.definirConcert(function(session) end)     -- joue le concert (bloquant)
```

**Champs utiles d'une session** :
- `id`, `options`, `phase`, `dossier` (attributs répliqués), `simulation` ;
- `spectateurs` (`{[Player]: true}`) ;
- `coureuseDe` (`{[Player]: id}`) et `joueurDe` (`{[id]: Player}`) ;
- `resultats` ;
- `donnees` : une table libre pour les fonctionnalités.

**Déroulé** : lobby (ou 3 s de mise en place) → presentation → stalles →
course → resultats (8 s s'il y a un concert, 14 s sinon) → concert → fin.

Les participantes imposées sont en tête des définitions : la première a
l'identifiant 1, etc. Les stalles, elles, sont tirées au sort.

**La simulation**, pour les effets venus d'ailleurs que des compétences :
```lua
session.simulation:appliquerEffet(id, { genre = "vitesse", valeur = 0.2, duree = 2 }, "entraineuse")
```
Genres : "vitesse" (m/s), "acceleration" (m/s²), "endurance" (fraction de
l'endurance max). La simulation émet `{ genre = "bonus", id, source }`.

### Le reste

| Module | Ce qu'il offre |
|---|---|
| `Lieux` | `versAcademie(joueur)`, `versTribune(joueur, piste)`, `vers(joueur, cframe)` |
| `Coureuses.surCreation(function(modele, fiche) end)` | une touche sur chaque modèle de coureuse (tenue…). `fiche.tenue` est la tenue équipée. |
| `Hippodrome.reperes(piste)` | `{ podium, ecran, tribune, scene }`. La scène a `Plateau`, `Place1..3`, `Fosse`, `VueCamera`. |
| `Academie.reperes()` | `{ racine, apparition }` |
| `Recompenses` | branché sur `Sessions.surFin` : étoiles, XP, statistiques et points de saison de chaque joueuse qui a couru |

**Ce que contient l'Académie** (`Workspace.Academie`) :
- `Place` : fontaine, `Apparition`, la guide ;
- `Portails/Portail_<piste>` ;
- `CentreEntrainement/Atelier_<stat>` ;
- `BureauCarrieres`, `Boutique` ;
- `Classements/Tableau_victoires|Tableau_saison|Tableau_legendes` : des
  pièces à habiller d'une SurfaceGui, face avant ;
- `Decor`.

## 5. Le client

**Etat** — la course regardée :
- les champs : `phase` (`"aucune"` à l'Académie), `genre`, `titre`,
  `pisteId`, `course()`, `repere()`, `peloton`, `parId`, `monId`, `moi()`,
  `resultats`, `regarde()`, `enCourse()`, `modeles()` ;
- les signaux, avec `Etat.ecouter(signal, fonction)` : `session`, `phase`,
  `peloton`, `resultats`, `evenements`, `monId`, `course`.

**Rendu** :
- `Rendu.affiche[id]` : ce qui est montré à cette image ;
- `Rendu.modeleDe(id)` ;
- `Rendu.poser(id, cframe, fete)` : poser une coureuse (scène, podium) ;
- `Rendu.hippodrome()` : le dossier de l'hippodrome regardé.

**Camera** : `Camera.prendre(function(dt, camera) ... return encore end)`
pour filmer un moment (cinématique, mini-jeu).

**Menu** :

| Fonction | Rôle |
|---|---|
| `Menu.ajouter({ id, icone, texte, ordre, ouvrir })` | un bouton dans la rangée de l'Académie |
| `Menu.ouvrir(panneau)` | ouvre un panneau, un seul à la fois |
| `Menu.fermer()` | ferme les panneaux |
| `Menu.masquer()` | cache le menu (mini-jeu plein écran) ; renvoie la fonction pour le rendre |
| `Menu.ecran()` | la ScreenGui commune |

Ordres pris : Courir 10, Carrière 20, Entraînement 30, Boutique 40,
Classements 50, Profil 60, Duo 70, Live 80 (la streameuse seulement).

**Ui** :
- `Ui.panneau(parent, nom, titre, taille, surFermeture?)` renvoie
  `panneau, contenu` (le contenu défile) ;
- et les briques `cadre`, `texte`, `bouton`, `coins`, `contour`, `marges`,
  `liste`.

**Profil** (lecture seule) : `Profil.donnees`, `Profil.ecouter(fonction)`,
`Profil.niveau()`, `Profil.possede(categorie, id)`.

**Les autres** :

| Module | Fonction |
|---|---|
| `Requetes` | `Requetes.envoyer(nom, args)` attend la réponse : à appeler depuis un clic |
| `Notifications` | `Notifications.afficher(texte, genre?)` |
| `Interactions` | `Interactions.surAction("boutique", function(argument) end)` ; `Interactions.declencher("carriere")` |
| Signaux de fonctionnalité | `Reseau.signal().OnClientEvent:Connect(function(nom, donnees) ... end)` |
| Commandes de course | `Reseau.commande():FireServer(genre, valeur)` |

**Interface** : dessinée pour 1280 × 720, mise à l'échelle. Penser
téléphone d'abord :
- gros boutons (au moins 44 px) ;
- textes d'au moins 14 px ;
- rien d'indispensable au survol.

## 6. Catalogues partagés et contrats entre fonctionnalités

| Catalogue | Contenu |
|---|---|
| `shared/Jeu/Catalogue` | tout ce qui se possède : robes, tenues, bâtons, effets. Prix, niveau requis, couleurs `{ r, g, b }`. La boutique les vend, le concert lit la couleur du bâton équipé, les cinématiques lisent l'effet équipé, les tenues sont dessinées par `Coureuses.surCreation`. |
| `shared/Jeu/Titres` | les titres. `Titres.nouveaux(d)` donne les titres à condition désormais mérités. `Titres.donner(d, id, os.time())` accorde un titre donné par un service (par exemple « destin » quand on bat une rivale). |

**Qui accorde quel titre** :
- les titres à condition : ServiceRivales, régulièrement ;
- « grandprix » : Recompenses ;
- « saison » : Classements ;
- « streameuse » : ModeLive ;
- « destin » : ServiceRivales.

**Contrat entraînement ↔ carrière** :
- `ServiceEntrainement.definirCarriere(fonction(joueur, stat, qualite) -> table?)` :
  la carrière branche ici le gain de stats d'un tour d'entraînement. Ce que
  la fonction renvoie est ajouté à la réponse de `entrainement.terminer` ;
  nil refuse l'entraînement en carrière.
- Côté client, `EcranEntrainement.jouer(stat, "carriere")` joue le
  mini-jeu et renvoie la réponse du serveur, ou nil si le joueur
  abandonne.

## 7. Le réseau

Voir l'en-tête de `shared/Reseau.luau` : canaux, attributs d'une session
et du joueur.

Une fonctionnalité qui a besoin d'un état partagé par session peut poser
ses propres attributs sur `session.dossier`, avec un nom à elle
(`Concert`, `Duo`…), en JSON si c'est une table.

## 8. La sauvegarde

Les champs sont décrits dans `shared/Jeu/Schema.luau`.

**À qui est quoi** :

| Champs | Fonctionnalité |
|---|---|
| `etoiles`, `xp` | tout le monde, via `Profils.crediter` |
| `equipement`, `possessions` | boutique |
| `titres` | rivales et titres |
| `stats` | chacun ses compteurs |
| `rivales` | rivales |
| `carriere` (table libre, validée par `Jeu/Carriere`), `legendes` | carrière |
| `tutoriel` | tutoriel |
| `saison` | classements, et Recompenses pour les points |
| `reglages` | socle |
| `achats` | boutique (reçus Robux déjà crédités, écrits avec les étoiles) |

**Si une fonctionnalité a besoin d'un champ nouveau** :
1. l'ajouter à `Schema.nouveau()` et à `Schema.nettoyer()` ;
2. ajouter un test dans `tests/jeu.luau`.

## 9. Vérifier

Depuis `stellar-derby/` :

```sh
lune run tests/tests                 # moteur
lune run tests/jeu                   # socle
lune run tests/<fonctionnalite>      # chaque fonctionnalité
stylua src tests tools               # formatage
rojo build default.project.json -o build/StellarDerby.rbxl && lune run tools/decor build/StellarDerby.rbxl
lune run tools/essai-habillage build/StellarDerby.rbxl
```

**Vérification de types** : `luau-lsp analyze` (ou l'outil de la session
de développement) en mode strict, avec les définitions Roblox et le
sourcemap Rojo.

## 10. Les fonctionnalités

Chaque fonctionnalité a sa logique pure dans `shared/Jeu/<Module>`, testée
par `tests/<fonctionnalite>.luau`, un service serveur et un écran client.

| Fonctionnalité | Logique pure | Serveur | Client |
|---|---|---|---|
| Entraînement (5 mini-jeux) | `Jeu/Entrainement` | `ServiceEntrainement` | `EcranEntrainement`, `EntrainementJeux` |
| Carrière, événements, Légendes | `Jeu/Carriere`, `Jeu/Evenements` | `ServiceCarriere` | `EcranCarriere`, `CarriereCreation` |
| Concert de la victoire | `Jeu/Concert` | `ServiceConcert` | `EcranConcert` |
| Boutique, garde-robe, profil | `Jeu/Boutique` | `ServiceBoutique`, `Tenues` | `EcranBoutique`, `EcranProfil` |
| Classements et saison | `Jeu/Classement` | `Classements` | `EcranClassements` |
| Rivales, titres, cinématiques | `Jeu/Rivales`, `Jeu/Titres` | `ServiceRivales` | `Cinematique`, `RivalesMarques` |
| Duo entraîneuse–coureuse | `Jeu/Duo` | `ServiceDuo` | `EcranDuo` |
| Mode Live | `Jeu/Live` | `ModeLive` | `PanneauLive` (voir `MODE-LIVE.md`) |
| Tutoriel | `Jeu/Tutoriel` | `ServiceTutoriel` | `Tutoriel` |
| Sons et ambiances | — | — | `Sons` (`Sons.jouer(nom)`) |

### Requêtes, commandes et signaux

| Fonctionnalité | Requêtes (client → serveur) | Commandes de course | Signaux (serveur → client) |
|---|---|---|---|
| Entraînement | `entrainement.commencer { jeu, mode }`, `.terminer { jeton, note }`, `.abandonner`, `.etat` | — | — |
| Carrière | `carriere.etat`, `.creer {…}`, `.action { action }`, `.choix { choix }`, `.courir`, `.abandonner` | — | `carriere.retour`, `carriere.fin` |
| Concert | — | `concert.note`, `concert.ovation` | `concert.bilan` |
| Boutique | `boutique.acheter`, `boutique.equiper { categorie, id }`, `boutique.pack { id }`, `profil.titre { id }` | — | — |
| Duo | `duo.entrainer { coureuseId }`, `duo.regarder { userId }`, `duo.arreter` | `duo.ordre` | `duo.debut`, `duo.ordre`, `duo.verdict` |
| Live | `live.etat`, `.ajouter`, `.retirer`, `.vote`, `.lancer`, `.message` (streameuse), `live.rejoindre` | — | `live.classement` |
| Tutoriel | `tutoriel.commencer`, `.etape`, `.passer`, `.finir` | — | `tutoriel.proposer`, `tutoriel.academie` |

### Attributs publiés

| Où | Attribut | Contenu |
|---|---|---|
| dossier de session | `Concert` | JSON : chanson, graine, début, durée, artistes, noms |
| dossier de session | `ConcertAmbiance` | l'ambiance de la salle, 0 à 1 |
| dossier de session | `Duo` | JSON : qui entraîne qui |
| `Reseau.monde()` | `Classements`, `Saison`, `NomSaison`, `Weekend` | les tops 10 (JSON) et la saison |
| `Reseau.monde()` | `Live` | JSON : invitées, vote, pronostics, classement (mode Live) |
| joueur | `Streameuse` | vrai pour la streameuse du mode Live |

### Équilibrage des stratégies

Le coefficient de finale de chaque stratégie dépend de la course
(`Strategies.FINALES` dans `Course/Strategies`, avec un repli par catégorie
dans `finale`). Le moteur et le HUD prennent la stratégie par
`Strategies.pour(id, course)`. Les valeurs sortent de
`lune run tests/reglage` (graines distinctes de celles du rapport) ; le
rapport est dans `EQUILIBRAGE.md`.

### Les crochets ajoutés au socle

- `Profils.avantDepart` : la carrière y fait finir par l'IA une course
  quittée en route (le résultat compte), les classements y écrivent les
  dernières valeurs.
- `Profils.sauverMaintenant` : un achat en Robux n'est accordé qu'une fois
  la sauvegarde écrite.
- `Sessions` : l'option `dureeLobby`, et un lobby qui part même sans
  inscrite quand des partantes sont imposées (les invitées du mode Live).

