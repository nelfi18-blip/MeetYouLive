const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const AppleAuthChallenge = require("../models/AppleAuthChallenge.js");

const APPLE_AUDIENCE = "com.meetyoulive.app";
const APPLE_ISSUER = "https://appleid.apple.com";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
let cachedKeys;
let keysExpireAt = 0;
let lastRefreshAt = 0;
let pendingKeys;

function appleAuthError(code, status = 401) {
  return Object.assign(new Error("Apple authentication failed"), { code, status });
}

const hashNonce = (nonce) => crypto.createHash("sha256").update(nonce).digest("hex");

async function createAppleChallenge() {
  const challengeId = crypto.randomBytes(32).toString("hex");
  const nonce = crypto.randomBytes(32).toString("hex");
  await AppleAuthChallenge.create({
    _id: challengeId,
    nonceHash: hashNonce(nonce),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return { challengeId, nonce };
}

async function getAppleKey(kid) {
  const now = Date.now();
  if (cachedKeys?.has(kid) && now < keysExpireAt) return cachedKeys.get(kid);
  if (!pendingKeys && now - lastRefreshAt >= 60000) {
    lastRefreshAt = now;
    pendingKeys = (async () => {
      try {
        const response = await fetch(`${APPLE_ISSUER}/auth/keys`, {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Apple JWKS unavailable");
        const body = await response.json();
        if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20) {
          throw new Error("Invalid Apple JWKS");
        }
        const keys = new Map();
        for (const key of body.keys) {
          if (key.kty === "RSA" && key.alg === "RS256" && key.use === "sig" && typeof key.kid === "string") {
            keys.set(key.kid, crypto.createPublicKey({ key, format: "jwk" }));
          }
        }
        if (!keys.size) throw new Error("Empty Apple JWKS");
        cachedKeys = keys;
        keysExpireAt = Date.now() + 60 * 60 * 1000;
      } catch {
        throw appleAuthError("APPLE_KEYS_UNAVAILABLE", 503);
      } finally {
        pendingKeys = null;
      }
    })();
  }
  if (pendingKeys) await pendingKeys;
  if (!cachedKeys || Date.now() >= keysExpireAt) throw appleAuthError("APPLE_KEYS_UNAVAILABLE", 503);
  const key = cachedKeys.get(kid);
  if (!key) throw appleAuthError("APPLE_INVALID_TOKEN");
  return key;
}

async function verifyAppleCredential(idToken, challengeId) {
  if (typeof idToken !== "string" || idToken.length > 16384 ||
      typeof challengeId !== "string" || !/^[a-f0-9]{64}$/.test(challengeId)) {
    throw appleAuthError("APPLE_INVALID_REQUEST", 400);
  }
  const challenge = await AppleAuthChallenge.findOne({ _id: challengeId, expiresAt: { $gt: new Date() } });
  if (!challenge) throw appleAuthError("APPLE_CHALLENGE_EXPIRED");

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || decoded.header.alg !== "RS256" ||
      typeof decoded.header.kid !== "string" || decoded.header.kid.length > 128) {
    throw appleAuthError("APPLE_INVALID_TOKEN");
  }
  const key = await getAppleKey(decoded.header.kid);
  let claims;
  try {
    claims = jwt.verify(idToken, key, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience: APPLE_AUDIENCE,
      maxAge: "5m",
    });
  } catch {
    throw appleAuthError("APPLE_INVALID_TOKEN");
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== APPLE_AUDIENCE || typeof claims.sub !== "string" || !claims.sub.trim() ||
      claims.sub.length > 255 || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) ||
      claims.iat > now + 30 || claims.exp <= now ||
      typeof claims.nonce !== "string" || !/^[a-f0-9]{64}$/.test(claims.nonce) ||
      hashNonce(claims.nonce) !== challenge.nonceHash) {
    throw appleAuthError("APPLE_INVALID_TOKEN");
  }
  // Atomic across server instances: a valid credential can only be used once.
  const consumed = await AppleAuthChallenge.findOneAndDelete({
    _id: challengeId,
    nonceHash: challenge.nonceHash,
    expiresAt: { $gt: new Date() },
  });
  if (!consumed) throw appleAuthError("APPLE_CHALLENGE_EXPIRED");
  return claims;
}

module.exports = { createAppleChallenge, verifyAppleCredential, appleAuthError };
