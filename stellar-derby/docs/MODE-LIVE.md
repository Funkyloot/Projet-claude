# Mode Live — guide pour les streameuses

Le mode Live reprend le format des vidéos de courses en live : les
spectateurs inscrivent leur pseudo Roblox, leur avatar court, le chat vote
la course et fait ses pronostics. **Sans rien miser** : les pronostics ne
rapportent qu'une place au classement de la soirée.

## 1. L'activer

| Où | Comment | Qui est la streameuse |
|---|---|---|
| Serveur privé | Créer un serveur privé du jeu et y entrer | la propriétaire du serveur privé |
| Studio (essais) | Workspace → Attributes → ajouter « ModeLive » (booléen), coché | le premier joueur |
| Serveur public | rien ne change | — |

La streameuse voit un bouton **🎥 Live** dans le menu de l'Académie. Tout
le serveur voit un bandeau : « tape !join <ton pseudo> dans le chat du
live ».

## 2. Animer une course

1. **Les invitées.** Les spectateurs écrivent `!join <pseudo Roblox>` dans
   le chat du live (avec le relais, voir plus bas). Sans relais, la
   streameuse colle les pseudos dans le panneau. Un pseudo inconnu de
   Roblox est refusé. La file contient au plus 30 coureuses, joueurs
   présents compris ; celles qui ont couru laissent la place aux suivantes.
2. **Le vote.** Choisir un hippodrome, puis « Proposer 3 courses au vote ».
   Le chat vote avec `!vote 1`, `!vote 2` ou `!vote 3` (un vote par
   personne). La course gagnante se présélectionne.
3. **Les pronostics.** Pendant le lobby, le chat écrit `!prono <numéro de
   dossard>` (un par personne et par course). Bonne gagnante : 10 points ;
   sur le podium : 3 points.
4. **La course.** « Lancer la course Live » : 30 s de lobby, pendant
   lesquelles les joueurs présents peuvent aussi s'inscrire (bouton
   « Courir ! » du bandeau). Tout le serveur regarde la course, puis le
   concert de la victoire. À la fin, le classement des pronostiqueurs
   s'affiche.

Les invitées sont pilotées par l'IA, avec l'avatar de leur compte Roblox et
**3 000 points de stats comme tout le monde** : la course reste égale.

## 3. Le relais du chat (facultatif)

Le jeu ne se connecte à aucune plateforme de live. Il lit simplement, toutes
les 2 secondes, une adresse web (le « relais ») qui lui renvoie les derniers
messages du chat. C'est à la streameuse (ou à un ami développeur) de faire
tourner ce relais, avec l'outil de son choix.

### Brancher le relais

1. Dans `src/server/ModeLive.luau`, coller l'adresse dans la constante
   `RELAIS` (par exemple `"https://mon-relais.exemple/chat"`).
2. Dans Studio : Game Settings → Security → **Allow HTTP Requests**.

### Le protocole

Le jeu appelle :

```
GET <RELAIS>?curseur=<dernier curseur reçu>
```

Le premier appel envoie un curseur vide. Le relais répond en JSON :

```json
{
  "curseur": "1842",
  "messages": [
    { "auteur": "camille_42", "texte": "!join Camille" },
    { "auteur": "lea", "texte": "!prono 7" },
    { "auteur": "noa", "texte": "!vote 2" }
  ]
}
```

- `curseur` : n'importe quelle valeur qui permet au relais de savoir ce qui
  a déjà été envoyé ; le jeu la renvoie telle quelle au prochain appel.
- `messages` : les messages arrivés depuis ce curseur (au plus 200 lus par
  appel). Les messages qui ne sont pas des commandes sont ignorés.

Le jeu n'envoie rien d'autre que le curseur. Les noms des auteurs ne
s'affichent dans le jeu qu'après le filtre de texte de Roblox.

### Un relais minimal

Un exemple générique, en Node.js sans bibliothèque : il garde les messages
en mémoire et les sert au jeu. Le branchement sur la plateforme de live (ce
qui appelle `ajouter`) est à écrire selon l'outil utilisé ; ici, on peut
aussi poster des messages à la main pour tester.

```js
// relais.js — node relais.js
const http = require("http");
const messages = []; // { id, auteur, texte }
let suivant = 1;

function ajouter(auteur, texte) {
  messages.push({ id: suivant++, auteur, texte });
  if (messages.length > 1000) messages.shift();
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname === "/message") {
    let corps = "";
    req.on("data", (c) => (corps += c));
    req.on("end", () => {
      const { auteur, texte } = JSON.parse(corps || "{}");
      if (typeof auteur === "string" && typeof texte === "string") ajouter(auteur, texte);
      res.end("ok");
    });
    return;
  }
  if (url.pathname === "/chat") {
    const depuis = Number(url.searchParams.get("curseur")) || 0;
    const nouveaux = messages.filter((m) => m.id > depuis).slice(0, 200);
    const curseur = nouveaux.length ? nouveaux[nouveaux.length - 1].id : depuis;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ curseur: String(curseur), messages: nouveaux.map(({ auteur, texte }) => ({ auteur, texte })) }));
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(8080);
```

Le relais doit être joignable depuis Internet en HTTPS (Roblox n'appelle pas
`localhost`) : un petit hébergement ou un tunnel fait l'affaire.

## 4. Les règles à respecter

- Vérifier les **conditions d'utilisation** de Roblox et de la plateforme de
  live avant de brancher un relais.
- **Jamais de contrepartie aux cadeaux ou dons du live** sous forme
  d'avantage en course : pas de stats, pas de meilleure place, pas de
  priorité payante dans la file. Le jeu n'en propose pas, et il ne faut pas
  en ajouter.
- Les pronostics restent un jeu sans mise : ni Robux, ni étoiles, ni objets.
- Les pseudos inscrits sont des pseudos Roblox (déjà modérés par Roblox) ;
  les noms venus du chat passent par le filtre de texte de Roblox avant
  d'être affichés.
