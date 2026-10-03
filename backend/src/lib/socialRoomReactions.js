"use strict";

/**
 * Authoritative handling for the `social_room:react` Socket.io event
 * (ambient emoji reactions inside Social Rooms).
 *
 * Design goals:
 * - Backend is authoritative: the emitting user is always `socket._userId`
 *   (set by `authenticateSocket` in socket.js), never a client-supplied id.
 * - Reactions are ephemeral: nothing is persisted to MongoDB.
 * - Reactions are only ever broadcast to `social_room:${roomId}` — never
 *   via a global `io.emit`.
 * - A small allowlist and a per-user cooldown prevent spam/abuse.
 */

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

// Small, curated allowlist of ambient reaction emojis. Keep this short —
// anything outside of it must be rejected by the backend.
const ROOM_REACTION_EMOJIS = ["❤️", "🔥", "😂", "👏", "😮", "👍"];

// Minimum time (ms) a given authenticated user must wait between accepted
// reactions, regardless of which Social Room they are in.
const ROOM_REACTION_COOLDOWN_MS = 1200;

// userId (string) -> timestamp (ms) of their last accepted reaction.
const lastReactionAt = new Map();

const isValidRoomId = (roomId) => typeof roomId === "string" && OBJECT_ID_RE.test(roomId);

const isAllowedReactionEmoji = (emoji) =>
  typeof emoji === "string" && ROOM_REACTION_EMOJIS.includes(emoji);

/**
 * Returns true (and records the attempt) if `userId` is allowed to send a
 * reaction right now; returns false if they are still within the cooldown
 * window. Side-effect free for rejected attempts.
 */
const consumeReactionCooldown = (userId, now = Date.now()) => {
  if (!userId) return false;
  const last = lastReactionAt.get(userId) || 0;
  if (now - last < ROOM_REACTION_COOLDOWN_MS) return false;
  lastReactionAt.set(userId, now);
  return true;
};

/** Test-only helper: reset in-memory cooldown state between test cases. */
const resetReactionCooldowns = () => lastReactionAt.clear();

/**
 * Handle one `social_room:react` event.
 *
 * @param {object} params
 * @param {object} params.socket - the emitting Socket.io socket. Must expose
 *   `_userId` (set after JWT auth) and `_socialRoomId` (set by
 *   `join_social_room`, tracking the room this socket actually joined).
 * @param {object} params.io - the shared Socket.io server instance.
 * @param {object} params.data - client payload, expected `{ roomId, emoji }`.
 * @param {Function} [params.ack] - optional Socket.io acknowledgement callback.
 * @returns {{ ok: boolean, reason?: string, payload?: object }}
 */
const handleSocialRoomReaction = ({ socket, io, data = {}, ack } = {}) => {
  const reply = (result) => {
    if (typeof ack === "function") ack(result);
  };

  const userId = socket && socket._userId;
  if (!userId) {
    reply({ ok: false, message: "No autorizado" });
    return { ok: false, reason: "unauthenticated" };
  }

  const roomId = typeof data?.roomId === "string" ? data.roomId : "";
  if (!isValidRoomId(roomId)) {
    reply({ ok: false, message: "Sala inválida" });
    return { ok: false, reason: "invalid_room" };
  }

  // The socket must actually be joined to this Social Room (tracked by
  // join_social_room) — never trust an arbitrary roomId from the payload.
  if (socket._socialRoomId !== roomId) {
    reply({ ok: false, message: "Debes unirte a la sala para reaccionar" });
    return { ok: false, reason: "not_in_room" };
  }

  const emoji = data?.emoji;
  if (!isAllowedReactionEmoji(emoji)) {
    reply({ ok: false, message: "Reacción no permitida" });
    return { ok: false, reason: "invalid_emoji" };
  }

  if (!consumeReactionCooldown(userId)) {
    reply({ ok: false, message: "Espera un momento antes de reaccionar de nuevo" });
    return { ok: false, reason: "cooldown" };
  }

  const payload = {
    roomId,
    emoji,
    userId,
    at: new Date().toISOString(),
  };

  if (io && typeof io.to === "function") {
    io.to(`social_room:${roomId}`).emit("social_room:reaction", payload);
  }

  reply({ ok: true });
  return { ok: true, payload };
};

module.exports = {
  ROOM_REACTION_EMOJIS,
  ROOM_REACTION_COOLDOWN_MS,
  isValidRoomId,
  isAllowedReactionEmoji,
  consumeReactionCooldown,
  resetReactionCooldowns,
  handleSocialRoomReaction,
};
