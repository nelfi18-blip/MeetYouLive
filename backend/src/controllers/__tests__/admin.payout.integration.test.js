"use strict";

// REAL MongoDB integration tests for the admin payout approval/payment-
// confirmation flow (`updatePayout`). Unlike `admin.payout.test.js` (mocked
// mongoose session and mocked Payout/User models), this file connects to
// an ACTUAL MongoDB replica set — required for multi-document transactions
// — and exercises the REAL Mongoose models and the REAL `updatePayout`
// controller. No mocks of Payout, User, or the session are used here:
// `abortTransaction`, `commitTransaction`, concurrent sessions, and the
// atomic `findOneAndUpdate` compare-and-swap are all exercised against a
// genuine `mongod` server.
//
// This suite requires a reachable MongoDB REPLICA SET URI in the
// `INTEGRATION_MONGO_URI` environment variable (transactions are not
// supported on a standalone `mongod`). If that variable is not set, the
// whole suite is SKIPPED — not failed — so routine `npm test` runs (and CI,
// until/unless it provisions a Mongo service) are unaffected.
//
// How this was run for this change (documented for the PR): the same
// disposable, local-only MongoDB 6 container used for
// `creator.payout.integration.test.js` — no Atlas, no production data, no
// real credentials:
//   docker run -d --name mytests-mongo -p 27117:27017 mongo:6 --replSet rs0 --bind_ip_all
//   docker exec mytests-mongo mongosh --quiet --eval \
//     "rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:27017'}]})"
//   INTEGRATION_MONGO_URI="mongodb://127.0.0.1:27117/meetyoulive_admin_payout_test?replicaSet=rs0&directConnection=true" \
//     npx jest src/controllers/__tests__/admin.payout.integration.test.js
//
// NEVER point this at a production/Atlas URI: these tests freely create
// and delete Users/Payouts/StaffAuditLogs in whatever database the URI
// points to. No real external transfer is ever performed — "mark_paid"
// only writes a reference string the test itself supplies.

const INTEGRATION_MONGO_URI = process.env.INTEGRATION_MONGO_URI;

const describeIfRealMongo = INTEGRATION_MONGO_URI ? describe : describe.skip;

if (!INTEGRATION_MONGO_URI) {
  // Visible in the test summary even when the suite itself is skipped, so
  // it's obvious WHY (rather than silently vanishing from the run).
  // eslint-disable-next-line no-console
  console.warn(
    "[admin.payout.integration.test.js] SKIPPED — set INTEGRATION_MONGO_URI to a disposable " +
      "local MongoDB *replica set* URI to run these real-transaction tests (see file header for " +
      "a docker-based example). Transactions require a replica set; a standalone mongod will not work."
  );
}

