"use strict";

/**
 * Ephemeral, in-memory "who's online" presence for Social Rooms.
 *
 * Design goals (mirrors backend/src/lib/socialRoomReactions.js):
 * - Nothing here is persisted to MongoDB — presence lives only for the
 *   lifetime of the process / socket connections.
 * - Backend is authoritative: the present user is always `socket._userId`
 *   (set by `authenticateSocket` in socket.js) together with a username/
 *   name/avatar resolved server-side (e.g. via `User.findById`). An
 *   arbitrary `user` object sent by the client is never trusted as identity.
 * - Presence updates are only ever broadcast to `social_room:${roomId}` —
 *   never via a global `io.emit`.
 * - A single authenticated user can hold multiple sockets (e.g. two tabs,
 *   phone + desktop) in the same room without appearing twice and without
 *   disappearing until their *last* socket in that room disconnects/leaves.
 */

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const isValidRoomId = (roomId) => typeof roomId === "string" && OBJECT_ID_RE.test(roomId);

// roomId (string) -> Map<userId (string), {
//   userId, username, name, avatar, joinedAt, socketIds: Set<socketId>
// }>
const roomPresence = new Map();

const getSafeAvatar = (profile = {}) => {
  const candidates = [
    profile.avatar,
    profile.profilePhoto,
    profile.profileImage,
    profile.photo,
    Array.isArray(profile.profilePhotos) ? profile.profilePhotos[0] : null,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
};

/**
 * Builds the only fields ever exposed to clients for a presence entry.
 * Deliberately excludes email, phone, tokens, payment info, or any other
 * User field — only what the UI needs to render a chip/avatar.
 */
const sanitizePresenceUser = (userId, profile = {}) => ({
  userId: String(userId),
  username: String(profile.username || "").slice(0, 80),
  name: String(profile.name || "").slice(0, 80),
  avatar: getSafeAvatar(profile),
});

const addParticipant = ({ roomId, socketId, userId, profile = {} }) => {
  if (!isValidRoomId(roomId) || !socketId || !userId) return false;
  const uid = String(userId);
  if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
  const participants = roomPresence.get(roomId);
  const existing = participants.get(uid);
  if (existing) {
    existing.socketIds.add(socketId);
    return false; // already present — not a new participant, avoid duplicates
  }
  participants.set(uid, {
    ...sanitizePresenceUser(uid, profile),
    joinedAt: new Date().toISOString(),
    socketIds: new Set([socketId]),
  });
  return true;
};

/**
 * Removes one socket from a room's presence. If `userId` is known it is
 * used directly; otherwise (e.g. generic disconnect cleanup) every
 * participant is scanned for a matching socketId.
 * Returns true only when this was the user's LAST socket in the room (i.e.
 * the user actually left), so callers can avoid emitting spurious
 * "user left" events while another connection is still active.
 */
const removeParticipantSocket = ({ roomId, socketId, userId }) => {
  if (!roomId || !socketId) return false;
  const participants = roomPresence.get(roomId);
  if (!participants) return false;

  const tryRemove = (uid) => {
    const entry = participants.get(uid);
    if (!entry) return false;
    entry.socketIds.delete(socketId);
    if (entry.socketIds.size === 0) {
      participants.delete(uid);
      if (participants.size === 0) roomPresence.delete(roomId);
      return true;
    }
    return false;
  };

  const uid = userId ? String(userId) : null;
  if (uid && participants.has(uid)) return tryRemove(uid);

  for (const candidateId of participants.keys()) {
    if (participants.get(candidateId).socketIds.has(socketId)) {
      return tryRemove(candidateId);
    }
  }
  return false;
};

/** Authoritative snapshot of who is currently online in a room, sorted by join order. */
const getPresenceSnapshot = (roomId) => {
  const participants = roomPresence.get(roomId);
  if (!participants) return [];
  return Array.from(participants.values())
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    .map(({ userId, username, name, avatar }) => ({ userId, username, name, avatar }));
};

const getPresenceCount = (roomId) => {
  const participants = roomPresence.get(roomId);
  return participants ? participants.size : 0;
};

/** Test-only helper: reset in-memory presence state between test cases. */
const resetPresence = () => roomPresence.clear();

/** Emits the authoritative snapshot to `social_room:${roomId}` ONLY — never globally. */
const emitPresenceSnapshot = (io, roomId) => {
  if (!io || typeof io.to !== "function" || !isValidRoomId(roomId)) return;
  const participants = getPresenceSnapshot(roomId);
  io.to(`social_room:${roomId}`).emit("social_room:presence", {
    roomId,
    count: participants.length,
    participants,
  });
};

/**
 * Handle a socket registering presence after joining a Social Room.
 * `profile` must come from a server-side lookup (e.g. User.findById), never
 * from the client payload.
 */
const handleJoinSocialRoomPresence = ({ socket, io, roomId, profile } = {}) => {
  const userId = socket && socket._userId;
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!isValidRoomId(roomId)) return { ok: false, reason: "invalid_room" };

  const isNewParticipant = addParticipant({ roomId, socketId: socket.id, userId, profile: profile || {} });
  emitPresenceSnapshot(io, roomId);

  if (isNewParticipant) {
    const safeUser = sanitizePresenceUser(userId, profile || {});
    socket.to(`social_room:${roomId}`).emit("ROOM_USER_JOINED", { user: safeUser, roomId });
  }

  return { ok: true, isNewParticipant };
};

/** Handle a socket leaving a Social Room (explicit leave or disconnect). */
const handleLeaveSocialRoomPresence = ({ socket, io, roomId } = {}) => {
  if (!socket || !roomId) return { ok: false };
  const userId = socket._userId;
  const didRemoveUser = removeParticipantSocket({ roomId, socketId: socket.id, userId });

  if (didRemoveUser) {
    socket.to(`social_room:${roomId}`).emit("ROOM_USER_LEFT", { userId, roomId });
  }
  emitPresenceSnapshot(io, roomId);

  return { ok: true, didRemoveUser };
};

module.exports = {
  isValidRoomId,
  sanitizePresenceUser,
  addParticipant,
  removeParticipantSocket,
  getPresenceSnapshot,
  getPresenceCount,
  resetPresence,
  emitPresenceSnapshot,
  handleJoinSocialRoomPresence,
  handleLeaveSocialRoomPresence,
};
