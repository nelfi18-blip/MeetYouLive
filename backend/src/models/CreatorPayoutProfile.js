"use strict";

const mongoose = require("mongoose");
const {
  BENEFICIARY_TYPES,
  DESTINATION_METHODS,
  TAX_DOCS_STATUSES,
} = require("../lib/creatorPayoutProfile.js");

// Private, backend-only configuration for how/where an approved creator
// gets paid. Deliberately kept in its own collection (not embedded on
// User) so it is never accidentally included in a `User.find(...)` used for
// public profile/Discover responses — see creator.controller.js /
// creatorPayoutProfile.controller.js for the only read/write paths, both of
// which require an authenticated, approved, owning creator.
const creatorPayoutProfileSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // ── Step 1: beneficiary data ────────────────────────────────────────
    legalName: { type: String, default: "", trim: true, maxlength: 120 },
    // ISO 3166-1 alpha-2 (e.g. "US", "MX"); see COUNTRY_CODE_PATTERN in
    // ../lib/creatorPayoutProfile.js for the validated shape.
    residenceCountry: { type: String, default: "", trim: true, uppercase: true, maxlength: 2 },
    taxResidenceCountry: { type: String, default: "", trim: true, uppercase: true, maxlength: 2 },
    beneficiaryType: {
      type: String,
      enum: [...BENEFICIARY_TYPES, null],
      default: null,
    },

    // ── Step 2: payout destination ──────────────────────────────────────
    // PayPal is the only supported destination in this PR — no automatic
    // bank transfers or other providers without a compatible integration.
    destinationMethod: {
      type: String,
      enum: DESTINATION_METHODS,
      default: "paypal",
    },
    paypalEmail: { type: String, default: "", trim: true, maxlength: 254 },

    // ── Tax documentation (status only — see ../lib/creatorPayoutProfile.js) ─
    // We do NOT collect SSN/TIN/W-9/W-8BEN or any signed tax forms here.
    // "pending_review" only signals that this is a known pending item once
    // beneficiary data exists; it never implies the creator is tax-verified
    // and no 1099/tax-withholding logic is implemented in this PR.
    taxDocsStatus: {
      type: String,
      enum: TAX_DOCS_STATUSES,
      default: "not_started",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CreatorPayoutProfile", creatorPayoutProfileSchema);
