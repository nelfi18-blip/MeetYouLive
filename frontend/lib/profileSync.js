export const PROFILE_UPDATED_EVENT = "profile:updated";
export const PROFILE_UPDATED_MARKER_KEY = "meetyoulive:profile:updatedAt:v1";

export function publishProfileUpdated(profile) {
  if (typeof window === "undefined" || !profile) return;

  try {
    const profileId = profile._id || profile.id || "";
    window.sessionStorage.setItem(
      PROFILE_UPDATED_MARKER_KEY,
      JSON.stringify({ updatedAt: Date.now(), profileId: profileId ? String(profileId) : "" })
    );
  } catch {
  }

  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: profile }));
}

export function consumeProfileUpdatedMarker() {
  if (typeof window === "undefined") return "";

  try {
    const marker = window.sessionStorage.getItem(PROFILE_UPDATED_MARKER_KEY) || "";
    if (marker) {
      window.sessionStorage.removeItem(PROFILE_UPDATED_MARKER_KEY);
    }
    return marker;
  } catch {
    return "";
  }
}
