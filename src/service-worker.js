import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// --- VERSION CONFIGURATION ---
const APP_VERSION = "1.0.5";
const CACHE_NAME = `dr-agent-v${APP_VERSION}`;

console.log("[PWA] Service worker initializing version:", APP_VERSION);

cleanupOutdatedCaches();

// Precaching files built by Vite (excluding manifest, favicon and icons to avoid aggressive cache lock)
const manifestFilter = (self.__WB_MANIFEST || []).filter(entry => {
  const url = typeof entry === "string" ? entry : entry.url;
  return !url.includes("manifest") && !url.includes("icons/") && !url.includes("favicon") && !url.includes("apple-touch-icon");
});

precacheAndRoute(manifestFilter);

// Service Worker installation
self.addEventListener("install", (event) => {
  console.log("[PWA] Service Worker installing");
  self.skipWaiting();
});

// Cache management on service worker activation
self.addEventListener("activate", (event) => {
  console.log("[PWA] Service Worker activating");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME && !cacheName.includes('workbox-precache'))
          .map((cacheName) => {
            console.log("[ServiceWorker] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log("[PWA] Service Worker ready and Clients claimed");
      return self.clients.claim();
    })
  );
});

// Custom fetch interceptor for standard GET requests with network-first with cache fallback strategy
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Bypass service-worker caching entirely for these critical configuration/icon files
  if (
    requestUrl.pathname.includes("manifest.json") ||
    requestUrl.pathname.includes("/icons/") ||
    requestUrl.pathname.includes("service-worker.js")
  ) {
    return;
  }

  // Network-First with Cache Fallback Strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache clone of GET basic responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation mode (e.g. /, /app), fallback to cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response("Offline content not available for this resource.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});
