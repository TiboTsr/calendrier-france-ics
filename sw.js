const CACHE_NAME = 'cal-fr-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/css/styles.css',
  '/assets/css/responsive.css',
  '/assets/js/utils.js',
  '/assets/js/theme.js',
  '/assets/js/zone.js',
  '/zone-departments.json',
  '/img/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});