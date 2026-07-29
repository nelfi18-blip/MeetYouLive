const { validateEnv } = require("../env");

describe("Environment Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("does not throw when required env vars are present", () => {
    process.env.JWT_SECRET = "secret";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    process.env.NODE_ENV = "development";
    process.env.STRIPE_SECRET_KEY = "sk_test_12345";

    expect(() => validateEnv()).not.toThrow();
  });

  test("throws when required env vars are missing", () => {
    process.env.JWT_SECRET = "";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.MONGO_URI = "mongodb://localhost:27017/test";

    expect(() => validateEnv()).toThrow(/Missing required environment variables/);
  });

  test("throws in production when STRIPE_SECRET_KEY is a test key", () => {
    process.env.JWT_SECRET = "secret";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_12345";

    expect(() => validateEnv()).toThrow("Stripe secret key uses a test environment value in production. This is unsafe.");
  });

  test("does not throw in production when STRIPE_SECRET_KEY is a live key", () => {
    process.env.JWT_SECRET = "secret";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_12345";

    expect(() => validateEnv()).not.toThrow();
  });
});
