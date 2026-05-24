import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

// --- VERSION CONFIGURATION ---
// Change this version manually at each new deploy to force service worker updates.
const APP_VERSION = "1.0.1";
const CACHE_VERSION = `dr-agent-v${APP_VERSION}`;

cleanupOutdatedCaches();

// Precaching files built by Vite
precacheAndRoute(self.__WB_MANIFEST || []);

// SPA Navigation route fallback (excluding API and auth routes)
try {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    denylist: [
      /^\/api\//,
      /^\/auth\/callback/,
    ],
  });
  registerRoute(navigationRoute);
} catch (e) {
  console.error('[ServiceWorker] Navigation fallback setup failed:', e);
}

// Message listener to trigger prompt updates
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Cache management on service worker activation
self.addEventListener("activate", (event) => {
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
    }).then(() => self.clients.claim())
  );
});
