const {
  GAME_TYPES, ROUND_COUNTS, OPTION_COUNTS, MIN_PHASE_MS,
  allowSocialRoomGames, clearSocialRoomGames, resetSocialRoomGamesForTests,
  publicGame, emitSocialRoomGame, handleSocialRoomGameAction,
} = require("../socialRoomGames.js");

const A = "507f1f77bcf86cd799439011";
const B = "507f1f77bcf86cd799439099";
const USER = "507f1f77bcf86cd799439012";
const NOW = 1_000_000;

const makeSocket = (userId = USER, roomId = A) => ({
  _userId: userId,
  _socialRoomId: roomId,
  connected: true,
  rooms: new Set([`social_room:${roomId}`]),
});
const makeIo = () => {
  const roomEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  return { to, roomEmit, emit: jest.fn() };
};
const action = (socket, io, a, data = {}, now = NOW) =>
  handleSocialRoomGameAction({
    socket, io, now, data: { roomId: A, action: a, ...data },
  });

beforeEach(resetSocialRoomGamesForTests);

describe("real-time social room mini-games", () => {
  test("only the four existing social room categories are eligible", () => {
    expect(allowSocialRoomGames(A, "unknown")).toBe(false);
    expect(allowSocialRoomGames("not-an-id", "rompe_hielo")).toBe(false);
    expect(allowSocialRoomGames(A, "rompe_hielo")).toBe(true);
    expect(GAME_TYPES).toEqual(["would_you_rather", "emoji_guess", "connection_mission", "story_circle"]);
    expect(ROUND_COUNTS).toEqual({ would_you_rather: 6, emoji_guess: 6, connection_mission: 6, story_circle: 6 });
    expect(OPTION_COUNTS).toEqual({ would_you_rather: 2, emoji_guess: 3, connection_mission: 3, story_circle: 3 });
  });

  test("no anonymous, stale, cross-room or inactive-room actions", () => {
    const io = makeIo();
    const anonymous = makeSocket(null);
    expect(action(anonymous, io, "start", { type: "would_you_rather" }).reason).toBe("unauthenticated");
    const socket = makeSocket();
    expect(action(socket, io, "start", { type: "emoji_guess" }).reason).toBe("inactive_room");
    allowSocialRoomGames(A, "rompe_hielo");
    socket.rooms.clear();
    expect(action(socket, io, "start", { type: "emoji_guess" }).reason).toBe("not_in_room");
    socket.rooms.add(`social_room:${A}`);
    socket._socialRoomId = B;
    expect(action(socket, io, "start", { type: "emoji_guess" }).reason).toBe("not_in_room");
    socket._socialRoomId = A;
    socket.connected = false;
    expect(action(socket, io, "start", { type: "emoji_guess" }).reason).toBe("not_in_room");
    expect(io.to).not.toHaveBeenCalled();
    expect(publicGame(A)).toBeNull();
  });

  test("rejects malformed payloads and never creates phantom participation", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    const socket = makeSocket(), io = makeIo();
    expect(action(socket, io, "start", { type: "unknown" }).ok).toBe(false);
    expect(action(socket, io, "vote", { option: 1 }).reason).toBe("not_voting");
    expect(action(socket, io, "start", { roomId: { $ne: null }, type: "emoji_guess" }).reason).toBe("invalid_room");
    expect(action(socket, io, "unknown").reason).toBe("invalid_action");
    expect(io.to).not.toHaveBeenCalled();
  });

  test("actual votes are one per account per round (even on two sockets)", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    const io = makeIo(), user = makeSocket();
    expect(action(user, io, "start", { type: "would_you_rather" }).ok).toBe(true);
    expect(action(user, io, "vote", { option: 0 }).ok).toBe(true);
    expect(action(makeSocket(USER), io, "vote", { option: 1 }).reason).toBe("already_voted");
    expect(action(makeSocket("507f1f77bcf86cd799439013"), io, "vote", { option: 1 }).ok).toBe(true);
    expect(publicGame(A).totalVotes).toBe(2);
    expect(publicGame(A).votes).toEqual([1, 1]);
    expect(action(user, io, "vote", { option: 2 }).reason).toBe("invalid_option");
    expect(action(user, io, "vote", { option: -1 }).reason).toBe("invalid_option");
    expect(action(user, io, "vote", { option: "1" }).reason).toBe("invalid_option");
    expect(io.emit).not.toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledWith(`social_room:${A}`);
  });

  test("emoji answer cannot be read before result phase; cooldown protects shared game", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    const io = makeIo(), user = makeSocket();
    expect(action(user, io, "start", { type: "emoji_guess" }).ok).toBe(true);
    expect(publicGame(A).correctOption).toBeNull();
    expect(action(user, io, "advance", {}, NOW + MIN_PHASE_MS - 1).reason).toBe("cooldown");
    expect(action(user, io, "advance", {}, NOW + MIN_PHASE_MS).ok).toBe(true);
    expect(publicGame(A).phase).toBe("results");
    expect([0, 1, 2]).toContain(publicGame(A).correctOption);
    expect(action(user, io, "vote", { option: 0 }, NOW + 2 * MIN_PHASE_MS).reason).toBe("not_voting");
    const round = publicGame(A).roundIndex;
    expect(action(user, io, "advance", {}, NOW + 2 * MIN_PHASE_MS).ok).toBe(true);
    expect(publicGame(A).phase).toBe("voting");
    expect(publicGame(A).roundIndex).toBe((round + 1) % 6);
    expect(publicGame(A).correctOption).toBeNull();
    expect(publicGame(A).totalVotes).toBe(0);
  });

  test("game changes are rate-limited; reset clears room and avoids stale votes", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    const io = makeIo(), user = makeSocket();
    action(user, io, "start", { type: "would_you_rather" });
    expect(action(user, io, "start", { type: "emoji_guess" }).reason).toBe("cooldown");
    expect(action(user, io, "start", { type: "emoji_guess" }, NOW + MIN_PHASE_MS).ok).toBe(true);
    action(user, io, "vote", { option: 2 }, NOW + MIN_PHASE_MS);
    expect(publicGame(A).totalVotes).toBe(1);
    clearSocialRoomGames(A);
    expect(publicGame(A)).toBeNull();
    expect(action(user, io, "vote", { option: 1 }).reason).toBe("inactive_room");
  });


  test("connection missions choose only real, unique majority votes", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    const io = makeIo();
    const first = makeSocket(USER);
    const second = makeSocket("507f1f77bcf86cd799439013");
    const third = makeSocket("507f1f77bcf86cd799439014");
    expect(action(first, io, "start", { type: "connection_mission" }).ok).toBe(true);
    expect(publicGame(A).selectedOption).toBeNull();
    expect(action(first, io, "vote", { option: 2 }).ok).toBe(true);
    expect(action(second, io, "vote", { option: 2 }).ok).toBe(true);
    expect(action(third, io, "vote", { option: 1 }).ok).toBe(true);
    expect(action(makeSocket(USER), io, "vote", { option: 0 }).reason).toBe("already_voted");
    expect(action(first, io, "vote", { option: 3 }).reason).toBe("invalid_option");
    expect(publicGame(A).votes).toEqual([0, 1, 2]);
    expect(action(first, io, "advance", {}, NOW + MIN_PHASE_MS).ok).toBe(true);
    expect(publicGame(A).selectedOption).toBe(2);
    expect(publicGame(A).correctOption).toBeNull();
    expect(action(first, io, "advance", {}, NOW + MIN_PHASE_MS * 2).ok).toBe(true);
    expect(publicGame(A).selectedOption).toBeNull();
    expect(publicGame(A).totalVotes).toBe(0);
  });

  test("collaborative stories show no fabricated group decision on ties or zero votes", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    const io = makeIo();
    const user = makeSocket(USER);
    const peer = makeSocket("507f1f77bcf86cd799439013");
    expect(action(user, io, "start", { type: "story_circle" }).ok).toBe(true);
    expect(action(user, io, "advance", {}, NOW + MIN_PHASE_MS).ok).toBe(true);
    expect(publicGame(A).totalVotes).toBe(0);
    expect(publicGame(A).selectedOption).toBeNull();
    expect(action(user, io, "advance", {}, NOW + 2 * MIN_PHASE_MS).ok).toBe(true);
    expect(action(user, io, "vote", { option: 0 }).ok).toBe(true);
    expect(action(peer, io, "vote", { option: 1 }).ok).toBe(true);
    expect(action(user, io, "advance", {}, NOW + 3 * MIN_PHASE_MS).ok).toBe(true);
    expect(publicGame(A).votes).toEqual([1,1,0]);
    expect(publicGame(A).selectedOption).toBeNull();
    expect(publicGame(A).correctOption).toBeNull();
  });

  test("games, votes and broadcasts stay isolated between rooms", () => {
    allowSocialRoomGames(A, "rompe_hielo");
    allowSocialRoomGames(B, "consejos_citas");
    const io = makeIo();
    action(makeSocket(), io, "start", { type: "would_you_rather" });
    expect(publicGame(B)).toBeNull();
    emitSocialRoomGame(io, B);
    expect(io.to).toHaveBeenCalledTimes(1);
    const other = makeSocket("507f1f77bcf86cd799439013", B);
    const result = handleSocialRoomGameAction({
      io, socket: other,
      data: { roomId: B, action: "start", type: "emoji_guess" },
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(publicGame(B).type).toBe("emoji_guess");
    expect(publicGame(A).type).toBe("would_you_rather");
    expect(io.emit).not.toHaveBeenCalled();
  });
});
