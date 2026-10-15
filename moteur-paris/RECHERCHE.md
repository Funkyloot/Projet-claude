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

## 7. Contexte des matchs : enjeux, forme, confrontations directes (onglet Simulateur)

Question : quand ces facteurs sont présents, Pinnacle se trompe-t-il de façon répétée ? Mesure sur
86 157 matchs (16 championnats, 2012-2026) : écart entre la fréquence réelle et la probabilité juste
de Pinnacle à la clôture, sur deux périodes indépendantes.

| Facteur | 2012-2020 | 2020-2026 | Verdict |
|---|---|---|---|
| Domicile a un enjeu, extérieur rien (8 dernières journées) | victoire dom. +1,3 pt | −0,8 pt | le sens s'inverse : bruit |
| Domicile sans enjeu, extérieur avec | +0,6 pt | −1,6 pt | bruit |
| Forme : domicile nettement meilleur sur 5 matchs | +0,6 pt | −1,1 pt | bruit |
| Forme : extérieur nettement meilleur | +1,5 pt | +0,3 pt | s'efface |
| Confrontations : domicile domine | +0,3 pt | −0,8 pt | bruit |
| Confrontations : domicile dominé | +1,1 pt | −0,4 pt | bruit |
| Plus de 2,5 buts, une équipe sans enjeu (3 dernières journées) | +3,7 pts (2019-23) | +1,1 pt (2023-27) | effet passé, corrigé par le marché |

Conclusion : Pinnacle intègre déjà ces informations. Les ajouter aux probabilités ajouterait du bruit,
donc **elles n'entrent pas dans le calcul**. L'onglet Simulateur les affiche pour comprendre un match :
scores les plus probables, forme, confrontations, classement, et fin de saison simulée 10 000 fois
(chances de titre, de haut et de bas de tableau, enjeu réel de chaque match).

Météo : non testée (service Open-Meteo saturé depuis la machine de recherche ce jour-là) et elle
demande la ville du stade de chaque équipe, absente des données. À refaire avant tout affichage.

## 8. Correction (octobre 2026) : aucun signal S pendant un week-end entier

Trois causes, toutes corrigées en 0.6.2 :

1. **Bug** : chaque cote venue de The Odds API était datée de son dernier *changement* (« last_update »)
   et non du moment du relevé. Dans les petits championnats, une cote Pinnacle ou 1xBet peut rester
   identique des heures : elle était jugée « vieille de plus de 3 h » et écartée, alors qu'elle venait
   d'être relevée. Désormais : date du relevé (cote figée depuis plus d'un jour : écartée).
2. **Seuil trop strict pour 1xBet.** Saison 2024-25, championnats suivis hors 5 grands, 1X2 à la clôture
   (en supposant chaque match relevé) :

   | Écart minimum | Occasions sur la saison | Par semaine | Gain moyen réel |
   |---|---|---|---|
   | 3 % | 234 | 5,6 | +8,4 % |
   | **4 % (nouveau défaut)** | **126** | **3,0** | **+12,5 %** |
   | 5 % | 74 | 1,8 | −0,3 % |
   | 6 % (ancien défaut) | 45 | 1,1 | −15,4 % |

   Le 6 % venait de la moyenne de tous les bookmakers ; pour 1xBet seul il ne laisse presque rien.
   Une seule saison de données 1xBet : ces chiffres restent incertains (le principe, lui, est validé
   sur 77 000 paris).
3. **Crédits dispersés.** Un relevé ne coûte plus qu'1 crédit (cotes 1X2 seules, le marché étudié) et
   n'est refait qu'après 2 h 30 pour un même championnat : avec l'offre gratuite, environ 2 fois plus
   de matchs couverts.

Nouveau : Données → « Relevés de cotes avant les matchs » montre, pour chaque relevé, les matchs
comparés et le plus grand écart vu entre 1xBet et Pinnacle, même quand rien ne passe le seuil.

