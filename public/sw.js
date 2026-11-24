const CACHE_NAME = "cineflow-public-shell-v2";
const PUBLIC_OFFLINE = ["/centro", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;

  // Never cache authenticated pages, login, invitation callbacks, or reset flows.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        if (url.pathname === "/centro") {
          return (await caches.match("/centro")) || Response.error();
        }
        return Response.error();
      })
    );
    return;
  }
});
