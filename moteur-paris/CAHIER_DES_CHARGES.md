# Cahier des charges — Moteur d'analyse de paris sportifs

> Document de conception. Il reprend toutes les décisions prises pendant la phase de discussion.
> État : étapes 0 à 8 et 11 codées et testées (voir section 15), plus l'interface web de réglage.

## 0. Décisions ajoutées après la première version

| Décision | Conséquence |
|---|---|
| **Football en priorité** | 2es divisions et championnats moyens (Championship, League One/Two, écossais, 2. Bundesliga, Serie B, Segunda, Ligue 2, Eredivisie, Belgique, Portugal, Turquie, Grèce). Les grands championnats servent à régler le modèle, pas à parier. Tennis ensuite si la simulation est positive. |
| **Sans API Claude** | L'abonnement Claude ne donne pas de crédits API. Le programme fonctionne entièrement sans : rapport par modèle de texte, vérifications par règles. Claude sert à construire le programme et au bilan hebdomadaire, collé à la main dans une conversation. |
| **Tout se règle dans l'interface web** | Token Telegram, clé d'API de cotes, championnats, capital, seuils, fuseau, historique, backtest, alias d'équipes : rien à modifier dans le code ni dans `.env`. |
| **Cote minimale** | Chaque signal donne la cote au-dessus de laquelle le pari a au moins 3 % de value. Suffit quand la cote exacte de 22bet n'est pas disponible dans une source autorisée. |
| **Machine** | Dell OptiPlex, Core i5 8ᵉ génération (≈ 3 GHz, 6 cœurs, UHD 630), 16 Go, 256 Go, Linux. |

---

## 1. Objectif

Construire un programme qui tourne en continu sur un serveur local, analyse les cotes de **22bet**
en temps réel, **calcule ses propres probabilités** et indique chaque jour **sur quoi miser et combien**.

**Critère de réussite du premier mois :** partir de **100 $** et tenir un mois complet sans faillite,
avec un rapport quotidien obligatoire.

**Attentes réalistes :**
- un bon mois se situe entre **+5 % et +15 %** ; un mois perdant reste possible (variance) ;
- aucune promesse de doublement du capital ; un « profit de 25 % » garanti n'existe pas.

---

## 2. Principes non négociables

| # | Règle | Pourquoi |
|---|---|---|
| 1 | **Rapport quotidien obligatoire, pari jamais forcé.** Un jour sans valeur = « rien de bon aujourd'hui ». | Forcer un pari sans avantage = perte moyenne garantie. |
| 2 | **Mise max 5 % du capital** par pari (Kelly fractionné ; 3 % jusqu'en octobre 2026, relevé à la demande de l'utilisateur après simulation, voir RECHERCHE.md §5). | 3-4 pertes d'affilée ne doivent jamais vider le capital. |
| 3 | **Aucune martingale** (jamais doubler après une perte). | Mène toujours à la faillite à terme. |
| 4 | **Arrêt automatique** si le capital passe sous un seuil (par défaut 60 $). | Protection contre un bug ou une mauvaise série. |
| 5 | **2 semaines de simulation** avant tout argent réel. | Vérifier le programme sans risque. |
| 6 | **Placement des paris manuel.** Le programme conseille, l'humain mise. | Un bot qui mise seul fait fermer les comptes et peut se tromper en boucle. |
| 7 | **Aucune amélioration activée sans test historique.** Le programme ne réécrit pas son code en direct. | Un bug non testé peut vider le capital en une soirée. |
| 8 | **Sources de données légitimes uniquement.** Pas d'aspiration de sites qui l'interdisent, pas de contournement d'abonnement. | Légalité et robustesse. |

---

## 3. Périmètre

### Inclus
- Sport réel, **pré-match** en priorité (live plus tard, avec prudence).
- **Football d'abord**, 2es divisions et championnats moyens (section 0). Tennis ensuite, basket peut-être.
- Tous les types de marchés : 1X2, double chance, plus/moins, les deux équipes marquent, score exact,
  mi-temps/fin, handicaps, cartons, corners, combinés sur un même match.

### Exclu (décision mathématique, pas arbitraire)
- **Casino, roulette, jeux crash, jeux virtuels** : probabilité fixée par le jeu, marge intégrée
  (souvent 10-20 % sur les virtuels). Aucun calcul ne peut les battre.
