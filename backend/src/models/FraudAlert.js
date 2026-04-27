"use strict";

const mongoose = require("mongoose");

const fraudAlertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    alertType: {
      type: String,
      enum: [
        "rate_limit_exceeded",
        "velocity_exceeded",
        "self_gifting",
        "new_account_restriction",
        "duplicate_transaction",
      ],
      required: true,
      index: true,
    },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "dismissed"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewNotes: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    // Request context for audit trail
    route: { type: String, default: "" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    blocked: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Compound index for the admin dashboard queries
fraudAlertSchema.index({ status: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.model("FraudAlert", fraudAlertSchema);
