import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

// --- VERSION CONFIGURATION ---
// Change this version manually at each new deploy to force service worker updates.
const APP_VERSION = "1.0.2";
const CACHE_VERSION = `dr-agent-v${APP_VERSION}`;

console.log("[PWA] Service worker initializing version:", APP_VERSION);

cleanupOutdatedCaches();

// Precaching files built by Vite (excluding manifest, favicon and icons to avoid aggressive cache lock on PWA setup)
const manifestFilter = (self.__WB_MANIFEST || []).filter(entry => {
  const url = typeof entry === "string" ? entry : entry.url;
  return !url.includes("manifest") && !url.includes("icons/") && !url.includes("favicon") && !url.includes("apple-touch-icon");
});

precacheAndRoute(manifestFilter);

// SPA Navigation route fallback (excluding API and auth routes)
try {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    denylist: [
      /^\/api\//,
      /^\/auth\/callback/,
      /^\/manifest\.json/,
    ],
  });
  registerRoute(navigationRoute);
} catch (e) {
  console.error('[ServiceWorker] Navigation fallback setup failed:', e);
}

// Service Worker installation
self.addEventListener("install", (event) => {
  console.log("[PWA] Service worker installed");
  self.skipWaiting();
});

// Message listener to trigger prompt updates
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("[PWA] Service worker Skip Waiting received");
    self.skipWaiting();
  }
});

// Cache management on service worker activation
self.addEventListener("activate", (event) => {
  console.log("[PWA] Service worker activated");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION && !cacheName.includes('workbox-precache')) {
            console.log("[ServiceWorker] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log("[PWA] Clients claimed");
      return self.clients.claim();
    })
  );
});
