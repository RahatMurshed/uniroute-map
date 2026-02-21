// UniRoute Service Worker — Push Notifications + Caching

const CACHE_NAME = 'uniroute-v1';
const TILE_CACHE = 'uniroute-tiles-v1';
const MAX_TILE_CACHE = 100;

const STATIC_ASSETS = [
  '/',
  '/map',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — routing strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Map tiles — Cache First
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response.ok) {
            // Limit tile cache size
            const keys = await cache.keys();
            if (keys.length >= MAX_TILE_CACHE) {
              await cache.delete(keys[0]);
            }
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // Supabase API calls — Network First
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((cached) => cached || new Response('{"error":"offline"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
    );
    return;
  }

  // Navigation requests — Network First with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((cached) =>
          cached || caches.match('/offline.html')
        )
      )
    );
    return;
  }

  // Static assets — Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful static asset responses
        if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.woff2'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 408 }));
    })
  );
});

// Push notifications
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'UniRoute 🚌';
  const options = {
    body: data.body || 'Bus update',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'uniroute-alert',
    renotify: true,
    data: {
      url: data.url || '/map'
    }
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/map')
  );
});
