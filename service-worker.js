const CACHE = 'sana-app-shell-v2';
const APP_SHELL = [
  './index.html',
  './reading.html',
  './reading.css',
  './reading.js',
  './dictation.html',
  './diagnostics.html',
  './reading-app-config.js',
  './sana-core.js',
  './sana-progress.js',
  './sana-text.js',
  './manifest.webmanifest',
  './pwa-register.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(response => {
        if(response.ok){
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached)
    )
  );
});
