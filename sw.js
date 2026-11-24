const CACHE = 'naura-qna-v14';
const ASSETS = ['./', './index.html', './styles.css', './extras.css', './vendor/vosk.js', './app.js', './qna.json', './qna-extra.json', './qna-ai.json', './qna-ai-deep.json', './guidance-en.json', './spoken-questions.json', './qna-variants-more.json', './expanded-answers.json', './manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
