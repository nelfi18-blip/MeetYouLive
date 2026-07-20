"use strict";

const {
  EXECUTE_CONFIRMATION,
  PRODUCTION_EXECUTE_CONFIRMATION,
  STAFF_ROLES,
  assertCanExecuteCleanup,
  buildTestUserFilter,
  cleanupTestData,
  formatCleanupReport,
  normalizeCleanupOptions,
} = require("../src/services/testDataCleanup.service");
const User = require("../src/models/User");
const Chat = require("../src/models/Chat");
const Live = require("../src/models/Live");
const Video = require("../src/models/Video");
const ExclusiveContent = require("../src/models/ExclusiveContent");
const SocialRoomMessage = require("../src/models/SocialRoomMessage");

const relatedModels = [
  require("../src/models/AccessPass"),
  require("../src/models/AgencyRelationship"),
  require("../src/models/AnalyticsEvent"),
  require("../src/models/CoinTransaction"),
  require("../src/models/ContentUnlock"),
  require("../src/models/CrushTransaction"),
  require("../src/models/Dislike"),
  require("../src/models/ExclusiveUnlock"),
  require("../src/models/FraudAlert"),
  require("../src/models/Gift"),
  require("../src/models/Greeting"),
  require("../src/models/Like"),
  require("../src/models/Message"),
  require("../src/models/Notification"),
  require("../src/models/Payout"),
  require("../src/models/Purchase"),
  require("../src/models/PushAnalytic"),
  require("../src/models/PushEvent"),
  require("../src/models/Report"),
  require("../src/models/SimulationResponse"),
  require("../src/models/SimulationUnlock"),
  require("../src/models/SocialRoom"),
  require("../src/models/SparkTransaction"),
  require("../src/models/Subscription"),
  require("../src/models/UserMissions"),
  require("../src/models/UserVisit"),
  require("../src/models/VideoCall"),
  require("../src/models/WithdrawalRequest"),
  Chat,
  ExclusiveContent,
  Live,
  SocialRoomMessage,
  User,
  Video,
];

function makeFindChain(value) {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.sort = jest.fn(() => chain);
  chain.lean = jest.fn(() => Promise.resolve(value));
  return chain;
}

