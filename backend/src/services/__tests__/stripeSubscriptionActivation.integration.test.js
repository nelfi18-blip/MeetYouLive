"use strict";
const mockStripe = { customers: {}, subscriptions: {}, checkout: { sessions: {} }, subscriptionSchedules: {} };
jest.mock("stripe", () => jest.fn(() => mockStripe));
jest.mock("../faceReference.service.js", () => ({ revokeFaceReferenceForAccountDeletion: jest.fn(async () => ({ scheduled: false })) }));
jest.mock("../analytics.service.js", () => ({ trackAnalyticsEvent: jest.fn() }));
jest.mock("../essentialNotification.service.js", () => ({ notifySubscription: jest.fn() }));
const uri = process.env.INTEGRATION_MONGO_URI;
const withMongo = uri ? describe : describe.skip;

withMongo("Stripe activation/recovery — synthetic provider, disposable MongoDB", () => {
  jest.setTimeout(60000);
  const env = { ...process.env };
  let mongoose, User, Lifecycle, Subscription, recovery, lifecycle, deletion, user, customers, subs, sessions;
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) throw new Error("Disposable localhost MongoDB only");
    mongoose = require("mongoose");
    await mongoose.connect(uri, { autoIndex: false });
    User = require("../../models/User.js");
    Subscription = require("../../models/Subscription.js");
    Lifecycle = require("../../models/StripeSubscriptionLifecycle.js");
    recovery = require("../stripeSubscriptionRecovery.service.js");
    lifecycle = require("../stripeSubscriptionLifecycle.service.js");
    deletion = require("../accountDeletion.service.js").deleteUserAccount;
    for (const model of Object.values(mongoose.models)) await model.createCollection();
  });
  afterAll(async () => { process.env = env; if (mongoose?.connection.readyState) await mongoose.disconnect(); });
  beforeEach(async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic";
    process.env.ENABLE_VIP_CHECKOUT = "true";
    customers = new Map(); subs = new Map(); sessions = [];
    user = await User.create({ username: "activation_fixture", email: "fixture@example.invalid", password: "synthetic" });
    mockStripe.customers.retrieve = jest.fn(async (id) => customers.get(id));
    mockStripe.customers.create = jest.fn(async () => { throw new Error("Unexpected provider mutation"); });
    mockStripe.subscriptions.retrieve = jest.fn(async (id) => subs.get(id));
    mockStripe.subscriptions.list = jest.fn(async ({ customer }) => ({ data: [...subs.values()].filter((s) => s.customer === customer), has_more: false }));
    mockStripe.subscriptions.cancel = jest.fn(async () => { throw new Error("Unexpected cancellation"); });
    mockStripe.checkout.sessions.retrieve = jest.fn(async (id) => sessions.find((s) => s.id === id));
    mockStripe.checkout.sessions.list = jest.fn(async ({ customer }) => ({ data: sessions.filter((s) => s.customer === customer && s.status === "open"), has_more: false }));
    mockStripe.checkout.sessions.create = jest.fn(async () => { throw new Error("Unexpected replay"); });
    mockStripe.subscriptionSchedules.list = jest.fn(async () => ({ data: [], has_more: false }));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  });
  async function blockedDelete() {
    try { await deletion(user._id); throw new Error("Expected blocked deletion"); }
    catch (error) { expect(error.code).toMatch(/^STRIPE_/); return error; }
  }
  async function historical() {
    await User.collection.updateOne({ _id: user._id }, { $unset: { stripeSubscriptionTrackingVersion: "" } });
    await blockedDelete();
  }
  async function prime(status = "canceled") {
    customers.set("cus_C1", { id: "cus_C1", metadata: { userId: String(user._id) } });
    subs.set("sub_S1", { id: "sub_S1", customer: "cus_C1", status, metadata: { userId: String(user._id) } });
    await Subscription.create({ user: user._id, stripeCustomerId: "cus_C1", stripeSubscriptionId: "sub_S1", status: "active" });
    await Lifecycle.create({ _id: user._id, customerIds: ["cus_C1"], review: { required: false } });
  }
  async function evidence(overrides = {}) {
    const prepared = await recovery.prepareReview(String(user._id));
    return { userId: String(user._id), snapshotSha256: prepared.snapshotSha256,
      evidenceSha256: "a".repeat(64), ticket: "SYNTHETIC/CASE-1131", reviewers: ["reviewer_a", "reviewer_b"],
      historyComplete: true, writersDrained: true, deploymentSha: "b".repeat(40), inspectedAt: new Date().toISOString(),
      customerIds: prepared.customerIds, ...overrides };
  }
  async function unknown(kind = "customer.create") {
    await Lifecycle.create({ _id: user._id, phase: "working", owner: "stopped_worker", review: { required: true },
      lastMutation: { kind, key: "synthetic_key", status: "unknown", startedAt: new Date() } });
  }
  const unknownEvidence = (overrides = {}) => evidence({ mutationKey: "synthetic_key", stoppedOwner: "stopped_worker",
    requestLogReference: "req_synthetic", ...overrides });

  test("gate off persists a receipt with stable deadlines, status and no provider calls", async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "false";
    const first = await blockedDelete(); const second = await blockedDelete();
    expect(first.status).toBe(503);
    expect(second.deletionRequest).toEqual(first.deletionRequest);
    expect(await lifecycle.getDeletionRequest(user._id)).toEqual(first.deletionRequest);
    const receipt = first.deletionRequest;
    expect(receipt.reviewDueAt - receipt.requestedAt).toBe(24 * 3600000);
    expect(receipt.escalateAt - receipt.requestedAt).toBe(72 * 3600000);
    expect(mockStripe.customers.retrieve).not.toHaveBeenCalled();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    expect(lifecycle.sendLifecycleError(res, first)).toBe(true);
    expect(res.json.mock.calls[0][0].deletionRequest.id).toBe(String(user._id));
  });
  test("off-to-on activation closes the original receipt only after confirmed deletion", async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "false";
    const first = await blockedDelete();
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "true";
    await deletion(user._id);
    const state = await Lifecycle.findById(user._id);
    expect(state.phase).toBe("deleted"); expect(state.deletionRequest.status).toBe("completed");
    expect(state.deletionRequest.requestedAt).toEqual(first.deletionRequest.requestedAt);
    expect(await recovery.reviewQueue()).toEqual([]);
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
  test("accounts created off remain historical after activation", async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "false";
    user = await User.create({ username: "pre_gate", email: "pre-gate@example.invalid", password: "synthetic" });
    await blockedDelete(); process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "true";
    expect((await blockedDelete()).resolution).toBe("manual_review");
  });
  test("explicit cancellation is blocked off and succeeds on; activation never cancels", async () => {
    await prime("active");
    const controller = require("../../controllers/subscription.controller.js");
    const cancel = async () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await controller.cancelSubscription({ userId: user._id }, res); return res;
    };
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "false";
    expect((await cancel()).status).toHaveBeenCalledWith(503);
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "true";
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    mockStripe.subscriptions.cancel.mockImplementation(async (id) => { subs.get(id).status = "canceled"; return subs.get(id); });
    const result = await cancel(); expect(result.status).not.toHaveBeenCalled();
    expect(result.json).toHaveBeenCalledWith({ message: "Suscripción cancelada" });
    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });
  test("24h/72h monitoring escalates without losing requests or releasing the fence", async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "false";
    const error = await blockedDelete(); const time = error.deletionRequest.requestedAt.getTime();
    expect((await recovery.reviewQueue(new Date(time + 25 * 3600000)))[0].priority).toBe("overdue");
    expect((await recovery.reviewQueue(new Date(time + 73 * 3600000)))[0].priority).toBe("escalated");
    expect((await Lifecycle.findById(user._id)).deletionRequest.status).toBe("pending");
    expect(await User.exists({ _id: user._id })).toBeTruthy();
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
  test("historical dry run writes nothing; reviewed apply is audited and allows fresh deletion", async () => {
    await historical(); const review = await evidence();
    expect((await recovery.reviewAccount(review, mockStripe)).applied).toBe(false);
    expect((await Lifecycle.findById(user._id)).review.required).toBe(true);
    const result = await recovery.reviewAccount(review, mockStripe, { apply: true });
    const audit = await require("../../models/StripeSubscriptionReview.js").findById(result.evidenceId);
    expect(audit.evidenceSha256).toBe(review.evidenceSha256); expect(audit.reviewers).toEqual(review.reviewers);
    await deletion(user._id); expect(await User.findById(user._id)).toBeNull();
  });
  test("historical customer without metadata needs ID evidence, never email matching", async () => {
    await prime(); customers.get("cus_C1").metadata = {};
    await blockedDelete(); await recovery.reviewAccount(await evidence(), mockStripe, { apply: true });
    expect((await Lifecycle.findById(user._id)).review.legacyCustomerIds).toEqual(["cus_C1"]);
    await deletion(user._id); expect(await User.findById(user._id)).toBeNull();
  });
  test("review does not bypass active subscription checks or cancel anything", async () => {
    await prime("active"); await Lifecycle.updateOne({ _id: user._id }, { "review.required": true });
    const result = await recovery.reviewAccount(await evidence(), mockStripe, { apply: true });
    expect(result.inventory[0].subscriptions[0].status).toBe("active");
    expect((await blockedDelete()).resolution).toBe("subscription");
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
  test.each(["history", "writers", "reviewers", "freshness"])("incomplete %s evidence cannot clear review", async (field) => {
    await historical();
    const invalid = { history: { historyComplete: false }, writers: { writersDrained: false },
      reviewers: { reviewers: ["same", "same"] }, freshness: { inspectedAt: "2020-01-01T00:00:00Z" } };
    await expect(recovery.reviewAccount(await evidence(invalid[field]), mockStripe, { apply: true })).rejects.toThrow();
    expect((await Lifecycle.findById(user._id)).review.required).toBe(true);
  });
  test("stale snapshots cannot overwrite newer evidence", async () => {
    await historical(); const review = await evidence();
    await Lifecycle.updateOne({ _id: user._id }, { "review.reason": "new_evidence" });
    await expect(recovery.reviewAccount(review, mockStripe, { apply: true })).rejects.toThrow("Stale snapshot");
  });
  test("audit failure rolls back fence release", async () => {
    await historical();
    jest.spyOn(require("../../models/StripeSubscriptionReview.js"), "create").mockRejectedValueOnce(new Error("Synthetic audit outage"));
    await expect(recovery.reviewAccount(await evidence(), mockStripe, { apply: true })).rejects.toThrow();
    expect((await Lifecycle.findById(user._id)).review.required).toBe(true);
  });
  test("unknown customer creation preserves its exact ID and retry reuses it", async () => {
    await unknown(); customers.set("cus_C1", { id: "cus_C1", metadata: { userId: String(user._id) } });
    await recovery.reviewAccount(await unknownEvidence({ customerIds: ["cus_C1"], outcome: "confirmed", externalId: "cus_C1" }), mockStripe, { apply: true });
    await lifecycle.withSubscriptionLifecycle(user._id, "checkout", async (context) => {
      expect(await lifecycle.getCheckoutCustomer(context, mockStripe, user)).toBe("cus_C1");
    });
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
  });
  test("unknown Checkout recovery still blocks deletion and duplicate Checkout", async () => {
    await unknown("checkout.create"); customers.set("cus_C1", { id: "cus_C1", metadata: { userId: String(user._id) } });
    sessions.push({ id: "cs_S1", mode: "subscription", customer: "cus_C1", status: "open", metadata: { userId: String(user._id) } });
    await recovery.reviewAccount(await unknownEvidence({ customerIds: ["cus_C1"], outcome: "confirmed", externalId: "cs_S1" }), mockStripe, { apply: true });
    expect((await blockedDelete()).resolution).toBe("subscription");
    await expect(lifecycle.withSubscriptionLifecycle(user._id, "checkout", lifecycle.assertDeletionSafe)).rejects.toMatchObject({ resolution: "subscription" });
  });
  test("unknown cancellation is recovered by readback without replay", async () => {
    await prime(); await Lifecycle.updateOne({ _id: user._id }, { phase: "working", owner: "stopped_worker",
      lastMutation: { kind: "subscription.cancel", key: "synthetic_key", status: "unknown", startedAt: new Date() } });
    await recovery.reviewAccount(await unknownEvidence({ outcome: "confirmed", externalId: "sub_S1" }), mockStripe, { apply: true });
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    await deletion(user._id); expect(await User.findById(user._id)).toBeNull();
  });
  test("elapsed time or absent Stripe objects cannot prove no-effect", async () => {
    await unknown();
    const review = await unknownEvidence({ outcome: "no_effect", requestLogReference: undefined });
    await expect(recovery.reviewAccount(review, mockStripe, { apply: true })).rejects.toThrow("request-log");
    expect((await Lifecycle.findById(user._id)).phase).toBe("working");
  });
  test("two-reviewer authoritative no-effect outcome releases only the stopped operation", async () => {
    await unknown();
    await recovery.reviewAccount(await unknownEvidence({ outcome: "no_effect" }), mockStripe, { apply: true });
    expect((await Lifecycle.findById(user._id)).lastMutation.status).toBe("no_effect");
    await deletion(user._id); expect(await User.findById(user._id)).toBeNull();
  });
  test("a different worker cannot release an interrupted fence", async () => {
    await unknown();
    await expect(recovery.reviewAccount(await unknownEvidence({ outcome: "no_effect", stoppedOwner: "wrong_worker" }), mockStripe, { apply: true })).rejects.toThrow("owner");
  });
  test("provider failure leaves the exact fence unchanged", async () => {
    await prime(); const review = await evidence();
    mockStripe.customers.retrieve.mockRejectedValueOnce(new Error("Synthetic outage"));
    await expect(recovery.reviewAccount(review, mockStripe, { apply: true })).rejects.toThrow();
    expect((await recovery.prepareReview(String(user._id))).snapshotSha256).toBe(review.snapshotSha256);
  });
  test("ownership conflicts and incomplete pages cannot clear review", async () => {
    await prime(); customers.get("cus_C1").metadata.userId = String(new mongoose.Types.ObjectId());
    await expect(recovery.reviewAccount(await evidence(), mockStripe, { apply: true })).rejects.toThrow("conflict");
    customers.get("cus_C1").metadata.userId = String(user._id);
    mockStripe.subscriptions.list.mockResolvedValueOnce({ data: [], has_more: true });
    await expect(recovery.reviewAccount(await evidence(), mockStripe, { apply: true })).rejects.toThrow("pagination");
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
