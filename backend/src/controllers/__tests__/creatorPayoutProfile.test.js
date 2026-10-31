"use strict";

// creatorPayoutProfile.controller.js — GET/PATCH /api/creator/payout-profile.
//
// Mocked models/services (same style as creator.payout.test.js): these
// tests exercise the controller's own logic (serialization, destination
// lock while a payout is pending/approved, audit logging, access isolation
// via the `creator` filter) without needing a live MongoDB connection.

jest.mock("../../models/Payout.js", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../models/CreatorPayoutProfile.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../services/audit.service.js", () => ({
  logStaffAction: jest.fn().mockResolvedValue(undefined),
}));

const Payout = require("../../models/Payout.js");
const CreatorPayoutProfile = require("../../models/CreatorPayoutProfile.js");
const { logStaffAction } = require("../../services/audit.service.js");
const { getPayoutProfile, updatePayoutProfile } = require("../creatorPayoutProfile.controller.js");

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  logStaffAction.mockResolvedValue(undefined);
});

describe("getPayoutProfile", () => {
  beforeEach(() => {
    // No pending/approved payout by default — individual tests override
    // this when they need to assert on `lockedDestination`.
    Payout.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
  });

  test("no profile on file: returns an incomplete, empty-shaped profile (not a 404)", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce(null);
    const res = makeRes();

    await getPayoutProfile({ userId: "creator-1" }, res);

    expect(CreatorPayoutProfile.findOne).toHaveBeenCalledWith({ creator: "creator-1" });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        profile: expect.objectContaining({
          completionStatus: "incomplete",
          lockedDestination: false,
          beneficiary: expect.objectContaining({ complete: false }),
          destination: expect.objectContaining({ complete: false, verified: false }),
        }),
      })
    );
  });

  test("complete profile: masks the PayPal email and never reports verified:true", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({
      legalName: "Jane Doe",
      residenceCountry: "US",
      taxResidenceCountry: "US",
      beneficiaryType: "individual",
      destinationMethod: "paypal",
      paypalEmail: "janedoe@example.com",
      taxDocsStatus: "pending_review",
    });
    const res = makeRes();

    await getPayoutProfile({ userId: "creator-1" }, res);

    const [[payload]] = res.json.mock.calls;
    expect(payload.profile.completionStatus).toBe("complete");
    expect(payload.profile.destination.verified).toBe(false);
    expect(payload.profile.destination.paypalEmail).toBe("janedoe@example.com");
    expect(payload.profile.destination.maskedPaypalEmail).not.toBe("janedoe@example.com");
    expect(payload.profile.destination.maskedPaypalEmail).toContain("@example.com");
    expect(payload.profile.taxDocsStatus).toBe("pending_review");
  });

  test("a pending/approved payout marks the response lockedDestination:true", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({
      legalName: "Jane Doe",
      residenceCountry: "US",
      taxResidenceCountry: "US",
      beneficiaryType: "individual",
      destinationMethod: "paypal",
      paypalEmail: "janedoe@example.com",
    });
    Payout.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValueOnce({ _id: "payout-1" }) });
    const res = makeRes();

    await getPayoutProfile({ userId: "creator-1" }, res);

    const [[payload]] = res.json.mock.calls;
    expect(payload.profile.lockedDestination).toBe(true);
    expect(Payout.findOne).toHaveBeenCalledWith({ creator: "creator-1", status: { $in: ["pending", "approved"] } });
  });

  test("db error: returns 500, not an unhandled rejection", async () => {
    CreatorPayoutProfile.findOne.mockRejectedValueOnce(new Error("db down"));
    const res = makeRes();

    await getPayoutProfile({ userId: "creator-1" }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updatePayoutProfile", () => {
  test("rejects an update with no recognized fields", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce(null);
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(CreatorPayoutProfile.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("saves step 1 (beneficiary) fields, scoped to this creator, and sets taxDocsStatus to pending_review", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce(null);
    CreatorPayoutProfile.findOneAndUpdate.mockResolvedValueOnce({
      legalName: "Jane Doe",
      residenceCountry: "US",
      taxResidenceCountry: "US",
      beneficiaryType: "individual",
      destinationMethod: "paypal",
      paypalEmail: "",
      taxDocsStatus: "pending_review",
    });
    const res = makeRes();

    await updatePayoutProfile(
      {
        userId: "creator-1",
        userRole: "creator",
        ip: "127.0.0.1",
        body: { legalName: "Jane Doe", residenceCountry: "US", taxResidenceCountry: "US", beneficiaryType: "individual" },
      },
      res
    );

    expect(CreatorPayoutProfile.findOneAndUpdate).toHaveBeenCalledWith(
      { creator: "creator-1" },
      expect.objectContaining({
        $set: expect.objectContaining({ legalName: "Jane Doe", taxDocsStatus: "pending_review" }),
      }),
      expect.objectContaining({ upsert: true })
    );
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: "creator-1", action: "update_payout_profile", targetType: "Creator" })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("blocks a destination change while a payout is pending, and preserves the historical destination", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({ destinationMethod: "paypal", paypalEmail: "old@example.com" });
    Payout.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValueOnce({ _id: "payout-1", status: "pending" }) });
    const res = makeRes();

    await updatePayoutProfile(
      { userId: "creator-1", body: { paypalEmail: "new@example.com" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(CreatorPayoutProfile.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("blocks a destination change while a payout is approved", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({ destinationMethod: "paypal", paypalEmail: "old@example.com" });
    Payout.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValueOnce({ _id: "payout-1", status: "approved" }) });
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-1", body: { paypalEmail: "new@example.com" } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("allows a destination change when there is no pending/approved payout", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({ destinationMethod: "paypal", paypalEmail: "old@example.com" });
    Payout.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValueOnce(null) });
    CreatorPayoutProfile.findOneAndUpdate.mockResolvedValueOnce({
      destinationMethod: "paypal",
      paypalEmail: "new@example.com",
    });
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-1", body: { paypalEmail: "new@example.com" } }, res);

    expect(CreatorPayoutProfile.findOneAndUpdate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("re-saving the SAME paypalEmail already on file is not treated as a destination change (no pending-payout check needed)", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({ destinationMethod: "paypal", paypalEmail: "same@example.com" });
    CreatorPayoutProfile.findOneAndUpdate.mockResolvedValueOnce({
      destinationMethod: "paypal",
      paypalEmail: "same@example.com",
    });
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-1", body: { paypalEmail: "same@example.com" } }, res);

    expect(Payout.findOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("beneficiary-only updates never trigger the destination lock, even with a pending payout", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({ destinationMethod: "paypal", paypalEmail: "old@example.com" });
    CreatorPayoutProfile.findOneAndUpdate.mockResolvedValueOnce({ legalName: "Jane Doe" });
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-1", body: { legalName: "Jane Doe" } }, res);

    expect(Payout.findOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test("isolation: looks up both the existing profile and any blocking payout scoped to the authenticated creator only", async () => {
    CreatorPayoutProfile.findOne.mockResolvedValueOnce({ destinationMethod: "paypal", paypalEmail: "old@example.com" });
    Payout.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValueOnce(null) });
    CreatorPayoutProfile.findOneAndUpdate.mockResolvedValueOnce({ paypalEmail: "new@example.com" });
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-9", body: { paypalEmail: "new@example.com" } }, res);

    expect(CreatorPayoutProfile.findOne).toHaveBeenCalledWith({ creator: "creator-9" });
    expect(Payout.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ creator: "creator-9", status: { $in: ["pending", "approved"] } })
    );
  });

  test("db error: returns 500, not an unhandled rejection", async () => {
    CreatorPayoutProfile.findOne.mockRejectedValueOnce(new Error("db down"));
    const res = makeRes();

    await updatePayoutProfile({ userId: "creator-1", body: { legalName: "Jane Doe" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
