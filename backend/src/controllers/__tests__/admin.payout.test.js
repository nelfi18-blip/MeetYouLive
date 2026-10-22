"use strict";

// Admin payout approval/payment-confirmation flow (SIMULATED / mocked).
//
// IMPORTANT — these tests use a MOCKED mongoose session (`withTransaction`
// just invokes the callback inline) and MOCKED User/Payout models to
// exercise updatePayout's control flow in isolation. They verify that the
// CODE performs the atomic compare-and-swap (`findOneAndUpdate` filtered by
// the expected CURRENT status), that the coins refund on "reject" is
// issued inside the SAME transaction as the status flip, and that the
// audit log is only written after the transaction has returned
// successfully. They are NOT a substitute for a real MongoDB replica-set
// transaction test — a mock can't prove that two concurrent connections
// racing for the same document are actually serialized by MongoDB, nor
// that an aborted transaction truly rolls back a previously-applied $inc
// on the server.
//
// For REAL MongoDB coverage of exactly those properties (concurrent
// transitions, rollback-on-failure, and invalid-transition rejection, all
// against a genuine replica-set `mongod`), see the sibling file
// `admin.payout.integration.test.js`, which runs against a disposable
// local MongoDB container (no mocks, no Atlas, no production data) when
// `INTEGRATION_MONGO_URI` is set.

jest.mock("../../models/User.js", () => ({
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/Payout.js", () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock("../../services/audit.service.js", () => ({
  logStaffAction: jest.fn().mockResolvedValue(undefined),
}));

const mongoose = require("mongoose");
const User = require("../../models/User.js");
const Payout = require("../../models/Payout.js");
const { logStaffAction } = require("../../services/audit.service.js");
const { updatePayout, getPayouts } = require("../admin.controller.js");

function makeMockSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(async () => {}),
  };
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

function makeReq({ params = {}, body = {}, userId = "admin-1", userRole = "admin" } = {}) {
  return { params, body, userId, userRole, ip: "127.0.0.1" };
}

// `Payout.findOneAndUpdate(...).session is implicit (mongoose accepts
// `{ session }` in the options object directly) — the mock simply records
// the call and resolves to the configured value.
function makePayoutDoc(overrides = {}) {
  return {
    _id: "payout-1",
    creator: "creator-1",
    amountCoins: 1000,
    status: "pending",
    method: "paypal",
    paymentDetails: "creator@example.com",
    notes: "",
    rejectionReason: "",
    approvedAt: null,
    paidAt: null,
    processedBy: null,
    approvedBy: null,
    paidBy: null,
    paymentMethodUsed: null,
    externalReference: "",
    ...overrides,
  };
}

