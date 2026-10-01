"use strict";

const mongoose = require("mongoose");

jest.mock("../../models/RandomQueueEntry.js", () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  deleteOne: jest.fn(),
  exists: jest.fn(),
}));

jest.mock("../../models/RandomSession.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock("../../services/callRules.service.js", () => ({
  hasUserBlockBetween: jest.fn(),
}));

jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
}));

const RandomQueueEntry = require("../../models/RandomQueueEntry.js");
const RandomSession = require("../../models/RandomSession.js");
const User = require("../../models/User.js");
const { hasUserBlockBetween } = require("../callRules.service.js");
const { getIO } = require("../../lib/socket.js");
const randomService = require("../random.service.js");

const userA = "507f1f77bcf86cd799439011";
const userB = "507f1f77bcf86cd799439012";
const userC = "507f1f77bcf86cd799439013";
const sessionId = "507f1f77bcf86cd799439099";

function makeDbSession() {
  return { withTransaction: jest.fn(async (fn) => fn()), endSession: jest.fn() };
}

function findQuery(value) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
    })),
  };
}

function selectLeanQuery(value) {
  return { select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })) };
}

beforeEach(() => {
  jest.clearAllMocks();
  RandomQueueEntry.find.mockReturnValue(findQuery([]));
  RandomQueueEntry.findOneAndUpdate.mockResolvedValue({ user: userA });
  RandomQueueEntry.deleteOne.mockResolvedValue({ deletedCount: 1 });
  RandomQueueEntry.exists.mockResolvedValue(null);
  RandomSession.findOne.mockResolvedValue(null);
  User.find.mockReturnValue(selectLeanQuery([]));
  User.findById.mockReturnValue(selectLeanQuery(null));
  hasUserBlockBetween.mockResolvedValue(false);
  getIO.mockReturnValue(null);
});

