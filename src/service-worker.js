import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

// --- VERSION CONFIGURATION ---
const APP_VERSION = "1.0.4";
const CACHE_NAME = `dr-agent-v${APP_VERSION}`;

console.log("[PWA] Service worker initializing version:", APP_VERSION);

cleanupOutdatedCaches();

// Precaching files built by Vite (excluding manifest, favicon and icons to avoid aggressive cache lock)
const manifestFilter = (self.__WB_MANIFEST || []).filter(entry => {
  const url = typeof entry === "string" ? entry : entry.url;
  return !url.includes("manifest") && !url.includes("icons/") && !url.includes("favicon") && !url.includes("apple-touch-icon");
});

precacheAndRoute(manifestFilter);

// SPA Navigation route fallback (excluding API, auth and assets)
try {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    denylist: [
      /^\/api\//,
      /^\/auth\/callback/,
      /^\/manifest\.json/,
      /^\/service-worker\.js/,
      /^\/icons\//,
    ],
  });
  registerRoute(navigationRoute);
} catch (e) {
  console.error('[ServiceWorker] Navigation fallback setup failed:', e);
}

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

// Custom fetch interceptor to guarantee manifest/icons/service-worker are never aggressively cached
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Bypass service-worker caching for these critical files
  if (
    requestUrl.pathname.includes("manifest.json") ||
    requestUrl.pathname.includes("/icons/") ||
    requestUrl.pathname.includes("service-worker.js")
  ) {
    return;
  }

  // Let other requests fall through to Workbox handlers or network
});
