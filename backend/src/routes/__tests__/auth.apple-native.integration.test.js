const crypto = require("crypto");
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("../../services/email.service.js", () => ({}));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(), trackSafeAnalyticsEvent: jest.fn(),
}));

const uri = process.env.INTEGRATION_MONGO_URI;
const describeMongo = uri ? describe : describe.skip;

describeMongo("Apple native auth — real local MongoDB uniqueness and replay protection", () => {
  let mongoose, User, Challenge, app, fetchSpy;
  const ids = [];
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "apple-integration-key", alg: "RS256", use: "sig" };
  const sub = "apple-integration-stable-sub";
  const email = "apple-auth-integration@privaterelay.appleid.com";

  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) {
      throw new Error("Apple integration tests require a disposable LOCAL MongoDB URI");
    }
    mongoose = require("mongoose");
    await mongoose.connect(uri, { dbName: "meetyoulive_apple_auth_integration" });
    User = require("../../models/User.js");
    Challenge = require("../../models/AppleAuthChallenge.js");
    await Promise.all([User.init(), Challenge.init()]);
    process.env.JWT_SECRET = "apple-integration-backend-secret";
    const express = require("express");
    app = express();
    app.use(express.json());
    app.use("/api/auth", require("../auth.routes.js"));
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ keys: [key] }) });
  }, 60000);

  beforeEach(async () => {
    await User.deleteMany({ email: { $in: [email, "apple-auth-integration-other@example.invalid"] } });
  });
  afterAll(async () => {
    if (mongoose?.connection.readyState) {
      await User.deleteMany({ email: { $in: [email, "apple-auth-integration-other@example.invalid"] } });
      await Challenge.deleteMany({ _id: { $in: ids } });
      await mongoose.disconnect();
    }
    fetchSpy?.mockRestore();
  });

  async function challenge() {
    const response = await request(app).post("/api/auth/apple-challenge").send({});
    expect(response.status).toBe(200);
    ids.push(response.body.challengeId);
    return response.body;
  }
  function login(c, ageConfirmed = true) {
    const idToken = jwt.sign({ sub, email, email_verified: true, nonce: c.nonce }, privateKey, {
      algorithm: "RS256", keyid: key.kid, issuer: "https://appleid.apple.com", audience: "com.meetyoulive.app", expiresIn: "5m",
    });
    return request(app).post("/api/auth/apple-native").send({ idToken, challengeId: c.challengeId, ageConfirmed });
  }

  test("concurrent first authorizations create exactly one account and resolve the same user", async () => {
    const withoutConsent = await challenge();
    const registration = await login(withoutConsent, false);
    expect(registration.status).toBe(403);
    expect(registration.body.code).toBe("APPLE_REGISTRATION_REQUIRED");
    expect(registration.body.token).toBeUndefined();
    expect(await User.countDocuments({ appleSub: sub })).toBe(0);
    expect((await login(withoutConsent, true)).status).toBe(401);
    const [first, second] = await Promise.all([challenge(), challenge()]);
    const responses = await Promise.all([login(first), login(second)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body.user.id).toBe(responses[1].body.user.id);
    expect(await User.countDocuments({ appleSub: sub })).toBe(1);
    const returning = await login(await challenge(), false);
    expect(returning.status).toBe(200);
    expect(returning.body.user.id).toBe(responses[0].body.user.id);
  });

  test("concurrent replay is consumed once across real MongoDB operations", async () => {
    const c = await challenge();
    const responses = await Promise.all([login(c), login(c)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(await Challenge.findById(c.challengeId)).toBeNull();
    expect(await User.countDocuments({ appleSub: sub })).toBe(1);
  });

  test("unique Apple subject index rejects another user even with a different email", async () => {
    expect((await login(await challenge())).status).toBe(200);
    await expect(User.create({
      appleSub: sub, email: "apple-auth-integration-other@example.invalid", password: "random", authProvider: "apple",
    })).rejects.toMatchObject({ code: 11000 });
    expect(await User.countDocuments({ appleSub: sub })).toBe(1);
  });

  test("email collision with a local account cannot attach an Apple identity", async () => {
    const original = await User.create({ email, password: "random", authProvider: "local" });
    const response = await login(await challenge());
    expect(response.status).toBe(409);
    expect((await User.findById(original._id)).appleSub).toBeUndefined();
    expect(await User.countDocuments({ email })).toBe(1);
  });
});
