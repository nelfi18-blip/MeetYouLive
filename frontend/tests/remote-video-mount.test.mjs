import test from "node:test";
import assert from "node:assert/strict";
import { computeRemoteVideoActions } from "../lib/remoteVideoMount.js";

// Fake DOM containers — identity is all that matters for these tests.
const hostContainer = { tag: "host-container" };
const guestContainer = { tag: "guest-container" };

const hostTrackA = { id: "host-track-a" };
const guestTrackA = { id: "guest-track-a" };
const guestTrackB = { id: "guest-track-b" };

test("remote video mount: host + guest both play once their containers are mounted (second stream no longer blank)", () => {
  const participants = [
    { uid: "local", isLocal: true }, // local participant, ignored by the helper
    { uid: 1001, isRemote: true, videoTrack: hostTrackA },
    { uid: 2002, isRemote: true, videoTrack: guestTrackA },
  ];
  const containers = { 1001: hostContainer, 2002: guestContainer };
  const { toPlay, toClear } = computeRemoteVideoActions(participants, containers, {});

  assert.equal(toPlay.length, 2, "both host and guest remote tracks should be scheduled to play");
  assert.deepEqual(
    toPlay.map((a) => a.uid).sort(),
    [1001, 2002].sort()
  );
  assert.equal(toClear.length, 0);
});

test("remote video mount: does not re-play the same track twice (idempotent against unrelated re-renders)", () => {
  const participants = [{ uid: 2002, isRemote: true, videoTrack: guestTrackA }];
  const containers = { 2002: guestContainer };
  const lastPlayed = { "2002": guestTrackA };

  const { toPlay } = computeRemoteVideoActions(participants, containers, lastPlayed);

  assert.equal(toPlay.length, 0, "already-played track must not be queued again");
});

test("remote video mount: a guest tile that exists before its video track arrives waits, then plays once ready", () => {
  // Step 1: guest joined (tile mounted) but hasn't published video yet.
  const step1Participants = [{ uid: 2002, isRemote: true, videoTrack: null }];
  const containers = { 2002: guestContainer };
  const lastPlayed = {};

  const result1 = computeRemoteVideoActions(step1Participants, containers, lastPlayed);
  assert.equal(result1.toPlay.length, 0, "no track yet, nothing to play");

  // Step 2: guest publishes video track — same mounted container, tile count unchanged.
  const step2Participants = [{ uid: 2002, isRemote: true, videoTrack: guestTrackA }];
  const result2 = computeRemoteVideoActions(step2Participants, containers, lastPlayed);

  assert.equal(result2.toPlay.length, 1, "newly available track must be played once the tile already exists");
  assert.equal(result2.toPlay[0].container, guestContainer);
});

test("remote video mount: container not mounted yet is skipped until the ref callback attaches it", () => {
  const participants = [{ uid: 2002, isRemote: true, videoTrack: guestTrackA }];
  const { toPlay } = computeRemoteVideoActions(participants, {}, {});

  assert.equal(toPlay.length, 0, "cannot play into a container that hasn't mounted yet");
});

test("remote video mount: replacing a participant's track (reconnect/renegotiation) re-plays the updated track", () => {
  const participants = [{ uid: 2002, isRemote: true, videoTrack: guestTrackB }];
  const containers = { 2002: guestContainer };
  const lastPlayed = { "2002": guestTrackA };

  const { toPlay } = computeRemoteVideoActions(participants, containers, lastPlayed);

  assert.equal(toPlay.length, 1);
  assert.equal(toPlay[0].videoTrack, guestTrackB, "the new track must be (re)played, not the stale one");
});

test("remote video mount: participant leaving is cleared from bookkeeping", () => {
  const participants = []; // guest left the channel entirely
  const lastPlayed = { "2002": guestTrackA };

  const { toPlay, toClear } = computeRemoteVideoActions(participants, {}, lastPlayed);

  assert.equal(toPlay.length, 0);
  assert.deepEqual(toClear, ["2002"]);
});

test("remote video mount: unpublishing video (audio-only) clears bookkeeping without removing the participant", () => {
  const participants = [{ uid: 2002, isRemote: true, videoTrack: null, audioTrack: {} }];
  const containers = { 2002: guestContainer };
  const lastPlayed = { "2002": guestTrackA };

  const { toPlay, toClear } = computeRemoteVideoActions(participants, containers, lastPlayed);

  assert.equal(toPlay.length, 0);
  assert.deepEqual(toClear, ["2002"], "stale track must be forgotten so a future republish always plays");
});

test("remote video mount: guest re-joining after leaving (same uid) plays again from a clean state", () => {
  // Guest left: bookkeeping cleared.
  let lastPlayed = { "2002": guestTrackA };
  const leaveResult = computeRemoteVideoActions([], {}, lastPlayed);
  leaveResult.toClear.forEach((uid) => delete lastPlayed[uid]);
  assert.deepEqual(lastPlayed, {});

  // Guest rejoins with a brand new track + freshly mounted container.
  const rejoinResult = computeRemoteVideoActions(
    [{ uid: 2002, isRemote: true, videoTrack: guestTrackB }],
    { 2002: guestContainer },
    lastPlayed
  );

  assert.equal(rejoinResult.toPlay.length, 1);
  assert.equal(rejoinResult.toPlay[0].videoTrack, guestTrackB);
});

test("remote video mount: local participant is never scheduled for remote play", () => {
  const participants = [{ uid: "local", isLocal: true, videoTrack: hostTrackA }];
  const { toPlay } = computeRemoteVideoActions(participants, { local: hostContainer }, {});

  assert.equal(toPlay.length, 0, "local preview is handled separately via localVideoRef");
});
