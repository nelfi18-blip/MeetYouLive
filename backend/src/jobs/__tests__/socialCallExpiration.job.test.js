"use strict";

jest.mock("../../models/VideoCall.js", () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
}));

jest.mock("../../services/essentialNotification.service.js", () => ({
  notifyMissedCall: jest.fn().mockResolvedValue(undefined),
}));

const VideoCall = require("../../models/VideoCall.js");
const { getIO } = require("../../lib/socket.js");
const { notifyMissedCall } = require("../../services/essentialNotification.service.js");
const {
  expirePendingSocialCalls,
  expireAcceptedSocialCalls,
} = require("../socialCallExpiration.job.js");

const callerId = "507f1f77bcf86cd799439011";
const recipientId = "507f1f77bcf86cd799439012";
const callId = "507f1f77bcf86cd799439013";
const now = new Date("2026-07-29T18:20:00.000Z");

function findQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

describe("social call expiration job", () => {
  let emit;
  let to;

  beforeEach(() => {
    jest.clearAllMocks();
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    getIO.mockReturnValue({ to });
  });

  test("expires pending social calls using persisted timeout and emits only participant events", async () => {
    const pending = {
      _id: callId,
      caller: callerId,
      recipient: recipientId,
      type: "social",
      status: "pending",
      createdAt: new Date("2026-07-29T18:19:00.000Z"),
      timeoutSeconds: 45,
    };
    const updated = { ...pending, status: "timeout", endedReason: "timeout" };
    VideoCall.find.mockReturnValueOnce(findQuery([pending]));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(updated);

    const expired = await expirePendingSocialCalls(now);

    expect(expired).toBe(1);
    expect(VideoCall.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: callId, status: "pending", type: "social" },
      { $set: { status: "timeout", endedAt: now, endedReason: "timeout" } },
      { new: true }
    );
    expect(to).toHaveBeenCalledWith(callerId);
    expect(to).toHaveBeenCalledWith(recipientId);
    expect(emit).toHaveBeenCalledWith("CALL_TIMEOUT", expect.objectContaining({ callId, reason: "timeout" }));
    expect(emit).toHaveBeenCalledWith("CALL_MISSED", expect.objectContaining({ callId, reason: "timeout" }));
    expect(notifyMissedCall).toHaveBeenCalledWith({ callId, callerId, recipientId });
  });

  test("expires accepted social calls by max duration without coin transactions", async () => {
    const accepted = {
      _id: callId,
      caller: callerId,
      recipient: recipientId,
      type: "social",
      status: "accepted",
      startedAt: new Date("2026-07-29T18:04:59.000Z"),
      maxDurationSeconds: 900,
    };
    const updated = { ...accepted, status: "ended", endedReason: "max_duration" };
    VideoCall.find.mockReturnValueOnce(findQuery([accepted]));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(updated);

    const expired = await expireAcceptedSocialCalls(now);

    expect(expired).toBe(1);
    expect(VideoCall.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: callId, status: "accepted", type: "social" },
      {
        $set: {
          status: "ended",
          endedAt: now,
          endedReason: "max_duration",
          totalDurationSeconds: 901,
        },
      },
      { new: true }
    );
    expect(emit).toHaveBeenCalledWith("CALL_ENDED", expect.objectContaining({ callId, reason: "max_duration" }));
  });
});
