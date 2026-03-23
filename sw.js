// sw.js — Service Worker avec versioning automatique
// Le cache name intègre un timestamp de build injecté au déploiement.
// Si BUILD_TIMESTAMP n'est pas remplacé par le CI, on utilise la date courante
// pour garantir que chaque déploiement invalide l'ancien cache.

const BUILD_TS   = '20260323025608'; // Remplacé par le workflow GitHub Actions
const CACHE_NAME = `cal-fr-v2-${BUILD_TS !== '20260323025608' ? BUILD_TS : Date.now()}`;

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

// ── Fetch : stratégie Stale-While-Revalidate ───────────
// Répond immédiatement depuis le cache, met à jour en arrière-plan.
// Les fichiers JS/CSS bénéficient ainsi d'un chargement instantané
// tout en étant actualisés au prochain chargement.
self.addEventListener('fetch', event => {
  // Ne gérer que les requêtes GET du même domaine
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Ne pas mettre en cache les appels API (calendrier.json, ICS, shorten)
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.ics') || url.pathname.endsWith('.json')) {
    return; // Laisser le réseau gérer
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          // Ne mettre en cache que les réponses valides
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached); // Fallback cache si réseau indisponible

        // Répondre depuis le cache immédiatement si disponible,
        // sinon attendre le réseau
        return cached || networkFetch;
      })
    )
  );
});