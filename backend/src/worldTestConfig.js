"use strict";

// Pure, fail-closed preflight for the *existing* isolated World Render service.
// Never reuse production Mongo/JWT credentials, even if inherited via env groups.
const TEST_HOST = /^worldtestfree(?:[-.][a-z0-9-]+)*\.mongodb\.net$/i;
const TEST_ORIGIN = /^https:\/\/meetyoulive-(?:git-feat-vcr-horizon-3d-world-meetyoulive|[a-z0-9-]+-meetyoulive)\.vercel\.app$/i;

function verifyWorldTestEnvironment(env) {
  if (env.WORLD_TEST_MODE !== "isolated") throw new Error("World test mode not enabled");
  if (["MONGO_URI", "MONGODB_URI", "DATABASE_URL"].some((key) => env[key])) {
    throw new Error("Shared Mongo settings detected; World Test must use its own variable");
  }
  if (["STRIPE_SECRET_KEY", "GOOGLE_CLIENT_SECRET", "SMTP_PASS", "AGORA_APP_CERTIFICATE"].some((key) => env[key])) {
    throw new Error("Unrelated provider credentials are not allowed on World Test");
  }
  const uri = String(env.WORLD_TEST_MONGODB_URI || "");
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error("World Test Mongo URL is invalid"); }
  if (parsed.protocol !== "mongodb+srv:" || !TEST_HOST.test(parsed.hostname) ||
      decodeURIComponent(parsed.pathname) !== "/world_test" || !parsed.username || !parsed.password) {
    throw new Error("World Test Mongo must use WorldTestFree/world_test with dedicated credentials");
  }
  const secret = String(env.WORLD_TEST_JWT_SECRET || "");
  if (secret.length < 40 || secret === env.JWT_SECRET) {
    throw new Error("A dedicated World Test JWT secret (40+ characters) is required");
  }
  const origin = String(env.WORLD_TEST_FRONTEND_ORIGIN || "");
  if (!TEST_ORIGIN.test(origin)) throw new Error("Use the exact World Vercel Preview origin");
  const accounts = ["A", "B"].map((id) => {
    const password = String(env[`WORLD_TEST_ACCOUNT_${id}_PASSWORD`] || "");
    if (password.length < 20 || password === secret) throw new Error("Two dedicated World Test account passwords are required");
    return {
      email: `world-pilot-${id.toLowerCase()}@example.invalid`,
      username: `worldpilottest${id.toLowerCase()}`,
      password,
    };
  });
  if (accounts[0].password === accounts[1].password) throw new Error("World Test passwords must differ");
  return { mongoUri: uri, jwtSecret: secret, origin, accounts };
}

module.exports = { verifyWorldTestEnvironment };
