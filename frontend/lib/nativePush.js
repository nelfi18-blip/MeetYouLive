import { Device } from "@capacitor/device";
import { PushNotifications } from "@capacitor/push-notifications";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

let listenersRegistered = false;
let latestBackendToken = "";

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
  }).catch(() => {});
}

function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  PushNotifications.addListener("registration", ({ value }) => {
    registerTokenWithBackend(value, latestBackendToken, "granted");
  });

  PushNotifications.addListener("registrationError", () => {});

  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const link = notification?.data?.link;
    if (typeof link === "string" && link) {
      window.location.assign(link);
    }
  });
}

export async function initNativePushNotifications(backendToken) {
  if (!backendToken || !isNativeMobileApp()) return false;

  latestBackendToken = backendToken;
  registerListeners();

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== "granted") {
    await registerTokenWithBackend(null, backendToken, permission.receive);
    return true;
  }

  await PushNotifications.register();
  return true;
}
