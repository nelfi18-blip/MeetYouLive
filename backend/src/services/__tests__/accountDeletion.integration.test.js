"use strict";

// REAL MongoDB transactions; only the HTTP identity and AWS boundary are
// simulated. Never use a production URI: fixtures are deleted after each test.
const uri = process.env.INTEGRATION_MONGO_URI;
const describeWithMongo = uri ? describe : describe.skip;
if (!uri) console.warn("[accountDeletion.integration] Set INTEGRATION_MONGO_URI to a disposable replica set.");

jest.mock("../../lib/rekognitionClient.js", () => ({ deleteFaces: jest.fn() }));
jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => { req.userId = req.get("x-test-user"); next(); },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

describeWithMongo("account deletion — REAL MongoDB rollback, isolation and retries", () => {
  jest.setTimeout(60000);
  let mongoose, User, Chat, Message, Live, Profile, models, service, app;
  let FaceReference, FaceReferenceDeletion, rekognition, faceService, Lifecycle;
  let target, peer, outsider, chat, independentChat;
  const originalFence = process.env.STRIPE_SUBSCRIPTION_FENCE_READY;
  const originalKey = process.env.FACE_REFERENCE_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.STRIPE_SUBSCRIPTION_FENCE_READY = "true";
    // Fail closed rather than allowing a mistyped remote/Atlas URI.
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) {
      throw new Error("Account deletion tests require a disposable localhost MongoDB replica set.");
    }
    mongoose = require("mongoose");
    // This suite tests deletion/transactions, not schema index migrations.
    // In particular Message's pre-existing partial index uses $ne, unsupported
    // by MongoDB 6. Do not change production schemas to run these fixtures.
    await mongoose.connect(uri, { autoIndex: false });
    User = require("../../models/User.js");
    Lifecycle = require("../../models/StripeSubscriptionLifecycle.js");
    Chat = require("../../models/Chat.js");
    Message = require("../../models/Message.js");
    Live = require("../../models/Live.js");
    Profile = require("../../models/CreatorPayoutProfile.js");
    const names = ["AgencyRelationship", "AnalyticsEvent", "Chat", "ChatProtectionAttempt",
      "CoinTransaction", "CreatorPayoutProfile", "FaceReferenceAudit", "Gift", "Like",
      "Live", "Message", "Notification", "Payout", "Purchase", "Report", "Subscription", "Video"];
    models = names.map((name) => require(`../../models/${name}.js`));
    FaceReference = require("../../models/FaceReference.js");
    FaceReferenceDeletion = require("../../models/FaceReferenceDeletion.js");
    rekognition = require("../../lib/rekognitionClient.js");
    faceService = require("../faceReference.service.js");
    service = require("../accountDeletion.service.js");
    // Create collections BEFORE starting any transaction; the real _id indexes
    // still enforce identity and concurrent deletion conflicts.
    for (const model of [...models, User, FaceReference, FaceReferenceDeletion, Lifecycle]) await model.createCollection();
    const express = require("express");
    app = express();
    app.use(express.json());
    app.use("/api/user", require("../../routes/user.routes.js"));
  });

  afterAll(async () => {
    if (originalFence === undefined) delete process.env.STRIPE_SUBSCRIPTION_FENCE_READY;
    else process.env.STRIPE_SUBSCRIPTION_FENCE_READY = originalFence;
    if (originalKey === undefined) delete process.env.FACE_REFERENCE_ENCRYPTION_KEY;
    else process.env.FACE_REFERENCE_ENCRYPTION_KEY = originalKey;
    if (mongoose?.connection.readyState) await mongoose.disconnect();
  });

  beforeEach(async () => {
    rekognition.deleteFaces.mockReset();
    const makeUser = (name) => User.create({ username: name, email: `${name}@example.invalid`,
      password: "synthetic-password", role: "creator", coins: 123, earningsCoins: 456 });
    target = await makeUser("deletion_target");
    peer = await makeUser("deletion_peer");
    outsider = await makeUser("deletion_unrelated");
    await User.updateOne({ _id: peer._id }, { $set: {
      followers: [target._id, outsider._id], following: [target._id],
      blockedUsers: [target._id], followersCount: 2,
    } });
    chat = await Chat.create({ participants: [target._id, peer._id] });
    independentChat = await Chat.create({ participants: [peer._id, outsider._id] });
    await Message.create([
      { chat: chat._id, sender: target._id, text: "target synthetic message" },
      { chat: chat._id, sender: peer._id, text: "incoming synthetic message, found only by chatIds" },
      { chat: independentChat._id, sender: outsider._id, text: "unrelated synthetic message" },
    ]);
    // Persist both matching and unrelated records for EVERY cleanup collection.
    // Raw inserts keep fixture data minimal; the models, queries and MongoDB
    // transactions themselves remain real and unmocked.
    for (const model of models.filter((m) => ![Chat, Message].includes(m))) {
      const record = (user, other) => ({ _id: new mongoose.Types.ObjectId(),
        creator: user._id, user: user._id, userId: user._id,
        streamKey: String(user._id),
        sender: user._id, receiver: other._id, senderId: user._id, recipientId: other._id,
        from: user._id, to: other._id, reporter: user._id, reportedUserId: other._id,
        parentCreator: user._id, subCreator: other._id,
        chatId: user === target ? chat._id : independentChat._id,
        data: { fromUserId: user._id },
        amount: 10, amountCoins: 100, amountUsd: 10, status: "paid",
        paymentDetails: "synthetic@example.invalid", externalReference: "synthetic-payment",
      });
      const fixtures = [record(target, peer), record(outsider, peer)];
      if (model.modelName === "Subscription") fixtures.forEach((fixture) => { fixture.status = "inactive"; });
      await model.collection.insertMany(fixtures);
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [...models, User, FaceReference, FaceReferenceDeletion, Lifecycle]) await model.deleteMany({});
  });

  async function snapshot() {
    const result = {};
    for (const model of [...models, User]) {
      result[model.modelName] = await model.collection.find({}).sort({ _id: 1 }).toArray();
    }
    return result;
  }

  async function expectCompleteDeletion() {
    expect(await User.findById(target._id)).toBeNull();
    expect(await Chat.findById(chat._id)).toBeNull();
    expect(await Message.countDocuments({ chat: chat._id })).toBe(0);
    expect(await Message.countDocuments({ chat: independentChat._id })).toBe(1);
    expect(await Chat.findById(independentChat._id)).not.toBeNull();
    for (const model of models.filter((m) => ![Chat, Message].includes(m))) {
      expect(await model.countDocuments()).toBe(1); // only the unrelated record survives
      expect(await model.collection.findOne({ userId: outsider._id })).not.toBeNull();
    }
    const other = await User.findById(outsider._id);
    expect(other.coins).toBe(123);
    expect(other.earningsCoins).toBe(456);
    const related = await User.findById(peer._id);
    expect(related.followers.map(String)).toEqual([String(outsider._id)]);
    expect(related.following).toHaveLength(0);
    expect(related.blockedUsers).toHaveLength(0);
    expect(related.followersCount).toBe(1);
  }

  test.each([
    ["message deletion", () => Message, "deleteMany"],
    ["after chat deletion", () => Live, "deleteMany"],
    ["private payout profile", () => Profile, "deleteMany"],
    ["after financial cleanup", () => User, "updateMany"],
    ["final user deletion", () => User, "findByIdAndDelete"],
  ])("failure at %s rolls back ALL MongoDB data including balances and payout profile", async (_name, model, method) => {
    const before = await snapshot();
    jest.spyOn(model(), method).mockRejectedValueOnce(new Error("injected mandatory write failure"));
    await expect(service.deleteUserAccount(target._id)).rejects.toMatchObject({ retriable: true });
    expect(await snapshot()).toEqual(before);
  });

  test("retry after a post-chat failure rediscovers chatIds and deletes incoming messages", async () => {
    jest.spyOn(Live, "deleteMany").mockRejectedValueOnce(new Error("injected post-chat failure"));
    await expect(service.deleteUserAccount(target._id)).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_CLEANUP_PENDING",
    });
    expect(await Chat.findById(chat._id)).not.toBeNull();
    expect(await Message.countDocuments({ chat: chat._id, sender: peer._id })).toBe(1);
    await service.deleteUserAccount(target._id);
    await expectCompleteDeletion();
  });

  test("successful deletion commits every mandatory cleanup and isolates unrelated users", async () => {
    const before = await snapshot();
    const result = await service.deleteUserAccount(target._id);
    expect(String(result._id)).toBe(String(target._id));
    await expectCompleteDeletion();
    const after = await snapshot();
    expect(after.User.find((doc) => String(doc._id) === String(outsider._id))).toEqual(
      before.User.find((doc) => String(doc._id) === String(outsider._id))
    );
    for (const model of models) {
      const unrelatedBefore = before[model.modelName].filter((doc) =>
        String(doc.userId) === String(outsider._id) || String(doc._id) === String(independentChat._id) ||
        String(doc.chat) === String(independentChat._id));
      for (const doc of unrelatedBefore) expect(after[model.modelName]).toContainEqual(doc);
    }
  });

  test("repeated deletion is idempotent and does not run destructive cleanup twice", async () => {
    await service.deleteUserAccount(target._id);
    const before = await snapshot();
    const cleanupSpy = jest.spyOn(Message, "deleteMany");
    await expect(service.deleteUserAccount(target._id)).resolves.toBeNull();
    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  test("two concurrent requests commit one deletion, with the loser becoming a no-op", async () => {
    // Parallel requests are intentional; all writes WITHIN each transaction are sequential.
    const results = await Promise.all([
      service.deleteUserAccount(target._id), service.deleteUserAccount(target._id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
    await expectCompleteDeletion();
  });

  const deleteHttp = () => require("supertest")(app).delete("/api/user/me").set("x-test-user", String(target._id));

  test("HTTP returns 503/retriable rather than 200 after a real transaction abort", async () => {
    const before = await snapshot();
    jest.spyOn(Message, "deleteMany").mockRejectedValueOnce(new Error("injected message failure"));
    const response = await deleteHttp();
    expect(response.status).toBe(503);
    expect(response.body.retriable).toBe(true);
    expect(response.body.ok).not.toBe(true);
    expect(await snapshot()).toEqual(before);
    expect((await deleteHttp()).status).toBe(200);
    await expectCompleteDeletion();
  });

  test("HTTP maps payout-profile failure to 503 and keeps the private profile intact", async () => {
    jest.spyOn(Profile, "deleteMany").mockRejectedValueOnce(new Error("injected profile failure"));
    const response = await deleteHttp();
    expect(response.status).toBe(503);
    expect(response.body.retriable).toBe(true);
    expect(await Profile.countDocuments({ creator: target._id })).toBe(1);
    expect(await User.findById(target._id)).not.toBeNull();
  });

  test("HTTP confirms success only after commit and repeated requests cannot claim another deletion", async () => {
    const response = await deleteHttp();
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    await expectCompleteDeletion();
    expect((await deleteHttp()).status).toBe(404);
  });

  test("two overlapping HTTP requests never both report a successful deletion", async () => {
    const results = await Promise.all([deleteHttp(), deleteHttp()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 404]);
    await expectCompleteDeletion();
  });

  test("durable biometric deletion survives rollback, retries and final user deletion", async () => {
    const { encryptFaceId } = require("../../lib/faceReferenceCrypto.js");
    const key = Buffer.alloc(32, 7).toString("base64"); // synthetic test key only
    process.env.FACE_REFERENCE_ENCRYPTION_KEY = key;
    await FaceReference.create({ userId: target._id, collectionId: "synthetic-collection",
      encryptedFaceId: encryptFaceId("synthetic-face-id", key), status: "active",
      consentedAt: new Date(), retentionExpiresAt: new Date(Date.now() + 86400000) });
    rekognition.deleteFaces.mockRejectedValue(new Error("simulated AWS outage"));
    jest.spyOn(Message, "deleteMany").mockRejectedValueOnce(new Error("injected MongoDB failure"));
    await expect(service.deleteUserAccount(target._id)).rejects.toMatchObject({ retriable: true });
    expect(await User.findById(target._id)).not.toBeNull();
    expect((await FaceReference.findOne({ userId: target._id })).status).toBe("revoked");
    const pending = await FaceReferenceDeletion.findOne({ userId: target._id });
    expect(pending.status).toBe("pending");
    await service.deleteUserAccount(target._id);
    expect(await FaceReferenceDeletion.countDocuments({ userId: target._id })).toBe(1);
    expect((await FaceReferenceDeletion.findById(pending._id)).status).toBe("pending");
    expect(rekognition.deleteFaces).toHaveBeenCalledTimes(1);
    rekognition.deleteFaces.mockResolvedValue({});
    expect(await faceService.retryPendingFaceReferenceDeletions()).toMatchObject({ confirmed: 1 });
    expect((await FaceReferenceDeletion.findById(pending._id)).status).toBe("confirmed");
    expect(await User.findById(target._id)).toBeNull();
  });
});
