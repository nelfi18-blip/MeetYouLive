const { verifyWorldTestEnvironment } = require("../../worldTestConfig");

const fixture = () => ({
  WORLD_TEST_MODE: "isolated",
  WORLD_TEST_MONGODB_URI: "mongodb+srv://onlytest:synthetic@worldtestfree.53upecq.mongodb.net/world_test?retryWrites=true&w=majority",
  WORLD_TEST_JWT_SECRET: "isolated-world-pilot-synthetic-signing-secret-long-enough",
  WORLD_TEST_FRONTEND_ORIGIN: "https://meetyoulive-git-feat-vcr-horizon-3d-world-meetyoulive.vercel.app",
  WORLD_TEST_ACCOUNT_A_PASSWORD: "isolated-synthetic-password-a-not-real",
  WORLD_TEST_ACCOUNT_B_PASSWORD: "isolated-synthetic-password-b-not-real",
});

describe("World test environment is isolated and fails closed", () => {
  test("accepts only an explicitly configured WorldTestFree/world_test", () => {
    const cfg = verifyWorldTestEnvironment(fixture());
    expect(cfg.accounts).toHaveLength(2);
    expect(cfg.mongoUri).toContain("/world_test");
    expect(cfg.origin).toContain("vcr-horizon-3d-world");
  });

  test.each([
    ["missing opt-in", { WORLD_TEST_MODE: undefined }],
    ["wrong mode", { WORLD_TEST_MODE: "production" }],
    ["production Mongo inherited", { MONGODB_URI: "mongodb+srv://hidden@production.example.com/main" }],
    ["production secret inherited", { JWT_SECRET: "production-test-placeholder" }],
    ["production Stripe inherited", { STRIPE_SECRET_KEY: "sk_placeholder" }],
    ["production email inherited", { SMTP_PASS: "some-shared-secret" }],
    ["production OAuth inherited", { GOOGLE_CLIENT_SECRET: "shared-secret" }],
    ["production stream inherited", { AGORA_APP_CERTIFICATE: "shared-cert" }],
    ["production Mongo host", { WORLD_TEST_MONGODB_URI: "mongodb+srv://test:test@production.example.mongodb.net/world_test" }],
    ["production database name", { WORLD_TEST_MONGODB_URI: "mongodb+srv://test:test@worldtestfree.53upecq.mongodb.net/meetyoulive" }],
    ["database lacks user", { WORLD_TEST_MONGODB_URI: "mongodb+srv://worldtestfree.53upecq.mongodb.net/world_test" }],
    ["weak JWT", { WORLD_TEST_JWT_SECRET: "short" }],
    ["shared preview origin", { WORLD_TEST_FRONTEND_ORIGIN: "https://www.meetyoulive.net" }],
    ["arbitrary preview origin", { WORLD_TEST_FRONTEND_ORIGIN: "https://attacker.vercel.app" }],
    ["another Vercel preview", { WORLD_TEST_FRONTEND_ORIGIN: "https://meetyoulive-random-meetyoulive.vercel.app" }],
    ["missing first test identity", { WORLD_TEST_ACCOUNT_A_PASSWORD: undefined }],
    ["same test password", { WORLD_TEST_ACCOUNT_B_PASSWORD: "isolated-synthetic-password-a-not-real" }],
  ])("rejects %s", (_, update) => {
    expect(() => verifyWorldTestEnvironment({ ...fixture(), ...update })).toThrow();
  });

  test("uses a distinct per-account test identity and never real emails", () => {
    const cfg = verifyWorldTestEnvironment(fixture());
    expect(cfg.accounts.map((x) => x.email)).toEqual([
      "world-pilot-a@example.invalid",
      "world-pilot-b@example.invalid",
    ]);
  });
});

test("World test server cannot import production entrypoint or expose payment/Live routes", () => {
  const fs = require("fs");
  const source = fs.readFileSync(require("path").join(__dirname, "../../../world-test-server.js"), "utf8");
  expect(source).not.toContain('require("./src/app")');
  expect(source).not.toContain('require("./index")');
  expect(source).toContain('initVcrWorld(io, authenticateSocket)');
  expect(source).toContain('app.use((_req, res) => res.status(404)');
  expect(source).toContain('app.get("/api/health"');
  expect(source).not.toContain('app.use("/api/payments"');
  expect(source).not.toContain('app.use("/api/live"');
});
