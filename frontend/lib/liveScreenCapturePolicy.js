// Every Live is protected, independent of price, privacy, VIP or access flags.
// An active session keeps ownership through full-room/mini-player handoffs.
export function shouldProtectLiveSurface(liveId) {
  return Boolean(liveId);
}
