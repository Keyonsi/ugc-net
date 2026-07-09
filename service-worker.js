const CACHE_NAME = 'ugc-net-hindi-v5'; // bumped: v4 -> v5 (forces old cached assets to be dropped)
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './questions/topics.json'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache First with background revalidation for ALL app assets
// (previously only .json files revalidated in the background, which meant
//  updated html/css/js could get stuck on mobile/PWA installs indefinitely)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Assets that should always self-heal from the network in the background
  const isRevalidatable = url.pathname.endsWith('.json') ||
                           url.pathname.endsWith('.html') ||
                           url.pathname.endsWith('.js') ||
                           url.pathname.endsWith('.css') ||
                           url.pathname === '/' ||
                           url.pathname.endsWith('/');

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        if (isRevalidatable) {
          // Stale-while-revalidate: serve cached copy instantly,
          // but silently fetch + store the newest version for NEXT load.
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => {/* ignore network errors during background updates */});
        }
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
