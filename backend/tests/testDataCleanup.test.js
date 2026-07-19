"use strict";

const {
  EXECUTE_CONFIRMATION,
  STAFF_ROLES,
  assertCanExecuteCleanup,
  buildTestUserFilter,
  formatCleanupReport,
  normalizeCleanupOptions,
} = require("../src/services/testDataCleanup.service");

describe("test data cleanup safety", () => {
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

  test("formats required Spanish handoff counts", () => {
    const report = {
      dryRun: true,
      counts: { users: 2, creators: 1, lives: 3, chats: 4, messages: 5 },
      preservedAmbiguousUsers: [{}],
    };

    expect(formatCleanupReport(report)).toContain("Users selected/deleted: 2");
    expect(formatCleanupReport(report)).toContain("Administrative/system configuration collections touched: none");
    expect(formatCleanupReport(report)).toContain("Preserved ambiguous test-like users: 1");
  });
});
