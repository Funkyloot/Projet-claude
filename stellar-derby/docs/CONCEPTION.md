# Stellar Derby — document de conception

> Un jeu de course Roblox inspiré de l'esprit d'*Uma Musume: Pretty Derby* :
> des coureuses aux oreilles et à la queue de cheval, qui s'entraînent, courent
> et finissent sur scène. Univers, personnages et musiques originaux.

*Nom de travail. Version du document : prototype de phase 1.*

---

## 1. Ce qu'on a vu, et ce qui manque

Les vidéos de référence montrent deux formats qui marchent déjà sur Roblox :

| Format | Ce qu'on voit | Limite |
|---|---|---|
| **Spectacle TikTok Live** | Les spectateurs commentent leur pseudo, leur avatar apparaît et court tout droit vers une arche FINISH. | Personne ne joue : c'est une loterie animée. |
| **Course jouable** | Tour 1/1, mini-carte, rang, barre d'endurance, aura éclair, biomes variés. | La course seule : ni entraînement, ni histoire, ni après-course. |

Uma Musume, c'est **trois choses** : l'entraînement, la course, et le *Winning
Live* (le concert de la gagnante). Les jeux de fans s'arrêtent à la deuxième.
Stellar Derby se différencie en faisant les trois, en rendant la course
*décidable* par le joueur, et en faisant de chaque course une petite histoire.

## 2. Les piliers

1. **La course se joue, elle ne se regarde pas.** Quatre décisions simples, lisibles sur téléphone : le rythme, le couloir, le moment du sprint, la compétence. Les stats fixent le plafond ; les décisions font la différence.
2. **Chaque course raconte une histoire.** Commentateur, changements de tête, duels, photo-finish au ralenti, écarts à la japonaise (« Nez », « Encolure »), rivales.
3. **On court ensemble.** Joueuses et bots dans le même peloton, un public pour le podium, plus tard le duo entraîneuse–coureuse et le mode Live.
4. **Original et respectueux.** On s'inspire, on ne copie pas (voir §3). Pas de contenu suggestif : sport, amitié, idoles.

## 3. Cadre légal et identité

Uma Musume appartient à Cygames, et ses personnages portent, sous licence, les noms de vrais chevaux. Reprendre noms, modèles, chansons ou logo exposerait le jeu à un retrait par plainte DMCA dès qu'il marcherait. Donc :

- **Aucun** personnage, nom, logo, musique ou visuel officiel.
- **Aucun nom de vrai cheval de course** : les 30 noms de bots sont inventés (*Brise Lunaire*, *Comète Écarlate*, *Perle Marine*…).
- Les **mécaniques** (vitesse de base, endurance, stratégies) ne sont pas protégées. Notre modèle s'inspire de ce que la communauté a documenté, mais il est recalibré et étendu (rythme, couloirs, sillage, sprint au choix du joueur).
- **Ton** : sport et idoles. Cygames a des règles strictes sur ce point, et la communauté y tient.

**Univers proposé — l'Archipel des Vents.** Une académie de course sur un archipel ; chaque île est un hippodrome au caractère propre (plage, savane, falaises, ville). Le prototype en contient un : l'hippodrome de l'Archipel, avec son étang, ses cerisiers et sa tribune rose et blanche.

## 4. Les boucles de jeu

| Boucle | Durée | Contenu |
|---|---|---|
| **Course** | ~2 min | Lobby (choix stratégie + profil) → présentation des partantes → stalles → course → podium. |
| **Session** | 10–15 min | Plusieurs courses d'affilée sur des distances variées ; progression des récompenses. |
| **Carrière** (phase 3) | 30–45 min | Trois « années » condensées : entraînement, événements à choix, courses-objectifs, puis la coureuse devient une Légende. |
| **Méta** | semaines | Collection de Légendes, héritage, saisons, Grand Prix du week-end, cosmétiques. |

## 5. La course, en détail

*Tout ce qui suit est implémenté dans `src/shared/Course/` et couvert par des tests.*

