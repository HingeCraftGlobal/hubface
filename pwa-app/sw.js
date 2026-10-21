// HubFace PWA shell worker: caches only the /app/ launcher shell.
const CACHE = 'hubface-app-phone-20261020a';
const SHELL = ['/app/', '/app/index.html', '/app/manifest.webmanifest',
  '/app/icon-180-v2.png', '/app/icon-192-v2.png', '/app/icon-512-v2.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('/app/')) return;
  // network first, fall back to cached shell when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('/app/'))));
});
