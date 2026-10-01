import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveActiveVsState,
  deriveIncomingChallenge,
  deriveOutgoingChallenge,
} from "../lib/vsBattleStatus.js";

const activeVsStatus = {
  isVsActive: true,
  opponent: { liveId: "opponent-live", username: "maria", avatar: null },
  vsStartTime: "2026-01-01T00:00:00.000Z",
  vsDuration: 120,
  vsScore: { host: 10, opponent: 5 },
  vsChallenge: null,
  challenger: null,
  challengeOpponent: null,
};

const incomingChallengeStatus = {
  isVsActive: false,
  opponent: null,
  vsChallenge: { challengeId: "chal-1", durationMinutes: 5, status: "pending" },
  challenger: { liveId: "challenger-live", username: "jose", avatar: null },
  challengeOpponent: null,
};

const outgoingChallengeStatus = {
  isVsActive: false,
  opponent: null,
  vsChallenge: { challengeId: "chal-2", durationMinutes: 5, status: "pending" },
  challenger: null,
  challengeOpponent: { liveId: "opponent-live", username: "maria", avatar: null },
};

test("vs-status recovery: identifies a pending incoming challenge (current live is the opponent)", () => {
  const incoming = deriveIncomingChallenge(incomingChallengeStatus, true);
  assert.deepEqual(incoming, {
    challengeId: "chal-1",
    challengerUsername: "jose",
    challengerAvatar: null,
    durationMinutes: 5,
  });
  assert.equal(deriveOutgoingChallenge(incomingChallengeStatus, true), null);
});

test("vs-status recovery: identifies a pending outgoing challenge and returns the opponent identity (current live is the challenger)", () => {
  const outgoing = deriveOutgoingChallenge(outgoingChallengeStatus, true);
  assert.deepEqual(outgoing, {
    challengeId: "chal-2",
    opponentUsername: "maria",
  });
  assert.equal(deriveIncomingChallenge(outgoingChallengeStatus, true), null);
});

test("vs-status recovery: refresh/recovery can distinguish incoming vs outgoing for the same creator", () => {
  assert.notEqual(
    deriveIncomingChallenge(incomingChallengeStatus, true),
    null
  );
  assert.equal(deriveOutgoingChallenge(incomingChallengeStatus, true), null);

  assert.equal(deriveIncomingChallenge(outgoingChallengeStatus, true), null);
  assert.notEqual(
    deriveOutgoingChallenge(outgoingChallengeStatus, true),
    null
  );
});

test("vs-status recovery: non-creator viewers never recover incoming/outgoing challenge banners", () => {
  assert.equal(deriveIncomingChallenge(incomingChallengeStatus, false), null);
  assert.equal(deriveOutgoingChallenge(outgoingChallengeStatus, false), null);
});

test("vs-status recovery: does not alter recovery of an active VS battle", () => {
  const activePatch = deriveActiveVsState(activeVsStatus);
  assert.deepEqual(activePatch, {
    vsActive: true,
    vsStartTime: "2026-01-01T00:00:00.000Z",
    vsDuration: 120,
    myScore: 10,
    theirScore: 5,
    opponentIdentity: { liveId: "opponent-live", username: "maria", avatar: null },
  });
  assert.equal(deriveIncomingChallenge(activeVsStatus, true), null);
  assert.equal(deriveOutgoingChallenge(activeVsStatus, true), null);
});

test("vs-status recovery: no active battle and no pending challenge yields no patches", () => {
  const emptyStatus = {
    isVsActive: false,
    opponent: null,
    vsChallenge: null,
    challenger: null,
    challengeOpponent: null,
  };
  assert.equal(deriveActiveVsState(emptyStatus), null);
  assert.equal(deriveIncomingChallenge(emptyStatus, true), null);
  assert.equal(deriveOutgoingChallenge(emptyStatus, true), null);
});
