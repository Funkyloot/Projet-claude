# Jouer à Pistonville sur ton téléphone, depuis ton PC, même hors de la maison

Le PC fait serveur : il garde le jeu et le sert au téléphone. Il doit rester
allumé (et ne pas se mettre en veille) pendant que tu joues.

## 0. Sur un serveur Linux (VM Proxmox, etc.) : tout en un

Dans la console du serveur (en root), colle ces deux lignes :

```
cd /root/projet-claude && git fetch origin claude/kairosoft-hybrid-racing-game-5x34eg && git worktree add /opt/pistonville FETCH_HEAD
bash /opt/pistonville/pistonville/installer-serveur.sh
```

Le script installe le jeu comme service (il redémarre tout seul), affiche
l'adresse à ouvrir sur le téléphone, et explique Tailscale pour jouer hors de
la maison. Pour mettre à jour plus tard : `bash /opt/pistonville/pistonville/installer-serveur.sh`.

## 1. Une seule fois, sur le PC

1. Installe **Node.js** (version LTS) : https://nodejs.org
2. Récupère le projet : sur GitHub, branche `claude/kairosoft-hybrid-racing-game-5x34eg`,
   bouton **Code → Download ZIP**, puis décompresse (ou `git clone` / `git pull`).
   Le jeu est déjà construit dans `pistonville/dist/web/` : rien d'autre à installer.

## 2. Lancer le serveur

- **Windows** : double-clic sur `pistonville/Lancer-serveur.bat`
- **Mac / Linux** : `pistonville/lancer-serveur.sh`
- ou, depuis le dossier du projet : `npm run pistonville:serveur` (reconstruit puis sert)

La fenêtre affiche les adresses. **À la maison, sur le même Wi-Fi**, ouvre sur
le téléphone l'adresse « Téléphone (même Wi-Fi) », par exemple
`http://192.168.1.20:8080`. Si Windows demande d'autoriser Node.js sur le
réseau, accepte pour les **réseaux privés**.

## 3. Hors de la maison : deux possibilités

### A. Tailscale — recommandé (privé, adresse fixe, https)

Seuls tes appareils peuvent ouvrir le jeu, et l'adresse ne change jamais :
ta sauvegarde reste en place et l'installation sur l'écran d'accueil marche.

1. Installe **Tailscale** sur le PC et sur le téléphone (https://tailscale.com/download)
   et connecte-les au **même compte**.
2. Sur le PC, serveur lancé, ouvre un terminal et tape :
   ```
   tailscale serve --bg 8080
   ```
   La première fois, Tailscale peut demander d'activer HTTPS pour ton réseau
   (un lien s'affiche, il suffit de valider). Il affiche ensuite une adresse
   du type `https://mon-pc.nom-du-reseau.ts.net`.
3. Sur le téléphone, Tailscale activé (en 4G ou ailleurs), ouvre cette adresse.

Pour arrêter le partage : `tailscale serve --https=443 off`.

### B. Cloudflare — rapide, sans compte (lien public temporaire)

1. Installe `cloudflared` :
   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Serveur lancé, double-clic sur `pistonville/Partager-avec-Cloudflare.bat`
   (ou `cloudflared tunnel --url http://localhost:8080`).
3. Il affiche une adresse `https://quelque-chose.trycloudflare.com` : ouvre-la sur le téléphone.

Attention : **n'importe qui ayant le lien peut jouer**, et l'adresse change à
chaque lancement. Comme la sauvegarde est rangée par adresse, utilise
« Transférer ma sauvegarde » (écran titre) pour retrouver ta partie.

## 4. L'installer comme une vraie appli

Sur l'adresse https (Tailscale ou Cloudflare) :
- **Android / Chrome** : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
- **iPhone / Safari** : bouton Partager → « Sur l'écran d'accueil ».

Le jeu s'ouvre alors en plein écran avec son icône, et marche **même sans
réseau** une fois chargé.

## 5. Garder sa partie entre PC et téléphone

Chaque appareil, et chaque adresse, a sa propre sauvegarde. Écran titre →
« Transférer ma sauvegarde (PC ↔ téléphone) » : copie le code sur un appareil,
colle-le sur l'autre. Le code contient toute la partie : garde-le pour toi.

## En cas de souci

- Rien ne s'ouvre à la maison : PC et téléphone sur le même Wi-Fi ? Pare-feu
  Windows : autoriser Node.js sur les réseaux privés.
- Rien ne s'ouvre dehors : la fenêtre du serveur est-elle encore ouverte ? Le PC en veille ?
- Pas la dernière version : recharge la page quand le PC est allumé.
