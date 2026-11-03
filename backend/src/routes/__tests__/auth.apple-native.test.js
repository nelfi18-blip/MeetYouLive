const crypto = require("crypto");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () => () => (_req, _res, next) => next());
jest.mock("../../models/User.js", () => ({
  init: jest.fn(), findOne: jest.fn(), exists: jest.fn(), create: jest.fn(), findByIdAndUpdate: jest.fn(),
}));
jest.mock("../../models/AppleAuthChallenge.js", () => ({
  create: jest.fn(), findOne: jest.fn(), findOneAndDelete: jest.fn(),
}));
jest.mock("../../services/email.service.js", () => ({
  sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn(),
}));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(), trackSafeAnalyticsEvent: jest.fn(),
}));

const User = require("../../models/User.js");
const Challenge = require("../../models/AppleAuthChallenge.js");
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "apple-test-key", alg: "RS256", use: "sig" };
const routes = require("../auth.routes.js");
const app = express();
app.use(express.json());
app.use("/api/auth", routes);

let challenges;
let users;
let fetchSpy;
let logSpy;
let errorSpy;
const existing = {
  _id: "507f1f77bcf86cd799439012", appleSub: "apple-stable-sub", email: "stored@privaterelay.appleid.com",
  name: "Original Name", role: "user", onboardingComplete: true, creatorStatus: "none",
};

function tokenFor(challenge, overrides = {}, key = privateKey, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://appleid.apple.com", aud: "com.meetyoulive.app", sub: "apple-stable-sub",
    email: "private@privaterelay.appleid.com", email_verified: "true",
    nonce: challenge.nonce, iat: now, exp: now + 300, ...overrides,
  };
  for (const field of Object.keys(claims)) {
    if (claims[field] === undefined) delete claims[field];
  }
  return jwt.sign(claims, key, {
    algorithm: "RS256", keyid: "apple-test-key", header,
    noTimestamp: Object.hasOwn(overrides, "iat") && overrides.iat === undefined,
  });
}

async function newChallenge() {
  const response = await request(app).post("/api/auth/apple-challenge").send({});
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  return response.body;
}

async function login(challenge, claims = {}, body = {}, key = privateKey) {
  const idToken = tokenFor(challenge, claims, key);
  return request(app).post("/api/auth/apple-native").send({
    idToken, challengeId: challenge.challengeId, ageConfirmed: true, ...body,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "apple-tests-backend-secret";
  challenges = new Map();
  users = [];
  Challenge.create.mockImplementation(async (record) => { challenges.set(record._id, record); return record; });
  const getChallenge = (filter) => {
    const record = challenges.get(filter._id);
    return record && record.expiresAt > filter.expiresAt.$gt &&
      (!filter.nonceHash || record.nonceHash === filter.nonceHash) ? record : null;
  };
  Challenge.findOne.mockImplementation(async (filter) => getChallenge(filter));
  Challenge.findOneAndDelete.mockImplementation(async (filter) => {
    const record = getChallenge(filter);
    if (record) challenges.delete(filter._id);
    return record;
  });
  User.init.mockResolvedValue(User);
  User.findOne.mockImplementation(async (filter) => users.find((user) => user.appleSub === filter.appleSub) || null);
  User.exists.mockImplementation(async (filter) => users.some((user) => user.email === filter.email));
  User.create.mockImplementation(async (payload) => {
    const user = { _id: "507f1f77bcf86cd799439013", role: "user", onboardingComplete: false, ...payload };
    users.push(user);
    return user;
  });
  fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) });
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test("first registration accepts Hide My Email and emits only the existing backend JWT and safe user", async () => {
  const challenge = await newChallenge();
  const response = await login(challenge, {}, { name: "Apple User", role: "admin", onboardingComplete: true });
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body.user).toMatchObject({ email: "private@privaterelay.appleid.com", role: "user", onboardingComplete: false });
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).id).toBe(response.body.user.id);
  expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
    appleSub: "apple-stable-sub", authProvider: "apple", emailVerified: true, appleAgeConfirmedAt: expect.any(Date),
    name: "Apple User",
  }));
  expect(User.create.mock.calls[0][0].password).not.toMatch(/^\$2/);
  expect(response.body).not.toHaveProperty("idToken");
  expect(response.body.user).not.toHaveProperty("appleSub");
  expect(logSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
  expect(fetchSpy).toHaveBeenCalledWith("https://appleid.apple.com/auth/keys", expect.objectContaining({ redirect: "error" }));
});

