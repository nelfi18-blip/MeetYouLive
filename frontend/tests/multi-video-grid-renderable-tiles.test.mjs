import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRenderableVideoParticipants,
  createLocalParticipant,
  createMultiGuestUidUserInfoMap,
  isHostParticipant,
} from "../lib/multiGuestPresentation.js";
import { fnv1aHash } from "../lib/agoraUid.js";

// Regression coverage for "only streams that are really publishing get a
// tile" — no placeholders for slots, max-guest counts, or approved-but-not-
// yet-publishing guests. These are the minimum counts requested for the
// Live stage visual redesign: 1 -> 1 tile, 2 -> 2 tiles, 3 -> 3 tiles,
// 4 -> 4 tiles, with automatic reflow when a stream disappears.

const host = { _id: "host-id" };

function makeRemoteAgoraUsers(entries) {
  // Mirrors the shape kept in app/live/[id]/page.jsx's remoteAgoraUsers state.
  const map = new Map();
  entries.forEach(({ uid, videoTrack = null, audioTrack = null, hasVideo = false, hasAudio = false }) => {
    map.set(uid, { uid, videoTrack, audioTrack, hasVideo, hasAudio });
  });
  return map;
}

test("1 publishing stream -> exactly 1 renderable tile (host alone)", () => {
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([]),
    uidUserInfoById,
  });

  assert.equal(participants.length, 1);
  assert.equal(isHostParticipant(participants[0], host._id), true);
});

test("2 publishing streams -> exactly 2 renderable tiles (host + 1 remote guest)", () => {
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const activeGuests = [{ userId: { _id: "guest-1", username: "guest-one" }, status: "active" }];
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([
      { uid: fnv1aHash("guest-1"), videoTrack: {}, hasVideo: true },
    ]),
    uidUserInfoById,
  });

  assert.equal(participants.length, 2);
  const remote = participants.find((p) => p.isRemote);
  assert.equal(remote.username, "guest-one");
  assert.equal(isHostParticipant(remote, host._id), false);
});

test("3 publishing streams -> exactly 3 renderable tiles (host + 2 remote guests)", () => {
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const activeGuests = [
    { userId: { _id: "guest-1", username: "guest-one" }, status: "active" },
    { userId: { _id: "guest-2", username: "guest-two" }, status: "active" },
  ];
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([
      { uid: fnv1aHash("guest-1"), videoTrack: {}, hasVideo: true },
      { uid: fnv1aHash("guest-2"), videoTrack: {}, hasVideo: true },
    ]),
    uidUserInfoById,
  });

  assert.equal(participants.length, 3);
});

test("4 publishing streams -> exactly 4 renderable tiles (host + 3 remote guests)", () => {
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const activeGuests = [
    { userId: { _id: "guest-1", username: "guest-one" }, status: "active" },
    { userId: { _id: "guest-2", username: "guest-two" }, status: "active" },
    { userId: { _id: "guest-3", username: "guest-three" }, status: "active" },
  ];
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([
      { uid: fnv1aHash("guest-1"), videoTrack: {}, hasVideo: true },
      { uid: fnv1aHash("guest-2"), videoTrack: {}, hasVideo: true },
      { uid: fnv1aHash("guest-3"), videoTrack: {}, hasVideo: true },
    ]),
    uidUserInfoById,
  });

  assert.equal(participants.length, 4);
});

test("an approved guest who has not published yet never creates a tile (no placeholders)", () => {
  // Approved (active) guests that have not published anything never appear
  // in remoteAgoraUsers at all — Agora only subscribes to actual publishers.
  // "Invitados 1/3" stays Multi-Guest system info and must never translate
  // into empty video tiles.
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const activeGuests = [{ userId: { _id: "guest-1", username: "guest-one" }, status: "active" }];
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const participants = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([]), // approved guest hasn't published yet
    uidUserInfoById,
  });

  assert.equal(participants.length, 1, "only the host tile should render — no empty slot for the approved guest");
});

test("a remote stream disappearing shrinks the renderable set and the layout can reflow", () => {
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const activeGuests = [
    { userId: { _id: "guest-1", username: "guest-one" }, status: "active" },
    { userId: { _id: "guest-2", username: "guest-two" }, status: "active" },
  ];
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const beforeLeave = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([
      { uid: fnv1aHash("guest-1"), videoTrack: {}, hasVideo: true },
      { uid: fnv1aHash("guest-2"), videoTrack: {}, hasVideo: true },
    ]),
    uidUserInfoById,
  });
  assert.equal(beforeLeave.length, 3);

  // guest-2 stops publishing and leaves the channel: Agora removes it from
  // remoteAgoraUsers (not just clears its tracks).
  const afterLeave = buildRenderableVideoParticipants({
    localParticipant,
    remoteAgoraUsers: makeRemoteAgoraUsers([
      { uid: fnv1aHash("guest-1"), videoTrack: {}, hasVideo: true },
    ]),
    uidUserInfoById,
  });

  assert.equal(afterLeave.length, 2, "the layout must shrink back to exactly 2 tiles once a stream disappears");
});

test("an unknown remote uid is never labeled host, and is still rendered with a fallback identity", () => {
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const participants = buildRenderableVideoParticipants({
    localParticipant: null,
    remoteAgoraUsers: makeRemoteAgoraUsers([{ uid: 999999, videoTrack: {}, hasVideo: true }]),
    uidUserInfoById,
  });

  assert.equal(participants.length, 1);
  assert.equal(isHostParticipant(participants[0], host._id), false);
});
