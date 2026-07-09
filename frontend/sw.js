// Gyro Board service worker - offline app-shell cache.
const CACHE = "gyrob-v1";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/favicon.svg"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) =>
    r || fetch(e.request).catch(() => caches.match("/index.html"))));
});
