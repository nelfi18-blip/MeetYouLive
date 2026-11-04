// Unit coverage for deletion gates, error propagation and session lifecycle.
// Real rollback, isolation and retries live in accountDeletion.integration.test.js.
const mockQuery = (value) => {
  const query = {
    select: jest.fn(() => query),
    session: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(value),
  };
  return query;
};
const mockChatFind = jest.fn(() => mockQuery([]));
const mockSession = {
  withTransaction: jest.fn((callback) => callback()),
  endSession: jest.fn().mockResolvedValue(),
};

jest.mock("../../models/AgencyRelationship.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/AnalyticsEvent.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Chat.js", () => ({
  find: (...args) => mockChatFind(...args),
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../models/ChatProtectionAttempt.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/CoinTransaction.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/CreatorPayoutProfile.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/FaceReferenceAudit.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Gift.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Like.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Live.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Message.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Notification.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Payout.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Purchase.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Report.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Subscription.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/User.js", () => ({
  find: jest.fn(() => mockQuery([])),
  findById: jest.fn(() => mockQuery({ _id: "507f1f77bcf86cd799439011" })),
  updateMany: jest.fn().mockResolvedValue({}),
  findByIdAndDelete: jest.fn().mockResolvedValue({ _id: "deleted-user" }),
}));
jest.mock("../../models/Video.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../faceReference.service.js", () => ({
  revokeFaceReferenceForAccountDeletion: jest.fn(),
}));

const mongoose = require("mongoose");
const Message = require("../../models/Message.js");
const User = require("../../models/User.js");
const CreatorPayoutProfile = require("../../models/CreatorPayoutProfile.js");
const { revokeFaceReferenceForAccountDeletion } = require("../faceReference.service.js");
const { deleteUserAccount } = require("../accountDeletion.service.js");

const USER_ID = "507f1f77bcf86cd799439011";

