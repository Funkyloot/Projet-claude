/* build-pistonville.mjs — assemble Pistonville en une seule page HTML.
 *
 * Le résultat, pistonville/dist/pistonville.html, contient tout : code,
 * styles, images Kenney et police. On l'ouvre d'un double-clic, sans serveur
 * ni connexion. La version de `pistonville/` reste la référence.
 *
 * Il prépare aussi pistonville/dist/web/, la version à servir sur un serveur
 * pour jouer au téléphone : la même page, plus un manifeste et un service
 * worker pour l'installer sur l'écran d'accueil (plein écran, hors ligne).
 *
 * Et pistonville/dist/android/index.html : l'édition « store », pour
 * l'application Android (android/), sans serveur, ni transfert de
 * sauvegarde, ni bouton de mise à jour (voir src/edition.js).
 *
 * Usage : node tools/build-pistonville.mjs
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'pistonville');

async function code(store) {
  const { outputFiles } = await build({
    entryPoints: [join(RACINE, 'src', 'main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    minify: false,          // lisible : c'est aussi un objet à lire, pas qu'à exécuter
    legalComments: 'none',
    define: { __STORE__: store ? 'true' : 'false' },
  });
  return outputFiles[0].text;
}
const js = await code(false);

const TYPES = { '.png': 'image/png', '.woff2': 'font/woff2' };
const dataUrl = (chemin) =>
  `data:${TYPES[extname(chemin)]};base64,${readFileSync(join(RACINE, chemin)).toString('base64')}`;

const assets = {};
const ajouter = (chemin) => { assets[chemin] = dataUrl(chemin); };
ajouter('assets/kenney/rpg-urban.png');
ajouter('assets/kenney/course.png');
ajouter('assets/kenney/modern-city.png');
ajouter('assets/kenney/voitures-3d.png');
ajouter('assets/kenney/voitures-3d-masque.png');
for (const f of readdirSync(join(RACINE, 'assets/kenney/profil'))) ajouter(`assets/kenney/profil/${f}`);
for (const p of ['factory', 'town', 'battle', 'ski', 'farm']) ajouter(`assets/kenney/tiny-${p}/tilemap_packed.png`);
ajouter('assets/police/Jersey10.woff2');

const css = readFileSync(join(RACINE, 'style.css'), 'utf8')
  .replace("url('assets/police/Jersey10.woff2')", `url('${assets['assets/police/Jersey10.woff2']}')`);

const assembler = (script) => readFileSync(join(RACINE, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="src/main.js"></script>',
    () => `<script>window.__PV_ASSETS = ${JSON.stringify(assets)};</script>\n<script>\n${script}\n</script>`,
  );
const page = assembler(js);

mkdirSync(join(RACINE, 'dist'), { recursive: true });
const sortie = join(RACINE, 'dist', 'pistonville.html');
writeFileSync(sortie, page);
console.log(`dist/pistonville.html : ${(page.length / 1024).toFixed(0)} ko`);

// --- Version web installable (dist/web) -------------------------------------
const WEB = join(RACINE, 'dist', 'web');
mkdirSync(join(WEB, 'icones'), { recursive: true });
for (const f of readdirSync(join(RACINE, 'assets', 'icones'))) copyFileSync(join(RACINE, 'assets', 'icones', f), join(WEB, 'icones', f));
const version = createHash('sha1').update(page).digest('hex').slice(0, 10);
const pageWeb = page
  .replace('<meta name="theme-color" content="#141022">', `<meta name="theme-color" content="#141022">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icones/icone-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pistonville">`)
  .replace('</body>', `<script>
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
</script>
</body>`);
writeFileSync(join(WEB, 'index.html'), pageWeb);
writeFileSync(join(WEB, 'manifest.webmanifest'), JSON.stringify({
  name: 'Pistonville', short_name: 'Pistonville', lang: 'fr', start_url: './', scope: './',
  display: 'fullscreen', orientation: 'portrait', background_color: '#141022', theme_color: '#141022',
  description: "Gère ton écurie, construis tes voitures et cours les Grands Prix de Pistonville.",
  icons: [
    { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icones/icone-512-masquable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
// Service worker : tout le jeu tient dans index.html ; on le met en cache.
// La version change à chaque construction : le téléphone récupère la nouvelle.
writeFileSync(join(WEB, 'sw.js'), `/* sw.js — Pistonville hors ligne. Version ${version}. */
const VERSION = 'pistonville-${version}';
const FICHIERS = ['./', './index.html', './manifest.webmanifest', './icones/icone-192.png', './icones/icone-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(FICHIERS.map((f) => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (pour voir tout de suite les mises à jour), cache si hors ligne.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    const copie = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copie)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
`);
writeFileSync(join(WEB, 'version.txt'), `${version}\n`);
console.log(`dist/web/ : version ${version}`);

// --- Édition store pour l'application Android (dist/android) ----------------
const ANDROID = join(RACINE, 'dist', 'android');
mkdirSync(ANDROID, { recursive: true });
writeFileSync(join(ANDROID, 'index.html'), assembler(await code(true)));
console.log('dist/android/index.html : édition store');
