# Moteur de paris

Programme qui tourne jour et nuit sur un serveur local, calcule ses propres probabilités sur le
football et indique chaque jour sur quoi miser sur 22bet, à quelle cote minimale et combien.
Conception complète : [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md).

**Tout se règle dans l'interface web** : token Telegram, clé d'API de cotes, championnats,
capital, seuils, téléchargement de l'historique, backtest, alias d'équipes. Aucun fichier à modifier.

## Installation (une seule fois)

Sur le serveur Linux :

```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER        # puis se déconnecter / reconnecter

git clone https://github.com/funkyloot/projet-claude.git
cd projet-claude && git checkout claude/surebet-bookmaker-analysis-tdfy3e
cd moteur-paris
docker compose up -d --build
```

Ouvrez ensuite **http://adresse-du-serveur:8080** depuis un navigateur du même réseau
(`hostname -I` donne l'adresse du serveur). Pour y accéder hors de chez vous, installez
Tailscale sur le serveur et sur le téléphone plutôt que d'ouvrir un port sur la box.

Mise à jour du programme plus tard : `git pull && docker compose up -d --build`.

## Premiers pas dans l'interface

1. **Créer le mot de passe** à la première visite.
2. **Réglages › Fuseau horaire** : le vôtre (ex. `Africa/Abidjan`, `Europe/Paris`), pour les heures du rapport.
3. **Réglages › Telegram** (conseillé) : créer un bot avec @BotFather, coller le token, envoyer au bot
   le code de liaison affiché. « Envoyer un message de test » pour vérifier.
4. **Données › Télécharger l'historique** : 20 ans de résultats et de cotes, quelques minutes.
   (Lancé aussi automatiquement au premier démarrage.)
5. **Données › Lancer le backtest** : teste chaque championnat sur l'historique et valide les marchés
   qui gagnent aussi dans le coffre-fort (2 dernières saisons). Quelques minutes à une heure.
6. C'est tout : le service analyse les matchs à venir toutes les 4 h et envoie le rapport chaque jour.

Optionnel : **Réglages › API de cotes** (compte gratuit sur the-odds-api.com) pour des cotes plus
fraîches. « Vérifier l'API » liste les bookmakers couverts : si 22bet (ou un bookmaker de la même
plateforme) y figure, mettez sa clé dans « Bookmaker cible ».

## Utilisation au quotidien

- Le **rapport du jour** (Telegram et tableau de bord) liste les paris recommandés :
  « Leeds – Hull · Plus de 2,5 buts · prix juste 1,82 · **jouer si 22bet ≥ 1,88** · mise 2,00 $ ».
- Ouvrez 22bet : si la cote affichée est au moins la cote minimale, le pari a de la valeur.
  En cas de doute : `/cote 12 1,95` sur Telegram ou « Je joue ? » dans le tableau de bord.
- En mode réel, enregistrez le pari pris : `/pari 12 1,95` ou le formulaire du tableau de bord.
- Les scores arrivent tout seuls ; les paris sont réglés et la CLV calculée automatiquement.
- Chaque lundi, **Bilan** : texte à copier dans une conversation Claude (abonnement, pas d'API).

Les deux premières semaines se font **en simulation** : le passage en argent réel est refusé tant
que 14 jours de simulation positive ne sont pas atteints. Sous 60 $, retour automatique en simulation.

## Ce que fait le moteur

| Brique | Rôle |
|---|---|
| Dixon-Coles pondéré dans le temps | Probabilité de chaque score exact, donc de tous les marchés d'un match |
| Mélange avec Pinnacle | Poids choisi par le backtest ; si Pinnacle est meilleur, le modèle s'efface |
| Chasseur B (value) | Cote 22bet (ou indicative) au-dessus du prix juste + 3 % |
| Chasseur A (incohérences) | Marché du bookmaker mal aligné sur ses propres 1X2 et plus/moins |
| Chasseur L (surebet) | Couverture de toutes les issues entre bookmakers |
| Promotions | Valeur exacte des paris gratuits, cotes boostées, remboursements (page Outils) |
| Garde-fous | Kelly × 0,25, 3 % max par pari, 5 % par match, 15 % par jour, arrêt sous 60 $ |
| Backtest | Walk-forward, coffre-fort, réglages choisis sur la log-loss et jamais sur le profit |

## Ligne de commande (facultatif)

Tout est aussi disponible en commandes, par exemple `docker compose exec moteur moteur etat`.

| Commande | Rôle |
|---|---|
| `moteur etat` | Mode, capital, championnats, marchés validés |
| `moteur historique` | Télécharge l'historique |
| `moteur backtest --activer` | Backtest et activation des réglages validés |
| `moteur analyser` | Mise à jour + analyse + rapport |
| `moteur fiche "Leeds" "Hull"` | Prix justes de tous les marchés d'un match |
| `moteur cote 12 1,95` / `moteur pari 12 1,95` | Vérifier / enregistrer un pari |
| `moteur value --proba 0.52 --cote 2.05` | Calcul de value et de mise |
| `moteur surebet 5.00 1.30 --total 50` | Calcul de surebet |
| `moteur promo gratuit --proba 0.3 --cote 3.4 --montant 10` | Valeur d'une promotion |
| `moteur veille` | Service + interface web (lancé par Docker) |

## Développement

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
pytest                      # 149 tests
moteur web                  # interface seule sur http://localhost:8080 (SQLite dans data/)
```

```
src/moteur/
├── calcul.py, marches.py      formules, marchés, règlement asiatique, Kelly
├── modeles/                   grille des scores, Dixon-Coles, ajustement par championnat
├── donnees/                   football-data (20 ans + matchs à venir), The Odds API, noms d'équipes
├── chasseurs.py, analyse.py   chasseurs A, B, L et analyse des matchs à venir
├── journal.py, capital.py     signaux, paris, mises plafonnées, règlement, CLV, modes, arrêt
├── backtest.py                walk-forward, coffre-fort, tournoi, validation par marché
├── rapport.py, telegram.py, commandes.py   rapport quotidien, bilan, bot Telegram
├── service.py, taches.py      calendrier, actions demandées depuis l'interface
└── web/                       interface web (FastAPI) et ses gabarits
```
