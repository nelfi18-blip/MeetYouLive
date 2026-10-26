jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
}));

jest.mock("../../models/Chat.js", () => ({}));
jest.mock("../../models/Message.js", () => ({}));
jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));
jest.mock("../../models/VideoCall.js", () => ({}));
jest.mock("../../services/chatProtection.service.js", () => ({
  checkLiveMessageProtection: jest.fn(),
}));

const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const { checkLiveMessageProtection } = require("../../services/chatProtection.service.js");
const {
  canJoinLiveRoom,
  addViewerToLive,
  removeViewerFromLive,
  getLiveAudience,
  getLiveViewerCount,
  clearLiveRoomState,
  resolveLiveChatMessageProtection,
  handleLiveChatMessage,
} = require("../socket.js");

const liveId = "507f1f77bcf86cd799439013";
const viewerId = "507f1f77bcf86cd799439012";
const hostId = "507f1f77bcf86cd799439011";

function mockLive(result) {
  Live.findOne.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(result),
    })),
  });
}

describe("live socket room authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLiveRoomState(liveId);
  });

  test("socket without authentication cannot enter a live", async () => {
    await expect(canJoinLiveRoom(liveId, null)).resolves.toBe(false);
    expect(Live.findOne).not.toHaveBeenCalled();
  });

  test("banned user cannot reconnect to the Socket.io live room", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [viewerId] });

    await expect(canJoinLiveRoom(liveId, viewerId)).resolves.toBe(false);
  });

  test("non-banned authenticated user can join the Socket.io live room", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [] });

    await expect(canJoinLiveRoom(liveId, viewerId)).resolves.toBe(true);
  });

  test("private live room requires host or paid viewer access", async () => {
    mockLive({ _id: liveId, user: hostId, isPrivate: true, paidViewers: [], bannedUsers: [] });

    await expect(canJoinLiveRoom(liveId, viewerId)).resolves.toBe(false);
  });

  test("private live room allows paid viewers and the host", async () => {
    mockLive({ _id: liveId, user: hostId, isPrivate: true, paidViewers: [viewerId], bannedUsers: [] });
    await expect(canJoinLiveRoom(liveId, viewerId)).resolves.toBe(true);

    mockLive({ _id: liveId, user: hostId, isPrivate: true, paidViewers: [], bannedUsers: [] });
    await expect(canJoinLiveRoom(liveId, hostId)).resolves.toBe(true);
  });

  test("live audience counts unique users, not sockets", () => {
    addViewerToLive({
      liveId,
      socketId: "socket-a",
      hostUserId: hostId,
      user: { _id: viewerId, username: "viewer", name: "Viewer" },
    });
    addViewerToLive({
      liveId,
      socketId: "socket-b",
      hostUserId: hostId,
      user: { _id: viewerId, username: "viewer", name: "Viewer" },
    });

    expect(getLiveViewerCount(liveId)).toBe(1);
    expect(getLiveAudience(liveId)).toHaveLength(1);
    expect(getLiveAudience(liveId)[0]).toMatchObject({ userId: viewerId, username: "viewer" });
  });

  test("live audience excludes the host", () => {
    const added = addViewerToLive({
      liveId,
      socketId: "host-socket",
      hostUserId: hostId,
      user: { _id: hostId, username: "host", name: "Host" },
    });

    expect(added).toBe(false);
    expect(getLiveViewerCount(liveId)).toBe(0);
    expect(getLiveAudience(liveId)).toEqual([]);
  });

  test("live audience removes a user only after their last socket leaves", () => {
    addViewerToLive({
      liveId,
      socketId: "socket-a",
      hostUserId: hostId,
      user: { _id: viewerId, username: "viewer", name: "Viewer" },
    });
    addViewerToLive({
      liveId,
      socketId: "socket-b",
      hostUserId: hostId,
      user: { _id: viewerId, username: "viewer", name: "Viewer" },
    });

    removeViewerFromLive("socket-a", liveId);
    expect(getLiveViewerCount(liveId)).toBe(1);
    expect(getLiveAudience(liveId)).toHaveLength(1);

    removeViewerFromLive("socket-b", liveId);
    expect(getLiveViewerCount(liveId)).toBe(0);
    expect(getLiveAudience(liveId)).toEqual([]);
  });
});

