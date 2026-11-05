"use strict";

// Provider is entirely simulated. MongoDB locks, rollback and HTTP handlers are real.
const mockStripe = { customers: {}, subscriptions: {}, checkout: { sessions: {} }, subscriptionSchedules: {} };
jest.mock("stripe", () => jest.fn(() => mockStripe));
jest.mock("../faceReference.service.js", () => ({ revokeFaceReferenceForAccountDeletion: jest.fn() }));
jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => { req.userId = req.get("x-test-user"); next(); },
  optionalVerifyToken: (_req, _res, next) => next(),
}));
jest.mock("express-rate-limit", () => () => (_req, _res, next) => next());
jest.mock("../analytics.service.js", () => ({ trackAnalyticsEvent: jest.fn() }));
jest.mock("../essentialNotification.service.js", () => ({ notifySubscription: jest.fn() }));

const uri = process.env.INTEGRATION_MONGO_URI;
const describeWithMongo = uri ? describe : describe.skip;
if (!uri) console.warn("[stripeSubscriptionLifecycle.integration] Requires a disposable localhost replica set; Stripe is mocked.");

describeWithMongo("Stripe subscription safety — simulated Stripe, REAL replica set", () => {
  jest.setTimeout(60000);
  let mongoose, User, Subscription, Lifecycle, revoke, app, controller;
  let user, customers, subscriptions, checkouts, schedules;
  const envNames = ["STRIPE_SECRET_KEY", "ENABLE_VIP_CHECKOUT", "FRONTEND_URL", "STRIPE_SUBSCRIPTION_PRICE_ID", "STRIPE_SUBSCRIPTION_FENCE_READY", "STRIPE_VIP_SILVER_PRICE_ID"];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) throw new Error("Disposable localhost MongoDB only");
    mongoose = require("mongoose");
    // Do not migrate the unrelated pre-existing Message partial index in MongoDB 6.
    await mongoose.connect(uri, { autoIndex: false });
    User = require("../../models/User.js");
    Subscription = require("../../models/Subscription.js");
    Lifecycle = require("../../models/StripeSubscriptionLifecycle.js");
    revoke = require("../faceReference.service.js").revokeFaceReferenceForAccountDeletion;
    controller = require("../../controllers/subscription.controller.js");
    const express = require("express");
    app = express();
    app.use(express.json());
    app.use("/api/user", require("../../routes/user.routes.js"));
    app.use("/api/subscriptions", require("../../routes/subscription.routes.js"));
    for (const model of Object.values(mongoose.models)) await model.createCollection();
  });

  afterAll(async () => {
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
    if (mongoose?.connection.readyState) await mongoose.disconnect();
  });

  beforeEach(async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_not_a_real_key";
    process.env.ENABLE_VIP_CHECKOUT = "true";
    process.env.FRONTEND_URL = "https://example.invalid";
    process.env.STRIPE_SUBSCRIPTION_PRICE_ID = "price_synthetic";
    customers = new Map(); subscriptions = new Map(); checkouts = []; schedules = [];
    revoke.mockReset().mockResolvedValue({ scheduled: false });
    user = await User.create({ username: "stripe_fixture", email: "synthetic@example.invalid", password: "synthetic-password" });
    mockStripe.customers.create = jest.fn(async (parameters) => {
      const row = { id: `cus_C${customers.size + 1}`, metadata: parameters.metadata };
      customers.set(row.id, row); return row;
    });
    mockStripe.customers.retrieve = jest.fn(async (id) => {
      if (!customers.has(id)) throw new Error("Synthetic missing customer");
      return customers.get(id);
    });
    mockStripe.subscriptions.retrieve = jest.fn(async (id) => {
      if (!subscriptions.has(id)) throw new Error("Synthetic missing subscription");
      return subscriptions.get(id);
    });
    mockStripe.subscriptions.list = jest.fn(async ({ customer }) => ({
      data: [...subscriptions.values()].filter((row) => row.customer === customer), has_more: false,
    }));
    mockStripe.subscriptions.cancel = jest.fn(async () => { throw new Error("Unexpected cancellation"); });
    mockStripe.checkout.sessions.create = jest.fn(async (parameters) => {
      const row = { id: `cs_S${checkouts.length + 1}`, customer: parameters.customer,
        mode: parameters.mode, status: "open", url: "https://example.invalid/synthetic-checkout" };
      checkouts.push(row); return row;
    });
    mockStripe.checkout.sessions.list = jest.fn(async ({ customer }) => ({
      data: checkouts.filter((row) => row.customer === customer && row.status === "open"), has_more: false,
    }));
    mockStripe.subscriptionSchedules.list = jest.fn(async () => ({ data: schedules, has_more: false }));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  });

  const request = () => require("supertest")(app);
  const removeAccount = () => request().delete("/api/user/me").set("x-test-user", String(user._id));
  const checkout = () => request().post("/api/subscriptions/checkout").set("x-test-user", String(user._id));
  async function prime(remoteStatus = "canceled", localStatus = "canceled") {
    customers.set("cus_C1", { id: "cus_C1", metadata: { userId: String(user._id) } });
    subscriptions.set("sub_S1", { id: "sub_S1", customer: "cus_C1", status: remoteStatus, metadata: { userId: String(user._id) } });
    await Subscription.create({ user: user._id, stripeCustomerId: "cus_C1", stripeSubscriptionId: "sub_S1", status: localStatus });
    await Lifecycle.create({ _id: user._id, customerIds: ["cus_C1"], review: { required: false } });
  }
  async function expectBlocked(response, status = 409) {
    expect(response.status).toBe(status);
    expect(response.body.ok).not.toBe(true);
    expect(await User.findById(user._id)).not.toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  }

  test("rollout must be explicitly fenced before any deletion is allowed", async () => {
    delete process.env.STRIPE_SUBSCRIPTION_FENCE_READY;
    await expectBlocked(await removeAccount(), 503);
  });

  test("new account without Stripe history deletes without provider calls", async () => {
    expect((await removeAccount()).status).toBe(200);
    expect(mockStripe.customers.retrieve).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect((await Lifecycle.findById(user._id)).phase).toBe("deleted");
  });

  test.each(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"])(
    "Stripe %s blocks deletion despite local canceled, BEFORE biometrics", async (status) => {
      await prime(status);
      const response = await removeAccount();
      await expectBlocked(response);
      expect(response.body.code).toBe("STRIPE_SUBSCRIPTION_ACTION_REQUIRED");
    });

  test("cancellation scheduled at period end is not confirmed terminal cancellation", async () => {
    await prime("active"); subscriptions.get("sub_S1").cancel_at_period_end = true;
    await expectBlocked(await removeAccount());
  });

  test("confirmed canceled in Stripe permits deletion despite stale local active", async () => {
    await prime("canceled", "active");
    expect((await removeAccount()).status).toBe(200);
    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_S1");
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  test("Stripe unavailable returns 503, preserves user/session state and supports retry", async () => {
    await prime();
    mockStripe.subscriptions.retrieve.mockRejectedValueOnce(new Error("Synthetic timeout"));
    await expectBlocked(await removeAccount(), 503);
    expect((await removeAccount()).status).toBe(200);
  });

  test("missing configuration fails closed when known identifiers require verification", async () => {
    await prime(); delete process.env.STRIPE_SECRET_KEY;
    await expectBlocked(await removeAccount(), 503);
  });

  test("invalid local Stripe identifier cannot be treated as canceled or missing", async () => {
    await prime(); await Subscription.updateOne({ user: user._id }, { stripeSubscriptionId: "not-a-stripe-id" });
    await expectBlocked(await removeAccount(), 503);
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  test("incomplete Stripe pagination fails closed", async () => {
    await prime(); mockStripe.subscriptions.list.mockResolvedValue({ data: [], has_more: true });
    await expectBlocked(await removeAccount(), 503);
  });

  test("all subscription pages are checked before deletion is allowed", async () => {
    await prime();
    mockStripe.subscriptions.list.mockResolvedValueOnce({ data: [subscriptions.get("sub_S1")], has_more: true })
      .mockResolvedValueOnce({ data: [{ id: "sub_S2", customer: "cus_C1", status: "active" }], has_more: false });
    await expectBlocked(await removeAccount());
    expect(mockStripe.subscriptions.list.mock.calls[1][0].starting_after).toBe("sub_S1");
  });

  test("additional renewable subscription on the same customer blocks deletion", async () => {
    await prime(); subscriptions.set("sub_S2", { id: "sub_S2", customer: "cus_C1", status: "active" });
    await expectBlocked(await removeAccount());
  });

  test("open subscription Checkout and future schedules block without cancellation", async () => {
    await prime(); checkouts.push({ id: "cs_S1", customer: "cus_C1", mode: "subscription", status: "open" });
    await expectBlocked(await removeAccount());
    checkouts[0].status = "expired";
    schedules.push({ id: "sub_sched_S1", status: "not_started" });
    await expectBlocked(await removeAccount());
  });

  test("legacy untracked accounts enter manual review rather than being assumed subscription-free", async () => {
    await User.collection.updateOne({ _id: user._id }, { $unset: { stripeSubscriptionTrackingVersion: "" } });
    await expectBlocked(await removeAccount());
    expect((await Lifecycle.findById(user._id)).review.required).toBe(true);
    // Saving/hydrating a historical account must never backfill provenance.
    const old = await User.findById(user._id); old.bio = "synthetic"; await old.save();
    await User.updateOne({ _id: user._id }, { stripeSubscriptionTrackingVersion: 1 });
    expect((await User.collection.findOne({ _id: user._id })).stripeSubscriptionTrackingVersion).toBeUndefined();
  });

  test("local active without sufficient identifiers requires manual review", async () => {
    await Subscription.create({ user: user._id, status: "active" });
    const response = await removeAccount(); await expectBlocked(response);
    expect(response.body.resolution).toBe("manual_review");
  });

  test("customer ownership mismatch requires review; email is never used for linking", async () => {
    await prime(); customers.get("cus_C1").metadata.userId = String(new mongoose.Types.ObjectId());
    await expectBlocked(await removeAccount());
    expect((await Lifecycle.findById(user._id)).review.reason).toBe("customer_ownership_unverified");
  });

  test("two concurrent Checkouts create one customer and one open session", async () => {
    const responses = await Promise.all([checkout(), checkout()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.customers.create.mock.calls[0][1].idempotencyKey).toBeTruthy();
    expect((await Lifecycle.findById(user._id)).customerIds).toHaveLength(1);
  });

  test("legacy and tier Checkout share the same customer/session fence", async () => {
    process.env.STRIPE_VIP_SILVER_PRICE_ID = "price_synthetic_silver";
    const tier = request().post("/api/subscriptions/subscribe-tier").set("x-test-user", String(user._id)).send({ tier: "silver" });
    const responses = await Promise.all([checkout(), tier]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test("a local save failure after customer creation does not create another customer on retry", async () => {
    jest.spyOn(Subscription, "findOneAndUpdate").mockRejectedValueOnce(new Error("Synthetic local save error"));
    expect((await checkout()).status).toBe(503);
    expect((await checkout()).status).toBe(200);
    expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
  });

  test("unknown customer creation is durably recorded and cannot be silently retried/unlocked", async () => {
    mockStripe.customers.create.mockRejectedValueOnce(new Error("Synthetic response lost"));
    expect((await checkout()).body.resolution).toBe("manual_review");
    const state = await Lifecycle.findById(user._id);
    expect(state.lastMutation.status).toBe("unknown"); expect(state.lastMutation.key).toBeTruthy();
    expect(state.review.required).toBe(true);
    await expectBlocked(await removeAccount());
    expect((await checkout()).status).toBe(409);
    expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
  });

  test("deletion cannot pass an in-flight Checkout, and no Checkout starts after deletion", async () => {
    let entered, finish;
    const enteredPromise = new Promise((resolve) => { entered = resolve; });
    const finishPromise = new Promise((resolve) => { finish = resolve; });
    const create = mockStripe.checkout.sessions.create.getMockImplementation();
    mockStripe.checkout.sessions.create.mockImplementationOnce(async (...args) => {
      entered(); await finishPromise; return create(...args);
    });
    const pending = checkout().then((response) => response);
    await enteredPromise;
    const blocked = await removeAccount();
    expect([409, 503]).toContain(blocked.status); expect(revoke).not.toHaveBeenCalled();
    finish(); expect((await pending).status).toBe(200);
    await expectBlocked(await removeAccount()); // confirmed open Checkout still blocks
    checkouts[0].status = "expired";
    expect((await removeAccount()).status).toBe(200);
    expect((await checkout()).status).toBe(404);
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test("two deletion requests and repeated deletion never duplicate a successful deletion", async () => {
    await prime();
    const results = await Promise.all([removeAccount(), removeAccount()]);
    expect(results.map((row) => row.status).sort()).toEqual([200, 404]);
    expect((await removeAccount()).status).toBe(404);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  test("MongoDB rollback restores Subscription and the deletion tombstone; retry succeeds", async () => {
    await prime();
    jest.spyOn(User, "findByIdAndDelete").mockRejectedValueOnce(new Error("Synthetic transaction abort"));
    const response = await removeAccount();
    expect(response.status).toBe(503);
    expect(await User.findById(user._id)).not.toBeNull();
    expect(await Subscription.findOne({ user: user._id })).not.toBeNull();
    expect((await Lifecycle.findById(user._id)).phase).toBe("idle");
    expect((await removeAccount()).status).toBe(200);
  });

  test("only the existing explicit cancellation request can modify the external subscription", async () => {
    await prime("active", "active"); await expectBlocked(await removeAccount());
    mockStripe.subscriptions.cancel.mockImplementation(async (id) => {
      const sub = subscriptions.get(id); sub.status = "canceled"; return sub;
    });
    const result = await request().delete("/api/subscriptions/cancel").set("x-test-user", String(user._id));
    expect(result.status).toBe(200);
    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(mockStripe.subscriptions.cancel.mock.calls[0][2].idempotencyKey).toBeTruthy();
    expect((await removeAccount()).status).toBe(200);
    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  test("an unknown cancellation result is recorded, never assumed canceled or automatically repeated", async () => {
    await prime("active", "active");
    mockStripe.subscriptions.cancel.mockRejectedValueOnce(new Error("Synthetic cancellation response lost"));
    const result = await request().delete("/api/subscriptions/cancel").set("x-test-user", String(user._id));
    expect(result.status).toBe(409); expect(result.body.resolution).toBe("manual_review");
    expect((await Lifecycle.findById(user._id)).lastMutation.status).toBe("unknown");
    expect((await Subscription.findOne({ user: user._id })).status).toBe("active");
    const deletion = await removeAccount(); expect(deletion.status).toBe(409);
    expect(revoke).not.toHaveBeenCalled(); expect(mockStripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  test("Stripe reads finish before biometrics and are never repeated inside the MongoDB transaction", async () => {
    await prime();
    revoke.mockImplementation(async () => {
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
      expect(mockStripe.subscriptionSchedules.list).toHaveBeenCalledTimes(1);
      return { scheduled: false };
    });
    expect((await removeAccount()).status).toBe(200);
    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    expect((await Lifecycle.findById(user._id)).customerIds).toHaveLength(0);
    expect((await Lifecycle.findById(user._id)).review.required).toBe(false);
  });

  test("a webhook already holding the fence blocks deletion before biometric scheduling", async () => {
    await prime("active", "active");
    let entered, finish;
    const ready = new Promise((resolve) => { entered = resolve; });
    const released = new Promise((resolve) => { finish = resolve; });
    const retrieve = mockStripe.subscriptions.retrieve.getMockImplementation();
    mockStripe.subscriptions.retrieve.mockImplementationOnce(retrieve).mockImplementationOnce(async (...args) => {
      entered(); await released; return retrieve(...args);
    });
    const pending = controller.handleSubscriptionWebhook({ id: "evt_S1", type: "checkout.session.completed", data: { object: {
      mode: "subscription", payment_status: "paid", subscription: "sub_S1", customer: "cus_C1", metadata: { userId: String(user._id) },
    } } });
    await ready;
    await expectBlocked(await removeAccount(), 503);
    finish(); await pending;
    expect(await User.findById(user._id)).not.toBeNull();
    await expectBlocked(await removeAccount());
  });

  test("late completed Checkout webhook cannot recreate Subscription after deletion", async () => {
    await prime(); expect((await removeAccount()).status).toBe(200);
    subscriptions.get("sub_S1").status = "active"; // provider fixture for an old delayed event
    await controller.handleSubscriptionWebhook({ id: "evt_S1", type: "checkout.session.completed", data: { object: {
      mode: "subscription", payment_status: "paid", subscription: "sub_S1", customer: "cus_C1", metadata: { userId: String(user._id) },
    } } });
    expect(await Subscription.countDocuments({ user: user._id })).toBe(0);
    expect((await Lifecycle.findById(user._id)).phase).toBe("deleted");
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  test.each(["active", "canceled"])("administrative hard deletion cannot bypass Stripe %s verification", async (status) => {
    await prime(status);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await require("../../controllers/admin.controller.js").hardDeleteUser({
      params: { id: String(user._id) }, userId: String(new mongoose.Types.ObjectId()), userRole: "admin", ip: "127.0.0.1",
    }, res);
    if (status === "active") {
      await expectBlocked({ status: res.statusCode, body: res.body });
    } else {
      expect(res.statusCode).toBe(200);
      expect(await User.findById(user._id)).toBeNull();
      expect((await Lifecycle.findById(user._id)).phase).toBe("deleted");
      expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    }
  });
});
