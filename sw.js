const CACHE = "musify-v2";

const ASSETS = [
  "/Musify/",
  "/Musify/index.html",
  "/Musify/app.js",
  "/Musify/styles.css",
  "/Musify/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
