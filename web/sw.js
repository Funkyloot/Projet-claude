/* sw.js — cache « app shell ».
 *
 * L'app tient en quelques dizaines de kilo-octets et ne dépend d'aucun
 * réseau une fois installée : on met tout en cache au premier lancement,
 * puis on sert depuis le cache en rafraîchissant en arrière-plan.
 */

const VERSION = 'calme-v1';
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/assets.js',
  './js/pixel.js',
  './js/cat.js',
  './js/scene-forest.js',
  './js/scene-city.js',
  './js/microfont.js',
  './js/audio.js',
  './js/ui.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll échoue en bloc si un seul fichier manque : on tolère les absents.
      .then((c) => Promise.all(FICHIERS.map((f) => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const reseau = fetch(e.request)
        .then((r) => {
          if (r && r.status === 200 && r.type === 'basic') {
            const copie = r.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copie));
          }
          return r;
        })
        .catch(() => hit);
      return hit || reseau;
    })
  );
});
