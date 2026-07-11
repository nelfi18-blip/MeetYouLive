jest.mock("agora-access-token", () => ({
  RtcRole: { SUBSCRIBER: 1, PUBLISHER: 2 },
  RtcTokenBuilder: {
    buildTokenWithUid: jest.fn(() => "agora-token"),
  },
}));

jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
}));

jest.mock("../../models/VideoCall.js", () => ({
  exists: jest.fn(),
}));

const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const { getToken } = require("../agora.controller.js");
const Live = require("../../models/Live.js");
const VideoCall = require("../../models/VideoCall.js");

const hostUserId = "507f1f77bcf86cd799439011";
const viewerUserId = "507f1f77bcf86cd799439012";
const liveId = "507f1f77bcf86cd799439013";
const callId = "507f1f77bcf86cd799439014";

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

function mockLive(result) {
  Live.findOne.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(result),
    })),
  });
}

describe("getToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGORA_APP_ID = "app-id";
    process.env.AGORA_APP_CERTIFICATE = "app-cert";
  });

  test("banned user does not receive a new Agora token for a live", async () => {
    mockLive({ _id: liveId, user: hostUserId, bannedUsers: [viewerUserId], guests: [] });
    const res = makeRes();

    await getToken({ query: { channelName: liveId, role: "subscriber" }, userId: viewerUserId }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(RtcTokenBuilder.buildTokenWithUid).not.toHaveBeenCalled();
  });

  test("live tokens use the short live-only expiry and validated live channel", async () => {
    mockLive({ _id: liveId, user: hostUserId, bannedUsers: [], guests: [] });
    const res = makeRes();

    await getToken({ query: { channelName: liveId, role: "publisher" }, userId: hostUserId }, res);

    expect(RtcTokenBuilder.buildTokenWithUid).toHaveBeenCalledWith(
      "app-id",
      "app-cert",
      liveId,
      expect.any(Number),
      RtcRole.PUBLISHER,
      expect.any(Number)
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ channelName: liveId, expiresIn: 60 }));
    expect(VideoCall.exists).not.toHaveBeenCalled();
  });

  test("call tokens keep the existing call expiry for authorized call participants", async () => {
    mockLive(null);
    VideoCall.exists.mockResolvedValue({ _id: callId });
    const res = makeRes();

    await getToken({ query: { channelName: callId }, userId: viewerUserId }, res);

    expect(VideoCall.exists).toHaveBeenCalledWith({
      _id: callId,
      $or: [{ caller: viewerUserId }, { recipient: viewerUserId }],
      status: { $in: ["pending", "accepted"] },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ channelName: callId, expiresIn: 3600 }));
  });

  test.each(["free-form-channel", "", null, undefined, "507f1f77bcf86cd79943901z", "507f1f77bcf86cd79943901"])(
    "unvalidated channelName %p does not receive Agora tokens",
    async (channelName) => {
      const res = makeRes();

      await getToken({ query: { channelName }, userId: viewerUserId }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(RtcTokenBuilder.buildTokenWithUid).not.toHaveBeenCalled();
    }
  );
});
