import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalParticipant,
  createMultiGuestUidUserInfoMap,
  getGuestPublicationPresentation,
  getGuestPublicationStatusForTransition,
  getRemoteParticipantIdentity,
  isHostParticipant,
} from "../lib/multiGuestPresentation.js";
import { fnv1aHash } from "../lib/agoraUid.js";
import { applyGuestTransition, createGuestTransitionQueue } from "../lib/agoraGuestTransition.js";

test("an approved guest whose publication is pending sees the preparing state", () => {
  const presentation = getGuestPublicationPresentation("preparing");

  assert.equal(presentation.titleKey, "multiGuest.approvedTitle");
  assert.equal(presentation.descriptionKey, "multiGuest.preparingMedia");
});

test('an "applyGuestTransition" promoted outcome shows the guest as live', async () => {
  const client = {
    async renewToken() {},
    async setClientRole() {},
    async publish() {},
  };
  const result = await applyGuestTransition({
    queue: createGuestTransitionQueue(),
    client,
    targetIsGuest: true,
    getIsPublisherState: () => false,
    setIsPublisherState() {},
    createTracks: async () => [{ close() {} }, { close() {} }],
    fetchPublisherToken: async () => ({ token: "publisher-token" }),
  });

  assert.equal(result.outcome, "promoted");
  const status = getGuestPublicationStatusForTransition(result.outcome);
  const presentation = getGuestPublicationPresentation(status);

  assert.equal(presentation.titleKey, "multiGuest.guestStatusTitle");
  assert.equal(presentation.descriptionKey, "multiGuest.guestStatusDesc");
  assert.notEqual(presentation.descriptionKey, "multiGuest.preparingMedia");
});

test("promotion errors have a distinct guest status", () => {
  const presentation = getGuestPublicationPresentation("error");

  assert.equal(presentation.titleKey, "multiGuest.promotionFailedTitle");
  assert.equal(presentation.descriptionKey, "multiGuest.promotionFailedDesc");
});

test("host local and guest remote tiles resolve to their own identities", () => {
  const host = { _id: "host-id" };
  const activeGuests = [{ userId: { _id: "guest-id", username: "guest-handle" }, status: "active" }];
  const uidInfo = createMultiGuestUidUserInfoMap({
    host,
    activeGuests,
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });
  const hostLocal = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const guestRemote = getRemoteParticipantIdentity(uidInfo, String(fnv1aHash("guest-id")));

  assert.equal(hostLocal.username, "host-handle");
  assert.equal(guestRemote.username, "guest-handle");
  assert.equal(isHostParticipant(hostLocal, host._id), true);
  assert.equal(isHostParticipant(guestRemote, host._id), false);
});

test("guest local and host remote tiles resolve to their own identities", () => {
  const host = { _id: "host-id" };
  const uidInfo = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });
  const guestLocal = createLocalParticipant({
    isCreator: false,
    isGuest: true,
    creatorName: "host-handle",
    currentUsername: "guest-handle",
    currentUserId: "guest-id",
    youFallback: "You",
  });
  const hostRemote = getRemoteParticipantIdentity(uidInfo, fnv1aHash("host-id"));

  assert.equal(guestLocal.username, "guest-handle");
  assert.equal(hostRemote.username, "host-handle");
  assert.equal(isHostParticipant(guestLocal, host._id), false);
  assert.equal(isHostParticipant(hostRemote, host._id), true);
});

test("an unknown remote UID is never resolved or styled as the host", () => {
  const uidInfo = createMultiGuestUidUserInfoMap({
    host: { _id: "host-id" },
    activeGuests: [],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });
  const unknownRemote = getRemoteParticipantIdentity(uidInfo, 999999);

  assert.equal(unknownRemote.username, undefined);
  assert.equal(unknownRemote.isHost, false);
  assert.equal(isHostParticipant(unknownRemote, undefined), false);
  assert.equal(isHostParticipant(unknownRemote, "host-id"), false);
});
