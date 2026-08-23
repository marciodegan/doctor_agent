import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

const APP_VERSION = "1.0.8";
const CACHE_NAME = `dr-agent-runtime-v${APP_VERSION}`;

console.log("[PWA] Service worker initializing version:", APP_VERSION);

cleanupOutdatedCaches();

const manifestFilter = (self.__WB_MANIFEST || []).filter((entry) => {
  const url = typeof entry === "string" ? entry : entry.url;

  return (
    !url.includes("manifest") &&
    !url.includes("icons/") &&
    !url.includes("favicon") &&
    !url.includes("apple-touch-icon") &&
    !url.includes("service-worker")
  );
});

precacheAndRoute(manifestFilter);

self.addEventListener("install", (event) => {
  console.log("[PWA] Service Worker installing, skip waiting immediately");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[PWA] Service Worker activating - purging outdated caches");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log("[PWA] Removing legacy/outdated cache:", cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log("[PWA] Service Worker ready and clients claimed");
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  // Ignore non-http protocols
  if (!requestUrl.protocol.startsWith("http")) {
    return;
  }

  // CRITICAL: NEVER intercept cross-origin requests (e.g. firestore.googleapis.com, identitytoolkit.googleapis.com, googleapis.com)
  // Let the browser handle external/Firebase/cloud services directly
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // CRITICAL: NEVER intercept server API routes or static meta assets/icons
  const pathname = requestUrl.pathname;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/icons/") ||
    pathname.includes("manifest") ||
    pathname.includes("favicon") ||
    pathname.includes("apple-touch-icon") ||
    pathname.includes("service-worker.js")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put("/index.html", responseClone);
          });

          return response;
        })
        .catch(async () => {
          const cachedIndex =
            (await caches.match("/index.html")) ||
            (await caches.match("/"));

          if (cachedIndex) {
            return cachedIndex;
          }

          return new Response("App offline", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          });
        })
    );

    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }

        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        return new Response("Offline content not available.", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        });
      })
  );
});
