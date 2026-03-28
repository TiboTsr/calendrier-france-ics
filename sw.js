// sw.js — Service Worker avec versioning automatique
// Le cache name intègre un timestamp de build injecté au déploiement.
// Si BUILD_TIMESTAMP n'est pas remplacé par le CI, on utilise la date courante
// pour garantir que chaque déploiement invalide l'ancien cache.

const BUILD_TS   = '__BUILD_TIMESTAMP__'; // Remplacé par le workflow GitHub Actions
const CACHE_NAME = `cal-fr-v2-${BUILD_TS !== '__BUILD_TIMESTAMP__' ? BUILD_TS : Date.now()}`;

const ASSETS = [
  '/',
  '/index.html',
  '/assets/css/styles.css',
  '/assets/css/responsive.css',
  '/assets/js/utils.js',
  '/assets/js/theme.js',
  '/assets/js/zone.js',
  '/zone-departments.json',
  '/img/icon.svg',
];

// ── Installation : mise en cache des assets statiques ──
self.addEventListener('install', event => {
  // Forcer l'activation immédiate sans attendre la fermeture des anciens clients
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// ── Activation : suppression des anciens caches ────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          // Supprimer tous les caches cal-fr-* qui ne sont pas le cache courant
          .filter(key => key.startsWith('cal-fr-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('.ics') || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});