jest.mock("../../models/Live.js", () => ({}));
jest.mock("../../models/Chat.js", () => ({}));
jest.mock("../../models/Message.js", () => ({}));
jest.mock("../../models/VideoCall.js", () => ({}));
jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

const User = require("../../models/User.js");
const { joinSocialRoom } = require("../socket.js");
const { handleSocialRoomReaction } = require("../socialRoomReactions.js");
const {
  getPresenceSnapshot,
  getPresenceCount,
  resetPresence,
} = require("../socialRoomPresence.js");

const ROOM_A = "507f1f77bcf86cd799439011";
const ROOM_B = "507f1f77bcf86cd799439099";
const USER_1 = "507f1f77bcf86cd799439012";
const USER_2 = "507f1f77bcf86cd799439013";

/**
 * Creates a "deferred" User.findById(...).select(...).lean() chain whose
 * resolution is controlled externally, so tests can mutate the socket
 * mid-flight (simulating leave/disconnect/room-switch) before the async
 * profile lookup used by `join_social_room` resolves.
 */
function mockPendingUserLookup() {
  let resolveLean;
  const promise = new Promise((resolve) => { resolveLean = resolve; });
  User.findById.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn(() => promise),
    })),
  });
  return (profile) => resolveLean(profile);
}

function mockImmediateUserLookup(profile) {
  User.findById.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(profile),
    })),
  });
}

function makeIo() {
  const roomEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  const emit = jest.fn();
  return { io: { to, emit }, to, roomEmit, emit };
}

/** A minimal fake Socket.io socket good enough to exercise joinSocialRoom. */
function makeSocket({ userId = USER_1, id = "socket-1" } = {}) {
  const rooms = new Set();
  const socketToEmit = jest.fn();
  const socket = {
    id,
    _userId: userId,
    _socialRoomId: null,
    connected: true,
    rooms,
    join: jest.fn((room) => rooms.add(room)),
    leave: jest.fn((room) => rooms.delete(room)),
    to: jest.fn(() => ({ emit: socketToEmit })),
  };
  return { socket, socketToEmit };
}

