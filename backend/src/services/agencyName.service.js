"use strict";

// Canonical agency names reserve a single namespace across pending requests
// and approved agencies. This service never modifies creator roles or Coins.
const User = require("../models/User.js");

function normalizeAgencyName(value) {
  if (typeof value !== "string") return null;
  const displayName = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    displayName.length < 3 || displayName.length > 80 ||
    /[<>\p{Cc}\p{Cf}]/u.test(displayName)
  ) return null;

  // Ignore case, accents, spacing and punctuation for duplicate protection;
  // preserve non-Latin letters/numbers to support multilingual agency names.
  const key = displayName.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, "");

  return key.length >= 3 ? { displayName, key } : null;
}

const reservedNameScope = {
  $or: [
    { "agencyProfile.enabled": true },
    { "agencyProfile.requestStatus": "pending" },
  ],
};

function namesFromRecord(record) {
  if (record?.agencyProfile?.enabled) {
    return [record.agencyProfile.agencyName, record.agencyProfile.requestedName];
  }
  if (record?.agencyProfile?.requestStatus === "pending") {
    return [record.agencyProfile.requestedName];
  }
  return [];
}

async function isAgencyNameAvailable(name, { excludeUserId = null } = {}) {
  const normalized = normalizeAgencyName(name);
  if (!normalized) return { valid: false, available: false, normalized: null };
  const exclude = excludeUserId ? { _id: { $ne: excludeUserId } } : {};
  // The unique partial index on the key prevents two concurrent new
  // applications with the same canonical name, even across Node processes.
  const reserved = await User.exists({
    "agencyProfile.nameKey": normalized.key,
    ...exclude,
  });
  if (reserved) return { valid: true, available: false, normalized };

  // Historical agencies may predate nameKey. Never silently rename or backfill
  // existing agencies during a normal read or application. Check their current
  // names read-only as well so a new agency cannot claim an old brand.
  const legacy = await User.find({
    ...reservedNameScope,
    "agencyProfile.nameKey": { $exists: false },
    ...exclude,
  }).select("agencyProfile.enabled agencyProfile.agencyName agencyProfile.requestStatus agencyProfile.requestedName").lean();
  const conflict = legacy.some((row) =>
    namesFromRecord(row).some((existing) =>
      normalizeAgencyName(existing)?.key === normalized.key
    )
  );
  return { valid: true, available: !conflict, normalized };
}

function isAgencyNameDuplicateError(err) {
  return err?.code === 11000 &&
    (err?.keyPattern?.["agencyProfile.nameKey"] === 1 ||
      /uniq_agency_name_key|agencyProfile\.nameKey/.test(String(err?.message || "")));
}

module.exports = {
  normalizeAgencyName,
  isAgencyNameAvailable,
  isAgencyNameDuplicateError,
};