describe("live_chat_message contact/payment protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLiveRoomState(liveId);
  });

  test("passes a null hostUserId through (never throws) when the live can't be resolved", async () => {
    mockLive(null);
    checkLiveMessageProtection.mockResolvedValue({ allowed: true, detectedTypes: [] });

    await resolveLiveChatMessageProtection({
      liveId,
      safeText: "hola a todos",
      senderId: viewerId,
      headers: { "user-agent": "jest" },
    });

    expect(checkLiveMessageProtection).toHaveBeenCalledWith(expect.objectContaining({
      text: "hola a todos",
      liveId,
      hostUserId: null,
      senderId: viewerId,
      req: { headers: { "user-agent": "jest" } },
    }));
  });

  test("falls back to a direct Live lookup for the host when not cached in memory", async () => {
    mockLive({ _id: liveId, user: hostId });
    checkLiveMessageProtection.mockResolvedValue({ allowed: true, detectedTypes: [] });

    await resolveLiveChatMessageProtection({
      liveId,
      safeText: "buen directo!",
      senderId: viewerId,
      headers: {},
    });

    expect(Live.findOne).toHaveBeenCalledWith({ _id: liveId, isLive: true });
    expect(checkLiveMessageProtection).toHaveBeenCalledWith(expect.objectContaining({
      hostUserId: hostId,
      senderId: viewerId,
    }));
  });

  test("propagates a blocked result (contact sharing) without broadcasting anything itself", async () => {
    mockLive({ _id: liveId, user: hostId });
    checkLiveMessageProtection.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "CONTACT_SHARING_RESTRICTED",
      message: "No compartas tu contacto",
      detectedTypes: ["phone"],
    });

    const result = await resolveLiveChatMessageProtection({
      liveId,
      safeText: "llamame al 555-123-4567",
      senderId: viewerId,
      headers: {},
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CONTACT_SHARING_RESTRICTED");
    // The caller (the live_chat_message socket handler) is solely responsible
    // for broadcasting; this resolver must never touch socket/io itself.
  });

  test("propagates a blocked result (external payment) the same way for host-authored messages", async () => {
    mockLive({ _id: liveId, user: hostId });
    checkLiveMessageProtection.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "EXTERNAL_PAYMENT_RESTRICTED",
      message: "No solicites pagos externos",
      detectedTypes: ["money_request"],
    });

    const result = await resolveLiveChatMessageProtection({
      liveId,
      safeText: "mándame el pago por paypal",
      senderId: hostId,
      headers: {},
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe("EXTERNAL_PAYMENT_RESTRICTED");
    expect(checkLiveMessageProtection).toHaveBeenCalledWith(expect.objectContaining({
      hostUserId: hostId,
      senderId: hostId,
    }));
  });
});