## 9. Pinnacle d'abord, notre modèle en complément ? (octobre 2026)

Question : notre modèle (Dixon-Coles, buts + tirs cadrés) ajoute-t-il quelque chose aux prédictions de Pinnacle ?
Mesure sur 33 118 matchs de 8 deuxièmes divisions (2016-2026), modèle réajusté chaque semaine avec le passé
seulement ; prix de Pinnacle publiés avant le match (football-data), sa marge retirée.

**A. Mélanger le modèle aux probabilités de Pinnacle** (log-loss, plus bas = mieux) :

| Part du modèle | 1X2 2016-23 | 1X2 2023-26 | Plus/moins 2,5 2016-23 | Plus/moins 2,5 2023-26 |
|---|---|---|---|---|
| **0 % (Pinnacle seul)** | **1,04173** | **1,03727** | 0,68278 | **0,68494** |
| 5 % | 1,04182 | 1,03753 | 0,68255 | 0,68493 |
| 10 % | 1,04199 | 1,03785 | 0,68237 | 0,68496 |
| 30 % (ancien défaut) | 1,04339 | 1,03988 | 0,68215 | 0,68544 |

Sur le 1X2, tout mélange est moins bon, sur les deux périodes. Sur le plus/moins, le petit gain d'avant
2023 a disparu. **Décision : les prédictions sont celles de Pinnacle telles quelles** (réglage « Part de
notre modèle face à Pinnacle » = 0 %) ; le modèle ne sert que si Pinnacle n'a pas de cote, et pour le Simulateur.

**B. Le modèle comme filtre des value bets** (cote ≥ prix juste de Pinnacle + 4 %, cote 1,25 à 4,5) :

| Avis du modèle | Paris (meilleure cote) | ROI 2016-23 | ROI 2023-26 |
|---|---|---|---|
| confirme (≥ 2 points au-dessus de Pinnacle) | 1 201 | −7,9 % | −19,9 % |
| neutre | 1 621 | −1,4 % | −6,8 % |
| contredit (≥ 2 points en dessous) | 5 717 | −1,3 % | +2,7 % |

Quand le modèle « confirme » une value, le résultat est même le plus mauvais : c'est le prix de Pinnacle qui
avait raison. Le modèle ne sert donc pas non plus de filtre. Ce qui marche en complément de Pinnacle reste
ce qui est mesuré plus haut : relever les cotes au bon moment (§3 bis), choisir les championnats où les
bookmakers suivent Pinnacle avec retard, et le prix de 1xBet/22bet face au prix juste de Pinnacle (§6, §8).

## 10. Rendre le prix de Pinnacle plus juste ? (octobre 2026)

**Notre modèle prévoit-il les mouvements de Pinnacle ?** (33 101 matchs, ouverture → clôture) Quand le modèle
voit une équipe 6 points au-dessus de Pinnacle, Pinnacle bouge ensuite de +0,1 point (2016-23) puis de
−0,1 point (2023-26) : corrélation 0,02 à 0,08. Rien d'exploitable face à une marge de 5 %.

**Combiner plusieurs prix « sharp » à la clôture** (19 championnats, 2019-2027, log-loss 1X2) : Pinnacle
seul 0,99994 / 0,98980 ; y ajouter la moyenne du marché est moins bon à tous les poids ; avec Betfair Exchange,
0,99341 → 0,99332 (écart négligeable, une seule période).

Signaux à la clôture (Bet365, Bwin, William Hill, 1xBet ; écart ≥ 4 %, hors 5 grands, cote 1,25-4,5) :

| Prix juste | 2019-23 | 2023-27 |
|---|---|---|
| **Pinnacle seul** | **1 371 paris, +8,7 %** | **761 paris, +12,2 %** |
| Pinnacle 80 % + moyenne 20 % | 1 173 paris, +9,0 % | 554 paris, +12,4 % |
| Pinnacle 60 % + moyenne 40 % | 1 048 paris, +7,1 % | 410 paris, +5,8 % |

