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

/**
 * Builds the list of valid Gift recipients for a Multi-Guest live: the host
 * plus every currently ACTIVE guest — never pending guestRequests, never
 * disconnected guests, never the viewer's own account (self-gifting is
 * always rejected server-side anyway, but it never makes sense to offer it
 * as an option).
 *
 * Used by the Live room page to decide whether the simple single-recipient
 * Gift flow applies (1 valid participant) or a recipient selector must be
 * shown (2+ valid participants) before confirming a Gift — see GiftPanel's
 * `recipients` prop.
 *
 * @param {object} host - live.user (populated: _id, username, name, avatar).
 * @param {Array}  guests - live.guests (populated userId: _id, username, name, avatar).
 * @param {string} currentUserId - the viewer's own user id (excluded from the list).
 * @param {string} defaultGuestName - i18n fallback label for a guest with no name.
 * @param {(user: object) => string|null} [resolveAvatar] - optional avatar URL
 *        normalizer (e.g. frontend/lib/imageHelpers.js's getUserImage). Defaults
 *        to the raw `avatar` field so this helper stays dependency-free/testable.
 * @returns {Array<{id: string, name: string, avatar: string|null, isHost: boolean}>}
 */
export function buildGiftRecipients({ host, guests, currentUserId, defaultGuestName, resolveAvatar }) {
  const getAvatar = typeof resolveAvatar === "function" ? resolveAvatar : (u) => u?.avatar || null;
  const recipients = [];
  const hostId = host?._id;

  if (hostId && String(hostId) !== String(currentUserId)) {
    recipients.push({
      id: String(hostId),
      name: host?.username || host?.name || defaultGuestName,
      avatar: getAvatar(host),
      isHost: true,
    });
  }

  (guests || [])
    .filter((g) => g?.status === "active")
    .forEach((g) => {
      const guestUser = g.userId;
      const guestId = guestUser?._id || guestUser;
      if (!guestId) return;
      if (String(guestId) === String(currentUserId)) return;
      // Never list the same user twice (e.g. host also present in guests[]).
      if (recipients.some((r) => r.id === String(guestId))) return;

      recipients.push({
        id: String(guestId),
        name: guestUser?.username || guestUser?.name || defaultGuestName,
        avatar: getAvatar(guestUser),
        isHost: false,
      });
    });

  return recipients;
}

/**
 * Pure selection logic for GiftPanel's recipient picker: given the valid
 * `recipients` list (see buildGiftRecipients) and the currently selected id,
 * resolves which backend-authoritative `receiverId` a Gift send should use.
 *
 * - 0-1 recipients (no selector shown): always the simple/base `receiverId`.
 * - 2+ recipients: whichever id is selected, falling back to the first
 *   recipient if the previous selection became invalid (e.g. a guest left).
 *
 * This does not change #986 receiver validation/authority in any way — it
 * only decides what the client *offers* as `receiverId` in the send request;
 * the backend remains the sole source of truth for who may receive a Gift.
 */
export function resolveEffectiveReceiverId({ recipients, selectedReceiverId, receiverId }) {
  const hasChoice = Array.isArray(recipients) && recipients.length > 1;
  if (!hasChoice) return receiverId;
  if (recipients.some((r) => r.id === selectedReceiverId)) return selectedReceiverId;
  return recipients[0]?.id || receiverId;
}

/**
 * Resolves which rendered video participant (see buildRenderableVideoParticipants)
 * a Gift's backend-authoritative `receiverId` (LIVE_GIFT_SENT payload, #986)
 * corresponds to, so the Live stage can visually target that tile (halo/pulse)
 * without inventing a second identity system or touching Agora UID generation.
 *
 * @param {Array} participants - result of buildRenderableVideoParticipants().
 * @param {string|null|undefined} receiverId - LIVE_GIFT_SENT's receiverId.
 * @returns {object|null} the matching participant, or null when none match
 *   (e.g. the recipient's camera is not currently rendered as a tile).
 */
export function resolveGiftTargetParticipant(participants, receiverId) {
  if (!receiverId) return null;
  return (
    (participants || []).find(
      (p) => p?.userId && String(p.userId) === String(receiverId)
    ) || null
  );
}
