const CACHE_PREFIX = "meetyoulive";
const CACHE_VERSION = "v43";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
let meetYouLiveRuntimeConfig = { apiUrl: null };
const STATIC_ASSETS = [
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

// Cache only known-public assets. Authenticated pages, Next.js RSC payloads,
// and API data must never be persisted or served to another signed-in user.
const PUBLIC_STATIC_PATHS = new Set([...STATIC_ASSETS, "/favicon.ico", "/manifest.json"]);
function isCacheableStatic(url) {
  return url.pathname.startsWith("/_next/static/") || PUBLIC_STATIC_PATHS.has(url.pathname);
}

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

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Do not cache any API response, including chat and notification data.
  // Offline API requests fail visibly instead of returning a previous user's
  // response. This applies to authenticated requests regardless of cookies.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: "Sin conexión", offline: true,
          message: "Esta función requiere conexión a internet" }),
        { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
      ))
    );
    return;
  }

  // Public build assets keep the previous offline performance behavior.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
          }
          return response;
        });
      })
    );
    return;
  }

  // Never cache HTML/RSC for profile, wallet, chats, settings, matches, login,
  // or any other dynamic page: a changed user must never receive a prior
  // session's page when offline. Public offline shell remains available.
  event.respondWith(
    fetch(request).catch(async () => {
      const isNavigation = request.mode === "navigate" ||
        (request.headers?.get("accept") || "").includes("text/html");
      if (isNavigation) {
        const offline = await caches.match("/offline");
        if (offline) return offline;
      }
      return new Response("Sin conexión", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    })
  );
});