Conclusion : Pinnacle seul reste le meilleur prix juste ; la puissance de calcul n'y change rien (ces tests
prennent quelques secondes), c'est l'information qui manque, et Pinnacle l'a déjà. La règle actuelle de
l'app (Pinnacle seul, écart ≥ 4 %) est confirmée sur 2 132 paris et deux périodes.

## 11. Matchs plan : mouvement anormal de Pinnacle (octobre 2026)

But : repérer les matchs où la cote de Pinnacle change brutalement avant le coup d'envoi (nouvelle de
dernière minute, ou argent suspect dans un match arrangé) pour **les éviter**, jamais pour parier dessus.
Mesure sur 90 500 matchs (19 championnats, 2013-2027) : plus grand changement de probabilité 1X2 de Pinnacle
entre son prix d'avant-match et sa clôture.

Médiane 2,2 points ; 99 % des matchs bougent de moins de 9,8 points ; 0,9 % bougent de 10 points ou plus.

Signaux à la clôture (écart ≥ 4 %, hors 5 grands, cote 1,25-4,5) selon ce mouvement :

| Seuil | 2020-27 au-dessus | 2020-27 en dessous | 2013-20 au-dessus |
|---|---|---|---|
| 8 points | 308 paris, +0,6 % | 1 837 paris, +15,9 % | 51 paris, +28,7 % |
| **10 points** | **123 paris, +7,8 %** | **2 022 paris, +14,1 %** | 19 paris, +42,7 % |
| 12 points | 44 paris, +0,6 % | 2 101 paris, +14,0 % | 9 paris, +15,1 % |

La clôture de Pinnacle reste juste même dans ces matchs (favori annoncé 51,9 %, gagne 54,4 % au-delà de
12 points) : Pinnacle a intégré l'information. Les signaux y gagnent moins sur la période récente, sans être
négatifs au seuil de 10 points ; les écarter coûte environ 6 % des signaux et 3 % du gain total. Ce que les
données ne montrent pas, c'est le risque propre à ces matchs : paris annulés, comptes surveillés.

**Autres critères testés** (fixés à l'avance ; on garde un critère si exclure ses matchs améliore nos signaux) :

| Critère | Matchs repérés | 2020-27 exclus | 2020-27 gardés |
|---|---|---|---|
| mouvement ≥ 10 points | 0,9 % | 123 paris, +7,8 % | 2 022 paris, +14,1 % |
| **mouvement ≥ 8 points** | **2,7 %** | **308 paris, +0,6 %** | **1 837 paris, +15,9 %** |
| mouvement ≥ 6 points | 8,0 % | 671 paris, +9,7 % | 1 474 paris, +15,5 % |
| mouvement relatif ≥ 35 % | 1,4 % | 76 paris, +11,7 % | 2 069 paris, +13,8 % |
| inhabituel pour le championnat | 1,5 % | 137 paris, +6,4 % | 2 008 paris, +14,2 % |
| désaccord Pinnacle / moyenne ≥ 4 points | 0,2 % | 182 paris, +7,0 % | 1 963 paris, +14,3 % |

La période 2013-20 compte trop peu de signaux (cotes de clôture des bookmakers rares) pour départager.
**Choix (0.6.9) : 8 points.** Trois fois plus de matchs plan repérés ; leurs signaux ne rapportaient presque
rien, donc les écarter ne coûte presque rien et relève la marge moyenne des autres. Un signal sur un match
qui n'a pas pu être vérifié (un seul prix de Pinnacle) le dit dans sa note.

**Règle de l'app** : mouvement ≥ 8 points (réglable) entre le premier et le dernier prix connu de
Pinnacle → « match plan » listé sur le tableau de bord et dans le rapport, aucun signal recommandé ni simulé.
