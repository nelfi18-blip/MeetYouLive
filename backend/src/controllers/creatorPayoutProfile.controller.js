"use strict";

const Payout = require("../models/Payout.js");
const CreatorPayoutProfile = require("../models/CreatorPayoutProfile.js");
const { logStaffAction } = require("../services/audit.service.js");
const {
  isBeneficiaryStepComplete,
  isDestinationStepComplete,
  maskPaypalEmail,
} = require("../lib/creatorPayoutProfile.js");

// Fields a PATCH request is allowed to set. Kept as an explicit allow-list
// (rather than spreading req.body) so an unexpected key validated upstream
// by zod but not meant to be persisted here can never leak into the
// document.
const UPDATABLE_FIELDS = [
  "legalName",
  "residenceCountry",
  "taxResidenceCountry",
  "beneficiaryType",
  "destinationMethod",
  "paypalEmail",
];

// Fields that identify WHERE money is sent. Changing any of these while a
// payout is pending/approved could make the already-submitted request
// (which keeps its own `method`/`paymentDetails` snapshot on the Payout
// document) inconsistent with what the creator now has on file, so such
// changes are blocked until the pending/approved request is resolved. The
// historical Payout's destination is never touched.
const DESTINATION_FIELDS = ["destinationMethod", "paypalEmail"];

/**
 * Never returns raw Mongoose documents to the client, and never mixes this
 * profile into any public/Discover-facing response — this is the only
 * serializer for /api/creator/payout-profile.
 */
function serializePayoutProfile(profile, { lockedDestination = false } = {}) {
  const beneficiaryComplete = isBeneficiaryStepComplete(profile);
  const destinationComplete = isDestinationStepComplete(profile);

  return {
    beneficiary: {
      legalName: profile?.legalName || "",
      residenceCountry: profile?.residenceCountry || "",
      taxResidenceCountry: profile?.taxResidenceCountry || "",
      beneficiaryType: profile?.beneficiaryType || null,
      complete: beneficiaryComplete,
    },
    destination: {
      method: profile?.destinationMethod || "paypal",
      paypalEmail: profile?.paypalEmail || "",
      maskedPaypalEmail: maskPaypalEmail(profile?.paypalEmail || ""),
      // A syntactically valid PayPal email is NOT a verified PayPal
      // account — this flag is reserved for a future real verification
      // step and must never be set true here.
      verified: false,
      complete: destinationComplete,
    },
    completionStatus: beneficiaryComplete && destinationComplete ? "complete" : "incomplete",
    // Informational only in this PR: no sensitive tax documents are
    // collected, no 1099/withholding logic exists, and this never implies
    // the creator is tax-verified.
    taxDocsStatus: profile?.taxDocsStatus || "not_started",
    // true while a pending/approved Payout exists — the UI uses this to
    // explain why the destination fields are temporarily locked (see
    // updatePayoutProfile's matching 409 check below).
    lockedDestination: Boolean(lockedDestination),
    updatedAt: profile?.updatedAt || null,
  };
}

// GET /api/creator/payout-profile
exports.getPayoutProfile = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const [profile, blockingPayout] = await Promise.all([
      CreatorPayoutProfile.findOne({ creator: userId }),
      Payout.findOne({ creator: userId, status: { $in: ["pending", "approved"] } }).select("_id"),
    ]);
    return res.json({ ok: true, profile: serializePayoutProfile(profile, { lockedDestination: Boolean(blockingPayout) }) });
  } catch (err) {
    console.error("getPayoutProfile error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// PATCH /api/creator/payout-profile — body already validated by
// payoutProfileUpdateSchema (validate.middleware.js).
exports.updatePayoutProfile = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    const body = req.body || {};

    const existing = await CreatorPayoutProfile.findOne({ creator: userId });

    const isChangingDestination = DESTINATION_FIELDS.some((field) => {
      if (body[field] === undefined) return false;
      const currentValue = existing?.[field] ?? (field === "destinationMethod" ? "paypal" : "");
      return String(body[field]) !== String(currentValue);
    });

    if (isChangingDestination) {
      const blockingPayout = await Payout.findOne({
        creator: userId,
        status: { $in: ["pending", "approved"] },
      }).select("_id status");

      if (blockingPayout) {
        return res.status(409).json({
          ok: false,
          message:
            "No puedes cambiar tu destino de cobro mientras tengas una solicitud de retiro pendiente o aprobada. El destino de esa solicitud se conserva sin cambios.",
        });
      }
    }

    const update = {};
    for (const key of UPDATABLE_FIELDS) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, message: "No se recibieron campos para actualizar." });
    }

    // Any beneficiary-step field being saved (re)opens the "pending review"
    // tax-documentation placeholder — we never mark it as anything stronger
    // than that in this PR (see module docblock in
    // ../models/CreatorPayoutProfile.js).
    if (
      update.legalName !== undefined ||
      update.residenceCountry !== undefined ||
      update.taxResidenceCountry !== undefined ||
      update.beneficiaryType !== undefined
    ) {
      update.taxDocsStatus = "pending_review";
    }

    const profile = await CreatorPayoutProfile.findOneAndUpdate(
      { creator: userId },
      { $set: update, $setOnInsert: { creator: userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Self-service change by the owning creator — logged the same way
    // staff actions are, for a consistent audit trail of sensitive payout
    // destination/beneficiary changes. Never blocks the response.
    await logStaffAction({
      staffId: userId,
      staffRole: req.userRole || "creator",
      action: "update_payout_profile",
      targetType: "Creator",
      targetId: userId,
      details: {
        changedFields: Object.keys(update).filter((key) => key !== "taxDocsStatus"),
        destinationChanged: isChangingDestination,
      },
      ipAddress: req.ip,
    });

    return res.json({ ok: true, profile: serializePayoutProfile(profile) });
  } catch (err) {
    if (err?.code === 11000) {
      // Extremely unlikely race on the unique `creator` index (two
      // concurrent first-time saves); treat as a transient conflict rather
      // than a 500 so the client can simply retry.
      return res.status(409).json({ ok: false, message: "Ya existe un perfil de cobros, intenta nuevamente." });
    }
    console.error("updatePayoutProfile error:", err);
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

module.exports.serializePayoutProfile = serializePayoutProfile;
