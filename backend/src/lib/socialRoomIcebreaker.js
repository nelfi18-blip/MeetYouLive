"use strict";

/**
 * Ephemeral, server-authoritative "room question" / icebreaker activity for
 * Social Rooms (mirrors socialRoomReactions.js and socialRoomPresence.js).
 *
 * Design goals:
 * - This is an AMBIENT room activity, not a second chat and not a clone of
 *   SimulationPanel. It only ever broadcasts a single shared question per
 *   room; participants keep talking about it via the existing room chat.
 * - Nothing here is persisted to MongoDB: the active question per room lives
 *   only in-memory for the lifetime of the process, keyed by roomId.
 * - No answers, votes, or comments are tracked for this activity — only the
 *   active question itself.
 * - Enabled for all four official Social Room categories: "rompe_hielo",
 *   "confianza_amor", "consejos_citas" and "mala_suerte_amor". Any other
 *   category is rejected server-side, regardless of what the client sends.
 * - Display text is NOT owned by the backend (mirrors frontend/lib/roomCategories.js):
 *   only a stable `category` + `questionIndex` pair is kept/broadcast, and the
 *   client resolves the actual question text via i18n
 *   (`rooms.icebreaker.questions.<category>.<index>`).
 */

// Categories that get the shared icebreaker/room-question activity. Keep in
// sync with `hasRoomQuestion` in frontend/app/rooms/[id]/page.jsx. NOTE: this
// is intentionally broader than `hasConversationPractice` (which stays
// scoped to "confianza_amor" / "rompe_hielo" and gates SimulationPanel only).
const ICEBREAKER_CATEGORIES = [
  "rompe_hielo",
  "confianza_amor",
  "consejos_citas",
  "mala_suerte_amor",
];

// How many curated questions exist per category. Must stay in sync with the
// `rooms.icebreaker.questions.<category>` arrays in every messages/*.json
// locale file (es/en/pt) — each must have exactly this many entries.
const QUESTIONS_PER_CATEGORY = 8;

// Minimum time (ms) a room must wait between accepted "next question"
// requests, regardless of which participant asks. This is a per-ROOM
// cooldown (not per-user) since it protects the shared activity itself.
const ICEBREAKER_ROTATE_COOLDOWN_MS = 8000;

// Same ObjectId contract used by socialRoomReactions.js / socialRoomPresence.js
// / socket.js — each module keeps its own local copy rather than importing a
// shared one, matching the existing Social Rooms convention.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const isValidRoomId = (roomId) => typeof roomId === "string" && OBJECT_ID_RE.test(roomId);

/**
 * True only if `socket` is CURRENTLY, genuinely joined to the Social Room's
 * underlying Socket.io room — mirrors the stale-async guard used by
 * `joinSocialRoom` in socket.js. Never trusts `socket._socialRoomId` alone:
 * a socket can retain stale bookkeeping for a moment after a fast
 * leave/disconnect/room-switch, and rotating the shared question on its
 * behalf would broadcast to a room it no longer belongs to.
 *
 * Requires:
 * - an authenticated socket (checked by the caller via `socket._userId`)
 * - `socket._socialRoomId === roomId`
 * - `socket.connected !== false`
 * - `socket.rooms.has(social_room:<roomId>)` when the Socket.io rooms API
 *   is available (skipped only for minimal test doubles that don't expose
 *   a `rooms` collection at all).
 */
const isSocketInSocialRoom = (socket, roomId) => {
  if (!socket || !roomId) return false;
  const roomKey = `social_room:${roomId}`;
  return (
    socket.connected !== false &&
    socket._socialRoomId === roomId &&
    (!socket.rooms || socket.rooms.has(roomKey))
  );
};

// roomId (string) -> { category, questionIndex, startedAt (ISO string) }
const activeQuestions = new Map();

// roomId (string) -> timestamp (ms) of the last accepted rotation.
const lastRotateAt = new Map();

const isSupportedCategory = (category) =>
  typeof category === "string" && ICEBREAKER_CATEGORIES.includes(category);

const randomQuestionIndex = (excludeIndex = -1) => {
  if (QUESTIONS_PER_CATEGORY <= 1) return 0;
  let index = Math.floor(Math.random() * QUESTIONS_PER_CATEGORY);
  if (index === excludeIndex) {
    index = (index + 1) % QUESTIONS_PER_CATEGORY;
  }
  return index;
};

/** Authoritative snapshot of the active question for a room, or null. */
const getActiveQuestion = (roomId) => {
  const entry = activeQuestions.get(roomId);
  if (!entry) return null;
  return { roomId, ...entry };
};

/**
 * Ensures a room with a supported category has an active question, picking
 * one at random the first time it's needed (e.g. when the first participant
 * joins). Returns the (possibly pre-existing) snapshot, or null if the
 * category doesn't support this activity.
 */