test("subsequent login resolves by sub without email or name and preserves profile/permissions", async () => {
  users.push({ ...existing, role: "creator", creatorStatus: "approved" });
  const response = await login(await newChallenge(), { email: undefined, email_verified: undefined }, { ageConfirmed: false });
  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({
    id: existing._id, email: existing.email, name: existing.name, role: "creator", creatorStatus: "approved", onboardingComplete: true,
  });
  expect(User.create).not.toHaveBeenCalled();
});

test("a repeat fresh authorization reuses the same account, not a second registration", async () => {
  const first = await login(await newChallenge());
  const second = await login(await newChallenge(), { email: undefined });
  expect(second.status).toBe(200);
  expect(first.body.user.id).toBe(second.body.user.id);
  expect(User.create).toHaveBeenCalledTimes(1);
});

test.each(["local", "google", "apple"])("never links a matching %s email belonging to a different subject", async (authProvider) => {
  users.push({ ...existing, authProvider, appleSub: authProvider === "apple" ? "another-sub" : undefined, email: "private@privaterelay.appleid.com" });
  const response = await login(await newChallenge());
  expect(response.status).toBe(409);
  expect(response.body.code).toBe("APPLE_ACCOUNT_CONFLICT");
  expect(response.body.token).toBeUndefined();
  expect(User.create).not.toHaveBeenCalled();
});

test.each([false, undefined, "true", 1])("requires explicit adult consent for first registration (%s)", async (ageConfirmed) => {
  const response = await login(await newChallenge(), {}, { ageConfirmed });
  expect(response.status).toBe(403);
  expect(response.body.code).toBe("APPLE_REGISTRATION_REQUIRED");
  expect(response.body.token).toBeUndefined();
  expect(User.create).not.toHaveBeenCalled();
});

test("new user starting from login must consent and authorize again with a fresh challenge", async () => {
  const firstChallenge = await newChallenge();
  const first = await login(firstChallenge, {}, { ageConfirmed: false });
  expect(first.status).toBe(403);
  expect(first.body.code).toBe("APPLE_REGISTRATION_REQUIRED");
  expect(User.create).not.toHaveBeenCalled();
  expect((await login(firstChallenge)).status).toBe(401);
  const registered = await login(await newChallenge(), {}, { ageConfirmed: true });
  expect(registered.status).toBe(200);
  expect(User.create).toHaveBeenCalledTimes(1);
  const returning = await login(await newChallenge(), { email: undefined }, { ageConfirmed: false });
  expect(returning.status).toBe(200);
  expect(returning.body.user.id).toBe(registered.body.user.id);
  expect(User.create).toHaveBeenCalledTimes(1);
});

test.each([
  { isBlocked: true }, { isSuspended: true },
  { birthdate: new Date(new Date().getFullYear() - 10, 0, 1) },
])("rejects restricted existing accounts: %j", async (restriction) => {
  users.push({ ...existing, ...restriction });
  const response = await login(await newChallenge());
  expect(response.status).toBe(403);
  expect(response.body.code).toBe(restriction.birthdate ? "APPLE_AGE_REQUIRED" : "APPLE_ACCOUNT_RESTRICTED");
  expect(response.body.token).toBeUndefined();
});

