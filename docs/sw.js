// Offline cache. Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'tingshuo-0d103139';
const FILES = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'vendor/pinyin-pro.js', 'vendor/hanzi-writer.min.js', 'data/words.js', 'data/sentences.js', 'data/dialogues.js',
  'js/store.js', 'js/srs.js', 'js/chinese.js', 'js/audio.js', 'data/tone-model.js', 'js/tones.js', 'js/dialogue.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
// The optional meaning model (js/meaning.js) is never precached: its library is kept in its own cache once fetched
// (the model files are kept by the library itself, in 'transformers-cache'), and both survive app updates.
const MEANING = 'tingshuo-meaning', MEANING_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/';
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tingshuo-') && k !== VERSION && k !== MEANING).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith(MEANING_LIB)) { // pinned version: cache first
    e.respondWith(caches.open(MEANING).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // network first (so updates arrive), cache as fallback when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