describe("random.service join()", () => {
  test("1. first user joining with nobody else waiting gets WAITING", async () => {
    const result = await randomService.join(userA);
    expect(result).toEqual({ state: "waiting" });
    expect(RandomQueueEntry.findOneAndUpdate).toHaveBeenCalledWith(
      { user: userA },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ user: userA }) }),
      expect.objectContaining({ upsert: true })
    );
  });

  test("2. second compatible user joining gets both MATCHED, exactly one session created", async () => {
    RandomQueueEntry.find.mockReturnValue(findQuery([{ user: userA, createdAt: new Date() }]));
    User.find.mockReturnValue(selectLeanQuery([{ _id: userA, role: "user", isBlocked: false, isSuspended: false }]));
    const dbSession = makeDbSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(dbSession);
    RandomQueueEntry.findOneAndDelete
      .mockResolvedValueOnce({ user: userA }) // claim candidate A
      .mockResolvedValueOnce({ user: userB }); // claim self B
    const created = {
      _id: sessionId,
      participants: [userA, userB].sort(),
      status: "matched",
    };
    RandomSession.create.mockResolvedValue([created]);
    User.findById.mockReturnValue(selectLeanQuery({ _id: userA, name: "Alice", username: "alice" }));

    const result = await randomService.join(userB);

    expect(result.state).toBe("matched");
    expect(result.sessionId).toBe(sessionId);
    expect(RandomSession.create).toHaveBeenCalledTimes(1);
    expect(RandomSession.create).toHaveBeenCalledWith(
      [expect.objectContaining({ participants: [userA, userB].sort(), status: "matched" })],
      expect.objectContaining({ session: dbSession })
    );
  });

  test("3. never matches a user with themselves even if they appear in the candidate scan", async () => {
    RandomQueueEntry.find.mockReturnValue(findQuery([{ user: userA, createdAt: new Date() }]));
    const result = await randomService.join(userA);
    expect(result).toEqual({ state: "waiting" });
    expect(RandomQueueEntry.findOneAndDelete).not.toHaveBeenCalled();
  });

  test("4. repeated join while waiting does not duplicate the queue (idempotent upsert)", async () => {
    await randomService.join(userA);
    await randomService.join(userA);
    expect(RandomQueueEntry.findOneAndUpdate).toHaveBeenCalledTimes(2);
    RandomQueueEntry.findOneAndUpdate.mock.calls.forEach((call) => {
      expect(call[2]).toEqual(expect.objectContaining({ upsert: true }));
    });
  });

  test("5. join while already matched returns the existing session, never creates another", async () => {
    RandomSession.findOne.mockResolvedValue({
      _id: sessionId,
      participants: [userA, userB],
      status: "matched",
    });
    User.findById.mockReturnValue(selectLeanQuery({ _id: userB, name: "Bob", username: "bob" }));

    const result = await randomService.join(userA);

    expect(result).toEqual({ state: "matched", sessionId, peer: { id: userB, name: "Bob", username: "bob" } });
    expect(RandomQueueEntry.findOneAndUpdate).not.toHaveBeenCalled();
    expect(RandomSession.create).not.toHaveBeenCalled();
  });

  test("7. blocked A->B are never matched to each other", async () => {
    RandomQueueEntry.find.mockReturnValue(findQuery([{ user: userA, createdAt: new Date() }]));
    User.find.mockReturnValue(selectLeanQuery([{ _id: userA, role: "user", isBlocked: false, isSuspended: false }]));
    hasUserBlockBetween.mockResolvedValue(true);

    const result = await randomService.join(userB);

    expect(result).toEqual({ state: "waiting" });
    expect(RandomQueueEntry.findOneAndDelete).not.toHaveBeenCalled();
    expect(RandomSession.create).not.toHaveBeenCalled();
  });

  test("8. blocked B->A (reverse direction) are never matched to each other", async () => {
    RandomQueueEntry.find.mockReturnValue(findQuery([{ user: userB, createdAt: new Date() }]));
    User.find.mockReturnValue(selectLeanQuery([{ _id: userB, role: "user", isBlocked: false, isSuspended: false }]));
    hasUserBlockBetween.mockResolvedValue(true);

    const result = await randomService.join(userA);

    expect(result).toEqual({ state: "waiting" });
    expect(RandomSession.create).not.toHaveBeenCalled();
    expect(hasUserBlockBetween).toHaveBeenCalledWith(userA, userB);
  });

  test("9. a suspended/ineligible candidate is skipped and dropped from the queue", async () => {
    RandomQueueEntry.find.mockReturnValue(
      findQuery([
        { user: userA, createdAt: new Date(0) },
        { user: userC, createdAt: new Date(1) },
      ])
    );
    User.find.mockReturnValue(
      selectLeanQuery([
        { _id: userA, role: "user", isBlocked: false, isSuspended: true },
        { _id: userC, role: "user", isBlocked: false, isSuspended: false },
      ])
    );
    const dbSession = makeDbSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(dbSession);
    RandomQueueEntry.findOneAndDelete
      .mockResolvedValueOnce({ user: userC })
      .mockResolvedValueOnce({ user: userB });
    RandomSession.create.mockResolvedValue([{ _id: sessionId, participants: [userB, userC].sort() }]);
    User.findById.mockReturnValue(selectLeanQuery({ _id: userC, name: "C", username: "c" }));

    const result = await randomService.join(userB);

    expect(RandomQueueEntry.deleteOne).toHaveBeenCalledWith({ user: userA });
    expect(result.state).toBe("matched");
    expect(RandomQueueEntry.findOneAndDelete).not.toHaveBeenCalledWith({ user: userA });
  });

  test("17. a lost concurrency race (self already claimed elsewhere) safely falls back to WAITING without a duplicate session", async () => {
    RandomQueueEntry.find.mockReturnValue(findQuery([{ user: userA, createdAt: new Date() }]));
    User.find.mockReturnValue(selectLeanQuery([{ _id: userA, role: "user", isBlocked: false, isSuspended: false }]));
    const dbSession = makeDbSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(dbSession);
    RandomQueueEntry.findOneAndDelete
      .mockResolvedValueOnce({ user: userA }) // candidate claimed
      .mockResolvedValueOnce(null); // self already removed by a concurrent request

    const result = await randomService.join(userB);

    expect(result).toEqual({ state: "waiting" });
    expect(RandomSession.create).not.toHaveBeenCalled();
  });

  test("17b. a duplicate-key error (two transactions both tried to create a session) safely falls back to WAITING", async () => {
    RandomQueueEntry.find.mockReturnValue(findQuery([{ user: userA, createdAt: new Date() }]));
    User.find.mockReturnValue(selectLeanQuery([{ _id: userA, role: "user", isBlocked: false, isSuspended: false }]));
    const dbSession = makeDbSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(dbSession);
    RandomQueueEntry.findOneAndDelete
      .mockResolvedValueOnce({ user: userA })
      .mockResolvedValueOnce({ user: userB });
    const duplicateKeyError = new Error("duplicate key");
    duplicateKeyError.code = 11000;
    RandomSession.create.mockRejectedValueOnce(duplicateKeyError);

    const result = await randomService.join(userB);

    expect(result).toEqual({ state: "waiting" });
  });
});

