"use strict";

/**
 * Four small, real-time, zero-stakes activities shared by authenticated participants
 * of an existing Social Room. Game state is ephemeral; no Coins, gifts, bets,
 * invented members, database writes, precise GPS, or AI-generated identities.
 *
 * Server controls round/phase/votes; browser only receives aggregate counts.
 * Question and option text comes from versioned ES/EN/PT client catalogues.
 */
const { isSocketInSocialRoom, isValidRoomId, isSupportedCategory } = require("./socialRoomIcebreaker.js");

const GAME_TYPES = Object.freeze([
  "would_you_rather", "emoji_guess", "connection_mission", "story_circle",
]);
const ROUND_COUNTS = Object.freeze({
  would_you_rather: 6, emoji_guess: 6, connection_mission: 6, story_circle: 6,
});
const OPTION_COUNTS = Object.freeze({
  would_you_rather: 2, emoji_guess: 3, connection_mission: 3, story_circle: 3,
});
// Original emoji puzzles; indices match frontend/lib/socialRoomGamesContent.js
const EMOJI_ANSWERS = Object.freeze([1, 0, 2, 1, 0, 2]);
const MIN_PHASE_MS = 8000;
const roomsAllowed = new Set();
const games = new Map();

const allowSocialRoomGames = (roomId, category) => {
  if (!isValidRoomId(roomId) || !isSupportedCategory(category)) return false;
  roomsAllowed.add(roomId);
  return true;
};

const clearSocialRoomGames = (roomId) => {
  roomsAllowed.delete(roomId);
  games.delete(roomId);
};

const resetSocialRoomGamesForTests = () => {
  roomsAllowed.clear();
  games.clear();
};

const publicGame = (roomId) => {
  const game = games.get(roomId);
  if (!game) return null;
  const voteCounts = Array.from({ length: OPTION_COUNTS[game.type] }, () => 0);
  for (const option of game.votes.values()) voteCounts[option] += 1;
  const highest = Math.max(0, ...voteCounts);
  const leaders = voteCounts.flatMap((count, index) => count === highest ? [index] : []);
  // Only a unique majority becomes a shared conversation mission or story
  // direction. Ties and empty rooms cannot fabricate a group decision.
  const selectedOption = game.phase === "results" &&
    ["connection_mission", "story_circle"].includes(game.type) &&
    highest > 0 && leaders.length === 1 ? leaders[0] : null;
  return {
    roomId, type: game.type, roundIndex: game.roundIndex, phase: game.phase,
    startedAt: game.startedAt, votes: voteCounts, totalVotes: game.votes.size,
    selectedOption,
    // Never reveal a quiz answer while users are still voting.
    correctOption: game.type === "emoji_guess" && game.phase === "results"
      ? EMOJI_ANSWERS[game.roundIndex] : null,
  };
};

const emitSocialRoomGame = (io, roomId) => {
  if (!games.has(roomId) || !io || typeof io.to !== "function") return;
  io.to(`social_room:${roomId}`).emit("social_room:game", publicGame(roomId));
};

const handleSocialRoomGameAction = ({ socket, io, data = {}, ack, now = Date.now() } = {}) => {
  const reply = (result) => { if (typeof ack === "function") ack(result); };
  const deny = (reason, message) => {
    const result = { ok: false, reason, message };
    reply(result);
    return result;
  };
  if (!socket?._userId) return deny("unauthenticated", "Inicia sesión para jugar");
  const roomId = data?.roomId;
  if (!isValidRoomId(roomId)) return deny("invalid_room", "Sala inválida");
  if (!isSocketInSocialRoom(socket, roomId)) return deny("not_in_room", "Debes estar en esta sala");
  if (!roomsAllowed.has(roomId)) return deny("inactive_room", "Sala no disponible");

  const action = data?.action;
  const current = games.get(roomId);
  if (action === "start") {
    if (!GAME_TYPES.includes(data?.type)) return deny("invalid_type", "Juego no disponible");
    if (current && now - current.changedAt < MIN_PHASE_MS)
      return deny("cooldown", "Espera antes de cambiar de juego");
    const type = data.type;
    const game = {
      type, roundIndex: Math.floor(Math.random() * ROUND_COUNTS[type]),
      phase: "voting", votes: new Map(),
      changedAt: now, startedAt: new Date(now).toISOString(),
    };
    games.set(roomId, game);
  } else if (action === "vote") {
    if (!current || current.phase !== "voting") return deny("not_voting", "No hay votación activa");
    const option = data?.option;
    if (!Number.isInteger(option) || option < 0 || option >= OPTION_COUNTS[current.type])
      return deny("invalid_option", "Respuesta inválida");
    const voterId = String(socket._userId);
    // One real vote per account per round, including on multiple devices.
    if (current.votes.has(voterId)) return deny("already_voted", "Ya votaste en esta ronda");
    current.votes.set(voterId, option);
  } else if (action === "advance") {
    if (!current) return deny("no_game", "Selecciona un juego primero");
    if (now - current.changedAt < MIN_PHASE_MS)
      return deny("cooldown", "Espera antes de avanzar");
    if (current.phase === "voting") {
      current.phase = "results";
    } else {
      current.phase = "voting";
      current.roundIndex = (current.roundIndex + 1) % ROUND_COUNTS[current.type];
      current.votes.clear();
      current.startedAt = new Date(now).toISOString();
    }
    current.changedAt = now;
  } else {
    return deny("invalid_action", "Acción desconocida");
  }

  emitSocialRoomGame(io, roomId);
  const result = { ok: true, game: publicGame(roomId) };
  reply(result);
  return result;
};

module.exports = {
  GAME_TYPES, ROUND_COUNTS, OPTION_COUNTS, MIN_PHASE_MS, EMOJI_ANSWERS,
  allowSocialRoomGames, clearSocialRoomGames, resetSocialRoomGamesForTests,
  publicGame, emitSocialRoomGame, handleSocialRoomGameAction,
};
