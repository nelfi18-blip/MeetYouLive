import { fnv1aHash } from "./agoraUid.js";

export function getGuestPublicationPresentation(status) {
  if (status === "published") {
    return {
      icon: "🟢",
      titleKey: "multiGuest.guestStatusTitle",
      descriptionKey: "multiGuest.guestStatusDesc",
    };
  }

  if (status === "error") {
    return {
      icon: "⚠️",
      titleKey: "multiGuest.promotionFailedTitle",
      descriptionKey: "multiGuest.promotionFailedDesc",
    };
  }

  return {
    icon: "⏳",
    titleKey: "multiGuest.approvedTitle",
    descriptionKey: "multiGuest.preparingMedia",
  };
}

export function getGuestPublicationStatusForTransition(outcome) {
  switch (outcome) {
    case "promoted":
      return "published";
    case "promote-failed":
      return "error";
    case "demoted":
    case "demote-failed":
      return "idle";
    default:
      return null;
  }
}

export function createMultiGuestUidUserInfoMap({ host, activeGuests, creatorName, defaultGuestName }) {
  const uidUserInfoById = new Map();
  const hostUserId = host?._id;

  if (hostUserId) {
    uidUserInfoById.set(fnv1aHash(hostUserId), {
      isHost: true,
      username: creatorName,
      userId: String(hostUserId),
    });
  }

  activeGuests.forEach((guest) => {
    const guestUserId = guest.userId?._id || guest.userId;
    if (!guestUserId) return;
    uidUserInfoById.set(fnv1aHash(guestUserId), {
      isHost: false,
      username: guest.userId?.username || guest.userId?.name || defaultGuestName,
      userId: String(guestUserId),
    });
  });

  return uidUserInfoById;
}

export function getRemoteParticipantIdentity(uidUserInfoById, uid) {
  const numericUid = Number(uid);
  const info = Number.isSafeInteger(numericUid)
    ? uidUserInfoById.get(numericUid)
    : uidUserInfoById.get(uid);

  return info || { isHost: false, username: undefined, userId: undefined };
}

export function createLocalParticipant({
  isCreator,
  isGuest,
  creatorName,
  currentUsername,
  currentUserId,
  youFallback,
}) {
  if (!isCreator && !isGuest) return null;

  return {
    uid: "local",
    isLocal: true,
    isHost: isCreator,
    username: isCreator ? creatorName : currentUsername || youFallback,
    userId: currentUserId,
  };
}

/**
 * Single source of truth for "which participants get a video tile".
 *
 * Renders a tile ONLY for streams that are actually available to show:
 * - the local participant (host, or an approved guest who is publishing
 *   locally), when one exists.
 * - remote Agora users that currently have a subscribed video and/or audio
 *   track (i.e. they are actually publishing — an approved guest who has
 *   not published yet never appears in `remoteAgoraUsers` in the first
 *   place, since only publishers are subscribed to via Agora).
 *
 * Never creates placeholders for guest slots, approved-but-not-yet-publishing
 * guests, or any "max participants" concept — those are Multi-Guest system
 * facts, not video tiles. This does not touch Agora join/publish logic; it
 * only decides, from state Agora already exposes, which already-available
 * streams are rendered.
 *
 * @param {object|null} localParticipant - result of createLocalParticipant(), or null.
 * @param {Map<string|number, {uid, videoTrack, audioTrack, hasVideo, hasAudio}>} remoteAgoraUsers
 * @param {Map} uidUserInfoById - result of createMultiGuestUidUserInfoMap().
 * @returns {Array} ordered list of renderable participants (local first, then remotes).
 */
export function buildRenderableVideoParticipants({
  localParticipant,
  remoteAgoraUsers,
  uidUserInfoById,
}) {
  const remoteParticipants = Array.from((remoteAgoraUsers || new Map()).values())
    // Only show participants that are actually publishing video/audio — never a
    // viewer/requester who has not been approved (they never appear in this map,
    // since only publishers are subscribed to via Agora).
    .filter((ru) => ru.videoTrack || ru.audioTrack)
    .map((ru) => {
      const info = getRemoteParticipantIdentity(uidUserInfoById, ru.uid);
      return {
        uid: ru.uid,
        isRemote: true,
        videoTrack: ru.videoTrack,
        audioTrack: ru.audioTrack,
        hasVideo: ru.hasVideo,
        hasAudio: ru.hasAudio,
        isHost: info.isHost || false,
        username: info.username,
        userId: info.userId,
      };
    });

  return [...(localParticipant ? [localParticipant] : []), ...remoteParticipants];
}

export function isHostParticipant(participant, hostUserId) {
  const participantUserId = participant?.userId;
  return (
    participant?.isHost === true ||
    (!!participantUserId &&
      !!hostUserId &&
      String(participantUserId) === String(hostUserId))
  );
}
