// Offline cache. Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'tingshuo-9c12abc4';
const FILES = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'vendor/pinyin-pro.js', 'vendor/hanzi-writer.min.js', 'data/words.js', 'data/sentences.js', 'data/dialogues.js',
  'js/store.js', 'js/srs.js', 'js/chinese.js', 'js/audio.js', 'js/dialogue.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // network first (so updates arrive), cache as fallback when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
