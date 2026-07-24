const express = require("express");
const rateLimit = require("express-rate-limit");
const request = require("supertest");
const AnalyticsEvent = require("../../models/AnalyticsEvent.js");
const User = require("../../models/User.js");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

jest.mock("../../models/AnalyticsEvent.js", () => ({
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  distinct: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
}));

const analyticsRoutes = require("../analytics.routes.js");
const { getGrowthAnalytics } = require("../../controllers/analytics.controller.js");
const { buildAnalyticsEventInput, classifySource, safePercent } = require("../../services/analytics.service.js");
const { verifyToken } = require("../../middlewares/auth.middleware.js");
const { requireAdmin } = require("../../middlewares/admin.middleware.js");

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  const testAdminLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000 });
  app.use(express.json());
  app.use("/api/analytics", analyticsRoutes);
  app.get("/api/admin/analytics/growth", testAdminLimiter, verifyToken, requireAdmin, getGrowthAnalytics);
  return app;
}

const basePayload = {
  eventName: "landing_view",
  anonymousVisitorId: "visitor_123456789",
  sessionId: "session_123456789",
  dedupeKey: "landing:visitor_123456789:session_123456789",
  path: "/?utm_source=instagram&utm_medium=social&utm_campaign=soft_launch&token=secret",
  locale: "es",
};

describe("analytics routes", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    AnalyticsEvent.create.mockResolvedValue({});
    AnalyticsEvent.findOneAndUpdate.mockResolvedValue({ lastErrorObject: { upserted: "event-1" } });
    AnalyticsEvent.countDocuments.mockResolvedValue(0);
    AnalyticsEvent.distinct.mockResolvedValue([]);
    AnalyticsEvent.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);
    User.updateOne.mockResolvedValue({});
  });

  test("a valid landing visit creates one sanitized event", async () => {
    const res = await request(app)
      .post("/api/analytics/events")
      .set("User-Agent", "Mozilla/5.0 iPhone")
      .send(basePayload);

    expect(res.status).toBe(202);
    expect(AnalyticsEvent.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = AnalyticsEvent.findOneAndUpdate.mock.calls[0];
    expect(update.$setOnInsert).toMatchObject({
      event: "landing_view",
      anonymousVisitorId: "visitor_123456789",
      sessionId: "session_123456789",
      source: "instagram",
      medium: "social",
      campaign: "soft_launch",
      deviceCategory: "mobile",
    });
    expect(update.$setOnInsert.path).toBe("/?utm_source=instagram&utm_medium=social&utm_campaign=soft_launch");
    expect(update.$setOnInsert.path).not.toContain("token");
  });

  test("refresh with same dedupe key does not create a duplicate session event", async () => {
    AnalyticsEvent.findOneAndUpdate.mockResolvedValueOnce({ lastErrorObject: {} });
    const res = await request(app).post("/api/analytics/events").send(basePayload);
    expect(res.status).toBe(202);
    expect(res.body.duplicate).toBe(true);
    expect(AnalyticsEvent.create).not.toHaveBeenCalled();
  });

  test("new anonymous visitor id is accepted without personal data", () => {
    const doc = buildAnalyticsEventInput({
      ...basePayload,
      metadata: {
        email: "person@example.com",
        password: "secret",
        step: "profile",
      },
    }, { get: () => "" });
    expect(doc.anonymousVisitorId).toBe("visitor_123456789");
    expect(doc.metadata).toEqual({ step: "profile" });
  });

  test.each([
    ["register_cta_click"],
    ["registration_started"],
    ["registration_submitted"],
    ["email_verified"],
    ["onboarding_completed"],
    ["feed_reached"],
  ])("%s is accepted", async (eventName) => {
    const res = await request(app).post("/api/analytics/events").send({ ...basePayload, eventName, dedupeKey: `${eventName}:abc12345` });
    expect(res.status).toBe(202);
  });

  test("UTM Instagram, Facebook referrer and direct traffic are classified", () => {
    expect(classifySource({ utmSource: "instagram" })).toBe("instagram");
    expect(classifySource({ referrerHost: "l.facebook.com" })).toBe("facebook");
    expect(classifySource({})).toBe("direct");
  });

  test("referrer URLs only store host and never sensitive query params", () => {
    const doc = buildAnalyticsEventInput({
      ...basePayload,
      referrer: "https://facebook.com/path?token=secret&email=test@example.com",
      dedupeKey: "referrer:safe:123",
    }, { get: () => "" });
    expect(doc.referrerHost).toBe("facebook.com");
    expect(doc.referrerHost).not.toContain("token");
    expect(doc.referrerHost).not.toContain("email");
  });

  test("unknown event is rejected", async () => {
    const res = await request(app).post("/api/analytics/events").send({ ...basePayload, eventName: "unknown_event" });
    expect(res.status).toBe(400);
  });

  test("payload too large is rejected", async () => {
    const res = await request(app).post("/api/analytics/events").send({ ...basePayload, metadata: { step: "x".repeat(5000) } });
    expect(res.status).toBe(413);
  });

  test("rate limiting eventually rejects excessive analytics requests", async () => {
    let status = 202;
    for (let i = 0; i < 65; i += 1) {
      const res = await request(app)
        .post("/api/analytics/events")
        .set("X-Forwarded-For", "203.0.113.10")
        .send({ ...basePayload, dedupeKey: `landing:test:${i}` });
      status = res.status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });

  test("non-admin cannot query growth analytics", async () => {
    const token = require("jsonwebtoken").sign({ id: "user-1" }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: "user-1", role: "user" }) });
    const res = await request(app).get("/api/admin/analytics/growth").set("Authorization", ["Bearer", token].join(" "));
    expect(res.status).toBe(403);
  });

  test("admin can query summary and conversion handles division by zero", async () => {
    const token = require("jsonwebtoken").sign({ id: "admin-1" }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: "admin-1", role: "admin" }) });
    const res = await request(app).get("/api/admin/analytics/growth").set("Authorization", ["Bearer", token].join(" "));
    expect(res.status).toBe(200);
    expect(res.body.analytics.summary.conversion).toBe(0);
    expect(safePercent(0, 0)).toBe(0);
  });

  test("bots, health checks, previews, admin paths and API paths are excluded", async () => {
    const cases = [
      { headers: { "User-Agent": "Googlebot" }, path: "/" },
      { headers: { Host: "test.vercel.app" }, path: "/" },
      { headers: {}, path: "/admin" },
      { headers: {}, path: "/api/health" },
      { headers: {}, path: "/_next/static/app.js" },
    ];
    for (const [index, item] of cases.entries()) {
      const res = await request(app)
        .post("/api/analytics/events")
        .set({ ...item.headers, "X-Forwarded-For": "203.0.113.20" })
        .send({ ...basePayload, path: item.path, dedupeKey: `case:excluded:${index}` });
      expect(res.status).toBe(202);
    }
    expect(AnalyticsEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("deep navigation does not become landing_view unless client sends landing_view", async () => {
    const res = await request(app)
      .post("/api/analytics/events")
      .set("X-Forwarded-For", "203.0.113.30")
      .send({ ...basePayload, eventName: "feed_reached", path: "/feed", dedupeKey: "feed:abc12345" });
    expect(res.status).toBe(202);
    const [, update] = AnalyticsEvent.findOneAndUpdate.mock.calls[0];
    expect(update.$setOnInsert.event).toBe("feed_reached");
  });
});
