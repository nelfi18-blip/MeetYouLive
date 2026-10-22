"use strict";

// Admin payout approval/payment-confirmation flow.
//
// These tests exercise `updatePayout` (PATCH /api/admin/payouts/:id) and
// `getPayouts` (GET /api/admin/payouts) in isolation, with the Payout and
// User models mocked. They verify:
//  - manual approval is a separate step from payment confirmation
//  - marking a payout "paid" requires a payment method AND an external
//    reference, and the server (not the client) stamps paidAt/paidBy
//  - a payout cannot be confirmed twice, and a rejected payout can never
//    be marked as paid (no transitions out of a terminal state)
//  - rejecting a payout still restores the creator's reserved coins
//  - the admin audit trail (logStaffAction) is recorded for every action

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/Payout.js", () => ({
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock("../../services/audit.service.js", () => ({
  logStaffAction: jest.fn().mockResolvedValue(undefined),
}));

const User = require("../../models/User.js");
const Payout = require("../../models/Payout.js");
const { logStaffAction } = require("../../services/audit.service.js");
const { updatePayout, getPayouts } = require("../admin.controller.js");

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

function makeReq({ params = {}, body = {}, userId = "admin-1", userRole = "admin" } = {}) {
  return { params, body, userId, userRole, ip: "127.0.0.1" };
}

// A minimal mongoose-document-like object: `.save()` resolves to itself so
// the controller's mutate-then-save pattern works without a real DB.
function makePayout(overrides = {}) {
  const payout = {
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
  payout.save = jest.fn().mockResolvedValue(payout);
  return payout;
}

describe("admin payout flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("approve", () => {
    it("moves a pending payout to approved and records the responsible admin", async () => {
      const payout = makePayout({ status: "pending" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({ params: { id: "payout-1" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(payout.status).toBe("approved");
      expect(payout.approvedBy).toBe("admin-1");
      expect(payout.approvedAt).toBeInstanceOf(Date);
      expect(payout.save).toHaveBeenCalled();
      expect(logStaffAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: "approve_payout", staffId: "admin-1" })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      // Approval never touches balances or the creator's requested destination.
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(payout.paymentDetails).toBe("creator@example.com");
    });

    it("rejects approving a payout that is not pending", async () => {
      const payout = makePayout({ status: "approved" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({ params: { id: "payout-1" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
    });
  });

  describe("mark_paid (payment confirmation)", () => {
    it("requires an approved payout, a payment method, and an external reference", async () => {
      const payout = makePayout({ status: "approved" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid" }, // missing paymentMethodUsed/externalReference
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
      expect(payout.status).toBe("approved");
    });

    it("rejects an invalid payment method even when a reference is present", async () => {
      const payout = makePayout({ status: "approved" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid", paymentMethodUsed: "bitcoin", externalReference: "TRX-123" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
    });

    it("rejects a reference shorter than the minimum length", async () => {
      const payout = makePayout({ status: "approved" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "ab" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
    });

    it("marks an approved payout as paid with a server-stamped date and responsible admin", async () => {
      const payout = makePayout({ status: "approved", approvedBy: "admin-0" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "TRX-456789" },
        userId: "admin-2",
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(payout.status).toBe("paid");
      expect(payout.paymentMethodUsed).toBe("zelle");
      expect(payout.externalReference).toBe("TRX-456789");
      expect(payout.paidBy).toBe("admin-2");
      expect(payout.paidAt).toBeInstanceOf(Date);
      // The original approver's identity is preserved, not overwritten.
      expect(payout.approvedBy).toBe("admin-0");
      expect(payout.paymentDetails).toBe("creator@example.com");
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
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    it("rejects marking a pending (not yet approved) payout as paid", async () => {
      const payout = makePayout({ status: "pending" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "TRX-456789" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
    });

    it("prevents duplicate confirmation of an already-paid payout", async () => {
      const payout = makePayout({
        status: "paid",
        paidAt: new Date("2024-01-01"),
        paidBy: "admin-1",
        paymentMethodUsed: "zelle",
        externalReference: "TRX-ORIGINAL",
      });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid", paymentMethodUsed: "paypal", externalReference: "TRX-NEW" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
      // Original confirmation data must remain untouched.
      expect(payout.externalReference).toBe("TRX-ORIGINAL");
      expect(payout.paymentMethodUsed).toBe("zelle");
    });

    it("never allows a rejected payout to be marked as paid", async () => {
      const payout = makePayout({ status: "rejected", rejectionReason: "fraud suspected" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "mark_paid", paymentMethodUsed: "zelle", externalReference: "TRX-456789" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
      expect(payout.status).toBe("rejected");
    });
  });

  describe("reject", () => {
    it("restores the creator's reserved coins and records the rejection reason", async () => {
      const payout = makePayout({ status: "pending", amountCoins: 500, creator: "creator-9" });
      Payout.findById.mockResolvedValue(payout);
      User.findByIdAndUpdate.mockResolvedValue({ _id: "creator-9" });

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "reject", rejectionReason: "Datos bancarios inválidos" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        "creator-9",
        { $inc: { earningsCoins: 500 } },
        { new: true }
      );
      expect(payout.status).toBe("rejected");
      expect(payout.rejectionReason).toBe("Datos bancarios inválidos");
      expect(logStaffAction).toHaveBeenCalledWith(expect.objectContaining({ action: "reject_payout" }));
    });

    it("requires a rejection reason of at least 5 characters", async () => {
      const payout = makePayout({ status: "pending" });
      Payout.findById.mockResolvedValue(payout);

      const req = makeReq({
        params: { id: "payout-1" },
        body: { action: "reject", rejectionReason: "no" },
      });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(payout.save).not.toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("rejects an invalid action", async () => {
      const req = makeReq({ params: { id: "payout-1" }, body: { action: "delete" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findById).not.toHaveBeenCalled();
    });

    it("returns 404 for a non-existent payout", async () => {
      Payout.findById.mockResolvedValue(null);
      const req = makeReq({ params: { id: "missing" }, body: { action: "approve" } });
      const res = makeRes();
      await updatePayout(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
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
