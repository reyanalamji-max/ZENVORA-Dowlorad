const CACHE_NAME = "zenvora-static-v7";
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/styles.css",
  "/logo.svg",
  "/pwa.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];
const CACHEABLE_URLS = new Set([
  ...PRECACHE_URLS,
  "/app.js",
  "/search.js",
  "/viewer.js",
  "/apps.js",
  "/videos.js",
  "/assistant.js",
  "/assistant.css",
  "/download.js",
  "/account.js",
  "/download.html"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith("zenvora-static-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const offlinePage = await caches.match("/offline.html");
      return offlinePage || Response.error();
    }));
    return;
  }

  if (!CACHEABLE_URLS.has(requestUrl.pathname) || requestUrl.search) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  }));
});
