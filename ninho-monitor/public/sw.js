const CACHE_NAME = 'ninho-static-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/pairing.js',
  '/signal-inbox.js',
  '/picture-in-picture.js',
  '/vendor/qrcode.mjs',
  '/manifest.webmanifest',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('ninho-static-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/signal' || url.pathname.startsWith('/api/')) return;
  if (!STATIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
