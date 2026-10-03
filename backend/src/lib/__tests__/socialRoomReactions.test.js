const {
  ROOM_REACTION_EMOJIS,
  ROOM_REACTION_COOLDOWN_MS,
  isValidRoomId,
  isAllowedReactionEmoji,
  consumeReactionCooldown,
  resetReactionCooldowns,
  handleSocialRoomReaction,
} = require("../socialRoomReactions.js");

const ROOM_ID = "507f1f77bcf86cd799439011";
const OTHER_ROOM_ID = "507f1f77bcf86cd799439099";
const USER_ID = "507f1f77bcf86cd799439012";

function makeIo() {
  const roomEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  const emit = jest.fn(); // tracks any accidental global io.emit usage
  return { io: { to, emit }, to, roomEmit, emit };
}

function makeSocket({ userId = USER_ID, socialRoomId = ROOM_ID } = {}) {
  return { _userId: userId, _socialRoomId: socialRoomId };
}

describe("Social Room ambient reactions — handleSocialRoomReaction", () => {
  beforeEach(() => {
    resetReactionCooldowns();
  });

  test("1. an unauthenticated socket cannot emit a reaction", () => {
    const { io, to, emit } = makeIo();
    const socket = makeSocket({ userId: null });
    const ack = jest.fn();

    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: ROOM_ID, emoji: "❤️" },
      ack,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unauthenticated");
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test("2. an invalid roomId is rejected", () => {
    const { io, to } = makeIo();
    const socket = makeSocket({ socialRoomId: "not-an-object-id" });
    const ack = jest.fn();

    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: "not-an-object-id", emoji: "❤️" },
      ack,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_room");
    expect(to).not.toHaveBeenCalled();
    expect(isValidRoomId("not-an-object-id")).toBe(false);
    expect(isValidRoomId(ROOM_ID)).toBe(true);
  });

  test("2b. a well-formed roomId the socket never joined is also rejected", () => {
    const { io, to } = makeIo();
    const socket = makeSocket({ socialRoomId: ROOM_ID });
    const ack = jest.fn();

    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: OTHER_ROOM_ID, emoji: "❤️" },
      ack,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_in_room");
    expect(to).not.toHaveBeenCalled();
  });

  test("3. an emoji outside the allowlist is rejected", () => {
    const { io, to } = makeIo();
    const socket = makeSocket();
    const ack = jest.fn();

    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: ROOM_ID, emoji: "💩" },
      ack,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_emoji");
    expect(to).not.toHaveBeenCalled();
    expect(isAllowedReactionEmoji("💩")).toBe(false);
    ROOM_REACTION_EMOJIS.forEach((emoji) => expect(isAllowedReactionEmoji(emoji)).toBe(true));
  });

  test("3b. an arbitrary payload (non-string emoji/roomId) is rejected, not coerced", () => {
    const { io, to } = makeIo();
    const socket = makeSocket();
    const ack = jest.fn();

    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: { $ne: null }, emoji: ["❤️"] },
      ack,
    });

    expect(result.ok).toBe(false);
    expect(to).not.toHaveBeenCalled();
  });

  test("4 & 5. a valid reaction is emitted only to social_room:<roomId>, never via io.emit", () => {
    const { io, to, roomEmit, emit } = makeIo();
    const socket = makeSocket();
    const ack = jest.fn();

    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: ROOM_ID, emoji: "🔥" },
      ack,
    });

    expect(result.ok).toBe(true);
    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(`social_room:${ROOM_ID}`);
    expect(roomEmit).toHaveBeenCalledWith(
      "social_room:reaction",
      expect.objectContaining({ roomId: ROOM_ID, emoji: "🔥", userId: USER_ID }),
    );
    // The backend never broadcasts reactions globally.
    expect(emit).not.toHaveBeenCalled();
    // Backend is authoritative: userId always comes from the socket, never the payload.
    expect(roomEmit.mock.calls[0][1].userId).toBe(USER_ID);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  test("6. cooldown/rate protection rejects rapid repeated reactions from the same user", () => {
    const { io, to } = makeIo();
    const socket = makeSocket();

    const first = handleSocialRoomReaction({ socket, io, data: { roomId: ROOM_ID, emoji: "👍" } });
    expect(first.ok).toBe(true);

    const second = handleSocialRoomReaction({ socket, io, data: { roomId: ROOM_ID, emoji: "👍" } });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("cooldown");

    // Only the first reaction should have been broadcast.
    expect(to).toHaveBeenCalledTimes(1);
  });

  test("6b. consumeReactionCooldown allows a new reaction once the window elapses", () => {
    const base = 1_000_000;
    expect(consumeReactionCooldown(USER_ID, base)).toBe(true);
    expect(consumeReactionCooldown(USER_ID, base + ROOM_REACTION_COOLDOWN_MS - 1)).toBe(false);
    expect(consumeReactionCooldown(USER_ID, base + ROOM_REACTION_COOLDOWN_MS)).toBe(true);
  });

  test("6c. cooldown is tracked per-user, not globally", () => {
    const { io } = makeIo();
    const socketA = makeSocket({ userId: USER_ID });
    const socketB = makeSocket({ userId: "507f1f77bcf86cd799439013" });

    expect(handleSocialRoomReaction({ socket: socketA, io, data: { roomId: ROOM_ID, emoji: "😮" } }).ok).toBe(true);
    expect(handleSocialRoomReaction({ socket: socketB, io, data: { roomId: ROOM_ID, emoji: "😮" } }).ok).toBe(true);
  });
});
