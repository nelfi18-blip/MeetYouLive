const {
  buildCreatorRepairUpdate,
  getCreatorInconsistencies,
  runCreatorClassificationAudit,
  serializeCreatorAuditRow,
} = require("../creatorClassificationAudit.service.js");

describe("creatorClassificationAudit.service", () => {
  test("detects approved creator status degraded to user role", () => {
    const user = {
      _id: "507f1f77bcf86cd799439011",
      role: "user",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      creatorApprovedAt: new Date("2026-01-01T00:00:00.000Z"),
      creatorProfile: { displayName: "Creator", liveEnabled: true },
    };

    expect(getCreatorInconsistencies(user)).toEqual(expect.arrayContaining([
      "creatorStatus approved con role no creador",
      "isVerifiedCreator true con role no creador",
      "creatorApprovedAt presente con role no creador",
      "creatorProfile presente con clasificación degradada",
    ]));
    expect(buildCreatorRepairUpdate(user)).toEqual({
      $set: { role: "creator" },
    });
  });

  test("does not modify admin accounts", () => {
    const admin = {
      _id: "admin-1",
      role: "admin",
      creatorStatus: "approved",
      isVerifiedCreator: true,
    };

    expect(getCreatorInconsistencies(admin)).toEqual([]);
    expect(buildCreatorRepairUpdate(admin)).toBeNull();
    expect(serializeCreatorAuditRow(admin)).toMatchObject({
      adminSkipped: true,
      repairable: false,
    });
  });

  test("dry-run audit reads selected fields and never writes", async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: "creator-1", role: "user", creatorStatus: "approved", isVerifiedCreator: true },
      { _id: "admin-1", role: "admin", creatorStatus: "approved", isVerifiedCreator: true },
    ]);
    const select = jest.fn(() => ({ lean }));
    const User = {
      find: jest.fn(() => ({ select })),
      bulkWrite: jest.fn(),
    };

    const report = await runCreatorClassificationAudit(User);

    expect(report.dryRun).toBe(true);
    expect(report.counts.inconsistentAccounts).toBe(1);
    expect(report.counts.adminsSkipped).toBe(1);
    expect(report.counts.repairableAccounts).toBe(1);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("creatorStatus"));
    expect(User.bulkWrite).not.toHaveBeenCalled();
  });

  test("repair mode only writes explicit repair operations for non-admin users", async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: "creator-1", role: "user", creatorStatus: "approved", isVerifiedCreator: true },
      { _id: "admin-1", role: "admin", creatorStatus: "approved", isVerifiedCreator: true },
    ]);
    const select = jest.fn(() => ({ lean }));
    const User = {
      find: jest.fn(() => ({ select })),
      bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const report = await runCreatorClassificationAudit(User, { execute: true });

    expect(report.dryRun).toBe(false);
    expect(report.modifiedCount).toBe(1);
    expect(User.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: "creator-1", role: { $ne: "admin" } },
          update: { $set: { role: "creator" } },
        },
      },
    ]);
  });
});
