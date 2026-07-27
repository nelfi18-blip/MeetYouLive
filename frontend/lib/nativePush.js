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

  await fetch(`${API_URL}/api/user/me/push-token`, {
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
  }).catch((err) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push] Native token registration failed:", err);
    }
  });
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
  if (localToken && currentOwnerId && localOwnerId === currentOwnerId) {
    await registerTokenWithBackend(localToken, backendToken, "granted");
  }

  let permission = await PushNotifications.checkPermissions();

  if (permission.receive !== "granted") {
    await registerTokenWithBackend(null, backendToken, permission.receive);
    return true;
  }

  await PushNotifications.register();
  return true;
}

export async function requestNativePushNotifications(backendToken) {
  if (!backendToken || !isNativeMobileApp()) return false;

  latestBackendToken = backendToken;
  registerListeners();

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
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
