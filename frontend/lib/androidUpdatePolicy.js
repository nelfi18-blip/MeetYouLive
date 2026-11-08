// Android-only Play Store version prompt. This does not install apps, interrupt
// Lives, or depend on PWA service-worker updates.
export const ANDROID_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.meetyoulive.app";

function asVersionCode(value) {
  const text = String(value ?? "");
  if (!/^[1-9][0-9]{0,9}$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

export function getAndroidUpdateStatus(installedBuild, manifest) {
  const installed = asVersionCode(installedBuild);
  const latest = asVersionCode(manifest?.latestVersionCode);
  const minimum = asVersionCode(manifest?.minimumVersionCode);
  if (installed === null || latest === null || minimum === null || minimum > latest) return null;
  if (installed >= latest) return null;
  return { installed, latest, required: installed < minimum };
}
