/**
 * feed-visibility-audit.js
 *
 * Read-only audit of the feed and crush (discover) visibility system.
 * For every user in the database it reports:
 *   - username / role / onboardingComplete / hasPhoto / age / gender
 *   - interestedIn / location
 *   - canAppearInFeed   (bool)
 *   - canAppearInCrush  (bool)
 *   - feedExclusionReasons  (array of strings, empty when eligible)
 *   - crushExclusionReasons (array of strings, empty when eligible)
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node backend/scripts/feed-visibility-audit.js
 *   — or —
 *   cd backend && node scripts/feed-visibility-audit.js  (reads backend/.env)
 *
 * Optional env variables:
 *   AUDIT_LIMIT=500    Max users to list in the per-user table (default 300)
 *   AUDIT_SHOW=all     Which users to list: "all" | "excluded" | "eligible" (default "all")
 *
 * NO data is modified.
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../src/models/User");

// ── Replica of production constants ──────────────────────────────────────────

/** Roles excluded from the public /crush discovery endpoint */
const CRUSH_STAFF_ROLES = [
  "admin", "moderator", "support", "creator_manager", "finance", "content_reviewer",
];

/** Minimal stub so photo-normalization helpers run without a real HTTP request */
const STUB_REQUEST = { protocol: "https", get: () => "" };

// ── Photo helpers (mirrors backend/src/lib/photoFields.js) ───────────────────

const getPhotoUrlValue = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.secure_url || value.url || value.src || value.path || "";
};

const hasUnsafePathSegment = (value) => {
  if (typeof value !== "string") return true;
  if (value.includes("..") || /%2e/i.test(value)) return true;
  try { return decodeURIComponent(value).split(/[\\/]/).includes(".."); } catch { return true; }
};

const normalizeUploadPath = (value) =>
  typeof value === "string" && !hasUnsafePathSegment(value)
    ? value.replace(/^\/?(?:api\/)?uploads\//i, "uploads/")
    : "";

const normalizePhotoUrl = (value) => {
  const rawValue = getPhotoUrlValue(value);
  if (typeof rawValue !== "string") return "";
  const trimmed = rawValue.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (hasUnsafePathSegment(url.pathname)) return "";
      return url.toString();
    } catch { return ""; }
  }
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  const normalizedPath = normalizeUploadPath(trimmed);
  if (/^uploads\//.test(normalizedPath)) return `/${normalizedPath}`;
  return "";
};

const getRawUserPhotoValues = (u) => [
  ...(Array.isArray(u?.profilePhotos) ? u.profilePhotos : []),
  ...(Array.isArray(u?.photos) ? u.photos : []),
  ...(Array.isArray(u?.images) ? u.images : []),
  u?.avatar,
  u?.profileImage,
  u?.photo,
  u?.photoURL,
  u?.photoUrl,
  u?.image,
  u?.imageUrl,
  u?.picture,
];

const hasSerializableUserPhoto = (u) =>
  getRawUserPhotoValues(u).some((v) => Boolean(normalizePhotoUrl(v)));

// ── Feed eligibility (mirrors feed.controller.js) ────────────────────────────

/**
 * Required profile fields for /feed.
 * Returns array of field names that are missing/empty.
 */
const getFeedMissingFields = (u = {}) => {
  const missing = [];
  if (!u.name || typeof u.name !== "string" || !u.name.trim()) missing.push("name");
  if (!hasSerializableUserPhoto(u)) missing.push("photo");
  if (!u.birthdate) missing.push("birthdate");
  if (!u.location || typeof u.location !== "string" || !u.location.trim()) missing.push("location");
  if (!Array.isArray(u.interests) || u.interests.length === 0) missing.push("interests");
  if (!u.intent || typeof u.intent !== "string" || !u.intent.trim()) missing.push("intent");
  return missing;
};

/**
 * All reasons a user cannot appear in /feed.
 *
 * The actual DB query uses:
 *   role="user", isBlocked=false, isSuspended=false, onboardingComplete=true
 * The full eligibility check (canAppearInFeed) also requires a complete profile.
 */
