const {
  ICEBREAKER_CATEGORIES,
  QUESTIONS_PER_CATEGORY,
  ICEBREAKER_ROTATE_COOLDOWN_MS,
  isSupportedCategory,
  getActiveQuestion,
  ensureQuestionForRoom,
  consumeRotateCooldown,
  clearRoomIcebreaker,
  resetIcebreakerState,
  emitIcebreakerSnapshot,
  handleRequestNextIcebreaker,
} = require("../socialRoomIcebreaker.js");

const ROOM_A = "507f1f77bcf86cd799439011";
const ROOM_B = "507f1f77bcf86cd799439099";
const USER_1 = "507f1f77bcf86cd799439012";

function makeIo() {
  const roomEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  const emit = jest.fn(); // tracks any accidental global io.emit usage
  return { io: { to, emit }, to, roomEmit, emit };
}

function makeSocket({ userId = USER_1, socialRoomId = ROOM_A } = {}) {
  return { _userId: userId, _socialRoomId: socialRoomId };
}

describe("Social Room ambient icebreaker — socialRoomIcebreaker", () => {
  beforeEach(() => {
    resetIcebreakerState();
  });

  test("1. only rompe_hielo and confianza_amor are supported categories", () => {
    expect(ICEBREAKER_CATEGORIES).toEqual(["rompe_hielo", "confianza_amor"]);
    expect(isSupportedCategory("rompe_hielo")).toBe(true);
    expect(isSupportedCategory("confianza_amor")).toBe(true);
    expect(isSupportedCategory("consejos_citas")).toBe(false);
    expect(isSupportedCategory("mala_suerte_amor")).toBe(false);
    expect(isSupportedCategory(undefined)).toBe(false);
  });

  test("2. ensureQuestionForRoom does nothing for an unsupported category", () => {
    const result = ensureQuestionForRoom({ roomId: ROOM_A, category: "consejos_citas" });
    expect(result).toBeNull();
    expect(getActiveQuestion(ROOM_A)).toBeNull();
  });

  test("3. ensureQuestionForRoom picks a question index within range and is idempotent", () => {
    const first = ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    expect(first).toEqual(
      expect.objectContaining({ roomId: ROOM_A, category: "rompe_hielo" })
    );
    expect(first.questionIndex).toBeGreaterThanOrEqual(0);
    expect(first.questionIndex).toBeLessThan(QUESTIONS_PER_CATEGORY);
    expect(typeof first.startedAt).toBe("string");

    // Calling again for the same room must NOT pick a new question.
    const second = ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    expect(second).toEqual(first);
  });

  test("4. different rooms get independently tracked questions", () => {
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    ensureQuestionForRoom({ roomId: ROOM_B, category: "confianza_amor" });

    expect(getActiveQuestion(ROOM_A).category).toBe("rompe_hielo");
    expect(getActiveQuestion(ROOM_B).category).toBe("confianza_amor");
  });

  test("5. emitIcebreakerSnapshot broadcasts only to social_room:<roomId>, never globally", () => {
    const { io, to, roomEmit, emit } = makeIo();
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });

    emitIcebreakerSnapshot(io, ROOM_A);

    expect(to).toHaveBeenCalledWith(`social_room:${ROOM_A}`);
    expect(roomEmit).toHaveBeenCalledWith(
      "social_room:icebreaker",
      expect.objectContaining({ roomId: ROOM_A, category: "rompe_hielo" })
    );
    expect(emit).not.toHaveBeenCalled();
  });

  test("5b. emitIcebreakerSnapshot is a no-op when the room has no active question", () => {
    const { io, to } = makeIo();
    emitIcebreakerSnapshot(io, ROOM_A);
    expect(to).not.toHaveBeenCalled();
  });

  test("6. an unauthenticated socket cannot request a new question", () => {
    const { io, to } = makeIo();
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    const socket = makeSocket({ userId: null });
    const ack = jest.fn();

    const result = handleRequestNextIcebreaker({ socket, io, data: { roomId: ROOM_A }, ack });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unauthenticated");
    expect(to).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test("7. a socket that never joined this room is rejected", () => {
    const { io, to } = makeIo();
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    const socket = makeSocket({ socialRoomId: ROOM_B });

    const result = handleRequestNextIcebreaker({ socket, io, data: { roomId: ROOM_A } });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_in_room");
    expect(to).not.toHaveBeenCalled();
  });

  test("8. a room without an active question (unsupported category) is rejected", () => {
    const { io, to } = makeIo();
    const socket = makeSocket();

    const result = handleRequestNextIcebreaker({ socket, io, data: { roomId: ROOM_A } });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unsupported_category");
    expect(to).not.toHaveBeenCalled();
  });

  test("9. a valid request rotates the question and broadcasts only to the room", () => {
    const { io, to, roomEmit, emit } = makeIo();
    const initial = ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    const socket = makeSocket();
    const ack = jest.fn();

    const result = handleRequestNextIcebreaker({ socket, io, data: { roomId: ROOM_A }, ack });

    expect(result.ok).toBe(true);
    expect(to).toHaveBeenCalledWith(`social_room:${ROOM_A}`);
    expect(roomEmit).toHaveBeenCalledWith(
      "social_room:icebreaker",
      expect.objectContaining({ roomId: ROOM_A, category: "rompe_hielo" })
    );
    expect(emit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: true });

    const updated = getActiveQuestion(ROOM_A);
    expect(updated.category).toBe(initial.category);
    expect(updated.questionIndex).toBeGreaterThanOrEqual(0);
    expect(updated.questionIndex).toBeLessThan(QUESTIONS_PER_CATEGORY);
  });

  test("10. per-room cooldown rejects rapid repeated rotation requests", () => {
    const { io, to } = makeIo();
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    const socket = makeSocket();

    const first = handleRequestNextIcebreaker({ socket, io, data: { roomId: ROOM_A } });
    expect(first.ok).toBe(true);

    const second = handleRequestNextIcebreaker({ socket, io, data: { roomId: ROOM_A } });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("cooldown");

    // Only the first rotation should have been broadcast.
    expect(to).toHaveBeenCalledTimes(1);
  });

  test("10b. consumeRotateCooldown allows a new rotation once the window elapses", () => {
    const base = 1_000_000;
    expect(consumeRotateCooldown(ROOM_A, base)).toBe(true);
    expect(consumeRotateCooldown(ROOM_A, base + ICEBREAKER_ROTATE_COOLDOWN_MS - 1)).toBe(false);
    expect(consumeRotateCooldown(ROOM_A, base + ICEBREAKER_ROTATE_COOLDOWN_MS)).toBe(true);
  });

  test("11. cooldown is tracked per-room, not globally", () => {
    const { io } = makeIo();
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    ensureQuestionForRoom({ roomId: ROOM_B, category: "confianza_amor" });
    const socketA = makeSocket({ socialRoomId: ROOM_A });
    const socketB = { _userId: USER_1, _socialRoomId: ROOM_B };

    expect(handleRequestNextIcebreaker({ socket: socketA, io, data: { roomId: ROOM_A } }).ok).toBe(true);
    expect(handleRequestNextIcebreaker({ socket: socketB, io, data: { roomId: ROOM_B } }).ok).toBe(true);
  });

  test("12. clearRoomIcebreaker removes the active question so a new one is picked later", () => {
    ensureQuestionForRoom({ roomId: ROOM_A, category: "rompe_hielo" });
    expect(getActiveQuestion(ROOM_A)).not.toBeNull();

    clearRoomIcebreaker(ROOM_A);

    expect(getActiveQuestion(ROOM_A)).toBeNull();
  });
});
