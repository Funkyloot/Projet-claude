# Ce qu'il faut fournir pour la version publiée de Pistonville

La version 1.0.1 est complète : le jeu, le Pack du fondateur, les bonus vidéo
et les statistiques sont en place. Il manque seulement **tes** comptes et
identifiants, que personne d'autre ne peut créer à ta place.

## À me donner (pour reconstruire la version finale)

| # | Quoi | Où le trouver | Format |
|---|---|---|---|
| 1 | **Fichier Firebase `google-services.json`** | console.firebase.google.com > projet « Pistonville » > Paramètres du projet > Vos applications > Android `fr.pistonville.jeu` > Télécharger | le fichier lui-même |
| 2 | **ID d'application AdMob** | admob.google.com > Applications > Pistonville > Paramètres de l'application | `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` (avec un **~**) |
| 3 | **ID du bloc d'annonces « Avec récompense »** | admob.google.com > Applications > Pistonville > Blocs d'annonces | `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ` (avec un **/**) |
| 4 | **Adresse e-mail de contact** (publique) | — | pour la politique de confidentialité et la fiche Play |
| 5 | *(facultatif)* **Nom de développeur** | celui de ton compte Play Console | pour les crédits du jeu |

Avec 1 à 4, je reconstruis l'AAB signé (la clé d'envoi reste la même).

## À faire de ton côté (pas besoin de me les envoyer)

1. **Compte Google Play Console** (25 $, une fois) et **profil de paiement**.
2. **Mettre en ligne la politique de confidentialité** (`confidentialite.html`,
   avec ton e-mail) — par exemple sur Google Sites — et coller son adresse
   dans la Play Console.
3. **Créer le produit intégré** `fondateur` à **4,00 €** (après le premier
   envoi en test interne).
4. **AdMob** : créer le message RGPD (Confidentialité et messages) et ajouter
   ton téléphone comme appareil de test.
5. **Firebase** : conservation des données à 2 mois ; relier Firebase à
   AdMob et à Google Play.
6. **Questionnaires** de la Play Console : réponses toutes prêtes dans
   `fiche-google-play.md`.
7. **Vidéo** : mettre `bande-annonce.mp4` sur ta chaîne YouTube et coller le
   lien dans la fiche.
8. **Test fermé** : recruter les testeurs demandés par Google (souvent 12
   pendant 14 jours pour un compte personnel récent).

## Garder en lieu sûr

- `pistonville-envoi.jks` et `CLE-ENVOI-A-GARDER.txt` (clé d'envoi et mot
  de passe) : indispensables pour **chaque** mise à jour.
