/* serveur-pistonville.mjs — sert Pistonville pour jouer depuis un téléphone.
 *
 * Petit serveur web sans dépendance : il ne sert que le dossier
 * pistonville/dist/web (le jeu déjà construit), en lecture seule.
 *
 * Usage : node tools/serveur-pistonville.mjs [port]   (8080 par défaut)
 * Puis, sur le téléphone : http://ADRESSE-DU-PC:8080 (affichée au lancement).
 * Pour y accéder hors de la maison, voir pistonville/JOUER-SUR-TELEPHONE.md.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'pistonville', 'dist', 'web');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json',
};

const serveur = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (chemin.endsWith('/')) chemin += 'index.html';
  const fichier = normalize(join(RACINE, chemin));
  // Jamais en dehors du dossier du jeu.
  if (fichier !== RACINE && !fichier.startsWith(RACINE + sep)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(fichier)).isFile()) throw new Error();
    const corps = await readFile(fichier);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream',
      'Cache-Control': extname(fichier) === '.png' ? 'max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : corps);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable. As-tu lancé « npm run pistonville » ?');
  }
  console.log(new Date().toLocaleTimeString('fr-FR'), req.method, chemin);
});

serveur.listen(PORT, '0.0.0.0', () => {
  console.log(`\nPistonville est servi sur le port ${PORT}.\n`);
  console.log(`  Sur ce PC :            http://localhost:${PORT}`);
  for (const liste of Object.values(networkInterfaces())) for (const a of liste || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`  Téléphone (même Wi-Fi) : http://${a.address}:${PORT}`);
  }
  console.log('\nHors de la maison : voir pistonville/JOUER-SUR-TELEPHONE.md (Tailscale ou Cloudflare).');
  console.log('Ctrl+C pour arrêter.\n');
});