### 5.1 Principe

Le serveur simule la course à pas fixe (30 pas/s). Chaque coureuse a une **distance parcourue** et un **couloir** (sa distance à la corde, en mètres). La physique Roblox n'intervient pas ; les clients ne simulent rien et affichent ce que le serveur envoie, en interpolant.

Pourquoi : 12 coureuses (ou 80 en mode Live) restent fluides, la triche côté client est impossible, le classement n'est qu'un tri, et une course est **rejouable** à l'identique à partir de sa graine.

### 5.2 Les stats

| Stat | Rôle |
|---|---|
| **Vitesse** | La pointe : ce qu'on gagne en finale et au sprint. |
| **Souffle** | La réserve d'endurance. |
| **Puissance** | Accélération, vitesse des changements de couloir. |
| **Cœur** | Coût de la finale, vitesse quand on est « à bout », force en duel. |
| **Instinct** | Fenêtre des compétences, régularité de l'allure, justesse du sprint chez les bots. |

Une coureuse moyenne a 600 partout. Les quatre profils proposés au joueur totalisent tous 3 000 : on choisit un **style**, pas un niveau.

| Profil | Vitesse | Souffle | Puissance | Cœur | Instinct |
|---|---:|---:|---:|---:|---:|
| Équilibrée | 600 | 600 | 600 | 600 | 600 |
| Sprinteuse | 720 | 500 | 680 | 520 | 580 |
| Endurante | 540 | 800 | 520 | 640 | 500 |
| Tacticienne | 590 | 620 | 560 | 560 | 670 |

### 5.3 Vitesse et endurance

