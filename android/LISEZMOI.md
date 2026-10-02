# Pistonville pour Android

Le jeu est une seule page HTML (l'édition « store », construite par
`tools/build-pistonville.mjs` dans `pistonville/dist/android/index.html`)
affichée plein écran dans une WebView. Le jeu tourne sur le téléphone du
joueur, sans serveur ; Internet ne sert qu'aux publicités récompensées
facultatives et à l'achat du Pack du fondateur (voir plus bas).

## Construire

Il faut le SDK Android (plateforme 36, build-tools 36) et Java 17 ou plus.

```
node tools/build-pistonville.mjs          # le jeu, dont l'édition store
cd android
./gradlew bundleRelease                   # app/build/outputs/bundle/release/app-release.aab (pour Google Play)
./gradlew assembleRelease                 # app/build/outputs/apk/release/app-release.apk (pour essayer sur un téléphone)
```

`local.properties` indique où est le SDK (`sdk.dir=...`).

## La clé d'envoi (à garder précieusement)

Google Play exige que chaque envoi soit signé avec la même **clé d'envoi**.
Le fichier `.jks` et son mot de passe ne sont **jamais** dans Git. Pour
construire une version signée, créer `android/signature.properties` :

```
fichier=/chemin/vers/pistonville-envoi.jks
alias=pistonville
motDePasse=...
```

Garder une copie de la clé et du mot de passe en lieu sûr (clé USB, coffre de
mots de passe). Avec la « signature des applications par Google Play »
(activée par défaut), une clé d'envoi perdue peut être remplacée en
contactant le support Google, mais c'est long.

## Mettre à jour le jeu sur Google Play

1. Faire les changements dans `pistonville/`, puis `node tools/build-pistonville.mjs`.
2. Dans `android/app/build.gradle`, **augmenter `versionCode` de 1** (2, 3, 4…)
   et mettre la nouvelle `versionName` (1.0.1, 1.1.0…). Google refuse un
   envoi dont le `versionCode` n'est pas plus grand que le précédent.
3. `cd android && ./gradlew bundleRelease`.
4. Play Console > Pistonville > Production (ou Tests) > Créer une version >
   envoyer `app-release.aab`, écrire les nouveautés, publier.
5. Les joueurs reçoivent la mise à jour automatiquement ; leur partie est
   gardée (elle est dans le stockage de l'application).

Les icônes se refont avec `python3 tools/android/icones.py`, les visuels de
la fiche avec `tools/android/fiche.py`.

## Publicités récompensées (AdMob) et Pack du fondateur

L'appli propose des **bonus vidéo facultatifs** (doubler une prime ou les gains
d'une balade) et un **achat unique**, le Pack du fondateur (produit
`fondateur` dans la Play Console, voir `store/fiche-google-play.md`).

Tant que `android/monetisation.properties` n'existe pas, l'appli utilise les
**identifiants de test de Google** : les publicités sont factices (« Test
Ad ») et ne rapportent rien. Pour de vraies publicités :

1. Créer un compte sur admob.google.com, ajouter l'appli Android
   « Pistonville » (après sa mise en ligne sur Google Play, ou en
   « non publiée » avant), puis créer un **bloc d'annonces « Avec
   récompense »**.
2. Dans AdMob > Confidentialité et messages : créer le **message RGPD**
   (Europe) — c'est le formulaire de consentement que l'appli affiche.
3. Créer `android/monetisation.properties` :

   ```
   admobAppId=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   pubRecompensee=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   ```

4. Reconstruire (`./gradlew bundleRelease`), augmenter `versionCode`, envoyer.
5. Pendant tes propres essais, **ne clique jamais sur tes vraies publicités**
   (AdMob peut suspendre le compte) : ajoute ton téléphone comme appareil de
   test dans AdMob.

## Statistiques de jeu (Google Analytics pour Firebase)

L'appli envoie des événements anonymes (voir `pistonville/src/stats.js`) :
`course_terminee`, `gp_termine`, `balade_commencee`, `balade_terminee`,
`lieu_visite`, `onglet`, `jour_suivant`, `bonus_propose`, `bonus_regarde`,
`bonus_pris`, `pack_vu`, `pack_achat_lance`, `pack_achete`,
`voiture_vendue`, `voiture_demontee`. Firebase ajoute de lui-même le temps
de jeu (`user_engagement`), les sessions, la fidélisation et les achats
(`in_app_purchase`).

Tant que `android/app/google-services.json` n'existe pas, les statistiques
sont désactivées (l'appli fonctionne normalement). Pour les activer :

1. console.firebase.google.com > Ajouter un projet « Pistonville »
   (Google Analytics : activé, compte Analytics par défaut).
2. Ajouter une application **Android**, nom du paquet **`fr.pistonville.jeu`**.
3. Télécharger **`google-services.json`** et le placer dans `android/app/`.
4. Dans Analytics > Paramètres de la propriété > Conservation des données :
   2 mois (c'est ce qu'annonce la politique de confidentialité).
5. Relier Firebase à AdMob et à Google Play (Paramètres du projet >
   Intégrations) pour voir revenus publicitaires et achats au même endroit.
6. Reconstruire, augmenter `versionCode`, envoyer.

Pour voir les événements en direct pendant tes essais :
`adb shell setprop debug.firebase.analytics.app fr.pistonville.jeu`, puis
Firebase > Analytics > DebugView.
