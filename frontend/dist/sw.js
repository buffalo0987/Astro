const CACHE_NAME = 'astropi-pwa-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/assets/app.css',
  '/assets/app.js',
  '/assets/audio.js',
  '/assets/catalog.js',
  '/assets/store.js',
  '/assets/vendor/preact.mjs',
  '/assets/vendor/hooks.mjs',
  '/assets/vendor/htm.mjs',
  '/assets/components/HudBar.js',
  '/assets/components/SkyViewport.js',
  '/assets/views/PolarAlignView.js',
  '/assets/views/FrameFocusView.js',
  '/assets/views/SequenceView.js',
  '/assets/views/OffloadView.js',
  '/assets/views/SystemDrawer.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }
  // Network-first with offline cache fallback so software updates take effect immediately
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
