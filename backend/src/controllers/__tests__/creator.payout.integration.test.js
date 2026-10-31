"use strict";

// REAL MongoDB integration tests for requestPayout's atomic, idempotent
// transaction. Unlike `creator.payout.test.js` (mocked mongoose session and
// mocked User/Payout models), this file connects to an ACTUAL MongoDB
// replica set — required for multi-document transactions — and exercises
// the REAL Mongoose models and the REAL `requestPayout` controller. No
// mocks of User, Payout, or the session are used here: `abortTransaction`,
// `commitTransaction`, concurrent sessions, and the unique `requestId`
// index are all exercised against a genuine `mongod` server.
//
// This suite requires a reachable MongoDB REPLICA SET URI in the
// `INTEGRATION_MONGO_URI` environment variable (transactions are not
// supported on a standalone `mongod`). If that variable is not set, the
// whole suite is SKIPPED — not failed — so routine `npm test` runs (and CI,
// until/unless it provisions a Mongo service) are unaffected.
//
// How this was run for this change (documented for the PR): a disposable,
// local-only MongoDB 6 container was started and initiated as a
// single-node replica set — no Atlas, no production data, no real
// credentials:
//   docker run -d --name mytests-mongo -p 27117:27017 mongo:6 --replSet rs0 --bind_ip_all
//   docker exec mytests-mongo mongosh --quiet --eval \
//     "rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:27017'}]})"
//   INTEGRATION_MONGO_URI="mongodb://127.0.0.1:27117/meetyoulive_payout_test?replicaSet=rs0&directConnection=true" \
//     npx jest src/controllers/__tests__/creator.payout.integration.test.js
//
// NEVER point this at a production/Atlas URI: these tests freely create
// and delete Users/Payouts in whatever database the URI points to.

const INTEGRATION_MONGO_URI = process.env.INTEGRATION_MONGO_URI;

const describeIfRealMongo = INTEGRATION_MONGO_URI ? describe : describe.skip;

if (!INTEGRATION_MONGO_URI) {
  // Visible in the test summary even when the suite itself is skipped, so
  // it's obvious WHY (rather than silently vanishing from the run).
  // eslint-disable-next-line no-console
  console.warn(
    "[creator.payout.integration.test.js] SKIPPED — set INTEGRATION_MONGO_URI to a disposable " +
      "local MongoDB *replica set* URI to run these real-transaction tests (see file header for " +
      "a docker-based example). Transactions require a replica set; a standalone mongod will not work."
  );
}

