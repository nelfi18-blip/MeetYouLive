const mongoose = require("mongoose");

// Restricted operational evidence. Never billing credentials, emails or payloads.
// Application recovery only inserts; it never overwrites previous reviews.
const schema = new mongoose.Schema({
  _id: String,
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  ticket: { type: String, required: true },
  evidenceSha256: { type: String, required: true },
  reviewers: { type: [String], required: true },
  snapshotSha256: { type: String, required: true },
  customerIds: [String],
  mutationKey: String,
  outcome: String,
  externalId: String,
  requestLogReference: String,
  stoppedOwner: String,
  deploymentSha: String,
  inspectedAt: Date,
  reviewedAt: { type: Date, required: true },
}, { versionKey: false });
module.exports = mongoose.model("StripeSubscriptionReview", schema);
