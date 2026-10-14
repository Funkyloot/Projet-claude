# Moteur de paris : mémoire du projet

## Vocabulaire de l'utilisateur (à garder tel quel, dans l'app et dans les réponses)

- **Matchs plan** : matchs où la cote de Pinnacle bouge de façon anormale avant le coup d'envoi
  (réglage « Mouvement anormal de Pinnacle », 10 points par défaut). L'app les liste pour que
  l'utilisateur les **évite** : aucun signal, aucun pari simulé, jamais de pronostic dessus
  (RECHERCHE.md §11). Dans le code : `mouvement_anormal`, `a_eviter`.
