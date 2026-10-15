const CACHE_NAME = 'farmacia-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: pre-cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first para todo (Supabase siempre requiere red)
// Cache solo para assets estáticos (_next/static/*)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requests no-GET y cross-origin (Supabase, etc.)
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Assets estáticos de Next.js: cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Todo lo demás: network-first, fallback a caché
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
