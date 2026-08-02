/**
 * FCM push-notification helpers (client-side).
 *
 * Call `initPushNotifications(backendToken)` once the user is authenticated.
 * It registers a web push token only when permission is already granted. Use
 * `requestWebPushNotifications(backendToken)` from an explicit UI action to
 * show the browser permission prompt.
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
import { getNativeNotificationPath } from "./nativeNotificationRoutes";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
let foregroundListenerRegistered = false;

function getFirebaseMessagingServiceWorkerUrl() {
  const params = new URLSearchParams({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    apiUrl: API_URL,
  });

  return `/sw.js?${params.toString()}`;
}

/** Send the FCM token to our backend so targeted pushes can be delivered. */
async function registerTokenWithBackend(pushToken, backendToken, permissionStatus = null) {
  if (!backendToken) return;
  try {
    await fetch(`${API_URL}/api/user/me/push-token`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: ["Bearer", backendToken].join(" "),
      },
      body: JSON.stringify({
        pushToken,
        platform: "web",
        permissionStatus,
      }),
    });
  } catch {
    // Non-critical — silently ignore network errors
  }
}

export function getWebPushPermissionState() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function getMessagingRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(getFirebaseMessagingServiceWorkerUrl(), {
    scope: "/",
  });
}

async function registerGrantedWebPush(backendToken) {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return false;

  const registration = await getMessagingRegistration();
  if (!registration) return false;

  const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
  const messaging = getMessaging(firebaseApp);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (token) {
    await registerTokenWithBackend(token, backendToken, "granted");
  }

  if (!foregroundListenerRegistered) {
    foregroundListenerRegistered = true;
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      const link = payload.data?.link || "/";
      const pushEventId = payload.data?.pushEventId;

      if (title && "Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(title, { body, icon: "/icon.png" });
        notif.onclick = () => {
          if (pushEventId) {
            fetch(`${API_URL}/api/push/opened/${pushEventId}`, { method: "POST" }).catch(() => {});
          }
          window.focus();
          window.location.assign(getNativeNotificationPath(link));
        };
      }
    });
  }

  return Boolean(token);
}

/**
 * Initialise push notifications for the authenticated user without prompting.
 *
 * @param {string} backendToken – JWT returned by the backend after login.
 * @returns {Promise<void>}
 */
export async function initPushNotifications(backendToken) {
  if (!backendToken) return;
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;

  try {
    const permission = Notification.permission;
    if (permission !== "granted") {
      await registerTokenWithBackend(null, backendToken, permission);
      return;
    }
    await registerGrantedWebPush(backendToken);
  } catch {
    // Silently ignore — push is a non-critical enhancement
  }
}

export async function requestWebPushNotifications(backendToken) {
  if (!backendToken) return false;
  if (typeof window === "undefined" || !("Notification" in window)) return false;

  try {
    const permission =
      Notification.permission === "default" || Notification.permission === "prompt"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") {
      await registerTokenWithBackend(null, backendToken, permission);
      return false;
    }
    return registerGrantedWebPush(backendToken);
  } catch {
    return false;
  }
}

export async function unregisterWebPushToken(backendToken) {
  if (!backendToken) return false;
  if (typeof window === "undefined" || !("Notification" in window)) return false;

  try {
    if (Notification.permission === "granted") {
      const { getMessaging, deleteToken } = await import("firebase/messaging");
      const messaging = getMessaging(firebaseApp);
      await deleteToken(messaging).catch(() => false);
    }
    await registerTokenWithBackend(null, backendToken, Notification.permission);
    return true;
  } catch {
    await registerTokenWithBackend(null, backendToken, Notification.permission).catch(() => {});
    return false;
  }
}