describeIfRealMongo("updatePayout — REAL MongoDB replica-set transaction coverage", () => {
  jest.setTimeout(30000);

  let mongoose;
  let User;
  let Payout;
  let StaffAuditLog;
  let updatePayout;

  beforeAll(async () => {
    mongoose = require("mongoose");
    await mongoose.connect(INTEGRATION_MONGO_URI);
    User = require("../../models/User.js");
    Payout = require("../../models/Payout.js");
    StaffAuditLog = require("../../models/StaffAuditLog.js");
    ({ updatePayout } = require("../admin.controller.js"));
  });

  afterAll(async () => {
    if (mongoose?.connection?.readyState) {
      await mongoose.connection.close();
    }
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Payout.deleteMany({}), StaffAuditLog.deleteMany({})]);
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

  function makeReq({ id, action, body = {}, adminId }) {
    return {
      params: { id: String(id) },
      body: { action, ...body },
      userId: String(adminId),
      userRole: "admin",
      ip: "127.0.0.1",
    };
  }

  let seq = 0;
  function tag() {
    seq += 1;
    return `${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function createCreator(overrides = {}) {
    const t = tag();
    return User.create({
      role: "creator",
      creatorStatus: "approved",
      username: `creator_${t}`,
      email: `creator_${t}@example.com`,
      password: "hashed-placeholder",
      earningsCoins: 0,
      ...overrides,
    });
  }

  async function createAdmin() {
    const t = tag();
    return User.create({
      role: "admin",
      username: `admin_${t}`,
      email: `admin_${t}@example.com`,
      password: "hashed-placeholder",
    });
  }

  async function createPayout(creator, overrides = {}) {
    return Payout.create({
      creator: creator._id,
      amountCoins: 500,
      amountUsd: 50,
      status: "pending",
      method: "paypal",
      paymentDetails: "creator@example.com",
      ...overrides,
    });
  }

  test("[REAL MONGO] approve: pending -> approved, approvedBy/approvedAt recorded, no balance touched", async () => {
    const creator = await createCreator({ earningsCoins: 0 });
    const admin = await createAdmin();
    const payout = await createPayout(creator);

    const res = makeRes();
    await updatePayout(makeReq({ id: payout._id, action: "approve", adminId: admin._id }), res);

    expect(res.body.ok).toBe(true);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("approved");
    expect(String(reloaded.approvedBy)).toBe(String(admin._id));
    expect(reloaded.approvedAt).toBeTruthy();

    const reloadedCreator = await User.findById(creator._id);
    expect(reloadedCreator.earningsCoins).toBe(0); // approval never touches balances

    const logs = await StaffAuditLog.find({ action: "approve_payout" });
    expect(logs).toHaveLength(1);
  });

  test("[REAL MONGO] reject: status flip and earningsCoins refund commit together (both succeed)", async () => {
    const creator = await createCreator({ earningsCoins: 0 });
    const admin = await createAdmin();
    const payout = await createPayout(creator, { amountCoins: 777 });

    const res = makeRes();
    await updatePayout(
      makeReq({
        id: payout._id,
        action: "reject",
        adminId: admin._id,
        body: { rejectionReason: "Datos bancarios inválidos" },
      }),
      res
    );

    expect(res.body.ok).toBe(true);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("rejected");
    expect(reloaded.rejectionReason).toBe("Datos bancarios inválidos");

    const reloadedCreator = await User.findById(creator._id);
    expect(reloadedCreator.earningsCoins).toBe(777); // refunded exactly once

    const logs = await StaffAuditLog.find({ action: "reject_payout" });
    expect(logs).toHaveLength(1);
  });

  test("[REAL MONGO] rollback: a forced failure after the status flip leaves BOTH the payout status and the balance untouched", async () => {
    const creator = await createCreator({ earningsCoins: 0 });
    const admin = await createAdmin();
    const payout = await createPayout(creator, { amountCoins: 321 });

    // Force the balance refund to fail INSIDE the transaction, so
    // commitTransaction never runs. This proves a REAL abortTransaction
    // reverts the already-applied Payout status flip on the server —
    // something a mocked session cannot prove.
    const spy = jest.spyOn(User, "findByIdAndUpdate").mockImplementationOnce(async () => {
      throw new Error("forced failure to verify rollback");
    });

    const res = makeRes();
    try {
      await updatePayout(
        makeReq({
          id: payout._id,
          action: "reject",
          adminId: admin._id,
          body: { rejectionReason: "forced failure test case" },
        }),
        res
      );
    } finally {
      spy.mockRestore();
    }

    expect(res.statusCode).toBe(500);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("pending"); // untouched: real server-side rollback

    const reloadedCreator = await User.findById(creator._id);
    expect(reloadedCreator.earningsCoins).toBe(0); // never refunded

    const logs = await StaffAuditLog.find({ action: "reject_payout" });
    expect(logs).toHaveLength(0); // no audit entry for a transaction that never committed
  });

  test("[REAL MONGO] mark_paid: approved -> paid requires method + reference, server-stamps paidAt/paidBy", async () => {
    const creator = await createCreator();
    const admin = await createAdmin();
    const payout = await createPayout(creator, { status: "approved", approvedBy: admin._id, approvedAt: new Date() });

    const res = makeRes();
    await updatePayout(
      makeReq({
        id: payout._id,
        action: "mark_paid",
        adminId: admin._id,
        body: { paymentMethodUsed: "zelle", externalReference: "REAL-MONGO-TRX-001" },
      }),
      res
    );

    expect(res.body.ok).toBe(true);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("paid");
    expect(reloaded.paymentMethodUsed).toBe("zelle");
    expect(reloaded.externalReference).toBe("REAL-MONGO-TRX-001");
    expect(String(reloaded.paidBy)).toBe(String(admin._id));
    expect(reloaded.paidAt).toBeTruthy();
    // Approval evidence from the earlier step is preserved, not overwritten.
    expect(String(reloaded.approvedBy)).toBe(String(admin._id));

    const logs = await StaffAuditLog.find({ action: "mark_payout_paid" });
    expect(logs).toHaveLength(1);
  });

  test("[REAL MONGO] invalid transition: a rejected payout can never be marked as paid", async () => {
    const creator = await createCreator();
    const admin = await createAdmin();
    const payout = await createPayout(creator, { status: "rejected", rejectionReason: "fraud suspected" });

    const res = makeRes();
    await updatePayout(
      makeReq({
        id: payout._id,
        action: "mark_paid",
        adminId: admin._id,
        body: { paymentMethodUsed: "zelle", externalReference: "SHOULD-NOT-APPLY" },
      }),
      res
    );

    expect(res.statusCode).toBe(400);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("rejected");
    expect(reloaded.externalReference).toBe("");
    expect(reloaded.paidAt).toBeNull();
  });

  test("[REAL MONGO] invalid transition: an already-paid payout cannot be re-confirmed (no duplicate payment evidence)", async () => {
    const creator = await createCreator();
    const admin = await createAdmin();
    const payout = await createPayout(creator, {
      status: "paid",
      paidAt: new Date(),
      paidBy: admin._id,
      paymentMethodUsed: "zelle",
      externalReference: "ORIGINAL-TRX",
    });

    const res = makeRes();
    await updatePayout(
      makeReq({
        id: payout._id,
        action: "mark_paid",
        adminId: admin._id,
        body: { paymentMethodUsed: "paypal", externalReference: "SECOND-ATTEMPT-TRX" },
      }),
      res
    );

    expect(res.statusCode).toBe(400);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.externalReference).toBe("ORIGINAL-TRX"); // untouched by the rejected re-confirmation
    expect(reloaded.paymentMethodUsed).toBe("zelle");
  });

  test("[REAL MONGO] concurrency — approve: two simultaneous approve requests for the same payout never both succeed", async () => {
    const creator = await createCreator();
    const admin = await createAdmin();
    const payout = await createPayout(creator);

    const resA = makeRes();
    const resB = makeRes();
    await Promise.all([
      updatePayout(makeReq({ id: payout._id, action: "approve", adminId: admin._id }), resA),
      updatePayout(makeReq({ id: payout._id, action: "approve", adminId: admin._id }), resB),
    ]);

    const successes = [resA, resB].filter((r) => r.body && r.body.ok === true);
    expect(successes).toHaveLength(1); // exactly one request won the compare-and-swap

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("approved");

    // Only ONE approval audit entry — the loser never logs a false success.
    const logs = await StaffAuditLog.find({ action: "approve_payout" });
    expect(logs).toHaveLength(1);
  });

  test("[REAL MONGO] concurrency — reject: two simultaneous reject requests never refund the creator's coins twice", async () => {
    const creator = await createCreator({ earningsCoins: 0 });
    const admin = await createAdmin();
    const payout = await createPayout(creator, { amountCoins: 1000 });

    const resA = makeRes();
    const resB = makeRes();
    await Promise.all([
      updatePayout(
        makeReq({ id: payout._id, action: "reject", adminId: admin._id, body: { rejectionReason: "race condition A" } }),
        resA
      ),
      updatePayout(
        makeReq({ id: payout._id, action: "reject", adminId: admin._id, body: { rejectionReason: "race condition B" } }),
        resB
      ),
    ]);

    const successes = [resA, resB].filter((r) => r.body && r.body.ok === true);
    expect(successes).toHaveLength(1); // only the winner refunds

    const reloadedCreator = await User.findById(creator._id);
    expect(reloadedCreator.earningsCoins).toBe(1000); // refunded exactly once, never twice

    const logs = await StaffAuditLog.find({ action: "reject_payout" });
    expect(logs).toHaveLength(1);
  });

  test("[REAL MONGO] concurrency — mark_paid: two simultaneous payment confirmations never both record evidence", async () => {
    const creator = await createCreator();
    const admin = await createAdmin();
    const payout = await createPayout(creator, { status: "approved", approvedBy: admin._id, approvedAt: new Date() });

    const resA = makeRes();
    const resB = makeRes();
    await Promise.all([
      updatePayout(
        makeReq({
          id: payout._id,
          action: "mark_paid",
          adminId: admin._id,
          body: { paymentMethodUsed: "zelle", externalReference: "RACE-A" },
        }),
        resA
      ),
      updatePayout(
        makeReq({
          id: payout._id,
          action: "mark_paid",
          adminId: admin._id,
          body: { paymentMethodUsed: "paypal", externalReference: "RACE-B" },
        }),
        resB
      ),
    ]);

    const successes = [resA, resB].filter((r) => r.body && r.body.ok === true);
    expect(successes).toHaveLength(1); // only one confirmation ever applies

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("paid");
    expect(["RACE-A", "RACE-B"]).toContain(reloaded.externalReference);

    const logs = await StaffAuditLog.find({ action: "mark_payout_paid" });
    expect(logs).toHaveLength(1); // the loser never logs a false "paid" success
  });

  test("[REAL MONGO] approve then reject race: reject only wins if it reaches MongoDB before approve commits", async () => {
    const creator = await createCreator({ earningsCoins: 0 });
    const admin = await createAdmin();
    const payout = await createPayout(creator, { amountCoins: 450 });

    const resApprove = makeRes();
    const resReject = makeRes();
    await Promise.all([
      updatePayout(makeReq({ id: payout._id, action: "approve", adminId: admin._id }), resApprove),
      updatePayout(
        makeReq({ id: payout._id, action: "reject", adminId: admin._id, body: { rejectionReason: "race between approve/reject" } }),
        resReject
      ),
    ]);

    const reloaded = await Payout.findById(payout._id);
    // Exactly one of the two transitions won; the payout is never left in
    // an inconsistent/partial state, and the coins are refunded iff (and
    // only iff) the reject actually won.
    expect(["approved", "rejected"]).toContain(reloaded.status);

    const reloadedCreator = await User.findById(creator._id);
    if (reloaded.status === "rejected") {
      expect(reloadedCreator.earningsCoins).toBe(450);
    } else {
      expect(reloadedCreator.earningsCoins).toBe(0);
    }

    const successes = [resApprove, resReject].filter((r) => r.body && r.body.ok === true);
    expect(successes).toHaveLength(1);
  });

  test("[REAL MONGO] compatibility: a legacy payout document without the new evidence fields can still be approved and paid", async () => {
    const creator = await createCreator();
    const admin = await createAdmin();
    // Simulate a historical document created before approvedBy/paidBy/
    // paymentMethodUsed/externalReference existed, by inserting raw and
    // unsetting those fields (no migration required for old records).
    const payout = await createPayout(creator);
    await Payout.collection.updateOne(
      { _id: payout._id },
      { $unset: { approvedBy: "", paymentMethodUsed: "", externalReference: "", paidBy: "" } }
    );

    const approveRes = makeRes();
    await updatePayout(makeReq({ id: payout._id, action: "approve", adminId: admin._id }), approveRes);
    expect(approveRes.body.ok).toBe(true);

    const payRes = makeRes();
    await updatePayout(
      makeReq({
        id: payout._id,
        action: "mark_paid",
        adminId: admin._id,
        body: { paymentMethodUsed: "bank", externalReference: "LEGACY-DOC-TRX" },
      }),
      payRes
    );
    expect(payRes.body.ok).toBe(true);

    const reloaded = await Payout.findById(payout._id);
    expect(reloaded.status).toBe("paid");
    expect(reloaded.externalReference).toBe("LEGACY-DOC-TRX");
  });
});
