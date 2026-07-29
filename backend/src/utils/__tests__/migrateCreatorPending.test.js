jest.mock("mongoose", () => ({
  connection: {
    collection: jest.fn(),
  },
}));

const mongoose = require("mongoose");
const migrateCreatorPending = require("../migrateCreatorPending.js");

describe("migrateCreatorPending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("preserves approved creator evidence instead of downgrading to user pending", async () => {
    const bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    mongoose.connection.collection.mockReturnValue({ bulkWrite });
    jest.spyOn(console, "log").mockImplementation(() => {});

    await migrateCreatorPending();

    expect(bulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        updateMany: expect.objectContaining({
          filter: expect.objectContaining({
            role: "creator_pending",
            $or: expect.arrayContaining([
              { creatorStatus: "approved" },
              { isVerifiedCreator: true },
              { creatorApprovedAt: { $ne: null } },
              { "creatorApplication.reviewDecision": "approved" },
            ]),
          }),
          update: expect.objectContaining({
            $set: expect.objectContaining({
              role: "creator",
              creatorStatus: "approved",
              isVerifiedCreator: true,
            }),
          }),
        }),
      }),
      expect.objectContaining({
        updateMany: expect.objectContaining({
          filter: expect.objectContaining({
            role: "creator_pending",
            creatorStatus: { $ne: "approved" },
            isVerifiedCreator: { $ne: true },
            creatorApprovedAt: null,
            "creatorApplication.reviewDecision": { $ne: "approved" },
          }),
          update: expect.objectContaining({
            $set: { role: "user", creatorStatus: "pending" },
          }),
        }),
      }),
    ]);

    console.log.mockRestore();
  });
});
