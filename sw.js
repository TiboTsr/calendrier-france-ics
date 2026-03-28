// sw.js — Service Worker avec versioning automatique
// Le cache name intègre un timestamp de build injecté au déploiement.
// Si BUILD_TIMESTAMP n'est pas remplacé par le CI, on utilise la date courante
// pour garantir que chaque déploiement invalide l'ancien cache.

// sw.js — PWA pro (network-first + cache intelligent + versioning)

const BUILD_TS = '__BUILD_TIMESTAMP__';
const VERSION = BUILD_TS !== '__BUILD_TIMESTAMP__' ? BUILD_TS : Date.now();
const CACHE_NAME = `cal-fr-${VERSION}`;

// Assets critiques (pré-cache)
const ASSETS = [
  '/',
  '/index.html',

  '/assets/css/styles.css',
  '/assets/css/responsive.css',

  '/assets/js/utils.js',
  '/assets/js/theme.js',
  '/assets/js/zone.js',

  '/zone-departments.json',

  // Icons
  '/img/icon-32.png',
  '/img/icon-192.png'
];


// ─────────────────────────────
// INSTALL
// ─────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});


// ─────────────────────────────
// ACTIVATE (clean old caches)
// ─────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('cal-fr-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});


// ─────────────────────────────
// FETCH STRATEGIES
// ─────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore external requests
  if (url.origin !== self.location.origin) return;


  // 🔥 1. HTML → NETWORK FIRST (toujours à jour)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }


  // 📡 2. JSON / ICS → NETWORK FIRST
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.ics')) {
    event.respondWith(
      fetch(event.request)
        .then(response => response)
        .catch(() => caches.match(event.request))
    );
    return;
  }


  // ⚡ 3. ASSETS → STALE WHILE REVALIDATE
  event.respondWith(
    caches.match(event.request).then(cached => {

      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // retourne cache instantané + update en fond
      return cached || fetchPromise;
    })
  );
});