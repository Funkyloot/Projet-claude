/* build-pistonville.mjs — assemble Pistonville en une seule page HTML.
 *
 * Le résultat, pistonville/dist/pistonville.html, contient tout : code,
 * styles, images Kenney et police. On l'ouvre d'un double-clic, sans serveur
 * ni connexion. La version de `pistonville/` reste la référence.
 *
 * Usage : node tools/build-pistonville.mjs
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'pistonville');

const { outputFiles } = await build({
  entryPoints: [join(RACINE, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  minify: false,          // lisible : c'est aussi un objet à lire, pas qu'à exécuter
  legalComments: 'none',
});
const js = outputFiles[0].text;

const TYPES = { '.png': 'image/png', '.woff2': 'font/woff2' };
const dataUrl = (chemin) =>
  `data:${TYPES[extname(chemin)]};base64,${readFileSync(join(RACINE, chemin)).toString('base64')}`;

const assets = {};
const ajouter = (chemin) => { assets[chemin] = dataUrl(chemin); };
ajouter('assets/kenney/rpg-urban.png');
for (const f of readdirSync(join(RACINE, 'assets/kenney/profil'))) ajouter(`assets/kenney/profil/${f}`);
ajouter('assets/police/Jersey10.woff2');

const css = readFileSync(join(RACINE, 'style.css'), 'utf8')
  .replace("url('assets/police/Jersey10.woff2')", `url('${assets['assets/police/Jersey10.woff2']}')`);

const page = readFileSync(join(RACINE, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="src/main.js"></script>',
    `<script>window.__PV_ASSETS = ${JSON.stringify(assets)};</script>\n<script>\n${js}\n</script>`,
  );

mkdirSync(join(RACINE, 'dist'), { recursive: true });
const sortie = join(RACINE, 'dist', 'pistonville.html');
writeFileSync(sortie, page);
console.log(`dist/pistonville.html : ${(page.length / 1024).toFixed(0)} ko`);