describeIfRealMongo("requestPayout — REAL MongoDB replica-set transaction coverage", () => {
  jest.setTimeout(30000);

  let mongoose;
  let User;
  let Payout;
  let CreatorPayoutProfile;
  let requestPayout;

  beforeAll(async () => {
    mongoose = require("mongoose");
    await mongoose.connect(INTEGRATION_MONGO_URI);
    User = require("../../models/User.js");
    Payout = require("../../models/Payout.js");
    CreatorPayoutProfile = require("../../models/CreatorPayoutProfile.js");
    ({ requestPayout } = require("../creator.controller.js"));
  });

  afterAll(async () => {
    if (mongoose?.connection?.readyState) {
      await mongoose.connection.close();
    }
  });

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Payout.deleteMany({}),
      CreatorPayoutProfile.deleteMany({}),
    ]);
  });

  function makeRes() {
    const res = {};
    res.status = jest.fn((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn((payload) => {
      res.body = payload;
      return res;
    });
    return res;
  }

  let seq = 0;
  // Creates an approved creator AND a complete `CreatorPayoutProfile`
  // (PayPal destination, valid email) for it — every creator used by these
  // tests to call `requestPayout` needs one, otherwise the
  // PAYOUT_PROFILE_INCOMPLETE gate rejects the request before it ever
  // reaches the transaction these tests exercise. The resolved PayPal email
  // is attached (not persisted) to the returned user as a convenience for
  // building matching request bodies in each test.
  async function createApprovedCreator(overrides = {}, payoutProfileOverrides = {}) {
    seq += 1;
    const tag = `${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 8)}`;
    const user = await User.create({
      role: "creator",
      creatorStatus: "approved",
      username: `creator_${tag}`,
      email: `creator_${tag}@example.com`,
      password: "hashed-placeholder",
      earningsCoins: 250,
      ...overrides,
    });

    const paypalEmail = payoutProfileOverrides.paypalEmail || `payout_${tag}@example.com`;
    await CreatorPayoutProfile.create({
      creator: user._id,
      legalName: `Creator ${tag}`,
      residenceCountry: "US",
      taxResidenceCountry: "US",
      beneficiaryType: "individual",
      destinationMethod: "paypal",
      ...payoutProfileOverrides,
      paypalEmail,
    });

    user.paypalEmail = paypalEmail;
    return user;
  }

  test("[REAL MONGO] success: reserves the balance and creates the payout atomically", async () => {
    const user = await createApprovedCreator();
    const res = makeRes();

    await requestPayout(
      { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail } },
      res
    );

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.body.ok).toBe(true);

    const reloaded = await User.findById(user._id);
    expect(reloaded.earningsCoins).toBe(0);

    const payouts = await Payout.find({ creator: user._id });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amountCoins).toBe(250);
    expect(payouts[0].status).toBe("pending");
  });

  test("[REAL MONGO] insufficient balance: a creator below the minimum is rejected without opening a transaction", async () => {
    const user = await createApprovedCreator({ earningsCoins: 40 });
    const res = makeRes();

    await requestPayout(
      { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);

    const reloaded = await User.findById(user._id);
    expect(reloaded.earningsCoins).toBe(40);
    await expect(Payout.find({ creator: user._id })).resolves.toHaveLength(0);
  });

  test("[REAL MONGO] rollback: a forced failure after the balance reservation leaves earningsCoins untouched on the server", async () => {
    const user = await createApprovedCreator();

    // Force Payout.create to fail INSIDE the transaction for this one call
    // only, so commitTransaction never runs. This proves a REAL
    // abortTransaction reverts the already-applied $set on the server —
    // something a mocked session (see creator.payout.test.js) cannot prove.
    const spy = jest.spyOn(Payout, "create").mockImplementationOnce(async () => {
      throw new Error("forced failure to verify rollback");
    });

    const res = makeRes();
    try {
      await requestPayout(
        { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail } },
        res
      );
    } finally {
      spy.mockRestore();
    }

    expect(res.statusCode).toBe(500);

    const reloaded = await User.findById(user._id);
    expect(reloaded.earningsCoins).toBe(250); // untouched: real server-side rollback

    await expect(Payout.find({ creator: user._id })).resolves.toHaveLength(0);
  });

  test("[REAL MONGO] concurrency: two simultaneous requests for the same creator never both reserve the balance", async () => {
    const user = await createApprovedCreator();

    const resA = makeRes();
    const resB = makeRes();
    await Promise.all([
      requestPayout(
        { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail } },
        resA
      ),
      requestPayout(
        { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail } },
        resB
      ),
    ]);

    const payouts = await Payout.find({ creator: user._id });
    expect(payouts).toHaveLength(1); // only one truly reserved+created

    const successes = [resA, resB].filter((r) => r.body && r.body.ok === true);
    expect(successes).toHaveLength(1);

    const reloaded = await User.findById(user._id);
    expect(reloaded.earningsCoins).toBe(0);
  });

  test("[REAL MONGO] unique index: the server itself rejects a genuine duplicate insert on Payout.requestId", async () => {
    const user = await createApprovedCreator();
    await Payout.create({ creator: user._id, requestId: "dup-key-real-mongo", amountCoins: 50 });

    await expect(
      Payout.create({ creator: user._id, requestId: "dup-key-real-mongo", amountCoins: 50 })
    ).rejects.toMatchObject({ code: 11000 });

    await expect(Payout.find({ creator: user._id })).resolves.toHaveLength(1);
  });

  test("[REAL MONGO] sparse index: two historical-style documents (requestId absent) coexist without colliding on the server", async () => {
    const user = await createApprovedCreator();

    await expect(
      Promise.all([
        Payout.create({ creator: user._id, amountCoins: 10 }),
        Payout.create({ creator: user._id, amountCoins: 20 }),
      ])
    ).resolves.toHaveLength(2);
  });

  test("[REAL MONGO] idempotency replay: repeating the same Idempotency-Key after the balance was reserved returns the original payout, never a second one", async () => {
    const user = await createApprovedCreator();
    const headers = { "idempotency-key": "real-mongo-replay-00001" };

    const first = makeRes();
    await requestPayout(
      { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail }, headers },
      first
    );
    expect(first.body.ok).toBe(true);

    // Balance is now 0 (below the 100-coin minimum) — the replay must still
    // succeed with the ORIGINAL payout, not a fresh 400.
    const second = makeRes();
    await requestPayout(
      { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail }, headers },
      second
    );

    expect(second.statusCode).not.toBe(400);
    expect(second.body.ok).toBe(true);
    expect(String(second.body.payout._id)).toBe(String(first.body.payout._id));

    await expect(Payout.find({ creator: user._id })).resolves.toHaveLength(1);
  });

  test("[REAL MONGO] idempotency conflict: reusing the key with a different destination is rejected with 409, original payout left untouched", async () => {
    const user = await createApprovedCreator();
    const headers = { "idempotency-key": "real-mongo-conflict-00001" };

    const first = makeRes();
    await requestPayout(
      { userId: String(user._id), body: { method: "paypal", paymentDetails: user.paypalEmail }, headers },
      first
    );
    expect(first.body.ok).toBe(true);

    const second = makeRes();
    await requestPayout(
      {
        userId: String(user._id),
        body: { method: "paypal", paymentDetails: `different-${user.paypalEmail}` },
        headers,
      },
      second
    );

    expect(second.statusCode).toBe(409);
    expect(second.body.ok).toBe(false);

    const payouts = await Payout.find({ creator: user._id });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].paymentDetails).toBe(user.paypalEmail); // untouched by the rejected reuse attempt
  });

  test("[REAL MONGO] creator isolation: the same Idempotency-Key used by a different creator never resolves to another creator's payout", async () => {
    const creatorA = await createApprovedCreator();
    const creatorB = await createApprovedCreator();
    const headers = { "idempotency-key": "shared-key-across-real-creators" };

    const resA = makeRes();
    await requestPayout(
      { userId: String(creatorA._id), body: { method: "paypal", paymentDetails: creatorA.paypalEmail }, headers },
      resA
    );
    expect(resA.body.ok).toBe(true);

    const resB = makeRes();
    await requestPayout(
      { userId: String(creatorB._id), body: { method: "paypal", paymentDetails: creatorB.paypalEmail }, headers },
      resB
    );

    // creatorB's own request proceeds as a brand-new payout — it must NOT
    // short-circuit with creatorA's payout, and the unique index (scoped
    // only by requestId, not by creator) would otherwise reject the second
    // insert outright; the controller must mint a fresh identifier when the
    // client-supplied one is already taken by someone else... but since
    // here B supplies the SAME literal key, the real unique index applies
    // server-side and the controller must resolve that without a 500 or
    // leaking A's payout.
    expect(resB.statusCode).not.toBe(500);
    if (resB.body.ok) {
      expect(String(resB.body.payout._id)).not.toBe(String(resA.body.payout._id));
    } else {
      expect(JSON.stringify(resB.body)).not.toMatch(new RegExp(String(resA.body.payout._id)));
    }

    const payoutsA = await Payout.find({ creator: creatorA._id });
    expect(payoutsA).toHaveLength(1);
    expect(String(payoutsA[0]._id)).toBe(String(resA.body.payout._id));
  });
});
