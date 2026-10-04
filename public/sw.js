// Offline support: the app is one page, so cache it and its static files and serve them when offline.
const CACHE = 'inkwell-v3';
const SHELL = ['./', './index.html', './favicon.svg', './site.webmanifest', './icon-192.png', './privacy.html', './terms.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  if (req.mode === 'navigate') {
    // Network first so a new version shows up right away; fall back to the cached copy offline.
    // Only the app itself is stored as the app shell, and only successful, non-redirected pages are cached.
    const isShell = url.pathname === '/' || url.pathname.endsWith('/index.html');
    e.respondWith(fetch(req).then((res) => {
      if (sameOrigin && res.ok && res.type === 'basic' && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(isShell ? './index.html' : req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: isShell }).then((hit) => hit || caches.match('./index.html'))));
    return;
  }
  // Static files and fonts: serve from cache, refresh in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const fresh = fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
