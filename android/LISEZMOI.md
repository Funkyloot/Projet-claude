# Pistonville pour Android

Le jeu est une seule page HTML (l'édition « store », construite par
`tools/build-pistonville.mjs` dans `pistonville/dist/android/index.html`)
affichée plein écran dans une WebView. Tout tourne sur le téléphone du
joueur : aucune connexion, aucun serveur, aucune permission Internet.

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
