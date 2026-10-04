"use strict";

const {
  getLiveState,
  getPersistedActiveLiveQuery,
  isPersistedActiveLive,
  isPubliclyActiveLive,
  MAX_LIVE_DURATION_MS,
  HOST_PRESENCE_GRACE_MS,
} = require("../live.service.js");

const now = new Date("2026-08-02T18:35:47.000Z");

function makeLive(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439013",
    isLive: true,
    // Well past the host-presence grace window by default, so tests must
    // opt in to "recently started" behavior explicitly.
    createdAt: new Date(now.getTime() - HOST_PRESENCE_GRACE_MS - 60_000),
    endedAt: null,
    user: {
      role: "creator",
      creatorStatus: "approved",
    },
    ...overrides,
  };
}

describe("live state service", () => {
  // A. persistedActive=true + hostConnected=true → publiclyListed=true
  test("persisted-active live with a connected host is publicly listed", () => {
    const live = makeLive();

    expect(isPersistedActiveLive(live, now.getTime())).toBe(true);
    expect(getLiveState(live, { hostConnected: true, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: true,
      publiclyListed: true,
    });
  });

  // B. persistedActive=true + hostConnected=false outside the tolerated grace
  // window → publiclyListed=false (the ghost-live scenario).
  test("persisted-active live with no host beyond the grace window is not publicly listed", () => {
    const live = makeLive(); // createdAt is already outside the grace window

    expect(isPersistedActiveLive(live, now.getTime())).toBe(true);
    expect(getLiveState(live, { hostConnected: false, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: false,
      publiclyListed: false,
    });
    expect(isPubliclyActiveLive(live, { hostConnected: false, now: now.getTime() })).toBe(false);
  });

  // C1. Live just started (within the grace window) and the host socket
  // hasn't registered yet → must not disappear (startLive HTTP vs. socket
  // registration race).
  test("just-started live is not hidden while the host socket is still registering", () => {
    const live = makeLive({ createdAt: new Date(now.getTime() - 5_000) });

    expect(getLiveState(live, { hostConnected: false, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: false,
      publiclyListed: true,
    });
  });

  // C2. Host was seen connected very recently (brief reconnect window) →
  // must not disappear even though it is not connected at this instant.
  test("live stays listed through a brief host reconnect window", () => {
    const live = makeLive(); // old createdAt, outside the startup grace window
    const hostLastSeenAt = now.getTime() - (HOST_PRESENCE_GRACE_MS - 5_000);

    expect(getLiveState(live, { hostConnected: false, hostLastSeenAt, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: false,
      publiclyListed: true,
    });
  });

  // C3. Once the reconnect grace window has elapsed, the live must stop
  // being listed (the tolerance is brief and explicit, not indefinite).
  test("live stops being listed once the reconnect grace window elapses", () => {
    const live = makeLive();
    const hostLastSeenAt = now.getTime() - (HOST_PRESENCE_GRACE_MS + 5_000);

    expect(getLiveState(live, { hostConnected: false, hostLastSeenAt, now: now.getTime() }).publiclyListed).toBe(false);
  });

  // D. isLive=false → publiclyListed=false, regardless of host presence.
  test("isLive=false is never publicly listed even with a connected host", () => {
    const live = makeLive({ isLive: false });

    expect(isPersistedActiveLive(live, now.getTime())).toBe(false);
    expect(getLiveState(live, { hostConnected: true, now: now.getTime() }).publiclyListed).toBe(false);
  });

  // E. endedAt defined → publiclyListed=false, regardless of host presence.
  test("endedAt defined is never publicly listed even with a connected host", () => {
    const live = makeLive({ endedAt: now });

    expect(isPersistedActiveLive(live, now.getTime())).toBe(false);
    expect(getLiveState(live, { hostConnected: true, now: now.getTime() }).publiclyListed).toBe(false);
  });

  // F. Live stale > 6h → publicly inactive as before, regardless of host
  // presence (the 6h safety net is untouched by this fix).
  test("stale (>6h) live is publicly inactive even with a connected host", () => {
    const live = makeLive({
      createdAt: new Date(now.getTime() - MAX_LIVE_DURATION_MS - 1),
    });

    expect(isPersistedActiveLive(live, now.getTime())).toBe(false);
    expect(getLiveState(live, { hostConnected: true, now: now.getTime() }).publiclyListed).toBe(false);
  });

  test("persisted-active query excludes stale and ended lives at DB level", () => {
    expect(getPersistedActiveLiveQuery(now)).toEqual({
      isLive: true,
      createdAt: { $gte: new Date(now.getTime() - MAX_LIVE_DURATION_MS) },
      $or: [
        { endedAt: null },
        { endedAt: { $exists: false } },
      ],
    });
  });
});