describe("test data cleanup safety", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("requires at least one explicit selector", () => {
    expect(() => assertCanExecuteCleanup({})).toThrow(/provide explicit test-user selectors/i);
  });

  test("rejects invalid object id selectors", () => {
    expect(() => assertCanExecuteCleanup({ userIds: "not-an-object-id" })).toThrow(/invalid user id/i);
  });

  test("requires destructive confirmation before execute", () => {
    expect(() =>
      assertCanExecuteCleanup({ execute: true, userIds: "64b64c261c9d440000000001" })
    ).toThrow(new RegExp(EXECUTE_CONFIRMATION));
  });

  test("accepts execute only with the explicit confirmation phrase", () => {
    const options = assertCanExecuteCleanup({
      execute: true,
      confirm: EXECUTE_CONFIRMATION,
      userIds: "64b64c261c9d440000000001",
    });

    expect(options.execute).toBe(true);
    expect(options.confirm).toBe(EXECUTE_CONFIRMATION);
  });

  test("normalizes CSV selectors conservatively", () => {
    const options = normalizeCleanupOptions({
      emails: " Test@Example.com , demo@example.com ",
      emailDomains: " @example.com, test.local ",
    });

    expect(options.emails).toEqual(["test@example.com", "demo@example.com"]);
    expect(options.emailDomains).toEqual(["example.com", "test.local"]);
  });

  test("candidate query excludes staff and admin roles", () => {
    const filter = buildTestUserFilter({ emailDomains: "example.com" });

    expect(filter.role).toEqual({ $nin: STAFF_ROLES });
    expect(filter.$or).toHaveLength(1);
  });

  test("production cleanup selects all non-administrative users and preserves staff roles", () => {
    const filter = buildTestUserFilter({ allNonAdministrative: true });

    expect(filter).toEqual({ role: { $nin: STAFF_ROLES } });
    expect(STAFF_ROLES).toEqual(expect.arrayContaining(["admin", "moderator", "finance"]));
  });

  test("production cleanup requires its own confirmation before execution", () => {
    expect(() => assertCanExecuteCleanup({ allNonAdministrative: true, execute: true })).toThrow(
      new RegExp(PRODUCTION_EXECUTE_CONFIRMATION)
    );
    expect(assertCanExecuteCleanup({
      allNonAdministrative: true,
      execute: true,
      confirm: PRODUCTION_EXECUTE_CONFIRMATION,
    }).execute).toBe(true);
  });

  test("production dry run reports admin preservation and does not delete documents", async () => {
    jest.spyOn(User, "find").mockReturnValue(makeFindChain([]));
    jest.spyOn(User, "countDocuments").mockResolvedValue(3);
    const deleteSpy = jest.spyOn(User, "deleteMany").mockResolvedValue({ deletedCount: 0 });

    const report = await cleanupTestData({
      allNonAdministrative: true,
      includeAmbiguousReport: false,
      includeSelectedUsers: false,
    });

    expect(report.dryRun).toBe(true);
    expect(report.mode).toBe("production-non-admin-cleanup");
    expect(report.counts.administratorsPreserved).toBe(3);
    expect(report.counts.users).toBe(0);
    expect(report.selectedUsers).toEqual([]);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test("production cleanup deletes dependent relations and can be repeated safely", async () => {
    const userId = "507f1f77bcf86cd799439011";
    const candidate = {
      _id: userId,
      email: "old-user@example.com",
      role: "user",
      creatorStatus: "none",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    };
    jest.spyOn(User, "find")
      .mockReturnValueOnce(makeFindChain([candidate]))
      .mockReturnValueOnce(makeFindChain([]));
    jest.spyOn(Chat, "find").mockReturnValue(makeFindChain([{ _id: "507f1f77bcf86cd799439021" }]));
    jest.spyOn(Live, "find").mockReturnValue(makeFindChain([{ _id: "507f1f77bcf86cd799439022" }]));
    jest.spyOn(Video, "find").mockReturnValue(makeFindChain([{ _id: "507f1f77bcf86cd799439023" }]));
    jest.spyOn(ExclusiveContent, "find").mockReturnValue(makeFindChain([{ _id: "507f1f77bcf86cd799439024" }]));
    jest.spyOn(SocialRoomMessage, "find").mockReturnValue(makeFindChain([{ room: "507f1f77bcf86cd799439025" }]));

    for (const Model of relatedModels) {
      jest.spyOn(Model, "countDocuments").mockResolvedValue(0);
      jest.spyOn(Model, "deleteMany").mockResolvedValue({ deletedCount: 0 });
      jest.spyOn(Model, "updateMany").mockResolvedValue({ modifiedCount: 0 });
    }
    User.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    User.deleteMany.mockResolvedValueOnce({ deletedCount: 1 });

    const first = await cleanupTestData({
      allNonAdministrative: true,
      execute: true,
      confirm: PRODUCTION_EXECUTE_CONFIRMATION,
      includeAmbiguousReport: false,
      includeSelectedUsers: false,
    });
    const second = await cleanupTestData({
      allNonAdministrative: true,
      execute: true,
      confirm: PRODUCTION_EXECUTE_CONFIRMATION,
      includeAmbiguousReport: false,
      includeSelectedUsers: false,
    });

    expect(first.dryRun).toBe(false);
    expect(first.counts.deletedDocuments.users).toBe(1);
    expect(Chat.deleteMany).toHaveBeenCalled();
    expect(Video.deleteMany).toHaveBeenCalled();
    expect(ExclusiveContent.deleteMany).toHaveBeenCalled();
    expect(SocialRoomMessage.deleteMany).toHaveBeenCalled();
    expect(User.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $nin: [expect.anything()] } }),
      expect.objectContaining({ $pull: expect.objectContaining({ followers: expect.any(Object) }) }),
      undefined
    );
    expect(Live.updateMany).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $pull: expect.objectContaining({ guests: expect.any(Object) }) }),
      undefined
    );
    expect(second.counts.users).toBe(0);
  });

  test("formats cleanup report summary", () => {
    const report = {
      dryRun: true,
      counts: { users: 2, creators: 1, lives: 3, chats: 4, messages: 5 },
      preservedAmbiguousUsers: [{}],
    };

    expect(formatCleanupReport(report)).toContain("Users selected/deleted: 2");
    expect(formatCleanupReport(report)).toContain("Administrative/system configuration collections: none touched");
    expect(formatCleanupReport(report)).toContain("Preserved ambiguous test-like users: 1");
  });
});