- **Vitesse de base** de la course : `V0 = 20 − (distance − 2000) / 1000` m/s (−0,25 sur terrain lourd).
- **Phases** : début (premier sixième), milieu (jusqu'aux deux tiers), finale.
- **Vitesse visée** = `V0 × coefficient de la stratégie pour la phase × rythme`, plus la pointe en finale (`√(500 × Vitesse) × 0,002`).
- **Sprint** : `(V0 × coef finale + 0,01 V0) × 1,05 + pointe + bonus de Cœur`.
- **Endurance max** = `0,7 × coef stratégie × Souffle + distance`.
- **Consommation** par seconde = `20 × (v − V0 + 12)² / 144`, multipliée en finale par `1 + 200 / √(600 × Cœur)`. Aller un peu plus vite coûte nettement plus cher.
- **À bout** (endurance à zéro) : la coureuse retombe à ~85 % de V0.

### 5.4 Les quatre stratégies

| | Stratégie | Idée | Coef. vitesse (début / milieu / finale) | Réserve |
|---|---|---|---|---:|
| 🚀 | **Fusée** | part en tête et tient ; régulière, forte en sprint | 1,000 / 0,983 / 0,9787 | 0,95 |
| 🌑 | **Ombre** | colle aux meneuses, frappe au dernier virage | 0,978 / 0,991 / 0,9775 | 0,89 |
| 🌊 | **Vague** | reste au milieu, remonte en finale | 0,938 / 0,998 / 0,9859 | 1,00 |
| 🌪️ | **Tempête** | attend au fond et explose ; tout ou rien, forte sur le long | 0,931 / 1,000 / 0,9941 | 0,995 |

Les coefficients de finale sortent de l'outil d'auto-réglage (`tests/reglage.luau`), qui égalise le **rang moyen** des stratégies et réduit l'écart de victoires. Il reste un écart voulu : la Fusée finit souvent bien placée sans gagner beaucoup, la Tempête gagne plus souvent mais finit aussi plus souvent loin. Mesures dans [`EQUILIBRAGE.md`](EQUILIBRAGE.md).

### 5.5 Ce que le joueur contrôle

| Levier | Effet | Tension |
|---|---|---|
| **Rythme** (Économie / Normal / Pousser) | ±2,5 % de vitesse visée | Pousser coûte ~8 % d'endurance en plus ; économiser en fait gagner autant. |
| **Couloir** (◀ ▶) | un pas = 1,2 m | Se glisser dans le sillage d'une concurrente, sortir d'un blocage, dépasser. Le couloir ne change pas la distance à courir. |
| **Sprint** | se déclenche en finale, sans retour possible | Trop tôt, on finit « à bout » ; trop tard, on laisse des longueurs. |
| **Compétence** | à déclencher dans sa fenêtre (≈ 2,5 s) | Manquée, elle est perdue pour la course. |
| **Départ** | appuyer pile au « Partez ! » | Parfait : sortie immédiate et relance plus vive. Trop tôt : faux départ, −0,25 s. |

**Garde-fous pour les débutantes.** Enfermée depuis plus d'une seconde et demie, et sans ordre de couloir depuis 3 s, la coureuse se décale seule là où il y a de la place. Si la joueuse ne sprinte pas, sa coureuse le fait d'elle-même 4 s après que le sprint est devenu tenable. La joueuse qui ne touche à rien finit en moyenne 9ᵉ sur 12 : moins bien qu'un bot, sans être ridicule.

**L'indice de sprint.** En finale, le HUD calcule combien de mètres de sprint le souffle permet (« Souffle pour 320 m · reste 450 m »), et le bouton passe à « SPRINT ! » quand c'est le moment. C'est exactement le calcul de l'IA, sans son erreur d'estimation.

### 5.6 Le peloton

- **Virages** : toutes les coureuses parcourent la même distance, quel que soit leur couloir (voir §5.10).
- **Sillage** : entre 0,6 et 6 m derrière une concurrente, dans son couloir : −15 % de consommation et +0,1 m/s.
- **Blocage** : à moins de 1,6 m, on ne peut pas aller plus vite que celle de devant ; à 1,1 m, on ne la traverse jamais.
- **Changement de couloir** : impossible si quelqu'un est à côté, du côté où l'on veut aller.
- **Duel** : deux coureuses au coude-à-coude (moins de 2 m d'écart) dans la dernière ligne droite se poussent mutuellement (bonus selon le Cœur), quel que soit leur couloir.
- **Allure** : petite variation à chaque 24ᵉ de la course, décalée vers le positif par l'Instinct.

### 5.7 Compétences

Chaque coureuse a la signature de sa stratégie, plus une compétence générale.

| Compétence | Condition | Effet |
|---|---|---|
| Échappée belle (Fusée) | début de course, 1re ou 2e | +0,3 m/s, 3,5 s |
| Coup de reins (Ombre) | dernier virage, 2e à 5e | +0,35 m/s, 3,5 s |
| Remontée (Vague) | finale, au cœur du peloton | +0,35 m/s, 4 s |
| Ouragan (Tempête) | dernière ligne droite, seconde moitié du peloton | +0,35 m/s, 3,5 s |
| Virage parfait | en virage, la voie libre devant soi | +0,2 m/s, 3 s |
| Second souffle | milieu de course, endurance < 55 % | +5,5 % d'endurance |
| Dans le sillage | 3 s à l'abri | +4 % d'endurance |
| Tête froide | en tête au milieu de course | +3,5 % d'endurance |
| Regard d'acier | en duel | +0,4 m/s², 2,5 s |
| Départ canon | premiers mètres | +0,6 m/s², 2 s |

### 5.8 L'arrivée

- **Photo-finish** : si les deux premières sont à moins de 15 cm à 6 m de la ligne, toute la course passe au ralenti (×0,3) pour tout le monde, caméra latérale sur la ligne.
- **Écarts à la japonaise** : Nez, Tête, Encolure, ½, ¾, 1 longueur, 1 ¼… jusqu'à « Large ».
- **Cadres de couleur** : blanc, noir, rouge, bleu, jaune, vert, orange, rose, selon la règle japonaise (au-delà de 8 partantes, les derniers cadres prennent deux numéros).

### 5.9 Le calendrier du prototype

| Course | Distance | Catégorie | Terrain | Météo |
|---|---:|---|---|---|
| Coupe des Alizés | 1 400 m | Sprint | bon | soleil |
| Prix de l'Aube | 1 800 m | Mile | bon | petit matin |
| Grand Prix de l'Archipel | 2 000 m | Moyenne | bon | couchant |
| Trophée des Marées | 2 600 m | Longue | lourd | pluie |

Les courtes distances se jouent surtout au placement : tout le monde peut sprinter toute la finale. Les longues se jouent à la gestion : il faut économiser, et choisir son moment. Sur le Trophée des Marées, la moitié du peloton finit à bout de souffle, presque toujours dans les trente derniers mètres.

### 5.10 Une course équitable

Personne n'est avantagée au départ :

- **Même total de stats pour toutes** : 3 000 points, joueuses comme bots. Seule leur répartition change.
- **Même distance pour toutes** : en virage, le couloir ne change pas la distance à parcourir. Avec la géométrie réelle, le numéro de stalle tiré au sort pesait jusqu'à quatre places au classement, et aucun réglage intermédiaire ne l'annulait sur toutes les distances. Désormais, le rang moyen de chaque stalle reste dans le bruit statistique (mesuré dans [`EQUILIBRAGE.md`](EQUILIBRAGE.md)).
- **Mêmes leviers pour toutes** : les bots n'ont aucun avantage caché, et les aides des joueuses (se dégager quand on est enfermée, sprint automatique) sont des aides de débutante, pas des avantages.
- **Aucune position privilégiée** : quand un bot change de couloir, il choisit le côté au hasard, sans préférer l'intérieur ni l'extérieur.
- **Des stalles centrées** : les stalles laissent un couloir libre contre chaque lice.
- **Des duels au coude-à-coude** : le duel se déclenche entre deux coureuses à la même hauteur, quel que soit leur couloir. Quand il fallait être côte à côte, les coureuses du milieu de la piste, qui ont une voisine de chaque côté, en profitaient plus que celles des bords : sur 800 courses, les stalles du milieu gagnaient environ une demi-place.

Le couloir garde tout son intérêt tactique : se mettre dans le sillage d'une concurrente fait économiser 15 % d'endurance, et il faut trouver une ouverture pour doubler.

## 6. Interface et contrôles

**Pensée d'abord pour le téléphone** (la majorité des joueurs Roblox, et tout le public TikTok).

| | Clavier | Manette | Tactile |
|---|---|---|---|
| Couloir | ← → / A D / Q | croix ← → | gros boutons ◀ ▶ (pouce gauche) |
| Rythme | ↑ ↓ / W S / Z | croix ↑ ↓ | trois boutons au-dessus du souffle |
| Départ, puis sprint | Espace | A | gros bouton rond (pouce droit) |
| Compétence | E | X | bouton doré qui apparaît |
| Caméra | C | Y | 🎥 |

HUD : mini-carte, nom de la course, phase lisible (« Dernier virage »), distance restante, rang, souffle, état (sillage, bloquée), commentateur, compte à rebours, alertes. Caméras : poursuite (le champ s'élargit au sprint), vue TV, photo-finish, travelling des stalles, podium.

## 7. Les touches personnelles

Classées par ordre de mise en œuvre. ✅ = déjà dans le prototype.

1. ✅ **Les robes.** Au lobby, chaque joueuse choisit la couleur de son pelage parmi dix (Noir, Bai brun, Alezan, Alezan cuivré, Isabelle, Gris perle, Rose poudré, Framboise, Prune, Bleu nuit). Ses oreilles et sa queue, tirées du catalogue Roblox, prennent cette couleur.
2. ✅ **Le commentateur.** Une phrase par événement (départ, tête, dernier virage, duel, à bout, compétence, photo-finish, victoire), avec priorités pour ne pas saturer l'écran.
3. ✅ **Le photo-finish au ralenti**, partagé par tout le serveur, avec la marge exacte à la japonaise.
4. ✅ **Ton avatar, avec oreilles et queue.** On garde l'avatar Roblox du joueur et on y ajoute celles de sa robe ; la queue laisse une traînée qui flotte en course.
5. ✅ **L'écran géant, le podium et les sons** (musique de course, foule, fanfare).
6. **Le Winning Live jouable.** La gagnante joue un mini-jeu de rythme au centre de la scène, avec la 2e et la 3e à ses côtés. Les autres joueurs sont dans la fosse : ils choisissent la couleur de leur bâton lumineux et remplissent une jauge d'ambiance qui augmente les récompenses de tous. *Aucun jeu de fan ne le fait.*
7. **Les compétences signature en cinématique.** 1,5 s de mise en scène (zoom, fond stylisé, phrase signature) au déclenchement, comme les *unique skills* d'Uma Musume.
8. **Les rivales du destin.** Le jeu mémorise qui t'a battue d'une encolure ; elle réapparaît marquée « RIVALE », et la battre rapporte un titre.
9. **Le duo entraîneuse–coureuse.** Un joueur court, l'autre entraîne : une roue d'ordres (« Garde ton souffle ! », « Dans son sillage ! », « MAINTENANT ! ») donne de petits bonus s'ils tombent au bon moment. C'est la relation centrale de l'anime, transformée en coopération.
10. **La carrière roguelite et l'héritage.** Trois années en 30–45 min ; la coureuse devient une Légende qui peut transmettre des bonus aux prochaines carrières, les tiennes ou celles de tes amies.
11. **Des pistes vivantes.** *Coupe des Marées* : le raccourci côté mer se ferme quand la marée monte ; courses de nuit aux lanternes ; une mécanique propre à chaque île.

## 8. Le mode Live (TikTok)

C'est le format des vidéos de référence, en mieux.

- Le spectateur tape `!join pseudo` : sa coureuse apparaît avec son vrai avatar Roblox (le moteur tient 80 coureuses, et l'instantané réseau de 80 coureuses tient sous la limite de 900 octets).
- Le chat **vote** pour la météo ou pour une compétence surprise.
- **Pronostics sans mise** : deviner la gagnante pour des points de prestige. Rien qui ressemble à un pari.

**Technique.** Roblox ne peut pas *recevoir* de requêtes extérieures. Il faut donc un petit relais (TikTok → serveur relais) que le serveur Roblox interroge régulièrement par `HttpService`. Le mode s'active sur des serveurs privés de streamers.

**À vérifier avant de lancer** : les règles Roblox sur les intégrations externes et sur toute contrepartie liée aux cadeaux TikTok. Un cadeau ne doit jamais acheter un avantage en course.

## 9. Architecture technique

```
src/shared/            (ReplicatedStorage.Partage)
  Course/              moteur pur, sans API Roblox, testé hors de Roblox
    Piste              géométrie (tronçons, abscisses, courbure)
    Formules           physique de la course
    Strategies         les quatre stratégies
    Competences        les compétences
    Simulation         une course, pas à pas
    IA                 les décisions des bots
    Peloton            profils, bots, noms
    Courses            le calendrier
    Paquet             l'instantané réseau en binaire (11 octets par coureuse)
    Commentaire        les phrases du commentateur
    Aleatoire          générateur déterministe
  Config, Couleurs, Monde (mètres → studs), Reseau (canaux, état partagé)
src/server/            boucle de partie, hippodrome, modèles, ambiance
src/client/            état, rendu interpolé, caméras, contrôles, HUD, lobby, résultats
tests/                 tests (Lune), équilibrage, auto-réglage
tools/                 décor enregistré dans la place, rediffusions, aperçu web
```

- **Autorité serveur** : le client n'envoie que des intentions (rythme, couloir, sprint, compétence, départ). Toutes sont validées et limitées à 20 par seconde.
- **Réseau** : 15 instantanés/s par `UnreliableRemoteEvent` (binaire), événements de course par `RemoteEvent`, état de partie par attributs (un joueur qui arrive en pleine course voit tout de suite où on en est).
- **Rendu** : le client affiche avec 150 ms de retard pour toujours interpoler entre deux instantanés.
- **Robustesse** : une course qui plante n'arrête pas le serveur ; une joueuse qui part est remplacée par l'IA.

## 10. Monétisation

Uniquement du cosmétique et du confort :

- tenues de course, effets visuels de compétence, couleurs de bâton lumineux ;
- décoration du dortoir et des écuries ;
- serveurs privés.

**Jamais de stats à acheter.** Ce serait la meilleure façon de tuer le classé.

## 11. Feuille de route

| Phase | Durée (solo) | Contenu | Critère de sortie |
|---|---|---|---|
| **0 — Préproduction** ✅ | 1–2 sem | Identité, document de conception, calendrier | L'identité tient sans aucun élément d'Uma Musume. |
| **1 — Prototype de course** ✅ | 3–4 sem | Moteur, bots, stratégies, rythme, couloirs, sillage, sprint, compétences, photo-finish, HUD, mini-carte, commentateur, podium, course équitable, robes du catalogue, sons, décor habillable | Une course de 60–120 s est intéressante **sans** décor final. *À valider en jeu avec 5 testeurs (voir [`CE-SOIR.md`](CE-SOIR.md)).* |
| **2 — Tranche verticale** | 4–6 sem | Sauvegarde (ProfileStore), entraînement (5 mini-jeux), une île finale, sons et musique, cinématiques de compétences | Les testeurs relancent d'eux-mêmes une deuxième session. |
| **3 — Alpha fermée** | 4 sem | Winning Live, carrière courte, rivales, 3 pistes, matchmaking | Rétention J1 ≥ 25 % sur les testeurs Discord. |
| **4 — Lancement** | 4 sem | Tutoriel, mode Live streamer, statistiques, boutique cosmétique | Rétention J1 ≥ 20 %, J7 ≥ 6 % en public. |
| **5 — Suivi** | continu | Saisons mensuelles, Grand Prix du week-end, nouvelles îles et coureuses | — |

## 12. Risques et parades

| Risque | Parade |
|---|---|
| Plainte pour contrefaçon | Univers 100 % original ; relecture « rien d'officiel » avant chaque mise à jour. |
| La course semble « automatique » | Décisions visibles (indice de sprint, alertes « bloquée », « sillage ») ; écarts serrés : jusqu'à 2 000 m, sept courses sur dix se jouent à une encolure ou moins, et une sur sept finit en photo-finish. |
| Avantage d'une stalle | Réglé : la distance ne dépend plus du couloir, et les bots choisissent leur côté au hasard. Le rapport d'équilibrage vérifie à chaque fois qu'aucune stalle ne s'écarte du rang neutre au-delà du hasard. |
| Latence mobile | Ordres lents par nature (rythme, couloir) ; affichage interpolé ; le départ parfait se mesure côté client. |
| Triche sur le départ parfait | L'heure d'appui vient du client (accepté au prototype). Plus tard : la borner par la latence mesurée. |
| Serveurs vides | Bots pour compléter, et courses qui tournent même avec une seule joueuse. |

## 13. Indicateurs à suivre

- Durée de session et nombre de courses par session.
- Part des joueuses qui utilisent le sprint *avant* le sprint automatique (apprentissage).
- Taux de compétences manquées (lisibilité de l'interface).
- Répartition des stratégies choisies ; taux de victoire par stratégie en vrai (à comparer à `EQUILIBRAGE.md`).
- Rétention J1 / J7 / J30, conversion cosmétique.

## 14. Questions ouvertes

- Le nom définitif (*Stellar Derby*, *Galop Étoile*, *Derby Starlight*…).
- Le style visuel des coureuses : avatar du joueur + kit (actuel), ou modèles originaux stylisés ?
- La musique du Winning Live : commande à un compositeur, ou bibliothèque libre de droits ?
- Le classé : saisonnier avec ligues, ou simple classement Elo ?