describe("join_social_room — stale async lookup race condition", () => {
  beforeEach(() => {
    resetPresence();
    jest.clearAllMocks();
  });

  test("1. socket disconnects while the profile lookup is still pending → no phantom presence", async () => {
    const { io } = makeIo();
    const { socket } = makeSocket({ userId: USER_1 });
    const resolveLookup = mockPendingUserLookup();

    const joinPromise = joinSocialRoom({ socket, io, roomId: ROOM_A });

    // Socket disconnects before the User.findById lookup resolves.
    socket.connected = false;

    resolveLookup({ username: "ana", name: "Ana", avatar: "a.png" });
    await joinPromise;

    expect(getPresenceCount(ROOM_A)).toBe(0);
    expect(getPresenceSnapshot(ROOM_A)).toEqual([]);
  });

  test("2. socket leaves/switches away from Room A before the lookup resolves → A never registers presence", async () => {
    const { io } = makeIo();
    const { socket } = makeSocket({ userId: USER_1 });
    const resolveLookup = mockPendingUserLookup();

    const joinPromise = joinSocialRoom({ socket, io, roomId: ROOM_A });

    // User abandons room A (e.g. navigates to the room list) before the
    // async profile lookup for the A-join completes.
    socket.leave(`social_room:${ROOM_A}`);
    socket._socialRoomId = null;

    resolveLookup({ username: "ana" });
    await joinPromise;

    expect(getPresenceCount(ROOM_A)).toBe(0);
  });

  test("3. fast A→B switch: late resolution of the stale A join neither contaminates B nor resurrects A", async () => {
    const { io } = makeIo();
    const { socket } = makeSocket({ userId: USER_1 });
    const resolveA = mockPendingUserLookup();

    // join_social_room(A) starts — lookup pending.
    const joinAPromise = joinSocialRoom({ socket, io, roomId: ROOM_A });

    // Before A resolves, the user actually ends up validly joined to B.
    socket.leave(`social_room:${ROOM_A}`);
    socket._socialRoomId = ROOM_B;
    socket.join(`social_room:${ROOM_B}`);
    mockImmediateUserLookup({ username: "ana" });
    await joinSocialRoom({ socket, io, roomId: ROOM_B });

    expect(getPresenceCount(ROOM_B)).toBe(1);

    // The stale A lookup finally resolves — must be a no-op for both rooms.
    resolveA({ username: "ana" });
    await joinAPromise;

    expect(getPresenceCount(ROOM_A)).toBe(0);
    expect(getPresenceCount(ROOM_B)).toBe(1);
    expect(getPresenceSnapshot(ROOM_B)).toEqual([
      { userId: USER_1, username: "ana", name: "", avatar: "" },
    ]);
  });

  test("4. normal join (no race) still registers presence correctly", async () => {
    const { io } = makeIo();
    const { socket } = makeSocket({ userId: USER_1 });
    mockImmediateUserLookup({ username: "ana", name: "Ana", avatar: "a.png" });

    await joinSocialRoom({ socket, io, roomId: ROOM_A });

    expect(socket._socialRoomId).toBe(ROOM_A);
    expect(socket.rooms.has(`social_room:${ROOM_A}`)).toBe(true);
    expect(getPresenceCount(ROOM_A)).toBe(1);
    expect(getPresenceSnapshot(ROOM_A)).toEqual([
      { userId: USER_1, username: "ana", name: "Ana", avatar: "a.png" },
    ]);
  });

  test("5. multi-socket join for the same user still dedupes (no regression from the guard)", async () => {
    const { io } = makeIo();
    const { socket: socketA } = makeSocket({ userId: USER_1, id: "socket-a" });
    const { socket: socketB } = makeSocket({ userId: USER_1, id: "socket-b" });
    mockImmediateUserLookup({ username: "ana" });

    await joinSocialRoom({ socket: socketA, io, roomId: ROOM_A });
    await joinSocialRoom({ socket: socketB, io, roomId: ROOM_A });

    expect(getPresenceCount(ROOM_A)).toBe(1);
    expect(getPresenceSnapshot(ROOM_A)).toHaveLength(1);
  });

  test("6. PR #970 social_room:react / social_room:reaction remain intact after a valid join", async () => {
    const { io, to, roomEmit } = makeIo();
    const { socket } = makeSocket({ userId: USER_1 });
    mockImmediateUserLookup({ username: "ana" });

    await joinSocialRoom({ socket, io, roomId: ROOM_A });
    expect(socket._socialRoomId).toBe(ROOM_A);

    const ack = jest.fn();
    const result = handleSocialRoomReaction({
      socket,
      io,
      data: { roomId: ROOM_A, emoji: "🔥" },
      ack,
    });

    expect(result.ok).toBe(true);
    expect(to).toHaveBeenCalledWith(`social_room:${ROOM_A}`);
    expect(roomEmit).toHaveBeenCalledWith(
      "social_room:reaction",
      expect.objectContaining({ roomId: ROOM_A, emoji: "🔥", userId: USER_1 }),
    );
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  test("race guard does not affect a second, independent user joining the same room", async () => {
    const { io } = makeIo();
    const { socket: socketUser1 } = makeSocket({ userId: USER_1, id: "socket-1" });
    const { socket: socketUser2 } = makeSocket({ userId: USER_2, id: "socket-2" });
    const resolveUser1 = mockPendingUserLookup();

    const joinPromise = joinSocialRoom({ socket: socketUser1, io, roomId: ROOM_A });

    // user1 disconnects mid-flight; user2 joins normally and should be unaffected.
    socketUser1.connected = false;
    mockImmediateUserLookup({ username: "bea" });
    await joinSocialRoom({ socket: socketUser2, io, roomId: ROOM_A });

    resolveUser1({ username: "ana" });
    await joinPromise;

    expect(getPresenceCount(ROOM_A)).toBe(1);
    expect(getPresenceSnapshot(ROOM_A)).toEqual([
      { userId: USER_2, username: "bea", name: "", avatar: "" },
    ]);
  });
});
