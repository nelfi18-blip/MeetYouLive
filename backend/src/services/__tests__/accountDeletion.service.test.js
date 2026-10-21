// Only the models/collections actually touched by the face-reference gate
// under test need real assertions; everything else just needs to resolve so
// deleteUserAccount can run to completion without throwing on unrelated
// cleanup steps.
const mockChatFind = jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }));

jest.mock("../../models/AgencyRelationship.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/AnalyticsEvent.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/Chat.js", () => ({
  find: (...args) => mockChatFind(...args),
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../models/ChatProtectionAttempt.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../../models/CoinTransaction.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
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
  updateMany: jest.fn().mockResolvedValue({}),
  findByIdAndDelete: jest.fn().mockResolvedValue({ _id: "deleted-user" }),
}));
jest.mock("../../models/Video.js", () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock("../faceReference.service.js", () => ({
  revokeFaceReferenceForAccountDeletion: jest.fn(),
}));

const User = require("../../models/User.js");
const { revokeFaceReferenceForAccountDeletion } = require("../faceReference.service.js");
const { deleteUserAccount } = require("../accountDeletion.service.js");

const USER_ID = "507f1f77bcf86cd799439011";

describe("accountDeletion.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatFind.mockImplementation(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }));
    User.findByIdAndDelete.mockResolvedValue({ _id: USER_ID });
  });

  it("proceeds with full account deletion when there is no active face reference to clean up", async () => {
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: false });

    const result = await deleteUserAccount(USER_ID);

    expect(result).toEqual({ _id: USER_ID });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(USER_ID);
  });

  it("proceeds with account deletion when the face reference was durably scheduled for deletion even though AWS DeleteFaces is still temporarily down/unconfirmed", async () => {
    // retireAndScheduleDeletion's transaction committed (durable record
    // exists) — AWS itself may still be unreachable, but that is retried by
    // the existing background job, so it must NOT block account deletion.
    revokeFaceReferenceForAccountDeletion.mockResolvedValue({ scheduled: true });

    const result = await deleteUserAccount(USER_ID);

    expect(result).toEqual({ _id: USER_ID });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(USER_ID);
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
});
