const {
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
} = require("../socialRoomPresence.js");

const ROOM_A = "507f1f77bcf86cd799439011";
const ROOM_B = "507f1f77bcf86cd799439099";
const USER_1 = "507f1f77bcf86cd799439012";
const USER_2 = "507f1f77bcf86cd799439013";

function makeIo() {
  const roomEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  const emit = jest.fn(); // tracks any accidental global io.emit usage
  return { io: { to, emit }, to, roomEmit, emit };
}

function makeSocket({ userId = USER_1, id = "socket-1" } = {}) {
  const socketToEmit = jest.fn();
  const socket = {
    id,
    _userId: userId,
    to: jest.fn(() => ({ emit: socketToEmit })),
  };
  return { socket, socketToEmit };
}

describe("Social Room ephemeral presence — socialRoomPresence", () => {
  beforeEach(() => {
    resetPresence();
  });

  test("1. an unauthenticated socket cannot create valid presence", () => {
    const { io, to, emit } = makeIo();
    const { socket } = makeSocket({ userId: null });

    const result = handleJoinSocialRoomPresence({ socket, io, roomId: ROOM_A, profile: { username: "ghost" } });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unauthenticated");
    expect(getPresenceCount(ROOM_A)).toBe(0);
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  test("2. an invalid roomId is rejected", () => {
    const { io, to } = makeIo();
    const { socket } = makeSocket();

    const result = handleJoinSocialRoomPresence({ socket, io, roomId: "not-an-object-id", profile: { username: "a" } });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_room");
    expect(isValidRoomId("not-an-object-id")).toBe(false);
    expect(isValidRoomId(ROOM_A)).toBe(true);
    expect(to).not.toHaveBeenCalled();
    expect(getPresenceCount(ROOM_A)).toBe(0);
  });

  test("3. an authenticated user appears exactly once in the snapshot", () => {
    const { io } = makeIo();
    const { socket } = makeSocket({ userId: USER_1, id: "socket-1" });

    handleJoinSocialRoomPresence({ socket, io, roomId: ROOM_A, profile: { username: "ana", name: "Ana", avatar: "a.png" } });

    const snapshot = getPresenceSnapshot(ROOM_A);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual({ userId: USER_1, username: "ana", name: "Ana", avatar: "a.png" });
    expect(getPresenceCount(ROOM_A)).toBe(1);
  });

  test("4. two sockets of the same user do not duplicate the participant", () => {
    const { io } = makeIo();
    const { socket: socketA } = makeSocket({ userId: USER_1, id: "socket-a" });
    const { socket: socketB } = makeSocket({ userId: USER_1, id: "socket-b" });

    const first = handleJoinSocialRoomPresence({ socket: socketA, io, roomId: ROOM_A, profile: { username: "ana" } });
    const second = handleJoinSocialRoomPresence({ socket: socketB, io, roomId: ROOM_A, profile: { username: "ana" } });

    expect(first.isNewParticipant).toBe(true);
    expect(second.isNewParticipant).toBe(false); // same user, second connection — no duplicate
    expect(getPresenceCount(ROOM_A)).toBe(1);
    expect(getPresenceSnapshot(ROOM_A)).toHaveLength(1);
  });

  test("5. disconnecting one of two sockets does NOT remove the user", () => {
    const { io } = makeIo();
    const { socket: socketA } = makeSocket({ userId: USER_1, id: "socket-a" });
    const { socket: socketB } = makeSocket({ userId: USER_1, id: "socket-b" });

    handleJoinSocialRoomPresence({ socket: socketA, io, roomId: ROOM_A, profile: { username: "ana" } });
    handleJoinSocialRoomPresence({ socket: socketB, io, roomId: ROOM_A, profile: { username: "ana" } });

    const leaveResult = handleLeaveSocialRoomPresence({ socket: socketA, io, roomId: ROOM_A });

    expect(leaveResult.didRemoveUser).toBe(false);
    expect(getPresenceCount(ROOM_A)).toBe(1); // still present via socket-b
  });

  test("6. disconnecting the LAST socket removes the user", () => {
    const { io } = makeIo();
    const { socket: socketA } = makeSocket({ userId: USER_1, id: "socket-a" });
    const { socket: socketB } = makeSocket({ userId: USER_1, id: "socket-b" });

    handleJoinSocialRoomPresence({ socket: socketA, io, roomId: ROOM_A, profile: { username: "ana" } });
    handleJoinSocialRoomPresence({ socket: socketB, io, roomId: ROOM_A, profile: { username: "ana" } });

    handleLeaveSocialRoomPresence({ socket: socketA, io, roomId: ROOM_A });
    const finalLeave = handleLeaveSocialRoomPresence({ socket: socketB, io, roomId: ROOM_A });

    expect(finalLeave.didRemoveUser).toBe(true);
    expect(getPresenceCount(ROOM_A)).toBe(0);
    expect(getPresenceSnapshot(ROOM_A)).toEqual([]);
  });

  test("7. Room A presence is never emitted to Room B", () => {
    const { io, to, roomEmit } = makeIo();
    const { socket: socketA } = makeSocket({ userId: USER_1, id: "socket-a" });
    const { socket: socketB } = makeSocket({ userId: USER_2, id: "socket-b" });

    handleJoinSocialRoomPresence({ socket: socketA, io, roomId: ROOM_A, profile: { username: "ana" } });
    handleJoinSocialRoomPresence({ socket: socketB, io, roomId: ROOM_B, profile: { username: "bea" } });

    expect(to).toHaveBeenCalledWith(`social_room:${ROOM_A}`);
    expect(to).toHaveBeenCalledWith(`social_room:${ROOM_B}`);
    expect(getPresenceSnapshot(ROOM_A)).toEqual([{ userId: USER_1, username: "ana", name: "", avatar: "" }]);
    expect(getPresenceSnapshot(ROOM_B)).toEqual([{ userId: USER_2, username: "bea", name: "", avatar: "" }]);

    // Every emitted presence payload must only ever reference its own room.
    roomEmit.mock.calls.forEach(([event, payload]) => {
      if (event !== "social_room:presence") return;
      if (payload.roomId === ROOM_A) {
        expect(payload.participants.some((p) => p.userId === USER_2)).toBe(false);
      }
      if (payload.roomId === ROOM_B) {
        expect(payload.participants.some((p) => p.userId === USER_1)).toBe(false);
      }
    });
  });

  test("8. presence is never broadcast via a global io.emit", () => {
    const { io, emit } = makeIo();
    const { socket } = makeSocket();

    handleJoinSocialRoomPresence({ socket, io, roomId: ROOM_A, profile: { username: "ana" } });
    handleLeaveSocialRoomPresence({ socket, io, roomId: ROOM_A });
    emitPresenceSnapshot(io, ROOM_A);

    expect(emit).not.toHaveBeenCalled();
  });

  test("9. snapshot never exposes private fields (email, phone, tokens, payments)", () => {
    const { io } = makeIo();
    const { socket } = makeSocket();

    handleJoinSocialRoomPresence({
      socket,
      io,
      roomId: ROOM_A,
      profile: {
        username: "ana",
        name: "Ana",
        avatar: "a.png",
        email: "ana@example.com",
        phone: "+1234567890",
        password: "hashed",
        stripeCustomerId: "cus_123",
        coinsBalance: 999,
      },
    });

    const snapshot = getPresenceSnapshot(ROOM_A);
    expect(snapshot[0]).toEqual({ userId: USER_1, username: "ana", name: "Ana", avatar: "a.png" });
    const keys = Object.keys(snapshot[0]);
    expect(keys).toEqual(["userId", "username", "name", "avatar"]);
  });

  test("9b. sanitizePresenceUser strips unknown fields directly", () => {
    const sanitized = sanitizePresenceUser(USER_1, { username: "ana", email: "leak@example.com", token: "secret" });
    expect(sanitized).toEqual({ userId: USER_1, username: "ana", name: "", avatar: "" });
  });

  test("10. reconnect/re-join does not artificially inflate onlineCount", () => {
    const { io } = makeIo();
    const { socket } = makeSocket({ userId: USER_1, id: "socket-a" });

    handleJoinSocialRoomPresence({ socket, io, roomId: ROOM_A, profile: { username: "ana" } });
    // Simulate a reconnect race where join fires again for the same socket/user.
    handleJoinSocialRoomPresence({ socket, io, roomId: ROOM_A, profile: { username: "ana" } });
    handleJoinSocialRoomPresence({ socket, io, roomId: ROOM_A, profile: { username: "ana" } });

    expect(getPresenceCount(ROOM_A)).toBe(1);
  });

  test("addParticipant/removeParticipantSocket low-level guards reject malformed input", () => {
    expect(addParticipant({ roomId: "bad", socketId: "s1", userId: USER_1 })).toBe(false);
    expect(addParticipant({ roomId: ROOM_A, socketId: null, userId: USER_1 })).toBe(false);
    expect(addParticipant({ roomId: ROOM_A, socketId: "s1", userId: null })).toBe(false);
    expect(removeParticipantSocket({ roomId: null, socketId: "s1" })).toBe(false);
    expect(removeParticipantSocket({ roomId: ROOM_A, socketId: null })).toBe(false);
  });
});
