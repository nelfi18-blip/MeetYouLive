/**
 * Firebase Messaging Service Worker
 *
 * Handles push notifications when the app is in the background or closed.
 * This file MUST be served from the root path (/firebase-messaging-sw.js)
 * so that Firebase can find it.
 *
 * The Firebase config is injected at runtime via query-string parameters
 * by the client (getToken passes them automatically through the SW URL).
 * Alternatively, hard-code the public config values below if you prefer.
 */

// Import Firebase scripts via CDN (required in service workers)
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Firebase will automatically pass the config when registering the SW.
// We also read it from the SW query params as a fallback.
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

const config = getConfigFromUrl();

// Only initialise if we have at minimum a projectId (avoids SW crash when
// config is not yet passed).
if (config.projectId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const { title = "MeetYouLive", body = "" } = payload.notification || {};
    const link = (payload.data && payload.data.link) || "/";

    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link },
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing window if one is already open
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            client.navigate(link);
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(link);
        }
      })
  );
});
