/**
 * FCM push-notification helpers (client-side).
 *
 * Call `initPushNotifications(backendToken)` once the user is authenticated.
 * It will:
 *  1. Request Notification permission.
 *  2. Register the Firebase messaging service worker.
 *  3. Obtain an FCM registration token.
 *  4. Send the token to the backend so it can send targeted pushes.
 *
 * Required NEXT_PUBLIC_* env vars:
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 *   NEXT_PUBLIC_FIREBASE_VAPID_KEY  (Web Push certificate public key)
 */

import firebaseApp from "./firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/** Send the FCM token to our backend so targeted pushes can be delivered. */
async function registerTokenWithBackend(token, backendToken) {
  try {
    await fetch(`${API_URL}/api/user/me/push-token`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backendToken}`,
      },
      body: JSON.stringify({ pushToken: token }),
    });
  } catch {
    // Non-critical — silently ignore network errors
  }
}

/**
 * Initialise push notifications for the authenticated user.
 *
 * @param {string} backendToken – JWT returned by the backend after login.
 * @returns {Promise<void>}
 */
export async function initPushNotifications(backendToken) {
  if (!backendToken) return;
  if (typeof window === "undefined") return;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return; // FCM not configured — skip silently

  // Browser must support notifications
  if (!("Notification" in window)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    // Register the FCM service worker
    if (!("serviceWorker" in navigator)) return;

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/" }
    );

    const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
    const messaging = getMessaging(firebaseApp);

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      await registerTokenWithBackend(token, backendToken);
    }

    // Handle foreground messages (app is open/focused)
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      const link = payload.data?.link || "/";
      const pushEventId = payload.data?.pushEventId;

      if (title && "Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(title, { body, icon: "/icons/icon-192.png" });
        notif.onclick = () => {
          // Track open on foreground click
          if (pushEventId) {
            fetch(`${API_URL}/api/push/opened/${pushEventId}`, { method: "POST" }).catch(() => {});
          }
          window.focus();
          window.location.assign(link);
        };
      }
    });
  } catch {
    // Silently ignore — push is a non-critical enhancement
  }
}
