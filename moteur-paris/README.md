# Moteur de paris

Programme d'analyse de paris sportifs qui tourne en continu sur un serveur local.
La conception complète est dans [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md).

**État : étapes 0 et 1 terminées** (feuille de route, section 15 du cahier des charges).

- Étape 0 : configuration, base de données (matchs, cotes, journal des paris, capital), suivi du
  capital avec arrêt automatique, service qui tourne en continu, Docker.
- Étape 1 : calculateur de la section 4 (probabilité implicite, marge, probabilités sans marge,
  espérance, Kelly fractionné plafonné et arrondi, surebet), avec signalement des erreurs
  « trop belles » de la section 8.

## Installation sur le serveur (Linux)

### 1. Installer Docker et Git

```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER   # puis se déconnecter / reconnecter
```

### 2. Récupérer le projet

```bash
git clone https://github.com/funkyloot/projet-claude.git
cd projet-claude
git checkout claude/surebet-bookmaker-analysis-tdfy3e
cd moteur-paris
```

### 3. Configurer

```bash
cp .env.example .env
nano .env        # changer POSTGRES_PASSWORD et l'URL de base qui le reprend ; clés API plus tard
```

### 4. Lancer

```bash
docker compose up -d --build
docker compose logs -f moteur          # voir le service tourner (Ctrl+C pour quitter l'affichage)
docker compose exec moteur moteur etat # capital, mode, clés configurées
```

Le service redémarre tout seul après une coupure de courant (`restart: always`),
à condition que Docker démarre avec la machine : `sudo systemctl enable docker`.

## Sans Docker (développement)

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
sed -i 's|^MOTEUR_DATABASE_URL=.*|MOTEUR_DATABASE_URL=sqlite:///data/moteur.db|' .env
moteur init && moteur etat
pytest
```

## Commandes

| Commande | Rôle |
|---|---|
| `moteur init` | Crée la base et le dépôt initial (100 $ par défaut) |
| `moteur etat` | Affiche mode, capital, seuil d'arrêt, clés configurées |
| `moteur value --proba 0.52 --cote 2.05` | Espérance et mise conseillée pour un pari |
| `moteur surebet 5.00 1.30 --total 50` | Vérifie une combinaison et répartit les mises |
| `moteur veille` | Service en continu (lancé automatiquement par Docker) |

## Structure

```
moteur-paris/
├── CAHIER_DES_CHARGES.md   conception complète
├── src/moteur/
│   ├── config.py           réglages (.env), règles de mise vérifiées au démarrage
│   ├── db.py               schéma : matchs, cotes, paris, capital
│   ├── calcul.py           formules de la section 4, règles de mise de la section 9
│   ├── capital.py          solde, dépôt initial, arrêt automatique
│   └── cli.py              commandes init / etat / veille
├── tests/                  tests automatiques
├── Dockerfile
└── docker-compose.yml      moteur + PostgreSQL, limites mémoire adaptées à 16 Go
```

## Prochaines étapes

2. Téléchargement de l'historique football (20 ans).
3. Premier modèle Poisson / Dixon-Coles + grille de scores + backtest chronologique.
4. Journal des paris et mode simulation.
