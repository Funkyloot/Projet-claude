/* build-monofichier.mjs — assemble l'app en une seule page HTML.
 *
 * Utile pour la publier là où on ne peut déposer qu'un fichier : une page
 * partagée, une pièce jointe, un test rapide sur un téléphone. La version
 * de `web/` reste la référence — celle-ci en est un tirage.
 *
 * Usage : node tools/build-monofichier.mjs
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(RACINE, 'web');

const { outputFiles } = await build({
  entryPoints: [join(WEB, 'js', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  minify: false,          // lisible : c'est aussi un objet à lire, pas qu'à exécuter
  legalComments: 'none',
});
const js = outputFiles[0].text;

const css = readFileSync(join(WEB, 'styles.css'), 'utf8');
const html = readFileSync(join(WEB, 'index.html'), 'utf8');
const icone = readFileSync(join(WEB, 'icons', 'icon-180.png')).toString('base64');

// On repart du index.html et on remplace ce qui pointe vers des fichiers
// voisins par leur contenu.
let page = html
  .replace(/<link rel="stylesheet" href="styles\.css">/, `<style>\n${css}\n</style>`)
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<script type="module" src="js\/main\.js"><\/script>/,
    `<script>window.__CALME_MONOFICHIER = true;</script>\n<script>\n${js}\n</script>`)
  .replace(/href="icons\/icon-180\.png"/g, `href="data:image/png;base64,${icone}"`);

mkdirSync(join(RACINE, 'dist'), { recursive: true });
const sortie = join(RACINE, 'dist', 'calme.html');
writeFileSync(sortie, page);
console.log(`dist/calme.html  ${(page.length / 1024).toFixed(0)} ko`);
