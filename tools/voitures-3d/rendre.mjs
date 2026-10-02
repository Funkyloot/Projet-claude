import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, modeles, n, taille, px, inc, sortie] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto('http://localhost:8099/index.html');
await p.waitForFunction(() => window.pret, null, { timeout: 30000 });
fs.mkdirSync(sortie, { recursive: true });
for (const m of modeles.split(',')) {
  const imgs = await p.evaluate(([m, n, t, px, inc]) => window.rendre(`modeles/${m}.glb`, n, t, px, inc), [m, +n, +taille, +px, +inc]);
  const ecrire = (l, suf) => l.forEach((u, i) => fs.writeFileSync(`${sortie}/${m}${suf}_${String(i).padStart(2, '0')}.png`, Buffer.from(u.split(',')[1], 'base64')));
  ecrire(imgs.images, ''); ecrire(imgs.masques, '-m');
  console.log(m, imgs.images.length, imgs.corps);
}
await b.close();