const getFeedExclusionReasons = (u) => {
  const reasons = [];
  if (u.role !== "user")          reasons.push(`role="${u.role}" (must be "user")`);
  if (u.isBlocked === true)       reasons.push("isBlocked=true");
  if (u.isSuspended === true)     reasons.push("isSuspended=true");
  if (u.onboardingComplete !== true) reasons.push("onboardingComplete=false");
  const missing = getFeedMissingFields(u);
  if (missing.length > 0)         reasons.push(`missing profile fields: [${missing.join(", ")}]`);
  return reasons;
};

// ── Crush eligibility (mirrors user.routes.js /discover) ─────────────────────

/**
 * All reasons a user cannot appear in /crush (GET /api/users/discover).
 *
 * The DB query uses:
 *   isBlocked=false, onboardingComplete=true,
 *   role NOT IN STAFF_ROLES
 * isSuspended is NOT explicitly filtered in /discover – documented as a gap.
 */
const getCrushExclusionReasons = (u) => {
  const reasons = [];
  if (CRUSH_STAFF_ROLES.includes(u.role)) reasons.push(`role="${u.role}" is a staff role`);
  if (u.isBlocked === true)               reasons.push("isBlocked=true");
  if (u.onboardingComplete !== true)      reasons.push("onboardingComplete=false");
  // isSuspended is not filtered by /discover — flagged as informational
  if (u.isSuspended === true)             reasons.push("isSuspended=true (informational: /discover does not filter this)");
  return reasons;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const calcAge = (birthdate) => {
  if (!birthdate) return null;
  const diff = Date.now() - new Date(birthdate).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const pad = (str, len) => String(str ?? "").slice(0, len).padEnd(len);
const hr = (c = "─", n = 80) => c.repeat(n);

const section = (title) => {
  console.log("\n" + hr("═", 80));
  console.log(`  ${title}`);
  console.log(hr("═", 80));
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("❌  No MongoDB URI found. Set MONGODB_URI or MONGO_URI in .env");
    process.exit(1);
  }

  const AUDIT_LIMIT = parseInt(process.env.AUDIT_LIMIT || "300", 10);
  const AUDIT_SHOW  = (process.env.AUDIT_SHOW || "all").toLowerCase(); // all | excluded | eligible

  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log("✅  Connected\n");

  // ── Fetch users ──────────────────────────────────────────────────────────
  const users = await User.find({})
    .select(
      "_id username name email role " +
      "avatar profilePhotos profileImage photo photos images photoURL photoUrl image imageUrl picture " +
      "gender birthdate interestedIn location interests intent " +
      "onboardingComplete isBlocked isSuspended createdAt"
    )
    .lean();

  console.log(`Loaded ${users.length} users.\n`);

  // ── Classify each user ──────────────────────────────────────────────────
  const audited = users.map((u) => {
    const feedReasons   = getFeedExclusionReasons(u);
    const crushReasons  = getCrushExclusionReasons(u);
    return {
      _id:                String(u._id),
      username:           u.username || "—",
      name:               u.name || "—",
      email:              u.email || "—",
      role:               u.role || "—",
      onboardingComplete: u.onboardingComplete === true,
      hasPhoto:           hasSerializableUserPhoto(u),
      age:                calcAge(u.birthdate),
      gender:             u.gender || "—",
      interestedIn:       u.interestedIn || "—",
      location:           u.location || "—",
      isBlocked:          u.isBlocked === true,
      isSuspended:        u.isSuspended === true,
      canAppearInFeed:    feedReasons.length === 0,
      canAppearInCrush:   crushReasons.length === 0,
      feedExclusionReasons:  feedReasons,
      crushExclusionReasons: crushReasons,
    };
  });

  // ── Aggregate counts ─────────────────────────────────────────────────────
  const eligibleFeed  = audited.filter(u => u.canAppearInFeed);
  const excludedFeed  = audited.filter(u => !u.canAppearInFeed);
  const eligibleCrush = audited.filter(u => u.canAppearInCrush);
  const excludedCrush = audited.filter(u => !u.canAppearInCrush);

  // Tally exclusion reasons for feed
  const feedReasonCounts = {};
  const crushReasonCounts = {};
  // Count each full reason string as-is (reasons are already short descriptive labels)
  for (const u of excludedFeed) {
    for (const r of u.feedExclusionReasons) {
      feedReasonCounts[r] = (feedReasonCounts[r] || 0) + 1;
    }
  }
  for (const u of excludedCrush) {
    for (const r of u.crushExclusionReasons) {
      crushReasonCounts[r] = (crushReasonCounts[r] || 0) + 1;
    }
  }

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log(hr("═", 80));
  console.log("  📊  MEETYOULIVE — FEED VISIBILITY AUDIT  (read-only)");
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log(hr("═", 80));

  // ── Section 1: What /feed requires ──────────────────────────────────────
  section("1. CONDITIONS TO APPEAR IN /feed  (GET /api/feed → recommendedProfiles)");
  console.log(`
  DB query filter (RECOMMENDED_PROFILES_BASE_MATCH):
    role         = "user"        ← creators, admins, staff are excluded
    isBlocked    = false
    isSuspended  = false
    onboardingComplete = true

  canAppearInFeed also requires complete profile fields:
    • name         — non-empty string
    • photo        — at least one renderable URL in any photo field
    • birthdate    — not null
    • location     — non-empty string
    • interests    — array with ≥1 item
    • intent       — non-empty string
                     (values: "dating" | "casual" | "live" | "creator")
  `);

  // ── Section 2: What /crush requires ─────────────────────────────────────
  section("2. CONDITIONS TO APPEAR IN /crush  (GET /api/users/discover)");
  console.log(`
  DB query filter:
    _id          ≠ current viewer
    isBlocked    = false
    onboardingComplete = true
    role         NOT IN ["admin","moderator","support","creator_manager","finance","content_reviewer"]
    ⚠  isSuspended is NOT filtered by this endpoint (potential gap)

  Additional dynamic filters applied per-viewer (discoveryPreferences):
    • gender / interestedIn    — reciprocal gender preference match
    • discoveryPreferences.ageRange   — birthdate range filter
    • discoveryPreferences.languages  — preferredLanguage match
    • discoveryPreferences.goals      — intent match via goal→intent map

  Note: creators and subCreators CAN appear in /crush (unlike /feed).
  `);

  // ── Section 3: onboardingComplete definition ─────────────────────────────
  section("3. WHAT THE SYSTEM CONSIDERS 'onboardingComplete'");
  console.log(`
  The field onboardingComplete (Boolean, default false) is set to true by the
  onboarding endpoint when the user explicitly submits/finalises their profile.

  It is a separate flag from 'profile complete' (missingFields check).
  A user can have onboardingComplete=true but still be missing profile fields
  (name, photo, birthdate, location, interests, intent) — in that case they pass
  the DB query but are flagged by canAppearInFeed=false in the audit.

  The onboarding flow is expected to set ALL required fields before flipping this
  flag, but data inconsistencies are possible for early/test accounts.
  `);

  // ── Section 4: Summary counts ────────────────────────────────────────────
  section("4. CURRENT VISIBILITY SUMMARY");
  console.log(`  Total users:               ${String(audited.length).padStart(6)}`);
  console.log(`  Eligible for /feed:        ${String(eligibleFeed.length).padStart(6)}`);
  console.log(`  Excluded from /feed:       ${String(excludedFeed.length).padStart(6)}`);
  console.log(`  Eligible for /crush:       ${String(eligibleCrush.length).padStart(6)}`);
  console.log(`  Excluded from /crush:      ${String(excludedCrush.length).padStart(6)}`);

  // ── Section 5: Top exclusion reasons ────────────────────────────────────
  section("5. TOP EXCLUSION REASONS");

  console.log("\n  /feed exclusion reasons:");
  console.log("  " + hr("─", 60));
  if (Object.keys(feedReasonCounts).length === 0) {
    console.log("  (none — all users are eligible)");
  } else {
    Object.entries(feedReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) =>
        console.log(`  ${pad(count, 6)}  ${reason}`)
      );
  }

  console.log("\n  /crush exclusion reasons:");
  console.log("  " + hr("─", 60));
  if (Object.keys(crushReasonCounts).length === 0) {
    console.log("  (none — all users are eligible)");
  } else {
    Object.entries(crushReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) =>
        console.log(`  ${pad(count, 6)}  ${reason}`)
      );
  }

  // ── Section 6: Per-user table ────────────────────────────────────────────
  section(`6. PER-USER DETAIL  (showing: ${AUDIT_SHOW}, max ${AUDIT_LIMIT})`);

  let toList = audited;
  if (AUDIT_SHOW === "excluded") toList = audited.filter(u => !u.canAppearInFeed || !u.canAppearInCrush);
  if (AUDIT_SHOW === "eligible") toList = audited.filter(u =>  u.canAppearInFeed && u.canAppearInCrush);

  const sliced = toList
    .sort((a, b) => {
      // Show excluded users first, then sort by role, then email
      const aExcl = !a.canAppearInFeed || !a.canAppearInCrush ? 0 : 1;
      const bExcl = !b.canAppearInFeed || !b.canAppearInCrush ? 0 : 1;
      return aExcl - bExcl || a.role.localeCompare(b.role) || a.email.localeCompare(b.email);
    })
    .slice(0, AUDIT_LIMIT);

  // Header
  const COL = {
    username:    14,
    role:        16,
    onboard:      8,
    photo:        6,
    age:          4,
    gender:       8,
    intIn:        8,
    location:    14,
    feed:         5,
    crush:        6,
  };
  const header = [
    pad("USERNAME",   COL.username),
    pad("ROLE",       COL.role),
    pad("ONBOARD",    COL.onboard),
    pad("PHOTO",      COL.photo),
    pad("AGE",        COL.age),
    pad("GENDER",     COL.gender),
    pad("INT_IN",     COL.intIn),
    pad("LOCATION",   COL.location),
    pad("FEED",       COL.feed),
    pad("CRUSH",      COL.crush),
    "EXCLUSION REASONS",
  ].join("  ");
  console.log("\n" + header);
  console.log(hr("─", header.length));

  for (const u of sliced) {
    const feedStr  = u.canAppearInFeed  ? "✓" : "✗";
    const crushStr = u.canAppearInCrush ? "✓" : "✗";

    // Merge feed and crush reasons into one readable string
    const feedLabel  = u.feedExclusionReasons.length  > 0
      ? u.feedExclusionReasons.map(r => `[feed] ${r}`).join(" | ")
      : "";
    const crushLabel = u.crushExclusionReasons.length > 0
      ? u.crushExclusionReasons.map(r => `[crush] ${r}`).join(" | ")
      : "";
    const reasons = [feedLabel, crushLabel].filter(Boolean).join(" | ") || "—";

    const row = [
      pad(u.username,        COL.username),
      pad(u.role,            COL.role),
      pad(u.onboardingComplete ? "true" : "false", COL.onboard),
      pad(u.hasPhoto ? "yes" : "no",               COL.photo),
      pad(u.age ?? "?",      COL.age),
      pad(u.gender,          COL.gender),
      pad(u.interestedIn,    COL.intIn),
      pad(u.location,        COL.location),
      pad(feedStr,           COL.feed),
      pad(crushStr,          COL.crush),
      reasons,
    ].join("  ");
    console.log(row);
  }

  if (toList.length > AUDIT_LIMIT) {
    console.log(`\n  … and ${toList.length - AUDIT_LIMIT} more. Set AUDIT_LIMIT env var to increase.`);
  }

  // ── Section 7: Detailed reason dump (excluded from feed only) ────────────
  section("7. DETAILED EXCLUSION BREAKDOWN — users excluded from /feed");
  if (excludedFeed.length === 0) {
    console.log("  All users are eligible for /feed.");
  } else {
    const byReason = {};
    for (const u of excludedFeed) {
      // Group by the primary (first) exclusion reason for cleaner aggregation
      const key = u.feedExclusionReasons[0] || "unknown";
      if (!byReason[key]) byReason[key] = [];
      byReason[key].push(u);
    }
    for (const [reason, group] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n  [${group.length} user(s)] ${reason}`);
      console.log("  " + hr("─", 60));
      for (const u of group.slice(0, 20)) {
        console.log(`    ${pad(u.email, 36)}  ${pad(u.role, 14)}  ${pad(u.username, 16)}`);
      }
      if (group.length > 20) console.log(`    … and ${group.length - 20} more`);
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  console.log("\n" + hr("═", 80));
  console.log("  ✅  Audit complete.  NO data was modified.");
  console.log("  💡  Tips:");
  console.log("      • Set AUDIT_SHOW=excluded to only show excluded users in section 6.");
  console.log("      • Set AUDIT_SHOW=eligible to only show eligible users in section 6.");
  console.log("      • Set AUDIT_LIMIT=1000 to see more rows.");
  console.log(hr("═", 80) + "\n");

  await mongoose.disconnect();
}

run().catch(err => {
  console.error("❌  Script failed:", err);
  process.exit(1);
});
