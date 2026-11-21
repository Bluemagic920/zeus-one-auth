// Zeus One Authenticator - offline support. Bump VERSION when you upload new files.
const VERSION = "zoauth-1.1.0";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "js/app.js", "js/core.js", "js/qr.js",
  "img/zeusone-logo.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
  "icons/maskable-512.png", "icons/emblem-64.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from the offline cache; refresh it in the background when online.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
