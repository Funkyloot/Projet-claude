# Recherche : trouver une stratégie rentable (octobre 2026)

Données : football-data.co.uk, 19 championnats, saisons 2018-19 à 2026-27 (résultats réels,
cotes de 15 bookmakers avant match et à la clôture). Toutes les mesures portent sur des matchs
réellement joués ; rien n'est simulé à partir du modèle.

## 1. Ce qui ne marche pas

| Piste | Résultat |
|---|---|
| Modèle Dixon-Coles seul contre les cotes moyennes | Perd (−6,9 % sur 747 paris de buts). Le modèle est moins précis que Pinnacle. |
| Fatigue (jours de repos) | Aucun effet mesurable : buts réels / attendus entre 0,98 et 1,01 quel que soit le repos. |
| Surebets avec 22bet/1xBet + un seul autre bookmaker | Trop rares : 0,4 à 0,7 % des matchs, ≈ 1 % de gain. |
| Surebets « meilleure cote partout » | Fréquents (24 % des matchs) mais il faut des comptes chez des dizaines de bookmakers, qui ferment les comptes des parieurs d'arbitrage. |

## 2. Ce qui améliore le modèle

Tirs cadrés : apprendre sur 30 % buts + 70 % tirs cadrés (convertis en buts) donne une
meilleure log-loss **dans les 8 deuxièmes divisions testées**, sur la période de développement
comme sur les 2 saisons de contrôle (1X2 : 1,062 → 1,057 ; plus/moins : 0,697 → 0,688).
Activé par défaut. Le modèle reste moins précis que Pinnacle (1,041) : il sert de complément.

## 3. Ce qui est rentable : la value « sharp »

Principe (utilisé par les parieurs professionnels) : le prix de Pinnacle (ou de Betfair Exchange),
une fois sa marge retirée, est la meilleure estimation disponible de la vraie probabilité. Quand un
bookmaker « grand public » paie plus que ce prix juste, le pari a une espérance positive.

**Le profit réel suit l'écart annoncé** (meilleure cote du marché contre Pinnacle/Betfair à la
clôture, 77 000 paris) :

| Écart annoncé | Paris | ROI réel |
|---|---|---|
| 0-2 % | 43 312 | +1,0 % |
| 2-4 % | 19 193 | +2,8 % |
| 4-6 % | 8 094 | +4,6 % |
| 6-10 % | 5 102 | +5,4 % |
| 10-15 % | 1 426 | +8,7 % |

Stable dans le temps : +4,7 % (2018-2023) et +5,3 % (2023-2027) sur le plus/moins à la clôture.

**Avec les règles de l'app** (clôture, écart 3-10 %, cote 1,25-4,5), bookmaker par bookmaker :
tous les bookmakers individuels réunis +2,15 % (4 857 paris) ; **1xBet** (même plateforme que
22bet) +10 % sur 312 paris (une seule saison disponible : incertitude forte, t = 1,1).

Le moment compte : à la clôture (juste avant le match) le résultat est solide ; en début de semaine
il l'est beaucoup moins (1X2 : +2,0 % puis −0,3 %). D'où le relevé des cotes **dans les 2 h avant
le coup d'envoi**.

## 3 bis. Où et quand chercher (deuxième série de mesures)

**Pas dans les 5 grands championnats.** Premier League, Liga, Serie A, Bundesliga, Ligue 1 :
−5,5 % sur 1 042 paris (les bookmakers y sont aussi précis que Pinnacle). Ailleurs : +4,2 % sur
3 815 paris, et 10,8 occasions pour 100 matchs contre 8,3. Le chasseur S ignore ces 5 championnats.

**Juste après un mouvement de Pinnacle.** Probabilité Pinnacle du début de semaine au coup d'envoi,
et part des issues où un bookmaker grand public paie au moins 3 % au-dessus du prix juste :

| Mouvement de Pinnacle | Issues | Occasions |
|---|---|---|
| stable | 82 154 | 0,6 % |
| ↑ 2 à 4 points | 47 466 | 2,0 % |
| ↑ plus de 4 points | 25 719 | 3,2 % |

Les bookmakers grand public suivent Pinnacle avec retard : les occasions sont 3 à 5 fois plus
fréquentes après un mouvement. D'où un second relevé dans la dernière heure (compositions).

**En début de semaine (données gratuites)** : CLV +1,9 à +3,9 %, ROI positif mais moins net
qu'à la clôture. Sans la cote de 22bet dans ces données, trop de fausses alertes : non retenu.

## 4. Ce que l'app fait maintenant (chasseur S)

- Calendrier des matchs via The Odds API (gratuit, 0 crédit), relu toutes les 6 h.
- Cotes relevées seulement dans les 2 h avant un match, au plus une fois par heure et par
  championnat (donc un second relevé après les compositions), en commençant par les championnats qui
  ont le plus de matchs dans la fenêtre : Pinnacle, Betfair et 1xBet sont dans la région « eu ».
- Chaque relevé est gardé : le signal indique de combien Pinnacle a bougé, et la CLV est mesurée
  sur le dernier relevé pris après le pari, sans attendre football-data.
- Signal si la cote 1xBet ≥ prix juste Pinnacle (ou Betfair si Pinnacle manque) + 3 %, cote entre
  1,25 et 4,5, prix relevés il y a moins de 3 h. Marchés : 1X2, plus/moins et handicaps à demi-buts.
- Le signal donne la **cote minimale** à exiger sur 22bet. 22bet suit généralement 1xBet, mais pas
  toujours : il faut vérifier avant de jouer.
- Les signaux S sont simulés tout de suite (validation : cette recherche) ; l'argent réel reste
  bloqué tant que 14 jours de simulation ne sont pas positifs.

## 5. Ce qu'il faut en attendre (100 $, honnêtement)

Simulation (4 000 tirages) avec les mises de l'app, 2 paris par jour :

| Hypothèse | Après 30 jours (médiane) | Après 90 jours (médiane) | Chance d'être gagnant à 90 j |
|---|---|---|---|
| ROI +2 % (tous bookmakers) · Kelly ×0,25 | 102 $ | 106 $ | 64 % |
| ROI +10 % (1xBet 2024-25) · Kelly ×0,25 | 104 $ | 112 $ | 83 % |
| ROI +10 % · Kelly ×0,5, plafond 5 % | 107 $ | 123 $ | 80 % |

C'est une espérance positive, pas une garantie : un mois perdant reste possible (10 % des cas sous
91-95 $). Avec 100 $, les gains sont lents parce que les mises sont petites ; ils grandissent avec
le capital et le nombre de paris (plus de championnats et de marchés suivis).

Risques réels : 22bet ne suit pas toujours 1xBet ; les bookmakers limitent les comptes gagnants ;
offre gratuite de The Odds API = 500 crédits par mois (≈ 4 relevés avant-match par jour).

## 6. Seuil d'écart du chasseur S (règles de l'app, hors 5 grands championnats, clôture)

| Écart minimum | Paris par saison et par bookmaker | Gain moyen réel par pari |
|---|---|---|
| 3 % | 94 | +4,6 % |
| 5 % | 43 | +7,1 % |
| **6 % (défaut)** | **31** | **+7,7 %** |
| 8 % | 18 | +14,4 % |

Choix de l'utilisateur : moins de paris, chacun avec une vraie marge. Le gain total sur une saison
reste du même ordre (les petits écarts sont plus nombreux mais rapportent peu chacun).
