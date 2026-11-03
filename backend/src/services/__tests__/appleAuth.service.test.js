const crypto = require("crypto");
const jwt = require("jsonwebtoken");

jest.mock("../../models/AppleAuthChallenge.js", () => ({
  findOne: jest.fn(), findOneAndDelete: jest.fn(), create: jest.fn(),
}));

let service;
let Challenge;
let fetchSpy;
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = { ...publicKey.export({ format: "jwk" }), alg: "RS256", use: "sig", kid: "key-1" };
const nonce = "f".repeat(64);
const challengeId = "e".repeat(64);

function credential(kid = "key-1") {
  return jwt.sign({ sub: "stable-apple-sub", nonce }, privateKey, {
    algorithm: "RS256", keyid: kid, issuer: "https://appleid.apple.com",
    audience: "com.meetyoulive.app", expiresIn: "5m",
  });
}

beforeEach(() => {
  jest.resetModules();
  service = require("../appleAuth.service.js");
  Challenge = require("../../models/AppleAuthChallenge.js");
  Challenge.findOne.mockResolvedValue({ nonceHash: crypto.createHash("sha256").update(nonce).digest("hex") });
  Challenge.findOneAndDelete.mockResolvedValue({});
  fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ keys: [key] }) });
});
afterEach(() => jest.restoreAllMocks());

test("stores only a nonce digest and gives each challenge independent random identifiers", async () => {
  const first = await service.createAppleChallenge();
  const second = await service.createAppleChallenge();
  expect(first.challengeId).not.toBe(second.challengeId);
  expect(first.nonce).not.toBe(first.challengeId);
  expect(first.nonce).not.toBe(second.nonce);
  expect(Challenge.create.mock.calls[0][0]).toEqual({
    _id: first.challengeId, nonceHash: crypto.createHash("sha256").update(first.nonce).digest("hex"), expiresAt: expect.any(Date),
  });
});

test("caches Apple keys rather than fetching on every login", async () => {
  await service.verifyAppleCredential(credential(), challengeId);
  await service.verifyAppleCredential(credential(), challengeId);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("refreshes on key rotation after the refresh throttle interval", async () => {
  await service.verifyAppleCredential(credential(), challengeId);
  const now = Date.now();
  jest.spyOn(Date, "now").mockReturnValue(now + 61000);
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ keys: [{ ...key, kid: "key-2" }] }) });
  await expect(service.verifyAppleCredential(credential("key-2"), challengeId)).resolves.toMatchObject({ sub: "stable-apple-sub" });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test.each(["network", "http", "invalid-keys"])("fails closed when Apple JWKS is unavailable (%s)", async (failure) => {
  if (failure === "network") fetchSpy.mockRejectedValue(new Error("network"));
  if (failure === "http") fetchSpy.mockResolvedValue({ ok: false });
  if (failure === "invalid-keys") fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) });
  await expect(service.verifyAppleCredential(credential(), challengeId)).rejects.toMatchObject({
    code: "APPLE_KEYS_UNAVAILABLE", status: 503,
  });
  expect(Challenge.findOneAndDelete).not.toHaveBeenCalled();
});
