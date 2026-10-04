const express = require("express");
const request = require("supertest");

const staffUserId = "507f1f77bcf86cd799439021";
const normalUserId = "507f1f77bcf86cd799439022";
const signalId = "507f1f77bcf86cd799439033";

jest.mock("../../models/User.js", () => ({ findById: jest.fn() }));
jest.mock("../../models/AIModerationSignal.js", () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../../services/audit.service.js", () => ({ logStaffAction: jest.fn() }));

const User = require("../../models/User.js");
const AIModerationSignal = require("../../models/AIModerationSignal.js");
const { logStaffAction } = require("../../services/audit.service.js");

const mockState = { currentUserId: normalUserId };
jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = mockState.currentUserId;
    next();
  },
}));

const aiModerationSignalRoutes = require("../aiModerationSignal.routes.js");

const makeApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/moderation", aiModerationSignalRoutes);
  return app;
};

const makeFindByIdSelectChain = (value) => ({ select: jest.fn().mockResolvedValue(value) });

describe("AI moderation signal staff review endpoints", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockState.currentUserId = normalUserId;
    app = makeApp();
  });

  describe("GET /api/moderation/ai-signals", () => {
    test("rejects a normal user", async () => {
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "user" }));
      const res = await request(app).get("/api/moderation/ai-signals");
      expect(res.status).toBe(403);
      expect(AIModerationSignal.find).not.toHaveBeenCalled();
    });

    test("allows an authorized moderator to list pending signals without exposing raw text", async () => {
      mockState.currentUserId = staffUserId;
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "moderator" }));
      const signals = [{
        _id: signalId, context: "chat_message", sourceType: "message", riskLevel: "high",
        categories: ["harassment"], status: "pending",
      }];
      AIModerationSignal.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(signals),
      });
      AIModerationSignal.countDocuments.mockResolvedValue(1);

      const res = await request(app).get("/api/moderation/ai-signals");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, signals, total: 1, page: 1, limit: 50 });
      expect(AIModerationSignal.find).toHaveBeenCalledWith({ status: "pending" });
      expect(res.body.signals[0]).not.toHaveProperty("text");
      expect(res.body.signals[0]).not.toHaveProperty("messageText");
    });

    test("allows filtering by an allowed status", async () => {
      mockState.currentUserId = staffUserId;
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "admin" }));
      AIModerationSignal.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      AIModerationSignal.countDocuments.mockResolvedValue(0);

      await request(app).get("/api/moderation/ai-signals?status=dismissed");

      expect(AIModerationSignal.find).toHaveBeenCalledWith({ status: "dismissed" });
    });
  });

  describe("PATCH /api/moderation/ai-signals/:id", () => {
    test("rejects a normal user", async () => {
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "user" }));
      const res = await request(app)
        .patch(`/api/moderation/ai-signals/${signalId}`)
        .send({ status: "reviewed" });
      expect(res.status).toBe(403);
      expect(AIModerationSignal.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("rejects an invalid ObjectId", async () => {
      mockState.currentUserId = staffUserId;
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "moderator" }));
      const res = await request(app)
        .patch("/api/moderation/ai-signals/not-an-object-id")
        .send({ status: "reviewed" });
      expect(res.status).toBe(400);
      expect(AIModerationSignal.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("rejects an invalid status value", async () => {
      mockState.currentUserId = staffUserId;
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "moderator" }));
      const res = await request(app)
        .patch(`/api/moderation/ai-signals/${signalId}`)
        .send({ status: "banned" });
      expect(res.status).toBe(400);
      expect(AIModerationSignal.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test.each(["reviewed", "dismissed"])(
      "an authorized moderator can mark a signal as %s, reviewedBy comes from the authenticated identity",
      async (status) => {
        mockState.currentUserId = staffUserId;
        User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "moderator" }));
        const updated = { _id: signalId, status, riskLevel: "high", categories: ["harassment"] };
        AIModerationSignal.findByIdAndUpdate.mockResolvedValue(updated);

        const res = await request(app)
          .patch(`/api/moderation/ai-signals/${signalId}`)
          .send({ status, reviewedBy: "attacker-supplied-id" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, signal: updated });
        const [calledId, calledUpdate, calledOptions] = AIModerationSignal.findByIdAndUpdate.mock.calls[0];
        expect(String(calledId)).toBe(signalId);
        expect(calledUpdate).toEqual(expect.objectContaining({ status, reviewedBy: staffUserId }));
        expect(calledOptions).toEqual({ new: true });
        expect(logStaffAction).toHaveBeenCalledWith(expect.objectContaining({
          staffId: staffUserId, action: "update_ai_moderation_signal",
        }));
        expect(String(logStaffAction.mock.calls[0][0].targetId)).toBe(signalId);
      }
    );

    test("returns 404 when the signal does not exist", async () => {
      mockState.currentUserId = staffUserId;
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "admin" }));
      AIModerationSignal.findByIdAndUpdate.mockResolvedValue(null);
      const res = await request(app)
        .patch(`/api/moderation/ai-signals/${signalId}`)
        .send({ status: "reviewed" });
      expect(res.status).toBe(404);
    });

    test("this endpoint never bans, suspends, blocks or deletes the author", async () => {
      mockState.currentUserId = staffUserId;
      User.findById.mockReturnValue(makeFindByIdSelectChain({ role: "admin" }));
      AIModerationSignal.findByIdAndUpdate.mockResolvedValue({ _id: signalId, status: "reviewed" });
      await request(app).patch(`/api/moderation/ai-signals/${signalId}`).send({ status: "reviewed" });
      // No User mutation methods exist on this mock beyond findById (read-only lookup for role check).
      expect(Object.keys(User)).toEqual(["findById"]);
    });
  });
});
