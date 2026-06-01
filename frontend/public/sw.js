const CACHE_NAME = "meetyoulive-v22";
const STATIC_ASSETS = [
  "/",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

// API endpoints that should be cached for offline access
const CACHED_API_PATTERNS = [
  /\/api\/user\/me$/,
  /\/api\/notifications/,
  /\/api\/chats$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.error("Failed to cache static assets:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
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

  // Always serve the feed shell from the network so legacy UI is never restored
  // from an old page cache after deploys or refreshes.
  if (url.pathname === "/feed" || url.pathname.startsWith("/feed/")) {
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