test.each([
  { aud: "other.bundle" }, { aud: ["com.meetyoulive.app", "other"] },
  { iss: "https://attacker.example" }, { exp: 1 }, { exp: undefined },
  { iat: Math.floor(Date.now() / 1000) - 600 }, { iat: Math.floor(Date.now() / 1000) + 3600 },
  { iat: undefined }, { sub: "" }, { sub: undefined }, { nonce: "a".repeat(64) }, { nonce: undefined },
])("rejects invalid signed claims: %j", async (claims) => {
  const response = await login(await newChallenge(), claims);
  expect(response.status).toBe(401);
  expect(User.create).not.toHaveBeenCalled();
});

test("rejects a signature from a different RSA key", async () => {
  const response = await login(await newChallenge(), {}, {}, wrongKey);
  expect(response.status).toBe(401);
});

test.each(["not-a-jwt", "", "a.b.c"])("rejects malformed credentials: %s", async (idToken) => {
  const response = await login(await newChallenge(), {}, { idToken });
  expect(response.status).toBe(401);
});

test("rejects HS256 and unknown signing keys", async () => {
  const challenge = await newChallenge();
  for (const idToken of [
    jwt.sign({ nonce: challenge.nonce }, "not-an-rsa-key", { algorithm: "HS256", keyid: jwk.kid }),
    tokenFor(challenge, {}, privateKey, { kid: "unknown-kid" }),
  ]) {
    const response = await login(challenge, {}, { idToken });
    expect(response.status).toBe(401);
  }
});

test("a token cannot be exchanged with a different challenge", async () => {
  const first = await newChallenge();
  const second = await newChallenge();
  const response = await login(second, {}, { idToken: tokenFor(first) });
  expect(response.status).toBe(401);
});

test("rejects expired challenge even before Mongo TTL cleanup", async () => {
  const challenge = await newChallenge();
  challenges.get(challenge.challengeId).expiresAt = new Date(0);
  const response = await login(challenge);
  expect(response.status).toBe(401);
  expect(response.body.code).toBe("APPLE_CHALLENGE_EXPIRED");
});

test("rejects reuse and concurrent exchanges of the same credential", async () => {
  const challenge = await newChallenge();
  const responses = await Promise.all([login(challenge), login(challenge)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
  expect((await login(challenge)).status).toBe(401);
  expect(User.create).toHaveBeenCalledTimes(1);
});

test.each([{ email: undefined }, { email_verified: false }, { email_verified: "false" }, { email: "invalid" }])(
  "new registration requires verified token email: %j", async (claims) => {
    const response = await login(await newChallenge(), claims, { email: "untrusted@example.com" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("APPLE_EMAIL_REQUIRED");
    expect(User.create).not.toHaveBeenCalled();
  }
);

test("resolves concurrent unique-sub creation only to the same Apple subject", async () => {
  User.create.mockImplementationOnce(async () => {
    users.push({ ...existing });
    throw Object.assign(new Error("duplicate"), { code: 11000 });
  });
  const response = await login(await newChallenge());
  expect(response.status).toBe(200);
  expect(response.body.user.id).toBe(existing._id);
});

test("an email race never falls back to another account", async () => {
  User.create.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: 11000 }));
  const response = await login(await newChallenge());
  expect(response.status).toBe(409);
  expect(response.body.token).toBeUndefined();
});

test("does not return internal DB error text or credentials", async () => {
  User.findOne.mockRejectedValueOnce(new Error("internal connection detail"));
  const response = await login(await newChallenge());
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toContain("internal connection");
  expect(errorSpy).toHaveBeenCalledWith("[apple-auth] Authentication unavailable", { code: "APPLE_INTERNAL_ERROR" });
});

test("Google native cannot claim an Apple account by matching email", async () => {
  const { OAuth2Client } = require("google-auth-library");
  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  jest.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
    getPayload: () => ({ iss: "https://accounts.google.com", sub: "google-sub", email: existing.email,
      email_verified: true, exp: Math.floor(Date.now() / 1000) + 300 }),
  });
  User.findOne.mockResolvedValue(existing);
  const response = await request(app).post("/api/auth/google-native").send({ idToken: "test-google-token" });
  expect(response.status).toBe(409);
  expect(User.create).not.toHaveBeenCalled();
});
