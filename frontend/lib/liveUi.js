/**
 * Shared presentation rules for live discovery surfaces.
 * RECENT_LIVE_WINDOW_MS defines when the UI labels a stream as new/recent.
 */
export const RECENT_LIVE_WINDOW_MS = 45 * 60 * 1000;
export const RECENT_LIVE_WINDOW_MINUTES = Math.round(RECENT_LIVE_WINDOW_MS / 60000);

export function formatLiveDuration(live) {
  const startedAt = live?.startedAt || live?.createdAt;
  const startTime = startedAt ? new Date(startedAt).getTime() : NaN;
  if (!Number.isFinite(startTime)) return "Ahora";

  const minutes = Math.max(1, Math.floor((Date.now() - startTime) / 60000));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
