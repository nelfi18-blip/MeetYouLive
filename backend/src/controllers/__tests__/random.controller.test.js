"use strict";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../services/random.service.js", () => ({
  join: jest.fn(),
  leave: jest.fn(),
  next: jest.fn(),
  getStatus: jest.fn(),
}));

const User = require("../../models/User.js");
const randomService = require("../../services/random.service.js");
const { join, status, leave, next } = require("../random.controller.js");

const userId = "507f1f77bcf86cd799439011";
const peerId = "507f1f77bcf86cd799439012";
const sessionId = "507f1f77bcf86cd799439099";

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

function selectLeanQuery(value) {
  return { select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })) };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockReturnValue(selectLeanQuery({ _id: userId, isBlocked: false, isSuspended: false }));
});

describe("random.controller eligibility", () => {
  test("join rejects a missing user", async () => {
    User.findById.mockReturnValue(selectLeanQuery(null));
    const res = makeRes();
    await join({ userId }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(randomService.join).not.toHaveBeenCalled();
  });

  test("join rejects an isBlocked user", async () => {
    User.findById.mockReturnValue(selectLeanQuery({ _id: userId, isBlocked: true }));
    const res = makeRes();
    await join({ userId }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(randomService.join).not.toHaveBeenCalled();
  });

  test("9. join rejects an isSuspended user (not eligible to enter Random)", async () => {
    User.findById.mockReturnValue(selectLeanQuery({ _id: userId, isSuspended: true }));
    const res = makeRes();
    await join({ userId }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(randomService.join).not.toHaveBeenCalled();
  });

  test("next rejects an ineligible user before touching the service", async () => {
    User.findById.mockReturnValue(selectLeanQuery({ _id: userId, isSuspended: true }));
    const res = makeRes();
    await next({ userId }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(randomService.next).not.toHaveBeenCalled();
  });
});

describe("random.controller responses", () => {
  test("join returns waiting", async () => {
    randomService.join.mockResolvedValue({ state: "waiting" });
    const res = makeRes();
    await join({ userId }, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, status: "waiting" });
  });

  test("join returns matched with minimal peer info only", async () => {
    randomService.join.mockResolvedValue({
      state: "matched",
      sessionId,
      peer: { id: peerId, name: "Bob", username: "bob" },
    });
    const res = makeRes();
    await join({ userId }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({ ok: true, status: "matched", sessionId, peer: { id: peerId, name: "Bob", username: "bob" } });
    expect(payload.peer).not.toHaveProperty("email");
    expect(payload.peer).not.toHaveProperty("birthdate");
    expect(payload.peer).not.toHaveProperty("phone");
  });

  test("16. status never includes private fields even if the service accidentally forwarded them", async () => {
    randomService.getStatus.mockResolvedValue({
      state: "matched",
      sessionId,
      peer: { id: peerId, name: "Bob", username: "bob" },
    });
    const res = makeRes();
    await status({ userId }, res);
    const payload = res.json.mock.calls[0][0];
    expect(Object.keys(payload.peer).sort()).toEqual(["id", "name", "username"]);
  });

  test("status does not require eligibility re-check (read-only, authoritative fallback)", async () => {
    randomService.getStatus.mockResolvedValue({ state: "idle" });
    const res = makeRes();
    await status({ userId }, res);
    expect(User.findById).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, status: "idle" });
  });

  test("10/11/12. leave is idempotent and always returns idle", async () => {
    randomService.leave.mockResolvedValue({ state: "idle" });
    const res1 = makeRes();
    await leave({ userId }, res1);
    const res2 = makeRes();
    await leave({ userId }, res2);
    expect(res1.json).toHaveBeenCalledWith({ ok: true, status: "idle" });
    expect(res2.json).toHaveBeenCalledWith({ ok: true, status: "idle" });
    expect(randomService.leave).toHaveBeenCalledTimes(2);
  });

  test("next surfaces the service result (waiting or matched)", async () => {
    randomService.next.mockResolvedValue({ state: "waiting" });
    const res = makeRes();
    await next({ userId }, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, status: "waiting" });
  });

  test("propagates unexpected service errors as 500 without leaking internals", async () => {
    randomService.join.mockRejectedValue(new Error("boom"));
    const res = makeRes();
    await join({ userId }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
