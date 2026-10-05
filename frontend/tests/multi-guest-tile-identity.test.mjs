import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRenderableVideoParticipants,
  createLocalParticipant,
  createMultiGuestUidUserInfoMap,
  getRemoteParticipantIdentity,
  isHostParticipant,
  resolveGiftTargetParticipant,
} from "../lib/multiGuestPresentation.js";
import { fnv1aHash } from "../lib/agoraUid.js";

// Regression coverage for "Multi-Guest tile identity" (Jose / naamalvarado9
// production bug): in a Multi-Guest live, every video tile's identity must
// be derived from `userId`, never inherited positionally or defaulted to the
// Host's name. Two different userIds must never render the same Host
// identity — Host tile -> Host's real identity, Guest tile -> that Guest's
// real identity, regardless of which account (Host or Guest) is viewing.
//
// This exercises exactly the production scenario reported:
//   Host:  userId "host-123", username "Jose"
//   Guest: userId "guest-456", username "naamalvarado9"
// and asserts the two tiles are never both labeled "Jose".

const host = { _id: "host-123", username: "Jose" };
const activeGuests = [
  { status: "active", userId: { _id: "guest-456", username: "naamalvarado9" } },
];
const creatorName = "Jose";
const defaultGuestName = "Guest";

function makeUidMap() {
  return createMultiGuestUidUserInfoMap({ host, activeGuests, creatorName, defaultGuestName });
}

function remoteUsersWith(...userIds) {
  const map = new Map();
  userIds.forEach((userId) => {
    const uid = fnv1aHash(userId);
    map.set(uid, { uid, videoTrack: {}, audioTrack: {}, hasVideo: true, hasAudio: true });
  });
  return map;
}

test("Guest view: local Guest tile keeps its own identity (never the Host's)", () => {
  const uidUserInfoById = makeUidMap();
  const localParticipant = createLocalParticipant({
    isCreator: false,
    isGuest: true,
    creatorName,
    currentUsername: "naamalvarado9",
    currentUserId: "guest-456",
    youFallback: "You",
  });

  assert.equal(localParticipant.userId, "guest-456");
  assert.equal(localParticipant.username, "naamalvarado9");
  assert.equal(localParticipant.isHost, false);

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: remoteUsersWith("host-123"),
    uidUserInfoById,
  });

  assert.equal(participants.length, 2);

  const [localTile, remoteTile] = participants;
  assert.equal(localTile.isLocal, true);
  assert.equal(localTile.userId, "guest-456");
  assert.equal(localTile.username, "naamalvarado9");
  assert.equal(isHostParticipant(localTile, host._id), false);

  assert.equal(remoteTile.isRemote, true);
  assert.equal(remoteTile.userId, "host-123");
  assert.equal(remoteTile.username, "Jose");
  assert.equal(isHostParticipant(remoteTile, host._id), true);

  // The two tiles must never resolve to the same identity.
  assert.notEqual(localTile.userId, remoteTile.userId);
  assert.notEqual(localTile.username, remoteTile.username);
});

test("Host view: local Host tile and remote Guest tile never collapse into the same identity", () => {
  const uidUserInfoById = makeUidMap();
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName,
    currentUsername: "Jose",
    currentUserId: "host-123",
    youFallback: "You",
  });

  assert.equal(localParticipant.userId, "host-123");
  assert.equal(localParticipant.username, "Jose");
  assert.equal(localParticipant.isHost, true);

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: remoteUsersWith("guest-456"),
    uidUserInfoById,
  });

  assert.equal(participants.length, 2);

  const [localTile, remoteTile] = participants;
  assert.equal(localTile.userId, "host-123");
  assert.equal(localTile.username, "Jose");
  assert.equal(isHostParticipant(localTile, host._id), true);

  assert.equal(remoteTile.userId, "guest-456");
  assert.equal(remoteTile.username, "naamalvarado9");
  assert.equal(isHostParticipant(remoteTile, host._id), false);

  assert.notEqual(localTile.userId, remoteTile.userId);
  assert.notEqual(localTile.username, remoteTile.username);
});

test("two different userIds never receive the same Host identity by fallback", () => {
  const uidUserInfoById = makeUidMap();
  const hostInfo = getRemoteParticipantIdentity(uidUserInfoById, fnv1aHash("host-123"));
  const guestInfo = getRemoteParticipantIdentity(uidUserInfoById, fnv1aHash("guest-456"));

  assert.equal(hostInfo.isHost, true);
  assert.equal(guestInfo.isHost, false);
  assert.notEqual(hostInfo.userId, guestInfo.userId);
  assert.notEqual(hostInfo.username, guestInfo.username);
});

test("an unresolved remote uid is never labeled Host and never inherits the Host's name", () => {
  const uidUserInfoById = makeUidMap();
  const unknownInfo = getRemoteParticipantIdentity(uidUserInfoById, fnv1aHash("ghost-user"));

  assert.equal(unknownInfo.isHost, false);
  assert.notEqual(unknownInfo.username, creatorName);
  assert.equal(unknownInfo.userId, undefined);

  const participants = buildRenderableVideoParticipants({
    localParticipant: null,
    remoteAgoraUsers: remoteUsersWith("ghost-user"),
    uidUserInfoById,
  });

  assert.equal(participants.length, 1);
  assert.equal(isHostParticipant(participants[0], host._id), false);
  assert.notEqual(participants[0].username, creatorName);
});

test("targeted Gift receiverId host-123 selects the Host tile, never the Guest's", () => {
  const uidUserInfoById = makeUidMap();
  const localParticipant = createLocalParticipant({
    isCreator: false,
    isGuest: true,
    creatorName,
    currentUsername: "naamalvarado9",
    currentUserId: "guest-456",
    youFallback: "You",
  });
  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: remoteUsersWith("host-123"),
    uidUserInfoById,
  });

  const target = resolveGiftTargetParticipant(participants, "host-123");
  assert.equal(target?.userId, "host-123");
  assert.equal(isHostParticipant(target, host._id), true);
});

test("targeted Gift receiverId guest-456 selects the Guest tile, never the Host's", () => {
  const uidUserInfoById = makeUidMap();
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName,
    currentUsername: "Jose",
    currentUserId: "host-123",
    youFallback: "You",
  });
  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: remoteUsersWith("guest-456"),
    uidUserInfoById,
  });

  const target = resolveGiftTargetParticipant(participants, "guest-456");
  assert.equal(target?.userId, "guest-456");
  assert.equal(isHostParticipant(target, host._id), false);
});