describe("handleLiveChatMessage", () => {
  function makeFakeSocket({ userId = viewerId, headers = {} } = {}) {
    const roomEmit = jest.fn();
    const socket = {
      _userId: userId,
      handshake: { headers },
      to: jest.fn(() => ({ emit: roomEmit })),
    };
    return { socket, roomEmit };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    clearLiveRoomState(liveId);
    User.findById.mockReturnValue({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ isVIP: false }) })) });
  });

  test("unauthenticated socket: acks ok:false and never broadcasts", async () => {
    const { socket, roomEmit } = makeFakeSocket({ userId: null });
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "hola" }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "UNAUTHENTICATED" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("invalid liveId: acks ok:false and never broadcasts", async () => {
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId: "not-an-object-id", text: "hola" }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "INVALID_LIVE_ID" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("missing/invalid text: acks ok:false and never broadcasts", async () => {
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: 12345 }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "INVALID_TEXT" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("whitespace-only text: acks ok:false and never broadcasts", async () => {
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "   " }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "EMPTY_TEXT" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("not allowed to join the room: acks ok:false and never broadcasts", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [viewerId] });
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "hola" }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "NOT_ALLOWED" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("blocked by chat protection (contact sharing): acks ok:false with the rejection details and never broadcasts", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [], user: hostId });
    checkLiveMessageProtection.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "CONTACT_SHARING_RESTRICTED",
      message: "No compartas tu contacto",
      detectedTypes: ["phone"],
    });
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "llamame al 555-123-4567" }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      code: "CONTACT_SHARING_RESTRICTED",
      message: "No compartas tu contacto",
      detectedTypes: ["phone"],
    });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("blocked by chat protection (external payment): acks ok:false and never broadcasts, even for the host", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [], user: hostId });
    checkLiveMessageProtection.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "EXTERNAL_PAYMENT_RESTRICTED",
      message: "No solicites pagos externos",
      detectedTypes: ["money_request"],
    });
    const { socket, roomEmit } = makeFakeSocket({ userId: hostId });
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "mándame el pago por paypal" }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack.mock.calls[0][0].ok).toBe(false);
    expect(ack.mock.calls[0][0].code).toBe("EXTERNAL_PAYMENT_RESTRICTED");
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("accepted message: broadcasts to the room, then acks ok:true exactly once", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [], user: hostId });
    checkLiveMessageProtection.mockResolvedValue({ allowed: true, detectedTypes: [] });
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "hola a todos!", user: { username: "viewer1" } }, ack);

    expect(socket.to).toHaveBeenCalledWith(`live:${liveId}`);
    expect(roomEmit).toHaveBeenCalledTimes(1);
    expect(roomEmit).toHaveBeenCalledWith("LIVE_CHAT_MESSAGE", expect.objectContaining({
      liveId,
      text: "hola a todos!",
      user: expect.objectContaining({ username: "viewer1", userId: viewerId }),
    }));
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: true });
    // The ack must be sent after the broadcast, not before.
    const emitOrder = roomEmit.mock.invocationCallOrder[0];
    const ackOrder = ack.mock.invocationCallOrder[0];
    expect(emitOrder).toBeLessThan(ackOrder);
  });

  test("accepted message truncates text to 200 chars before broadcasting", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [], user: hostId });
    checkLiveMessageProtection.mockResolvedValue({ allowed: true, detectedTypes: [] });
    const { socket, roomEmit } = makeFakeSocket();
    const longText = "a".repeat(500);

    await handleLiveChatMessage(socket, { liveId, text: longText });

    const payload = roomEmit.mock.calls[0][1];
    expect(payload.text).toHaveLength(200);
  });

  test("unexpected error (e.g. canJoinLiveRoom throws): acks ok:false and never broadcasts", async () => {
    Live.findOne.mockImplementation(() => {
      throw new Error("db unavailable");
    });
    const { socket, roomEmit } = makeFakeSocket();
    const ack = jest.fn();

    await handleLiveChatMessage(socket, { liveId, text: "hola" }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "LIVE_CHAT_MESSAGE_ERROR" });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  test("works without a callback (no ack provided) and still never broadcasts a blocked message", async () => {
    mockLive({ _id: liveId, isPrivate: false, bannedUsers: [], user: hostId });
    checkLiveMessageProtection.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "CONTACT_SHARING_RESTRICTED",
      message: "No compartas tu contacto",
      detectedTypes: ["phone"],
    });
    const { socket, roomEmit } = makeFakeSocket();

    await expect(handleLiveChatMessage(socket, { liveId, text: "mi whatsapp 555-123-4567" })).resolves.toBeUndefined();
    expect(roomEmit).not.toHaveBeenCalled();
  });
});
