# Ce soir, sur ton PC

Tout est prêt côté code : ce soir, il s'agit de **lancer le jeu dans Roblox
Studio**, de vérifier que tout marche en vrai, d'habiller le décor et de
jouer depuis ton téléphone. Compte une heure et demie environ.

Il te faut : ton PC avec Roblox Studio, ton compte Roblox, et ce dépôt GitHub.

---

## 1. Récupérer le jeu (5 min)

1. Sur GitHub, ouvre ton dépôt **Projet-claude**, branche
   **`claude/stellar-derby`**, dossier `stellar-derby/build/`.
2. Clique sur **`StellarDerby.rbxl`**, puis sur le bouton de téléchargement
   (**Download raw file**).
3. Double-clique sur le fichier : Roblox Studio l'ouvre. L'archipel est déjà
   là : l'Académie au centre, les trois hippodromes autour.

> Rojo n'est pas nécessaire ce soir. Il sert seulement à synchroniser le
> code du dépôt avec Studio en direct.

## 2. Allumer la sauvegarde (2 min)

**Home → Game Settings → Security → Enable Studio Access to API Services**,
puis **Save**. Sans ça, le jeu marche quand même, mais en mémoire : rien
n'est gardé d'une partie à l'autre (un message orange le dit dans Output).

> Il faut d'abord publier une fois le jeu (étape 8) pour que cette option
> soit disponible. Tu peux faire l'étape 3 avant, sans sauvegarde.

## 3. Premier essai, en solo (15 min)

**Ouvre la fenêtre Output** (View → Output), puis appuie sur **Play** (F5).
Si quelque chose cloche, les lignes **rouges** et **orange** disent
pourquoi : copie-les, fais une capture, envoie-moi les deux.

| Moment | Ce que tu dois voir |
|---|---|
| Arrivée | Tu apparais à l'Académie, face à la fontaine, sous l'arche « Académie des Vents ». Une musique douce joue. En haut, tes étoiles (300) et ton niveau ; en bas, la rangée de boutons. |
| 4 s après | La guide propose le tutoriel : **Commencer**. |
| Tutoriel | Une course guidée à l'hippodrome de l'Archipel : une bulle pour chaque geste (départ, couloirs, rythme, compétence, sprint). Puis retour à l'Académie et visite des boutons du menu. **+200 ★** à la fin. |
| Une course libre | Bouton **Courir** → un hippodrome → **Courir**. Lobby, présentation, course, podium, puis le **concert de la victoire** si tu es dans les trois premières (jeu de rythme : D F J K ou les quatre boutons), sinon tu es dans la fosse (bouton **Ovation !**). |

