// Offline support: app files are network-first (so updates arrive), character stroke data is cache-first.
const VERSION = 'meow-v39';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'state.js', 'pixel.js', 'ui.js', 'audio.js', 'spell.js', 'shop.js', 'parent.js', 'handwriting.js', 'cloud.js', 'merge.js', 'friends.js', 'challenge.js', 'phone.js', 'jokes.js', 'practice.js', 'banks.js', 'auth.js', 'essay.js', 'essayart.js', 'hanzi-writer.min.js', 'pinyin-pro.min.js', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'meow-data').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open('meow-data').then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  }
});
