# Pistonville — version d'essai 0.1

Jeu mobile de gestion d'écurie et de course en pixel art, inspiré de
*Grand Prix Story* (Kairosoft) et des jeux de poursuite mobiles où l'on tourne
en touchant la gauche ou la droite de l'écran. Le cahier des charges complet
est dans le document « Pistonville — Cahier des charges ».

## Jouer sur PC

Ouvrir **`dist/pistonville.html`** d'un double-clic (Chrome, Edge ou Firefox).
Tout est dans ce fichier : aucune installation, aucune connexion.

| Action | Clavier | Écran tactile ou souris |
|---|---|---|
| Tourner à gauche / droite | ← → (ou Q / D, A / D) | Toucher la moitié gauche / droite de l'écran |
| Nitro | Espace (ou ↑) | Bouton NITRO |
| Aura (jauge pleine) | E | Toucher le portrait de la pilote |
| Pause | Échap (ou P) | Bouton pause en haut |

La voiture accélère toute seule. Garder la direction dans un virage fait
drifter ; un long drift et chaque dépassement remplissent la jauge d'aura.
L'aide au pilotage (activée par défaut, réglable dans la pause) recentre
doucement la voiture quand on ne touche à rien.

## Ce que contient cette version

- **Garage** : boutique (acheter tout de suite ou construire, moins cher mais
  plus long), atelier (améliorer vitesse, accélération, maniabilité,
  solidité ; réparer), passage au jour suivant.
- **Bureau des courses** : les 3 Grands Prix ouverts (il suffit d'avoir une
  voiture), puis les paliers régional, national, continental et mondial sur
  candidature (points de licence, podiums, victoires, classe de voiture ;
  réponse le lendemain : acceptée, refusée ou liste d'attente).
- **Courses** : 12 Grands Prix, 30 circuits générés à partir d'une graine
  (même graine = même circuit), décor placé par zones (piste, vibreurs,
  gravier, murs de pneus, barrières de sponsors, tribunes, public, paddock,
  ville, port, plage, chantier, parc), adversaires pilotés par l'ordinateur,
  nitro, aura, aspiration, chocs, mini-carte, podium.
- **Sauvegarde automatique** dans le navigateur.

Pas encore là : balade en ville, recrutement de l'équipe, recherche de
pièces, musique, voitures MinZinn (téléchargement bloqué par itch.io depuis
l'environnement de développement ; les voitures sont dessinées dans le code).

## Développer

```
npm install                 # une fois, à la racine du dépôt
npm run pistonville:servir  # http://localhost:8778 (les modules demandent un serveur)
npm run pistonville         # reconstruit dist/pistonville.html
```

| Dossier | Contenu |
|---|---|
| `src/` | Le moteur : circuits, rendu, physique, course, menus |
| `contenu/` | Les données : véhicules, Grands Prix, écuries. Une mise à jour = un nouveau dossier à côté de `base/` et une ligne dans `catalogue.js` |
| `assets/` | Planche Kenney RPG Urban, voitures de profil Kenney, police Jersey 10 |
| `licences/` | Licences des polices |

## Crédits

- Graphismes : Kenney, RPG Urban Pack et Pixel Vehicle Pack (CC0) — kenney.nl
- Police : Jersey 10, The Soft Type Project Authors (SIL Open Font License 1.1)
