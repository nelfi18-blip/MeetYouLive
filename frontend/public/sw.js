const CACHE_PREFIX = "meetyoulive";
const CACHE_VERSION = "v42";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
let meetYouLiveRuntimeConfig = { apiUrl: null };
const STATIC_ASSETS = [
  "/",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

// API endpoints that should be cached for offline access
const CACHED_API_PATTERNS = [
  /\/api\/notifications/,
  /\/api\/chats$/,
];

const NETWORK_ONLY_API_ROUTES = ["/api/user/me", "/api/feed"];

function getConfigFromUrl() {
  try {
    const params = new URL(self.location.href).searchParams;
    return {
      apiKey: params.get("apiKey"),
      authDomain: params.get("authDomain"),
      projectId: params.get("projectId"),
      storageBucket: params.get("storageBucket"),
      messagingSenderId: params.get("messagingSenderId"),
      appId: params.get("appId"),
    };
  } catch {
    return {};
  }
}

function getRuntimeConfigFromUrl() {
  try {
    const params = new URL(self.location.href).searchParams;
    return { apiUrl: params.get("apiUrl") };
  } catch {
    return { apiUrl: null };
  }
}

function sanitizeNotificationPath(link) {
  if (typeof link !== "string" || !link) return "/";
  try {
    const parsed = new URL(link, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    const allowedPrefixes = [
      "/chats",
      "/chat",
      "/call",
      "/calls",
      "/live",
      "/profile",
      "/coins",
      "/creator",
      "/creator-request",
      "/creator-center",
      "/dashboard/creator",
      "/wallet",
      "/matches",
      "/match",
      "/crush",
      "/vip",
      "/settings/notifications",
    ];
    const path = parsed.pathname || "/";
    const isAllowed = allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    return isAllowed ? `${path}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}

try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

  const firebaseConfig = getConfigFromUrl();
  meetYouLiveRuntimeConfig = getRuntimeConfigFromUrl();
  if (firebaseConfig.projectId && self.firebase && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  if (firebaseConfig.projectId && self.firebase) {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const { title = "MeetYouLive", body = "" } = payload.notification || {};
      const link = sanitizeNotificationPath((payload.data && payload.data.link) || "/");
      const pushEventId = (payload.data && payload.data.pushEventId) || null;

      self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { link, pushEventId },
      });
    });
  }
} catch (error) {
  // Offline/PWA caching still works if Firebase scripts cannot be loaded.
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = sanitizeNotificationPath((event.notification.data && event.notification.data.link) || "/");
  const pushEventId = event.notification.data && event.notification.data.pushEventId;
  const apiUrl = meetYouLiveRuntimeConfig.apiUrl;

  if (pushEventId && apiUrl) {
    event.waitUntil(
      fetch(apiUrl + "/api/push/opened/" + pushEventId, { method: "POST" }).catch(() => {})
    );
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            client.navigate(link);
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(link);
        }
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(`${CACHE_PREFIX}-`) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Always serve primary app shells from the network so legacy responsive UI is
  // never restored from an old page cache after deploys or refreshes.
  const NETWORK_ONLY_PAGE_ROUTES = ["/admin", "/feed", "/live", "/profile", "/dashboard"];
  if (
    NETWORK_ONLY_PAGE_ROUTES.some(
      (route) => url.pathname === route || url.pathname.startsWith(`${route}/`)
    )
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (
    NETWORK_ONLY_API_ROUTES.some(
      (route) => url.pathname === route || url.pathname.startsWith(`${route}/`)
    )
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 1: Network-first for API calls (with offline fallback)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful GET API responses
          if (response.status === 200) {
            // Check if this endpoint should be cached
            const shouldCache = CACHED_API_PATTERNS.some((pattern) =>
              pattern.test(url.pathname)
            );

            if (shouldCache) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
              });
            }
          }
          return response;
        })
        .catch(() => {
          // Return cached version if available, otherwise return offline response
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return a custom offline response for API calls
            return new Response(
              JSON.stringify({
                error: "Sin conexión",
                offline: true,
                message: "Esta función requiere conexión a internet",
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          });
        })
    );
    return;
  }

  // Strategy 2: Cache-first for static assets (images, fonts, etc.)
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Strategy 3: Network-first with cache fallback for pages
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful page responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Try cache, then show offline page
        return caches.match(request).then((cached) => {
          return cached || caches.match("/offline");
        });
      })
  );
});