const ensureQuestionForRoom = ({ roomId, category }) => {
  if (!roomId || !isSupportedCategory(category)) return null;
  const existing = activeQuestions.get(roomId);
  if (existing) return { roomId, ...existing };

  const entry = {
    category,
    questionIndex: randomQuestionIndex(),
    startedAt: new Date().toISOString(),
  };
  activeQuestions.set(roomId, entry);
  return { roomId, ...entry };
};

/** Returns true (and records the attempt) if a rotation is allowed right now. */
const consumeRotateCooldown = (roomId, now = Date.now()) => {
  if (!roomId) return false;
  const last = lastRotateAt.get(roomId) || 0;
  if (now - last < ICEBREAKER_ROTATE_COOLDOWN_MS) return false;
  lastRotateAt.set(roomId, now);
  return true;
};

/** Clears any in-memory state for a room (e.g. once it becomes empty). */
const clearRoomIcebreaker = (roomId) => {
  if (!roomId) return;
  activeQuestions.delete(roomId);
  lastRotateAt.delete(roomId);
};

/** Test-only helper: reset in-memory state between test cases. */
const resetIcebreakerState = () => {
  activeQuestions.clear();
  lastRotateAt.clear();
};

/** Emits the authoritative snapshot to `social_room:${roomId}` ONLY — never globally. */
const emitIcebreakerSnapshot = (io, roomId) => {
  if (!io || typeof io.to !== "function" || !roomId) return;
  const snapshot = getActiveQuestion(roomId);
  if (!snapshot) return;
  io.to(`social_room:${roomId}`).emit("social_room:icebreaker", snapshot);
};

/**
 * Handle one `social_room:icebreaker:next` event — any authenticated
 * participant currently, genuinely joined to the room may request a fresh
 * question, subject to a per-room cooldown to prevent spam-cycling the
 * shared activity.
 *
 * Validation order (each gate must pass before the next runs, and before
 * any state is read/mutated or anything is broadcast):
 *   1. authenticated socket (`socket._userId`)
 *   2. `roomId` is a well-formed Mongo ObjectId
 *   3. socket is CURRENTLY joined to `social_room:<roomId>` (see
 *      `isSocketInSocialRoom` — not just `_socialRoomId` bookkeeping)
 *   4. the room actually has an active (supported-category) question
 *   5. per-room rotate cooldown
 *
 * @param {object} params
 * @param {object} params.socket - emitting socket, must expose `_userId`
 *   (JWT-authenticated) and `_socialRoomId` (set by join_social_room).
 * @param {object} params.io - shared Socket.io server instance.
 * @param {object} params.data - client payload, expected `{ roomId }`.
 * @param {Function} [params.ack] - optional Socket.io ack callback.
 */
const handleRequestNextIcebreaker = ({ socket, io, data = {}, ack } = {}) => {
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

  // The socket must actually still be joined to this Social Room's
  // Socket.io room — never trust `_socialRoomId` alone (it can be stale for
  // a moment after a fast leave/disconnect/room-switch).
  if (!isSocketInSocialRoom(socket, roomId)) {
    reply({ ok: false, message: "Debes unirte a la sala" });
    return { ok: false, reason: "not_in_room" };
  }

  const existing = activeQuestions.get(roomId);
  if (!existing || !isSupportedCategory(existing.category)) {
    reply({ ok: false, message: "Esta sala no tiene actividad de pregunta" });
    return { ok: false, reason: "unsupported_category" };
  }

  if (!consumeRotateCooldown(roomId)) {
    reply({ ok: false, message: "Espera un momento antes de pedir otra pregunta" });
    return { ok: false, reason: "cooldown" };
  }

  const entry = {
    category: existing.category,
    questionIndex: randomQuestionIndex(existing.questionIndex),
    startedAt: new Date().toISOString(),
  };
  activeQuestions.set(roomId, entry);

  if (io && typeof io.to === "function") {
    io.to(`social_room:${roomId}`).emit("social_room:icebreaker", { roomId, ...entry });
  }

  reply({ ok: true });
  return { ok: true, payload: { roomId, ...entry } };
};

module.exports = {
  ICEBREAKER_CATEGORIES,
  QUESTIONS_PER_CATEGORY,
  ICEBREAKER_ROTATE_COOLDOWN_MS,
  isSupportedCategory,
  isValidRoomId,
  isSocketInSocialRoom,
  getActiveQuestion,
  ensureQuestionForRoom,
  consumeRotateCooldown,
  clearRoomIcebreaker,
  resetIcebreakerState,
  emitIcebreakerSnapshot,
  handleRequestNextIcebreaker,
};
