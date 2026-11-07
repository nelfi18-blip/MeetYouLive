// Control remote playout only. No subscriptions, publication, local tracks,
// token handling or channel/session lifecycle operations belong here.
export function bindLivePlaybackVolume(client, { ready, muted }) {
  if (!client) return undefined;
  const volume = ready && !muted ? 100 : 0;
  const sync = () => {
    for (const user of client.remoteUsers || []) {
      const track = user.audioTrack;
      if (!track) continue;
      try {
        if (typeof track.setVolume === "function") track.setVolume(volume);
        else if (volume === 0) track.stop?.();
      } catch {
        // Stopping remote playout is a fallback, not closing a local microphone.
        if (volume === 0) { try { track.stop?.(); } catch { /* Device validation required. */ } }
      }
    }
  };
  const events = ["user-published", "user-unpublished", "connection-state-change"];
  for (const event of events) client.on?.(event, sync);
  sync();
  return () => { for (const event of events) client.off?.(event, sync); };
}
