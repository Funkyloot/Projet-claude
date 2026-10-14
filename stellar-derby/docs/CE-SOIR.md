# Ce soir, sur ton PC

Tout est prêt côté code : ce soir, il s'agit de **lancer le jeu dans Roblox
Studio**, de vérifier que tout marche en vrai, d'habiller le décor et de
jouer depuis ton téléphone. Compte une heure environ.

Il te faut : ton PC avec Roblox Studio, ton compte Roblox, et ce dépôt GitHub.

---

## 1. Récupérer le jeu (5 min)

1. Sur GitHub, ouvre ton dépôt **Projet-claude**, branche
   **`claude/stellar-derby`**, dossier `stellar-derby/build/`.
2. Clique sur **`StellarDerby.rbxl`**, puis sur le bouton de téléchargement
   (**Download raw file**).
3. Double-clique sur le fichier : Roblox Studio l'ouvre. L'hippodrome est
   déjà là.

> Rojo n'est pas nécessaire ce soir. Il sert seulement si on veut
> synchroniser le code du dépôt avec Studio en direct.

## 2. Premier essai, en solo (10 min)

Appuie sur **Play** (F5). Ce qui doit se passer :

| Moment | Ce que tu dois voir |
|---|---|
| 0 s | Tu apparais devant la tribune rose et blanche. À gauche, le panneau du lobby : prochaine course, stratégies, profils, robes. |
| 0–10 s | Choisis une stratégie, un profil et une robe ; appuie sur **Prête ?** pour partir tout de suite. |
| Présentation (6 s) | La caméra passe devant les stalles ; les 12 coureuses sont dedans, avec oreilles, queues et dossards. |
| Stalles (3 s) | Compte à rebours 3, 2, 1. Appuie sur **Espace** pile au « PARTEZ ! ». |
| Course | Caméra derrière ta coureuse. Flèches ← → : couloir. ↑ ↓ : rythme. Espace en finale : sprint. E : compétence. C : vue TV. |
| Arrivée | Commentateur, éventuellement photo-finish au ralenti, foule. |
| Résultats | Podium avec les trois premières, classement à droite, fanfare. Puis retour au lobby. |

**Ouvre la fenêtre Output** (View → Output) avant d'appuyer sur Play. Si
quelque chose cloche, les lignes **rouges** et **orange** disent pourquoi.
Copie-les, fais une capture d'écran, et envoie-moi les deux.

Points à regarder de près (je n'ai pas pu les voir moi-même) :

- [ ] les coureuses courent (animation) au lieu de glisser ;
- [ ] les pieds touchent la piste (ni enfoncés, ni en l'air) ;
- [ ] les oreilles, les queues et les coiffures du catalogue apparaissent ;
- [ ] ton avatar porte les oreilles et la queue de ta robe ;
- [ ] la vitesse donne une impression de course (ni trop lente, ni trop rapide) ;
- [ ] les boutons et textes sont lisibles ;
- [ ] les sons : musique, foule, fanfare.

## 3. Essai à plusieurs (5 min)

Onglet **Test** → **Clients and Servers** → 2 joueurs → **Start**. Deux
fenêtres s'ouvrent : vérifie que les deux joueuses courent dans la même
course et se voient.

## 4. Habiller le décor (15 min)

1. **View → Toolbox**, onglet **Models**.
2. Colle un numéro de la liste de [ASSETS.md](ASSETS.md) dans la recherche
   (par exemple `10586979345`, le cerisier), clique dessus : il apparaît dans
   le Workspace. La liste a des miniatures : choisis à l'œil.
3. Dans l'**Explorer**, fais-le glisser dans
   **ServerStorage → Ressources → Arbres**. Fais pareil avec un ou deux
   arbres verts (n° 4 à 9 de la liste), puis des buissons (dans **Buissons**)
   et des rochers (dans **Rochers**).
4. **Contrôle de sécurité** : ouvre `tools/studio/controle-modeles.lua`,
   copie tout, colle-le dans la **barre de commande** (View → Command Bar),
   Entrée. Si une ligne **[SUSPECT]** apparaît, supprime le modèle concerné.
5. **Aperçu sans lancer le jeu** : colle dans la barre de commande :

   ```lua
   require(game.ServerScriptService.Serveur.Habillage).appliquer()
   ```

   Les arbres en boules sont remplacés par tes modèles, et des buissons et
   des rochers apparaissent autour de la piste. Si le résultat ne te plaît
   pas : Ctrl+Z, ou retire des modèles du dossier et recommence.
6. **File → Save** pour garder ton décor.

## 5. Écouter les sons (5 min)

Dans la Toolbox, onglet **Audio**, cherche les numéros de
[ASSETS.md](ASSETS.md) et écoute-les (▶). Pour en changer un : dans
l'Explorer, **ReplicatedStorage → Partage → Config**, double-clic, et remplace
le numéro dans `SONS`.

## 6. Jouer sur ton téléphone (10 min)

1. **File → Publish to Roblox** → **Create new experience**, nom par exemple
   « Stellar Derby (test) ». Elle reste **privée** : personne d'autre que toi ne peut y jouer.
2. Sur [create.roblox.com](https://create.roblox.com/dashboard/creations),
   ouvre l'expérience, puis **View on Roblox**, et copie le lien.
3. Ouvre ce lien sur ton téléphone : bouton **Jouer** dans l'appli Roblox.

C'est le vrai test pour l'interface tactile : boutons ◀ ▶, rythme, gros
bouton SPRINT, bouton doré des compétences.

## 7. Ce que tu me renvoies

- les lignes rouges ou orange de la fenêtre Output, s'il y en a ;
- des captures d'écran (course, lobby, podium, téléphone) ;
- ton ressenti : vitesse, caméra, difficulté, lisibilité, sons, ce qui manque.

Avec ça, je corrige et j'avance sur la suite (phase 2 : sauvegarde,
entraînement, Winning Live).

## Si tu veux que je travaille directement sur ton PC

Cette session tourne dans le cloud : elle ne peut pas toucher à ton PC. Pour
que je travaille sur tes fichiers, ouvre une session qui tourne **sur ton
PC** : l'appli **Claude Desktop**, ou la commande `claude remote-control`
dans un terminal ouvert dans le dossier du projet (la session apparaît alors
dans l'appli Claude Code). Je pourrai lire et modifier les fichiers du projet
sur ton disque, puis tu rouvres la place dans Studio.