Coche ce qui marche (je n'ai pu rien voir moi-même) :

- [ ] tu peux **marcher** à l'Académie, jusqu'aux portails et aux ateliers ;
- [ ] les coureuses courent (animation) au lieu de glisser, pieds sur la piste ;
- [ ] les oreilles, queues et coiffures du catalogue apparaissent ;
- [ ] la vitesse donne une impression de course ;
- [ ] les boutons et textes sont lisibles, rien ne se chevauche ;
- [ ] les sons : musique de l'Académie, musique de course, sifflet du départ, foule, fanfare, clics.

## 4. Faire le tour des activités (25 min)

Tout part des boutons du bas (ou en marchant jusqu'aux lieux de l'Académie).

- [ ] **Entraînement** : les cinq mini-jeux (sprint, souffle, départs, cœur,
  lecture de course). Chacun dure 20 à 30 s ; à la fin, une note et des
  étoiles. Après dix entraînements dans la journée, les étoiles baissent :
  c'est voulu.
- [ ] **Carrière** : crée une coureuse (nom, robe, stratégie, profil), joue
  quelques tours (s'entraîner, se reposer, sortir), réponds à un événement,
  et cours la première course-objectif (tour 4). À la fin d'une carrière, ta
  coureuse devient une Légende.
- [ ] **Boutique** : achète une tenue, porte-la, puis cours une course
  libre : ton avatar doit porter une écharpe et un ruban à ses couleurs.
  Achète un bâton lumineux et regarde sa couleur au concert.
- [ ] **Classements** : les trois tableaux (ils se remplissent avec les
  vraies valeurs au bout d'une minute) ; les mêmes tops sur les tableaux de
  l'Académie.
- [ ] **Profil** : statistiques, titres (« Débutante » dès la première
  course : touche **Afficher**, il apparaît sous ton nom en haut).
- [ ] **Cinématiques** : quand ta compétence se déclenche en course,
  1,5 s de caméra qui tourne autour de toi, avec un fond coloré. Réglage
  pour les couper : ⚙️ en haut à droite.
- [ ] **Rivales** : si une coureuse te bat d'une encolure, elle devient ta
  rivale ; à la course suivante où elle est là, elle porte « RIVALE ».

## 5. Essai à plusieurs (10 min)

Onglet **Test** → **Clients and Servers** → **2 joueurs** → **Start**.

- [ ] Les deux joueuses dans la même course libre se voient.
- [ ] **Duo** : la joueuse 1 court, la joueuse 2 clique **Regarder** sur le
  même hippodrome, puis **🎽 Entraîner une coureuse** : trois gros ordres.
  La joueuse 1 voit « … t'entraîne » et les ordres en grand.
- [ ] **Concert** : celle qui n'est pas sur le podium est dans la fosse et
  fait monter l'ambiance.
- [ ] Deux courses en même temps sur deux hippodromes : chacune ne voit que
  la sienne.

## 6. Le mode Live (5 min, facultatif)

Dans l'Explorer, clique **Workspace**, puis dans Properties → Attributes →
**+** : nom `ModeLive`, type booléen, coché. Lance **Play** : un bouton
**🎥 Live** apparaît. Colle quelques pseudos Roblox (par exemple
`Roblox Builderman`), propose un vote, lance la course : les avatars de ces
comptes courent. Tout est expliqué dans [MODE-LIVE.md](MODE-LIVE.md).
Enlève l'attribut ensuite.

## 7. Habiller le décor (15 min)

1. **View → Toolbox**, onglet **Models**.
2. Colle un numéro de la liste de [ASSETS.md](ASSETS.md) dans la recherche
   (par exemple `10586979345`, le cerisier), clique dessus : il apparaît dans
   le Workspace.
3. Dans l'**Explorer**, fais-le glisser dans
   **ServerStorage → Ressources → Arbres**. Pareil avec des arbres verts,
   des buissons (dans **Buissons**) et des rochers (dans **Rochers**).
4. **Contrôle de sécurité** : ouvre `tools/studio/controle-modeles.lua`,
   copie tout, colle-le dans la **barre de commande** (View → Command Bar),
   Entrée. Si une ligne **[SUSPECT]** apparaît, supprime le modèle concerné.
5. **Aperçu sans lancer le jeu**, dans la barre de commande :

   ```lua
   require(game.ServerScriptService.Serveur.Habillage).appliquer()
   ```

   Les arbres en boules sont remplacés par tes modèles, sur les trois
   hippodromes et à l'Académie. Si le résultat ne te plaît pas : Ctrl+Z.
6. **File → Save**.

## 8. Jouer sur ton téléphone (10 min)

1. **File → Publish to Roblox** → **Create new experience**, nom par exemple
   « Stellar Derby (test) ». Elle reste **privée**.
2. Reviens à l'étape 2 et allume la sauvegarde.
3. Sur [create.roblox.com](https://create.roblox.com/dashboard/creations),
   ouvre l'expérience, puis **View on Roblox**, et copie le lien.
4. Ouvre ce lien sur ton téléphone : bouton **Jouer** dans l'appli Roblox.

C'est le vrai test pour l'interface tactile : les mini-jeux au doigt, le jeu
de rythme du concert, les boutons de course.

## 9. Écouter les sons (5 min)

Toolbox, onglet **Audio** : écoute les numéros de [ASSETS.md](ASSETS.md).
Pour en changer un : **ReplicatedStorage → Partage → Config**, table
`SONS` ; pour les chansons du concert : **Partage → Jeu → Concert**.

## 10. Ce que tu me renvoies

- les lignes rouges ou orange de la fenêtre Output ;
- des captures d'écran (Académie, course, concert, mini-jeux, téléphone) ;
- ton ressenti : vitesse, difficulté de la carrière, lisibilité, sons, ce
  qui manque ou ce qui t'ennuie.

## Si tu veux que je travaille directement sur ton PC

Cette session tourne dans le cloud : elle ne peut pas toucher à ton PC. Pour
que je travaille sur tes fichiers, ouvre une session qui tourne **sur ton
PC** : l'appli **Claude Desktop**, ou la commande `claude remote-control`
dans un terminal ouvert dans le dossier du projet. Je pourrai lire et
modifier les fichiers du projet sur ton disque, puis tu rouvres la place
dans Studio.
