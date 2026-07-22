jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
}));

jest.mock("../../models/Chat.js", () => ({}));
jest.mock("../../models/Message.js", () => ({}));
jest.mock("../../models/User.js", () => ({}));
jest.mock("../../models/VideoCall.js", () => ({}));

const Live = require("../../models/Live.js");
const { canJoinLiveRoom } = require("../socket.js");

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
});
