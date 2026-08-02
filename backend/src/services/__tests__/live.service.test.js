"use strict";

const {
  getLiveState,
  getPersistedActiveLiveQuery,
  isPersistedActiveLive,
  isPubliclyActiveLive,
  MAX_LIVE_DURATION_MS,
} = require("../live.service.js");

const now = new Date("2026-08-02T18:35:47.000Z");

function makeLive(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439013",
    isLive: true,
    createdAt: new Date(now.getTime() - 60_000),
    endedAt: null,
    user: {
      role: "creator",
      creatorStatus: "approved",
    },
    ...overrides,
  };
}

describe("live state service", () => {
  test("new DB-active live is publicly listed without requiring host connection", () => {
    const live = makeLive();

    expect(isPersistedActiveLive(live, now.getTime())).toBe(true);
    expect(isPubliclyActiveLive(live, { now: now.getTime() })).toBe(true);
    expect(getLiveState(live, { hostConnected: false, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: false,
      publiclyListed: true,
    });
  });

  test("ended live is not persisted active or publicly listed", () => {
    const live = makeLive({ isLive: false, endedAt: now });

    expect(isPersistedActiveLive(live, now.getTime())).toBe(false);
    expect(isPubliclyActiveLive(live, { now: now.getTime() })).toBe(false);
  });

  test("stale live is not persisted active or publicly listed", () => {
    const live = makeLive({
      createdAt: new Date(now.getTime() - MAX_LIVE_DURATION_MS - 1),
    });

    expect(isPersistedActiveLive(live, now.getTime())).toBe(false);
    expect(isPubliclyActiveLive(live, { now: now.getTime() })).toBe(false);
  });

  test("host-connected state is explicit health signal, not public-listing requirement", () => {
    const live = makeLive();

    expect(getLiveState(live, { hostConnected: true, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: true,
      publiclyListed: true,
    });
    expect(getLiveState(live, { hostConnected: false, now: now.getTime() })).toEqual({
      persistedActive: true,
      hostConnected: false,
      publiclyListed: true,
    });
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