- « Prédicteurs », « accès serveur », « failles » vendus en ligne : arnaques.
- **BetMines** et autres applis de pronostics : abandonné (pas d'API, collecte automatique interdite).

---

## 4. Rappels mathématiques

**Probabilité implicite d'une cote :** `p = 1 / cote`

**Marge du bookmaker sur un marché :** `somme(1 / cotes) − 1`

**Value bet :** `p_modèle × cote > 1` → espérance positive `EV = p_modèle × cote − 1`

**Surebet (entre bookmakers) :** `1/cote₁ + 1/cote₂ < 1` → profit `1 / somme − 1`
(conservé comme module secondaire ; rare entre bookmakers de la même plateforme que 22bet).

**Mise Kelly fractionnée :**
`f* = (p × cote − 1) / (cote − 1)` puis `mise = capital × f* × fraction` (fraction 0,5 par défaut depuis octobre 2026),
plafonnée à 5 % du capital.

**Paires complémentaires à connaître :** `1`+`X2`, `2`+`1X`, `X`+`12`, `1`+`X`+`2`,
Plus/Moins même ligne, handicap asiatique ±0,5.

---

## 5. Architecture

```
┌──────────────────────── SERVEUR LOCAL (Linux, 16 Go RAM, 256 Go disque) ────────────────────────┐
│                                                                                                   │
│  [1] Collecte          historique 20 ans + cotes 22bet + cote de référence + contexte             │
│        │                                                                                          │
│  [2] Base de données   PostgreSQL (ou SQLite au départ)                                           │
│        │                                                                                          │
│  [3] Tournoi de modèles  → grille de probabilités des scores pour chaque match                    │
│        │                                                                                          │
│  [4] Chasseurs d'erreurs (modules indépendants)                                                   │
│        │                                                                                          │
│  [5] Filtre commun     validation historique + contrôle cote de référence + seuil de valeur       │
│        │                                                                                          │
│  [6] Gestion des mises Kelly fractionné, plafonds, arrêt automatique                              │
│        │                                                                                          │
│  [7] Claude (API)      vérification des infos, presse locale, rapport, bilan hebdo               │
│        │                                                                                          │
│  [8] Sorties           bot Telegram + tableau de bord web (accès distant via Tailscale)           │
│        │                                                                                          │
│  [9] Journal & bilan   chaque pari, CLV, capital, performance par module                          │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Stack :** Python 3.12, asyncio + httpx, pandas / numpy / scipy, scikit-learn, LightGBM / XGBoost,
PyMC (bayésien), PostgreSQL, FastAPI (tableau de bord), python-telegram-bot, SDK Anthropic.
Déploiement via **Docker Compose**, redémarrage automatique.

---

## 6. Module 1 — Collecte de données

### Historique (entraînement)
Téléchargé automatiquement au premier lancement, puis mis à jour chaque jour.
Les données viennent de sources publiques vérifiables, **pas de la mémoire de Claude**.

| Source | Contenu | Remarque |
|---|---|---|
| football-data.co.uk | Résultats + cotes (dont Pinnacle), 20+ championnats | Depuis les années 1990-2000 |
| Archives ATP/WTA (Jeff Sackmann ou équivalent) | Matchs de tennis + statistiques | URL à revérifier au codage |
| Understat / FBref | xG, statistiques avancées | Respecter leurs conditions |
| StatsBomb Open Data | Données événement par événement | Sélection de compétitions |
| Météo (API publique, ex. Open-Meteo) | Vent, pluie, température | Pour les totaux de buts |

Si une source disparaît ou change de format, le programme le signale dans le rapport et bascule
sur une source de secours.

### Cotes en direct
- **API de cotes autorisée** couvrant 22bet et un bookmaker de référence (« sharp », ex. Pinnacle).
  Couverture de 22bet à vérifier avant de choisir le fournisseur.
- Actualisation toutes les 30 à 60 secondes en pré-match.
- Chaque cote est stockée avec son **horodatage** (âge de la cote = critère de validité).

### Correspondance des matchs
Rapprochement des noms d'équipes entre sources (table d'alias + correspondance approximative
+ heure du coup d'envoi). Une erreur ici crée de faux signaux : module testé en priorité.

---

## 7. Module 2 — Tournoi de modèles

Aucun type de calcul n'est exclu d'office. Tous les modèles s'affrontent ; les meilleurs gagnent du poids.

| Famille | Modèles |
|---|---|
| Statistiques classiques | Poisson, Dixon-Coles, Poisson bivarié, binomiale négative |
| Classements dynamiques | Elo, Glicko, TrueSkill (par surface pour le tennis) |
| Apprentissage automatique | Régression logistique, forêts aléatoires, LightGBM, XGBoost, petits réseaux de neurones |
| Bayésien | Modèles hiérarchiques de force d'équipe, mis à jour après chaque match |
| Simulation | Monte-Carlo de chaque match (millions de tirages) |
| Ensembles | Mélange pondéré des meilleurs modèles |

**Sortie centrale :** pour chaque match, une **grille de probabilités de tous les scores**.
Tous les marchés (1X2, totaux, BTTS, score exact, handicaps, combinés) en découlent de façon cohérente.

### Protection contre le surapprentissage (obligatoire)
1. **Validation chronologique (walk-forward)** : le modèle ne voit jamais le futur.
2. **Période coffre-fort** : les 2 dernières saisons sont mises de côté et jamais utilisées pour régler.
   Un modèle ne passe en réel que s'il gagne aussi sur cette période.
3. **Mesures de qualité** : log-loss, score de Brier, courbes de calibration (pas seulement le profit).
4. **Pénalité pour tests multiples** : plus on teste de variantes, plus l'avantage exigé est élevé.

### Utilisation des ressources
- Entraînements, backtests et simulations lourdes **la nuit**.
- En journée : ressources réservées aux recalculs en direct.

---

## 8. Module 3 — Chasseurs d'erreurs

Chaque chasseur est un module indépendant. Tous passent par le même filtre (section 9).
Chaque semaine, le programme mesure quel chasseur rapporte vraiment et ajuste son poids.

| # | Chasseur | Idée |
|---|---|---|
| A | **Incohérences internes 22bet** | Vérifier que les marchés d'un même match sont cohérents entre eux (score exact vs totaux vs 1X2…). |
| B | **Écart modèle / 22bet** | Probabilité du modèle nettement supérieure à celle de la cote. |
| C | **Combinés sur un même match (bet builder)** | Événements liés (ex. victoire + plus de 2,5 buts) parfois mal corrélés par le bookmaker. Test de milliers de combinaisons via la simulation. |
| D | **Décalage des compositions** | À l'annonce des compositions (~1h avant), recalcul instantané ; les marchés secondaires réagissent parfois plus lentement. |
| E | **Motivation** | Simulation Monte-Carlo du classement complet : équipes sans enjeu, en lutte pour la survie, rotation avant une Coupe d'Europe. |
| F | **Cartons & arbitres** | Modèle basé sur la sévérité de l'arbitre, l'enjeu, les derbies. |
| G | **Corners** | Styles de jeu, centres, pressing. |
| H | **Petits championnats** | Football féminin, divisions inférieures, jeunes : marchés moins soignés (mises max plus basses). |
| I | **Facteurs physiques** | Météo, jours de repos, voyages, altitude, chaleur ; tennis : durée du match précédent, surface. |
| J | **Promotions 22bet** | Valeur exacte des cotes boostées, cashback, bonus (conditions de mise comprises). |
| K | **Cash-out** | Comparer l'offre de cash-out à la valeur juste calculée ; accepter ou non. |
| L | **Surebet** (secondaire) | Si un second bookmaker d'une autre plateforme est ajouté. |

**Erreurs « trop belles » (> 10-15 %)** : signalées mais marquées « risque d'annulation »
(règle d'erreur manifeste des bookmakers).

---

## 9. Module 4 — Filtre commun et gestion des mises

Un signal devient une recommandation seulement si :
1. la valeur dépasse le seuil minimal (ex. EV ≥ 3 %) ;
2. la cote a moins de 60 secondes ;
3. le chasseur concerné est validé en backtest ;
4. la cote de référence ne contredit pas fortement le signal ;
5. Claude n'a pas trouvé d'information contradictoire (blessure, forfait…).

**Mises :** Kelly fractionné (0,5), plafond 5 % du capital, arrondies à des montants naturels.
**Exposition :** plafond de mise totale par jour et par match.
**Arrêt automatique :** sous 60 $ (paramétrable), le programme passe en simulation seule.

---

## 10. Module 5 — Rôle de Claude

**Décision : pas d'API par défaut** (section 0). Remplacements retenus :

| Tâche prévue | Remplacement gratuit |
|---|---|
| Rapport quotidien | Modèle de texte rempli par le programme |
| Vérifier chaque pari | Filtres automatiques : référence Pinnacle, désaccord maximal, cote « trop belle » |
| Bilan hebdomadaire | Page « Bilan » : texte compact à coller dans une conversation Claude |
| Construire et améliorer le programme | Claude Code avec l'abonnement |
| Blessures, compositions, presse locale | Plus tard : API football gratuite ou petit modèle local (Ollama) |

L'API reste possible plus tard, payée par les gains, avec un plafond de dépenses. Tableau d'origine :

| Tâche | Fréquence |
|---|---|
| Chercher les infos d'avant-match (blessures, suspensions, compositions, motivation) | Pour chaque pari candidat |
| **Presse locale multilingue** (lire, traduire, résumer, transformer en ajustement chiffré) | Quotidienne, petits championnats en priorité |
| Vérifier chaque pari proposé et le rejeter si une info le contredit | Avant chaque recommandation |
| Lire les captures d'écran envoyées par l'utilisateur (si besoin) | À la demande |
| Rédiger le rapport quotidien en français clair | Chaque jour |
| Analyser le journal : marchés/championnats qui gagnent ou perdent, proposer des réglages | Chaque semaine |

Claude **ne décide pas des mises** et **ne devine pas les scores** : les règles mathématiques décident.
Toute proposition de Claude est testée en backtest avant activation.

---

## 11. Module 6 — Sorties

### Bot Telegram
- Alerte : `Value +4,1 % · Match X · Plus de 2,5 buts @ 2,10 sur 22bet · Mise 2,50 $ · Confiance : élevée`
- Rapport quotidien (même si aucun pari).
- Commandes : `/capital`, `/journal`, `/stop`, `/simulation`, `/reel`.

### Interface web (port 8080, protégée par mot de passe)
- **Tableau de bord** : capital, statistiques, paris recommandés avec « Je joue ? » (cote vue sur 22bet)
  et enregistrement du pari réel, bascule simulation / réel (verrouillée), alertes.
- **Journal** : tous les paris, saisie manuelle d'un score manquant.
- **Fiche de match** : prix juste et cote minimale de tous les marchés.
- **Outils** : value, surebet, promotions (pari gratuit, remboursement, cote boostée).
- **Données** : téléchargement de l'historique et backtest avec progression, marchés validés par championnat.
- **Réglages** : Telegram (liaison par code), API de cotes (vérification), championnats, capital et mises,
  modèle, calendrier, alias d'équipes, mot de passe. Validés avant enregistrement, appliqués sans redémarrage.
- **Bilan** : texte hebdomadaire à copier dans Claude.
- Accès hors de chez soi via **Tailscale** uniquement (aucun port ouvert sur internet).

### Rapport quotidien (contenu)
- Paris recommandés ou « rien de bon aujourd'hui » (avec la raison).
- Capital, profit/perte du jour, de la semaine, du mois.
- CLV moyenne, taux de réussite, performance par chasseur.
- Alertes techniques (source en panne, coupure détectée).

---

## 12. Module 7 — Journal et auto-amélioration

Chaque pari enregistré : date, match, marché, cote prise, cote de clôture, probabilité du modèle,
chasseur d'origine, mise, résultat, capital après.

**Indicateur clé : CLV (closing line value).** Si la cote prise est régulièrement meilleure que la
cote finale, le modèle a un avantage réel, avant même que les résultats le montrent.

**Cycle hebdomadaire :**
1. ré-entraînement de tous les modèles ;
2. walk-forward + vérification sur la période coffre-fort ;
3. activation uniquement des réglages qui font mieux ;
4. bilan de Claude + ajustement des poids des chasseurs.

---

## 13. Infrastructure — serveur local

| Élément | Choix |
|---|---|
| Système | Linux |
| Machine | Dell OptiPlex, Intel Core i5 8ᵉ génération (≈ 3 GHz, 6 cœurs, UHD 630 non utilisée pour les calculs) |
| Ressources | 16 Go RAM (passés de 8 à 16 Go) entièrement dédiés, 256 Go disque |
| Calcul | **Processeur uniquement** : la puce Intel UHD n'est pas utilisée. Modèles adaptés : Poisson, Elo, LightGBM, bayésien, Monte-Carlo vectorisé (numpy/numba), parallélisés sur tous les cœurs. Pas de gros apprentissage profond. |
| Durées estimées | Entraînement 20 ans de football : quelques minutes à 1 h selon le modèle · tournoi de modèles + backtests : 2 à 6 h la nuit · recalcul en direct : quelques secondes |
| Déploiement | Docker Compose, redémarrage automatique (`restart: always`), interface sur le port 8080 |
| Coupures courant / internet | Reprise automatique + signalement dans le rapport ; onduleur (UPS) conseillé |
| Accès distant | Tailscale |
| Telegram | Mode « polling » : aucun port à ouvrir, pas besoin d'IP fixe |
| Sauvegardes | Chaque nuit (base + journal) vers disque externe ou cloud |
| Budget disque | ~20-50 Go pour données et modèles ; reste pour sauvegardes et logs |
| Secrets | Saisis dans l'interface, stockés dans la base locale, jamais réaffichés en clair |

---

## 14. Plan de test sur un mois

| Période | Mode | Critère de passage |
|---|---|---|
| Semaines 1-2 | **Simulation** (aucun argent réel) | Profit simulé ≥ 0 et CLV moyenne positive |
| Semaines 3-4 | **Argent réel, 100 $** | Capital > seuil d'arrêt, rapport chaque jour |

Bilan final : profit réel, CLV, performance par chasseur, décision de continuer ou non.

---

## 15. Feuille de route de développement

| Étape | Contenu | État |
|---|---|---|
| 0 | Structure du projet, Docker, configuration, base de données | ✅ fait |
| 1 | Calculateur (probabilités implicites, marge, value, Kelly, surebet) | ✅ fait |
| 2 | Téléchargement de l'historique football (football-data.co.uk, 20 ans + matchs à venir) | ✅ fait, à lancer sur le serveur |
| 3 | Dixon-Coles + grille de scores + backtest walk-forward + coffre-fort | ✅ fait |
| 4 | Journal, gestion du capital, mode simulation, plafonds, arrêt automatique | ✅ fait |
| 5 | Bot Telegram + rapport quotidien (sans Claude) | ✅ fait |
| 6 | Cotes en direct (The Odds API, optionnel) + correspondance des équipes | ✅ fait, clé à saisir |
| 7 | Chasseurs A, B (et L, J) | ✅ fait |
| 8 | Claude : bilan hebdomadaire à coller (sans API) | ✅ fait |
| 9 | Tournoi de modèles élargi (Elo, LightGBM, bayésien) | À faire : aujourd'hui Dixon-Coles × Pinnacle, ξ et poids choisis par le backtest |
| 10 | Chasseurs C à I, K (combinés, compositions, motivation, cartons, corners, physique, cash-out) | À faire |
| 11 | Interface web + Tailscale | ✅ interface faite ; Tailscale à installer sur le serveur |
| 12 | Tennis, puis autres sports | À faire |

**Règle de validation d'un marché** (filtre n° 3 de la section 9) : sur un championnat, une famille de
marchés (1X2, plus/moins, handicap) est validée si elle a au moins 30 paris dans le coffre-fort, un ROI
positif à la fois en développement et dans le coffre-fort, et une CLV moyenne positive quand elle est connue.
Les réglages (ξ, poids du modèle) sont choisis sur la log-loss, jamais sur le profit. Un signal hors marché
validé reste « en observation » : enregistré et mesuré, jamais recommandé.

## 16. Risques connus

1. **Limitation du compte 22bet** si les gains sont réguliers.
2. **Paris annulés** pour erreur manifeste de cote.
3. **Retraits bloqués ou KYC** : tester un petit retrait avant de déposer plus.
4. **Surapprentissage** : un modèle brillant sur le passé qui perd en réel (voir section 7).
5. **Variance** : un mois perdant est possible même avec un vrai avantage.
6. **Coupures** du serveur local.
7. **Légalité et fiscalité** des paris selon le pays : à vérifier par l'utilisateur.

---

## 17. Questions ouvertes

- Couverture de 22bet par une API de cotes autorisée (bouton « Vérifier l'API ») ; sinon cote minimale.
- Stabilité du courant et d'internet sur le lieu du serveur (onduleur conseillé).
- Premiers résultats du backtest sur les vraies données : quels championnats et marchés sont validés.
