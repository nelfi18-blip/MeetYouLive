import { Device } from "@capacitor/device";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";
import { getNativeNotificationPath } from "./nativeNotificationRoutes";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const LOCAL_PUSH_TOKEN_KEY = "meetyoulive.nativePushToken";
const LOCAL_PUSH_OWNER_KEY = "meetyoulive.nativePushOwner";

let listenersRegistered = false;
let latestBackendToken = "";

function parseJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getBackendUserId(backendToken) {
  const payload = parseJwtPayload(backendToken);
  return payload?.id ? String(payload.id) : "";
}

async function getDeviceMetadata() {
  const [id, info] = await Promise.all([
    Device.getId().catch(() => null),
    Device.getInfo().catch(() => null),
  ]);

  return {
    deviceId: id?.identifier || null,
    platform: info?.platform || getMobilePlatform(),
  };
}

async function registerTokenWithBackend(pushToken, backendToken, permissionStatus) {
  if (!backendToken) return;

  const { deviceId, platform } = await getDeviceMetadata();

  try {
    const response = await fetch(`${API_URL}/api/user/me/push-token`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: ["Bearer", backendToken].join(" "),
      },
      body: JSON.stringify({
        pushToken,
        platform,
        deviceId,
        permissionStatus,
      }),
    });
    // HTTP 401/403/429/5xx must not be mistaken for successful FCM token
    // registration. Never log the push token, JWT, device identifier or body.
    if (!response.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[push] Native token registration rejected:", response.status);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push] Native token registration failed:", err?.name || "network");
    }
    return false;
  }
}

async function persistLocalPushToken(pushToken, backendToken) {
  if (!pushToken) return;
  const ownerId = getBackendUserId(backendToken);
  await Promise.all([
    Preferences.set({ key: LOCAL_PUSH_TOKEN_KEY, value: pushToken }),
    ownerId ? Preferences.set({ key: LOCAL_PUSH_OWNER_KEY, value: ownerId }) : Promise.resolve(),
  ]).catch(() => {});
}

function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  PushNotifications.addListener("registration", ({ value }) => {
    persistLocalPushToken(value, latestBackendToken);
    registerTokenWithBackend(value, latestBackendToken, "granted");
  });

  PushNotifications.addListener("registrationError", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push] Native registration error:", err);
    }
  });

  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const path = getNativeNotificationPath(notification?.data);
    if (path !== "/") {
      window.location.assign(path);
    }
  });
}

export async function initNativePushNotifications(backendToken) {
  if (!backendToken || !isNativeMobileApp()) return false;

  latestBackendToken = backendToken;
  registerListeners();

  const currentOwnerId = getBackendUserId(backendToken);
  const [{ value: localToken }, { value: localOwnerId }] = await Promise.all([
    Preferences.get({ key: LOCAL_PUSH_TOKEN_KEY }),
    Preferences.get({ key: LOCAL_PUSH_OWNER_KEY }),
  ]).catch(() => [{ value: null }, { value: null }]);
  // Verify the OS permission BEFORE replaying a cached token as "granted".
  // An old token may still be stored after Android permission was revoked.
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    await registerTokenWithBackend(null, backendToken, permission.receive);
    return false;
  }

  if (localToken && currentOwnerId && localOwnerId === currentOwnerId) {
    await registerTokenWithBackend(localToken, backendToken, "granted");
  }

  // Firebase may rotate the token. The existing registration listener saves
  // and sends the current token whenever the OS returns it.
  await PushNotifications.register();
  return true;
}

export async function requestNativePushNotifications(backendToken) {
  if (!backendToken || !isNativeMobileApp()) return false;

  latestBackendToken = backendToken;
  registerListeners();

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    // Only called by the user-facing Allow notifications button.
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== "granted") {
    await registerTokenWithBackend(null, backendToken, permission.receive);
    return false;
  }

  await PushNotifications.register();
  return true;
}

export async function unregisterNativePushToken(backendToken) {
  if (!backendToken || !isNativeMobileApp()) return false;
  const { value: localToken } = await Preferences.get({ key: LOCAL_PUSH_TOKEN_KEY }).catch(() => ({ value: null }));
  await registerTokenWithBackend(null, backendToken, "prompt");
  await Promise.all([
    Preferences.remove({ key: LOCAL_PUSH_TOKEN_KEY }),
    Preferences.remove({ key: LOCAL_PUSH_OWNER_KEY }),
  ]).catch(() => {});
  return Boolean(localToken);
}

export async function openNativePushSettings() {
  if (!isNativeMobileApp()) return false;
  await PushNotifications.requestPermissions().catch(() => null);
  return true;
}
