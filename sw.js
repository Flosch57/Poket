// Binderplaner – Service Worker
// App-Dateien offline verfügbar, Kartenbilder werden zwischengespeichert,
// Kartendaten kommen frisch aus dem Netz (bei Funkloch aus dem Zwischenspeicher).
const VERSION = 'bp-1';
const SHELL = `${VERSION}-shell`, API = 'bp-api', IMG = 'bp-img';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const MAX_IMG = 400, MAX_API = 300;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, API, IMG];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const net = fetch(req);
    const res = await (timeoutMs ? Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]) : net);
    if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); if (cacheName === API) trim(API, MAX_API); }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: cacheName === SHELL });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trim(cacheName, max); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL, 4000).catch(() => caches.match('./index.html'))); return; }
  if (url.origin === location.origin) { e.respondWith(networkFirst(req, SHELL, 4000)); return; }
  if (url.hostname === 'api.tcgdex.net') { e.respondWith(networkFirst(req, API)); return; }
  if (url.hostname === 'assets.tcgdex.net' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(cacheFirst(req, IMG, MAX_IMG)); return;
  }
});