describe("accountDeletion.service", () => {
  const sessionSpy = jest.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);
  afterAll(() => sessionSpy.mockRestore());
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatFind.mockImplementation(() => mockQuery([]));
    User.findById.mockImplementation(() => mockQuery({ _id: USER_ID }));
    mockSession.withTransaction.mockImplementation((callback) => callback());
    User.findByIdAndDelete.mockResolvedValue({ _id: USER_ID });
    CreatorPayoutProfile.deleteMany.mockResolvedValue({});
  });

  it("proceeds with full account deletion when there is no active face reference to clean up", async () => {
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false });

    const result = await deleteUserAccount(USER_ID);

    expect(result).toEqual({ _id: USER_ID });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(USER_ID, { session: mockSession });
  });

  it("proceeds with account deletion when the face reference was durably scheduled for deletion even though AWS DeleteFaces is still temporarily down/unconfirmed", async () => {
    // retireAndScheduleDeletion's transaction committed (durable record
    // exists) — AWS itself may still be unreachable, but that is retried by
    // the existing background job, so it must NOT block account deletion.
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: true });

    const result = await deleteUserAccount(USER_ID);

    expect(result).toEqual({ _id: USER_ID });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(USER_ID, { session: mockSession });
  });

  it("ABORTS account deletion with a controlled, retriable error when the retire+persist transaction for the face reference failed (never leaves an orphaned biometric reference behind)", async () => {
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false, failed: true });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({ code: "FACE_REFERENCE_CLEANUP_PENDING" });

    // Nothing else about the account was touched — the deletion is aborted
    // BEFORE any destructive cleanup/removal step runs, so retrying later is
    // safe and does not leave partial state behind.
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("ABORTS account deletion with the same controlled, retriable error when revokeFaceReferenceForAccountDeletion itself throws unexpectedly", async () => {
    revokeFaceReferenceForAccountDeletion.mockRejectedValue(new Error("unexpected failure"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({ code: "FACE_REFERENCE_CLEANUP_PENDING" });
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("CONCURRENCY: two simultaneous account-deletion attempts never both report success when one hits a transaction failure — the failing one is never silently treated as deleted", async () => {
    revokeFaceReferenceForAccountDeletion
      .mockResolvedValueOnce({ scheduled: true })
      .mockResolvedValueOnce({ scheduled: false, failed: true });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const [first, second] = await Promise.allSettled([deleteUserAccount(USER_ID), deleteUserAccount(USER_ID)]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(second.reason).toMatchObject({ code: "FACE_REFERENCE_CLEANUP_PENDING" });

    errorSpy.mockRestore();
  });

  it("RE-REGISTRATION: deleting an account and later deleting a different (re-registered) account each revoke face references strictly by their own userId, never the other's", async () => {
    const OLD_USER_ID = "507f1f77bcf86cd799439099";
    const NEW_USER_ID = "507f1f77bcf86cd799439100"; // different _id — same real-world person/email
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: true });
    User.findByIdAndDelete
      .mockResolvedValueOnce({ _id: OLD_USER_ID })
      .mockResolvedValueOnce({ _id: NEW_USER_ID });

    await deleteUserAccount(OLD_USER_ID);
    await deleteUserAccount(NEW_USER_ID);

    expect(revokeFaceReferenceForAccountDeletion).toHaveBeenNthCalledWith(1, OLD_USER_ID);
    expect(revokeFaceReferenceForAccountDeletion).toHaveBeenNthCalledWith(2, NEW_USER_ID);
    expect(revokeFaceReferenceForAccountDeletion).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.anything() })
    );
    expect(User.findByIdAndDelete).toHaveBeenNthCalledWith(1, OLD_USER_ID, { session: mockSession });
    expect(User.findByIdAndDelete).toHaveBeenNthCalledWith(2, NEW_USER_ID, { session: mockSession });
  });

  it("never deletes the user or reports success when a mandatory message cleanup fails", async () => {
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false });
    Message.deleteMany.mockRejectedValueOnce(new Error("simulated write failure"));
    await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_CLEANUP_PENDING", retriable: true,
    });
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  it("returns a controlled error if commit cannot be confirmed", async () => {
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false });
    mockSession.withTransaction.mockRejectedValueOnce(new Error("unknown commit result"));
    await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_CLEANUP_PENDING", retriable: true,
    });
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the user was already deleted by another transaction", async () => {
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false });
    User.findById.mockReturnValueOnce(mockQuery(null));
    await expect(deleteUserAccount(USER_ID)).resolves.toBeNull();
    expect(Message.deleteMany).not.toHaveBeenCalled();
    expect(CreatorPayoutProfile.deleteMany).not.toHaveBeenCalled();
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  describe("CreatorPayoutProfile cleanup (legal name, residence/tax countries, PayPal email)", () => {
    beforeEach(() => {
      revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false });
    });

    it("deletes the payout profile of the correct user, scoped strictly by creator: userId", async () => {
      const result = await deleteUserAccount(USER_ID);

      expect(CreatorPayoutProfile.deleteMany).toHaveBeenCalledWith({ creator: USER_ID }, { session: mockSession });
      expect(result).toEqual({ _id: USER_ID });
      expect(User.findByIdAndDelete).toHaveBeenCalledWith(USER_ID, { session: mockSession });
    });

    it("ABORTS account deletion with a controlled, retriable error when the payout profile cleanup fails, WITHOUT silencing it via Promise.allSettled", async () => {
      CreatorPayoutProfile.deleteMany.mockRejectedValue(new Error("mongo write conflict"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({
        code: "PAYOUT_PROFILE_CLEANUP_PENDING",
        retriable: true,
      });

      // Aborted BEFORE the User document (and anything else) is touched —
      // nothing was silently marked "deleted" while the private payout
      // profile still exists.
      expect(User.findByIdAndDelete).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("RETRY: a deletion that previously failed on payout-profile cleanup can be retried and succeeds once the transient failure clears", async () => {
      CreatorPayoutProfile.deleteMany.mockRejectedValueOnce(new Error("mongo write conflict"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({ code: "PAYOUT_PROFILE_CLEANUP_PENDING" });
      expect(User.findByIdAndDelete).not.toHaveBeenCalled();

      // Retry: the second attempt (e.g. mongo write conflict resolved)
      // succeeds and the account is actually deleted.
      const result = await deleteUserAccount(USER_ID);

      expect(result).toEqual({ _id: USER_ID });
      expect(CreatorPayoutProfile.deleteMany).toHaveBeenCalledTimes(2);
      expect(User.findByIdAndDelete).toHaveBeenCalledWith(USER_ID, { session: mockSession });

      errorSpy.mockRestore();
    });

    it("RE-REGISTRATION: a user who deletes their account and later re-registers with a new _id never has the OLD payout profile deletion scoped to (or affecting) the new account", async () => {
      const OLD_USER_ID = "507f1f77bcf86cd799439099";
      const NEW_USER_ID = "507f1f77bcf86cd799439100"; // different _id — same real-world person/email
      User.findByIdAndDelete.mockResolvedValueOnce({ _id: OLD_USER_ID }).mockResolvedValueOnce({ _id: NEW_USER_ID });

      await deleteUserAccount(OLD_USER_ID);
      await deleteUserAccount(NEW_USER_ID);

      expect(CreatorPayoutProfile.deleteMany).toHaveBeenNthCalledWith(1, { creator: OLD_USER_ID }, { session: mockSession });
      expect(CreatorPayoutProfile.deleteMany).toHaveBeenNthCalledWith(2, { creator: NEW_USER_ID }, { session: mockSession });
    });

    it("never touches another creator's payout profile: the filter is always scoped to exactly this one userId, never a broader query", async () => {
      await deleteUserAccount(USER_ID);

      expect(CreatorPayoutProfile.deleteMany).toHaveBeenCalledTimes(1);
      const [filter] = CreatorPayoutProfile.deleteMany.mock.calls[0];
      expect(filter).toEqual({ creator: USER_ID });
      expect(Object.keys(filter)).toEqual(["creator"]);
    });
  });
});
