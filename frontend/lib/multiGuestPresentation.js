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

export function isHostParticipant(participant, hostUserId) {
  const participantUserId = participant?.userId;
  return (
    participant?.isHost === true ||
    (!!participantUserId &&
      !!hostUserId &&
      String(participantUserId) === String(hostUserId))
  );
}
