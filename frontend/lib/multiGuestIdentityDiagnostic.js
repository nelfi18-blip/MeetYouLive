import { isHostParticipant } from "./multiGuestPresentation.js";

/**
 * buildMultiGuestIdentityDiagnostic — TEMPORARY, read-only diagnostic snapshot
 * for a single, already-reproduced bug: on a Multi-Guest live, a guest tile
 * sometimes renders with the host's identity (badge shows "Jose" / "⭐ Jose")
 * instead of the actual guest's (e.g. "naamalvarado9"), even though that
 * guest's own camera is publishing correctly.
 *
 * This function does NOT compute or correct identity. It only takes the
 * exact runtime values already produced by the existing, unmodified
 * identity/presentation pipeline (createMultiGuestUidUserInfoMap,
 * createLocalParticipant, buildRenderableVideoParticipants, isHostParticipant
 * — see multiGuestPresentation.js) right before they are used to render the
 * Live stage, and reshapes them into a small, safe-to-display/copy snapshot.
 *
 * Never include tokens, Authorization headers, emails, coins, socket auth,
 * or any other sensitive data — only identity/presentation fields that are
 * already shown on-screen (userId, username, isHost flags, Agora uid,
 * video/audio presence booleans).
 *
 * @param {object} params
 * @param {string} params.liveId
 * @param {object} params.host - live.user (populated: _id, username, name).
 * @param {string|null} params.currentUserId
 * @param {string} params.currentUsername
 * @param {boolean} params.isCreator
 * @param {boolean} params.isGuest
 * @param {Array} params.activeGuests - guests with status === "active"
 *   (each item's `userId` may be a populated object or a raw id string).
 * @param {Map} params.uidUserInfoById - result of createMultiGuestUidUserInfoMap().
 * @param {Map} params.remoteAgoraUsers - raw Agora remote users map
 *   ({ uid, videoTrack, audioTrack, hasVideo, hasAudio }).
 * @param {object|null} params.localParticipant - result of createLocalParticipant().
 * @param {Array} params.videoParticipants - result of buildRenderableVideoParticipants().
 * @returns {object} plain-JSON-serializable diagnostic snapshot.
 */
export function buildMultiGuestIdentityDiagnostic({
  liveId,
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
}) {
  const hostUserId = host?._id != null ? String(host._id) : null;

  return {
    liveId: liveId != null ? String(liveId) : null,
    host: {
      userId: hostUserId,
      username: host?.username || host?.name || null,
    },
    currentUser: {
      currentUserId: currentUserId != null ? String(currentUserId) : null,
      currentUsername: currentUsername || null,
      isCreator: !!isCreator,
      isGuest: !!isGuest,
    },
    activeGuests: (activeGuests || []).map((guest) => {
      const guestUserId = guest?.userId?._id || guest?.userId;
      return {
        userId: guestUserId != null ? String(guestUserId) : null,
        username: guest?.userId?.username || guest?.userId?.name || null,
        status: guest?.status || null,
      };
    }),
    uidMap: Array.from((uidUserInfoById || new Map()).entries()).map(([agoraUid, info]) => ({
      agoraUid,
      userId: info?.userId != null ? String(info.userId) : null,
      username: info?.username || null,
      isHost: !!info?.isHost,
    })),
    remoteAgoraUsers: Array.from((remoteAgoraUsers || new Map()).values()).map((ru) => ({
      uid: ru?.uid,
      hasVideo: !!ru?.hasVideo,
      hasAudio: !!ru?.hasAudio,
    })),
    localParticipant: localParticipant
      ? {
          uid: localParticipant.uid,
          userId: localParticipant.userId != null ? String(localParticipant.userId) : null,
          username: localParticipant.username || null,
          isHost: !!localParticipant.isHost,
          isLocal: !!localParticipant.isLocal,
        }
      : null,
    videoParticipants: (videoParticipants || []).map((p) => ({
      uid: p?.uid,
      userId: p?.userId != null ? String(p.userId) : null,
      username: p?.username || null,
      isHost: !!p?.isHost,
      isLocal: !!p?.isLocal,
      isRemote: !!p?.isRemote,
      computedIsHost: isHostParticipant(p, hostUserId),
    })),
  };
}