describe("random.service leave()", () => {
  test("10. leave while WAITING removes the queue entry", async () => {
    RandomSession.findOne.mockResolvedValue(null);
    const result = await randomService.leave(userA);
    expect(result).toEqual({ state: "idle" });
    expect(RandomQueueEntry.deleteOne).toHaveBeenCalledWith({ user: userA });
    expect(RandomSession.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("11. leave while MATCHED ends the session", async () => {
    RandomSession.findOne.mockResolvedValue({ _id: sessionId, participants: [userA, userB], status: "matched" });
    RandomSession.findOneAndUpdate.mockResolvedValue({
      _id: sessionId,
      participants: [userA, userB],
      status: "ended",
      endReason: "leave",
    });

    const result = await randomService.leave(userA);

    expect(result).toEqual({ state: "idle" });
    expect(RandomSession.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: sessionId, status: "matched" },
      { $set: expect.objectContaining({ status: "ended", endedBy: userA, endReason: "leave" }) },
      { new: true }
    );
  });

  test("12. leave is idempotent when called again with nothing active", async () => {
    RandomSession.findOne.mockResolvedValue(null);
    RandomQueueEntry.exists.mockResolvedValue(null);
    await randomService.leave(userA);
    const result = await randomService.leave(userA);
    expect(result).toEqual({ state: "idle" });
  });
});

describe("random.service next()", () => {
  test("13. next ends the current session with reason=next", async () => {
    RandomSession.findOne.mockResolvedValueOnce({ _id: sessionId, participants: [userA, userB], status: "matched" });
    RandomSession.findOneAndUpdate.mockResolvedValue({
      _id: sessionId,
      participants: [userA, userB],
      status: "ended",
      endReason: "next",
    });
    RandomSession.findOne.mockResolvedValueOnce(null); // join() re-check after ending

    const result = await randomService.next(userA);

    expect(RandomSession.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: sessionId, status: "matched" },
      { $set: expect.objectContaining({ endedBy: userA, endReason: "next" }) },
      { new: true }
    );
    expect(result.state).toBe("waiting");
  });

  test("14. next returns the requester to WAITING when nobody else is available", async () => {
    RandomSession.findOne.mockResolvedValueOnce({ _id: sessionId, participants: [userA, userB], status: "matched" });
    RandomSession.findOneAndUpdate.mockResolvedValue({ _id: sessionId, participants: [userA, userB], status: "ended" });
    RandomSession.findOne.mockResolvedValueOnce(null);

    const result = await randomService.next(userA);
    expect(result).toEqual({ state: "waiting" });
  });

  test("15. the peer gets a coherent IDLE status after being nexted out of a session", async () => {
    // Session already ended by the other participant.
    RandomSession.findOne.mockResolvedValue(null);
    RandomQueueEntry.exists.mockResolvedValue(null);

    const status = await randomService.getStatus(userB);

    expect(status).toEqual({ state: "idle" });
  });
});

describe("random.service getStatus()", () => {
  test("16. status never exposes private peer fields beyond id/name/username", async () => {
    RandomSession.findOne.mockResolvedValue({ _id: sessionId, participants: [userA, userB], status: "matched" });
    User.findById.mockReturnValue(
      selectLeanQuery({
        _id: userB,
        name: "Bob",
        username: "bob",
        email: "bob@example.com",
        phone: "+1 555",
        birthdate: new Date("1990-01-01"),
      })
    );

    const status = await randomService.getStatus(userA);

    expect(status.peer).toEqual({ id: userB, name: "Bob", username: "bob" });
    expect(User.findById().select).toHaveBeenCalledWith("_id name username");
  });

  test("18. GET /status recovers session state purely from the database, never touching sockets", async () => {
    RandomSession.findOne.mockResolvedValue({ _id: sessionId, participants: [userA, userB], status: "matched" });
    User.findById.mockReturnValue(selectLeanQuery({ _id: userB, name: "Bob", username: "bob" }));

    await randomService.getStatus(userA);

    expect(getIO).not.toHaveBeenCalled();
  });

  test("returns waiting when queued and matched when not applicable", async () => {
    RandomSession.findOne.mockResolvedValue(null);
    RandomQueueEntry.exists.mockResolvedValue({ _id: "x" });
    const status = await randomService.getStatus(userA);
    expect(status).toEqual({ state: "waiting" });
  });
});
