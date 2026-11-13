// A stable, privacy-scoped key for photos of actual online World members.
// Socket snapshots arrive repeatedly. Reuse photo requests until the set of
// consenting visible peers changes, and revoke immediately on leave/block.
const OBJECT_ID = /^[a-f\d]{24}$/i;

export function worldConsentedPeerIds(peers, presence, max = 16) {
  if (presence !== "online" || !Array.isArray(peers)) return [];
  const ids = new Set();
  for (const peer of peers) {
    if (peer?.photoConsent !== true) continue;
    const id = String(peer.userId || "");
    if (OBJECT_ID.test(id)) ids.add(id.toLowerCase());
  }
  return [...ids].sort().slice(0, Math.max(0, max));
}

export function worldPhotoLookupKey(peers, presence) {
  return worldConsentedPeerIds(peers, presence).join(",");
}
