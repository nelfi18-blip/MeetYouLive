import test from "node:test";
import assert from "node:assert/strict";
import { buildMultiGuestIdentityDiagnostic } from "../lib/multiGuestIdentityDiagnostic.js";
import {
  createLocalParticipant,
  createMultiGuestUidUserInfoMap,
  buildRenderableVideoParticipants,
} from "../lib/multiGuestPresentation.js";
import { fnv1aHash } from "../lib/agoraUid.js";

/**
 * Reproduces the exact minimal case from the bug report: a Guest-view
 * snapshot for a live hosted by "Jose" (host-123) with one active guest,
 * "naamalvarado9" (guest-456), viewed from the Guest's own device.
 *
 * The diagnostic must use the SAME runtime pipeline (createMultiGuestUidUserInfoMap
 * -> createLocalParticipant -> buildRenderableVideoParticipants) the Live page
 * itself uses — never a second/parallel identity system.
 */
function buildGuestViewSnapshot() {
  const host = { _id: "host-123", username: "Jose" };
  const activeGuests = [
    { userId: { _id: "guest-456", username: "naamalvarado9" }, status: "active" },
  ];
  const currentUserId = "guest-456";
  const currentUsername = "naamalvarado9";
  const isCreator = false;
  const isGuest = true;

  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "Jose",
    defaultGuestName: "Guest",
  });

  const localParticipant = createLocalParticipant({
    isCreator,
    isGuest,
    creatorName: "Jose",
    currentUsername,
    currentUserId,
    youFallback: "You",
  });

  // The host's camera, seen remotely from the Guest's device, publishing
  // under the Agora uid Multi-Guest derives from the host's own userId.
  const remoteAgoraUsers = new Map([
    [
      fnv1aHash("host-123"),
      { uid: fnv1aHash("host-123"), videoTrack: {}, audioTrack: {}, hasVideo: true, hasAudio: true },
    ],
  ]);

  const videoParticipants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers,
    uidUserInfoById,
  });

  const diagnostic = buildMultiGuestIdentityDiagnostic({
    liveId: "live-1",
    host,
    currentUserId,
    currentUsername,
    isCreator,
    isGuest,
    activeGuests,
    uidUserInfoById,
    remoteAgoraUsers,
    localParticipant,
    videoParticipants,
  });

  return diagnostic;
}

test("buildMultiGuestIdentityDiagnostic: Guest's own localParticipant keeps the guest identity", () => {
  const diagnostic = buildGuestViewSnapshot();

  assert.equal(diagnostic.currentUser.currentUserId, "guest-456");
  assert.equal(diagnostic.currentUser.currentUsername, "naamalvarado9");
  assert.equal(diagnostic.currentUser.isCreator, false);
  assert.equal(diagnostic.currentUser.isGuest, true);

  assert.equal(diagnostic.localParticipant.userId, "guest-456");
  assert.equal(diagnostic.localParticipant.username, "naamalvarado9");
  assert.equal(diagnostic.localParticipant.isHost, false);
  assert.equal(diagnostic.localParticipant.isLocal, true);
});

test("buildMultiGuestIdentityDiagnostic: the remote host tile keeps the host identity", () => {
  const diagnostic = buildGuestViewSnapshot();

  const remoteHostTile = diagnostic.videoParticipants.find((p) => p.isRemote);
  assert.ok(remoteHostTile, "expected a remote (host) tile in videoParticipants");
  assert.equal(remoteHostTile.userId, "host-123");
  assert.equal(remoteHostTile.username, "Jose");
  assert.equal(remoteHostTile.isHost, true);
  assert.equal(remoteHostTile.computedIsHost, true);
});

test("buildMultiGuestIdentityDiagnostic: videoParticipants contains exactly two distinct identities", () => {
  const diagnostic = buildGuestViewSnapshot();

  assert.equal(diagnostic.videoParticipants.length, 2);
  const userIds = diagnostic.videoParticipants.map((p) => p.userId);
  assert.deepEqual(new Set(userIds), new Set(["guest-456", "host-123"]));

  const localTile = diagnostic.videoParticipants.find((p) => p.isLocal);
  const remoteTile = diagnostic.videoParticipants.find((p) => p.isRemote);
  assert.equal(localTile.userId, "guest-456");
  assert.equal(localTile.computedIsHost, false);
  assert.equal(remoteTile.userId, "host-123");
  assert.equal(remoteTile.computedIsHost, true);
});

test("buildMultiGuestIdentityDiagnostic: host and activeGuests/uidMap fields are correct", () => {
  const diagnostic = buildGuestViewSnapshot();

  assert.equal(diagnostic.host.userId, "host-123");
  assert.equal(diagnostic.host.username, "Jose");

  assert.equal(diagnostic.activeGuests.length, 1);
  assert.equal(diagnostic.activeGuests[0].userId, "guest-456");
  assert.equal(diagnostic.activeGuests[0].username, "naamalvarado9");
  assert.equal(diagnostic.activeGuests[0].status, "active");

  const hostUidEntry = diagnostic.uidMap.find((e) => e.userId === "host-123");
  assert.ok(hostUidEntry);
  assert.equal(hostUidEntry.username, "Jose");
  assert.equal(hostUidEntry.isHost, true);
  assert.equal(hostUidEntry.agoraUid, fnv1aHash("host-123"));

  assert.equal(diagnostic.remoteAgoraUsers.length, 1);
  assert.equal(diagnostic.remoteAgoraUsers[0].hasVideo, true);
  assert.equal(diagnostic.remoteAgoraUsers[0].hasAudio, true);
});

test("buildMultiGuestIdentityDiagnostic: never includes sensitive data", () => {
  const diagnostic = buildGuestViewSnapshot();
  const serialized = JSON.stringify(diagnostic).toLowerCase();

  for (const forbidden of ["token", "authorization", "email", "coins", "password", "secret"]) {
    assert.ok(!serialized.includes(forbidden), `diagnostic must not contain "${forbidden}"`);
  }
});

test("buildMultiGuestIdentityDiagnostic: tolerates a missing localParticipant (pure viewer)", () => {
  const host = { _id: "host-123", username: "Jose" };
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [],
    creatorName: "Jose",
    defaultGuestName: "Guest",
  });

  const diagnostic = buildMultiGuestIdentityDiagnostic({
    liveId: "live-1",
    host,
    currentUserId: null,
    currentUsername: "",
    isCreator: false,
    isGuest: false,
    activeGuests: [],
    uidUserInfoById,
    remoteAgoraUsers: new Map(),
    localParticipant: null,
    videoParticipants: [],
  });

  assert.equal(diagnostic.localParticipant, null);
  assert.deepEqual(diagnostic.videoParticipants, []);
  assert.equal(diagnostic.currentUser.currentUserId, null);
});
