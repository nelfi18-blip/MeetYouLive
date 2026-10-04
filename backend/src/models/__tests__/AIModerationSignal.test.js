const mongoose = require("mongoose");
const AIModerationSignal = require("../AIModerationSignal.js");

describe("AIModerationSignal model", () => {
  test("requires context, sourceType, sourceId, userId, provider, riskLevel and status", () => {
    const doc = new AIModerationSignal({ categories: ["harassment"] });
    const err = doc.validateSync();
    expect(err.errors.context).toBeDefined();
    expect(err.errors.sourceType).toBeDefined();
    expect(err.errors.sourceId).toBeDefined();
    expect(err.errors.userId).toBeDefined();
    expect(err.errors.provider).toBeDefined();
    expect(err.errors.riskLevel).toBeDefined();
  });

  test("rejects riskLevel 'safe' (safe is never persisted)", () => {
    const doc = new AIModerationSignal({
      context: "chat_message",
      sourceType: "message",
      sourceId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      provider: "openai_moderation",
      riskLevel: "safe",
      categories: ["harassment"],
    });
    const err = doc.validateSync();
    expect(err.errors.riskLevel).toBeDefined();
  });

  test("requires at least one category", () => {
    const doc = new AIModerationSignal({
      context: "chat_message",
      sourceType: "message",
      sourceId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      provider: "openai_moderation",
      riskLevel: "high",
      categories: [],
    });
    const err = doc.validateSync();
    expect(err.errors.categories).toBeDefined();
  });

  test("rejects an unknown sourceType or category", () => {
    const doc = new AIModerationSignal({
      context: "chat_message",
      sourceType: "live",
      sourceId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      provider: "openai_moderation",
      riskLevel: "high",
      categories: ["not-a-real-category"],
    });
    const err = doc.validateSync();
    expect(err.errors.sourceType).toBeDefined();
    expect(err.errors["categories.0"]).toBeDefined();
  });

  test("defaults status to pending and reviewedBy/reviewedAt to null", () => {
    const doc = new AIModerationSignal({
      context: "chat_message",
      sourceType: "message",
      sourceId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      provider: "openai_moderation",
      riskLevel: "high",
      categories: ["harassment"],
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe("pending");
    expect(doc.reviewedBy).toBeNull();
    expect(doc.reviewedAt).toBeNull();
  });

  test("schema does not define a field for the original message text", () => {
    expect(AIModerationSignal.schema.path("text")).toBeUndefined();
  });

  test("has a unique compound index on sourceType/sourceId to prevent accidental duplicates", () => {
    const indexes = AIModerationSignal.schema.indexes();
    const dedupeIndex = indexes.find(([fields]) => fields.sourceType === 1 && fields.sourceId === 1);
    expect(dedupeIndex).toBeDefined();
    expect(dedupeIndex[1].unique).toBe(true);
  });
});
