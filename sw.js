const APP_CACHE  = 'speedo-app-v1';
const TILE_CACHE = 'speedo-tiles-v1';
const MAX_TILES  = 1000;

const APP_ASSETS = [
  '/speedometer.html',
  '/leaflet.min.js',
  '/leaflet.min.css',
];

// ── Install: pre-cache app shell ───────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(c => c.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Delete old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== APP_CACHE && k !== TILE_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fill cache on the way ────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Map tiles — cache as they load, serve from cache when offline
  if (url.hostname.includes('cartocdn.com') ||
      url.hostname.includes('basemaps') ||
      url.pathname.match(/\/\d+\/\d+\/\d+\.png/)) {
    e.respondWith(tileStrategy(e.request));
    return;
  }

  // App shell — cache first, fall back to network
  if (APP_ASSETS.some(a => url.pathname === a || url.pathname.endsWith(a))) {
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request)
          .then(res => {
            const clone = res.clone();
            caches.open(APP_CACHE).then(c => c.put(e.request, clone));
            return res;
          })
        )
    );
    return;
  }

  // Everything else — network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

async function tileStrategy(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Evict oldest tile if over limit
      const keys = await cache.keys();
      if (keys.length >= MAX_TILES) {
        await cache.delete(keys[0]);
      }
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return transparent 1px PNG
    return new Response(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
      { headers: { 'Content-Type': 'image/png' } }
    );
  }
}