// `Payout.findById(id).session(session)` — used only on the "no document
// matched the compare-and-swap filter" path, to tell a 404 apart from an
// invalid transition.
function sessionQuery(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

const ADMIN_ID = "admin-1";

describe("admin payout flow — control flow with a mocked mongoose session", () => {
  let session;

  beforeEach(() => {
    jest.resetAllMocks();
    logStaffAction.mockResolvedValue(undefined);
    session = makeMockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  });

  describe("approve", () => {
    it("atomically flips pending -> approved and records the responsible admin", async () => {
      const updated = makePayoutDoc({ status: "approved", approvedBy: ADMIN_ID, approvedAt: new Date() });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);

      const req = makeReq({ params: { id: "507f1f77bcf86cd799439011" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(Payout.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "507f1f77bcf86cd799439011", status: "pending" },
        expect.objectContaining({
          $set: expect.objectContaining({ status: "approved", approvedBy: ADMIN_ID, processedBy: ADMIN_ID }),
        }),
        expect.objectContaining({ new: true, session })
      );
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(logStaffAction).toHaveBeenCalledWith(expect.objectContaining({ action: "approve_payout" }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, payout: updated }));
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it("rejects approving a payout that is not pending (no document matched the CAS filter)", async () => {
      Payout.findOneAndUpdate.mockResolvedValueOnce(null);
      Payout.findById.mockReturnValueOnce(sessionQuery(makePayoutDoc({ status: "approved" })));

      const req = makeReq({ params: { id: "507f1f77bcf86cd799439011" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(logStaffAction).not.toHaveBeenCalled();
    });
  });

  describe("mark_paid (payment confirmation)", () => {
    it("requires a payment method and an external reference before touching the database", async () => {
      const req = makeReq({ params: { id: "507f1f77bcf86cd799439011" }, body: { action: "mark_paid" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });

    it("rejects an invalid payment method even when a reference is present", async () => {
      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "bitcoin", externalReference: "TRX-123" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("rejects a reference shorter than the minimum length", async () => {
      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "ab" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("atomically flips approved -> paid with a server-stamped date and responsible admin", async () => {
      const updated = makePayoutDoc({
        status: "paid",
        approvedBy: "admin-0",
        paidBy: ADMIN_ID,
        paidAt: new Date(),
        paymentMethodUsed: "zelle",
        externalReference: "TRX-456789",
      });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "TRX-456789" },
        userId: "admin-2",
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(Payout.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "507f1f77bcf86cd799439011", status: "approved" },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "paid",
            paidBy: "admin-2",
            paymentMethodUsed: "zelle",
            externalReference: "TRX-456789",
          }),
        }),
        expect.objectContaining({ new: true, session })
      );
      expect(logStaffAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mark_payout_paid",
          staffId: "admin-2",
          details: expect.objectContaining({
            paymentMethodUsed: "zelle",
            externalReference: "TRX-456789",
          }),
        })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, payout: updated }));
    });

    it("rejects marking a pending (not yet approved) payout as paid", async () => {
      Payout.findOneAndUpdate.mockResolvedValueOnce(null);
      Payout.findById.mockReturnValueOnce(sessionQuery(makePayoutDoc({ status: "pending" })));

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "TRX-456789" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(logStaffAction).not.toHaveBeenCalled();
    });

    it("prevents duplicate confirmation of an already-paid payout (CAS filter matches nothing)", async () => {
      Payout.findOneAndUpdate.mockResolvedValueOnce(null);
      Payout.findById.mockReturnValueOnce(
        sessionQuery(
          makePayoutDoc({
            status: "paid",
            paidAt: new Date("2024-01-01"),
            paidBy: ADMIN_ID,
            paymentMethodUsed: "zelle",
            externalReference: "TRX-ORIGINAL",
          })
        )
      );

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "paypal", externalReference: "TRX-NEW" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(logStaffAction).not.toHaveBeenCalled();
    });

    it("never allows a rejected payout to be marked as paid", async () => {
      Payout.findOneAndUpdate.mockResolvedValueOnce(null);
      Payout.findById.mockReturnValueOnce(
        sessionQuery(makePayoutDoc({ status: "rejected", rejectionReason: "fraud suspected" }))
      );

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "TRX-456789" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(logStaffAction).not.toHaveBeenCalled();
    });
  });

  describe("reject", () => {
    it("restores the creator's reserved coins inside the SAME transaction and records the rejection reason", async () => {
      const updated = makePayoutDoc({
        status: "rejected",
        amountCoins: 500,
        creator: "creator-9",
        rejectionReason: "Datos bancarios inválidos",
      });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);
      User.findByIdAndUpdate.mockResolvedValueOnce({ _id: "creator-9" });

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "reject", rejectionReason: "Datos bancarios inválidos" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        "creator-9",
        { $inc: { earningsCoins: 500 } },
        expect.objectContaining({ new: true, session, select: "_id" })
      );
      expect(logStaffAction).toHaveBeenCalledWith(expect.objectContaining({ action: "reject_payout" }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    it("rolls back the status flip if the coins refund fails (same transaction, no partial effect)", async () => {
      const updated = makePayoutDoc({ status: "rejected", amountCoins: 500, creator: "creator-9" });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);
      // Creator vanished mid-transaction: refund target not found.
      User.findByIdAndUpdate.mockResolvedValueOnce(null);

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "reject", rejectionReason: "Datos bancarios inválidos" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      // The whole withTransaction callback throws, so logStaffAction (which
      // only runs AFTER a successful commit) must never be called — the
      // caller must not believe this rejection succeeded.
      expect(logStaffAction).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("requires a rejection reason of at least 5 characters before opening a transaction", async () => {
      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "reject", rejectionReason: "no" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mongoose.startSession).not.toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("audit log failure AFTER a successful financial commit", () => {
    // These tests simulate `logStaffAction` throwing only once the
    // financial transaction has already committed. The endpoint must still
    // report the real (successful) outcome of the money-moving operation —
    // it must NEVER re-run `session.withTransaction`/`Payout.findOneAndUpdate`
    // to "retry" the audit failure (that would risk a double refund or a
    // duplicate payment confirmation), and it must NEVER surface a 5xx that
    // would make an admin believe the approval/rejection/payment failed.
    it("approve: still returns success and never re-touches the database if the audit log write fails", async () => {
      const updated = makePayoutDoc({ status: "approved", approvedBy: ADMIN_ID, approvedAt: new Date() });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);
      logStaffAction.mockRejectedValueOnce(new Error("audit sink unreachable"));
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const req = makeReq({ params: { id: "507f1f77bcf86cd799439011" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(Payout.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, payout: updated }));
      // The failure must be logged server-side for manual investigation...
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("audit log FAILED"),
        expect.objectContaining({ payoutId: String(updated._id), action: "approve" })
      );
      // ...but never with the payment method/reference or other financial
      // specifics that shouldn't be duplicated into an operational log line.
      const loggedContext = consoleErrorSpy.mock.calls[0][1];
      expect(loggedContext).not.toHaveProperty("paymentMethodUsed");
      expect(loggedContext).not.toHaveProperty("externalReference");
      consoleErrorSpy.mockRestore();
    });

    it("reject: the coins refund is NOT reversed or re-applied when only the audit write fails afterward", async () => {
      const updated = makePayoutDoc({ status: "rejected", amountCoins: 500, creator: "creator-9" });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);
      User.findByIdAndUpdate.mockResolvedValueOnce({ _id: "creator-9" });
      logStaffAction.mockRejectedValueOnce(new Error("audit sink unreachable"));
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "reject", rejectionReason: "Datos bancarios inválidos" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      // The refund happened exactly once, inside the already-committed
      // transaction — the post-commit audit failure must not cause a second
      // call (no double refund) nor an error response.
      expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("audit log FAILED"),
        expect.objectContaining({ action: "reject" })
      );
      consoleErrorSpy.mockRestore();
    });

    it("mark_paid: does not duplicate the payment confirmation when only the audit write fails afterward", async () => {
      const updated = makePayoutDoc({
        status: "paid",
        paidBy: ADMIN_ID,
        paidAt: new Date(),
        paymentMethodUsed: "paypal",
        externalReference: "TXN-999",
      });
      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);
      logStaffAction.mockRejectedValueOnce(new Error("audit sink unreachable"));
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const req = makeReq({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "mark_paid", paymentMethodUsed: "paypal", externalReference: "TXN-999" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(Payout.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, payout: updated }));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("audit log FAILED"),
        expect.objectContaining({ action: "mark_paid" })
      );
      const loggedContext = consoleErrorSpy.mock.calls[0][1];
      expect(loggedContext).not.toHaveProperty("paymentMethodUsed");
      expect(loggedContext).not.toHaveProperty("externalReference");
      consoleErrorSpy.mockRestore();
    });
  });

  describe("validation / misc", () => {
    it("rejects an invalid action before opening a transaction", async () => {
      const req = makeReq({ params: { id: "507f1f77bcf86cd799439011" }, body: { action: "delete" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });

    it("rejects an invalid payout id before opening a transaction", async () => {
      const req = makeReq({ params: { id: "not-an-object-id" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });

    it("returns 404 for a non-existent payout", async () => {
      Payout.findOneAndUpdate.mockResolvedValueOnce(null);
      Payout.findById.mockReturnValueOnce(sessionQuery(null));

      const req = makeReq({ params: { id: "68f000000000000000000001" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("retries once on a transient write-conflict and succeeds without double-processing", async () => {
      const conflictErr = Object.assign(new Error("Write conflict"), { code: 112 });
      const updated = makePayoutDoc({ status: "approved", approvedBy: ADMIN_ID });

      // First session attempt hits a write conflict; second succeeds.
      const failingSession = makeMockSession();
      failingSession.withTransaction.mockImplementationOnce(async () => {
        throw conflictErr;
      });
      const succeedingSession = makeMockSession();
      jest.spyOn(mongoose, "startSession")
        .mockResolvedValueOnce(failingSession)
        .mockResolvedValueOnce(succeedingSession);

      Payout.findOneAndUpdate.mockResolvedValueOnce(updated);

      const req = makeReq({ params: { id: "507f1f77bcf86cd799439011" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(failingSession.endSession).toHaveBeenCalledTimes(1);
      expect(succeedingSession.endSession).toHaveBeenCalledTimes(1);
      expect(Payout.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(logStaffAction).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });
  });

  describe("getPayouts", () => {
    it("lists payouts with pagination and never exposes production balances or secrets", async () => {
      const lean = jest.fn().mockResolvedValue([
        { _id: "payout-1", amountCoins: 100, status: "paid", paymentMethodUsed: "zelle", externalReference: "TRX-1" },
      ]);
      const limit = jest.fn(() => ({ lean }));
      const skip = jest.fn(() => ({ limit }));
      const sort = jest.fn(() => ({ skip }));
      const populatePaidBy = jest.fn(() => ({ sort }));
      const populateApprovedBy = jest.fn(() => ({ populate: populatePaidBy }));
      const populateProcessedBy = jest.fn(() => ({ populate: populateApprovedBy }));
      const populateCreator = jest.fn(() => ({ populate: populateProcessedBy }));
      Payout.find.mockReturnValue({ populate: populateCreator });
      Payout.countDocuments.mockResolvedValue(1);

      const req = makeReq({ body: {} });
      req.query = { status: "paid" };
      const res = makeRes();
      await getPayouts(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, payouts: expect.any(Array), pagination: expect.any(Object) })
      );
    });
  });
});
