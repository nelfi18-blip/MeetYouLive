import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";
import { normalizeGpsPlace } from "./gpsPlace";

const NativeGeocoder = registerPlugin("MeetYouLiveGeocoder");

// User-initiated foreground GPS only. iOS and web keep their existing manual
// location support; no external reverse-geocoding API receives coordinates.
export async function resolveAndroidGpsPlace({ lat, lng }) {
  if (typeof window === "undefined" || !isNativeMobileApp() || getMobilePlatform() !== "android") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  let timer;
  try {
    const result = await Promise.race([
      NativeGeocoder.reverseGeocode({ latitude: lat, longitude: lng }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("GPS lookup timeout")), 6000);
      }),
    ]);
    return normalizeGpsPlace(result);
  } catch {
    // GPS coordinates remain usable for nearby Discovery; never invent city
    // or country from a failed reverse-geocoder response.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
