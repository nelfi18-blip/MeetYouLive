/**
 * user-report.js
 *
 * Read-only pre-deletion audit script.
 * Generates a full snapshot of the user base and shows exactly which accounts
 * would be KEPT (admin + system staff) vs. DELETED (everyone else).
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node backend/scripts/user-report.js
 *   — or —
 *   cd backend && node scripts/user-report.js   (reads .env automatically)
 *
 * NO data is modified by this script.
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../src/models/User");

// ── Role buckets ──────────────────────────────────────────────────────────────
const ADMIN_ROLES  = ["admin"];
const STAFF_ROLES  = ["moderator", "support", "creator_manager", "finance", "content_reviewer"];
const CREATOR_ROLES = ["creator", "subCreator"];
// Roles that will be KEPT (not deleted)
const KEEP_ROLES   = [...ADMIN_ROLES, ...STAFF_ROLES];

// ── Helpers ───────────────────────────────────────────────────────────────────
function hasPhoto(u) {
  return (u.avatar && u.avatar.trim() !== "") ||
         (Array.isArray(u.profilePhotos) && u.profilePhotos.length > 0);
}

function pad(str, len) {
  return String(str).padEnd(len);
}

function hr(char = "─", len = 72) {
  return char.repeat(len);
}

function section(title) {
  console.log("\n" + hr("═"));
  console.log(`  ${title}`);
  console.log(hr("═"));
}

function table(rows, cols) {
  // cols: [{ label, key, width }]
  const header = cols.map(c => pad(c.label, c.width)).join("  ");
  console.log(header);
  console.log(hr("─", header.length));
  for (const row of rows) {
    console.log(cols.map(c => pad(row[c.key], c.width)).join("  "));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("❌  No MongoDB URI found. Set MONGODB_URI or MONGO_URI in .env");
    process.exit(1);
  }

  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log("✅  Connected\n");

  // ── Fetch all users (projection: only the fields we need) ─────────────────
  const users = await User.find({})
    .select("_id name email role creatorStatus avatar profilePhotos onboardingComplete createdAt isBlocked isSuspended")
    .lean();

  // ── Classify ──────────────────────────────────────────────────────────────
  const total       = users.length;
  const admins      = users.filter(u => ADMIN_ROLES.includes(u.role));
  const staff       = users.filter(u => STAFF_ROLES.includes(u.role));
  const creators    = users.filter(u => CREATOR_ROLES.includes(u.role));
  const regularUsers = users.filter(u => u.role === "user");

  const withPhoto    = users.filter(u =>  hasPhoto(u));
  const withoutPhoto = users.filter(u => !hasPhoto(u));

  const onboardingComplete   = users.filter(u =>  u.onboardingComplete);
  const onboardingIncomplete = users.filter(u => !u.onboardingComplete);

  // Kept / deleted split (role-based, no data is touched here)
  const willKeep   = users.filter(u => KEEP_ROLES.includes(u.role));
  const willDelete = users.filter(u => !KEEP_ROLES.includes(u.role));

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log(hr("═"));
  console.log("  📊  MEETYOULIVE — USER AUDIT REPORT (read-only)");
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log(hr("═"));

  // 1. Summary counts
  section("1. GENERAL SUMMARY");
  const summaryRows = [
    { metric: "Total users (all roles)",       value: total },
    { metric: "  Admins",                       value: admins.length },
    { metric: "  Staff (moderators / support)", value: staff.length },
    { metric: "  Creators / SubCreators",       value: creators.length },
    { metric: "  Regular users (role=user)",    value: regularUsers.length },
  ];
  table(summaryRows, [
    { label: "Metric",  key: "metric", width: 44 },
    { label: "Count",   key: "value",  width: 8  },
  ]);

  // 2. Photo coverage
  section("2. PROFILE PHOTO COVERAGE");
  const photoRows = [
    { metric: "Users WITH a photo (avatar or profilePhotos)", value: withPhoto.length },
    { metric: "Users WITHOUT any photo",                      value: withoutPhoto.length },
  ];
  table(photoRows, [
    { label: "Metric",  key: "metric", width: 52 },
    { label: "Count",   key: "value",  width: 8  },
  ]);

  // 3. Onboarding
  section("3. ONBOARDING STATUS");
  const onboardRows = [
    { metric: "Onboarding COMPLETE",   value: onboardingComplete.length },
    { metric: "Onboarding INCOMPLETE", value: onboardingIncomplete.length },
  ];
  table(onboardRows, [
    { label: "Metric",  key: "metric", width: 30 },
    { label: "Count",   key: "value",  width: 8  },
  ]);

  // 4. Role breakdown (full detail)
  section("4. ROLE BREAKDOWN");
  const roleCounts = {};
  for (const u of users) {
    roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
  }
  const roleRows = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));
  table(roleRows, [
    { label: "Role",  key: "role",  width: 20 },
    { label: "Count", key: "count", width: 8  },
  ]);

  // 5. Accounts that would be KEPT
  section("5. ACCOUNTS THAT WOULD BE KEPT  (admin + staff)");
  if (willKeep.length === 0) {
    console.log("  ⚠️  No admin or staff accounts found!");
  } else {
    const keepCols = [
      { label: "ID",       key: "id",    width: 26 },
      { label: "Role",     key: "role",  width: 16 },
      { label: "Name",     key: "name",  width: 24 },
      { label: "Email",    key: "email", width: 34 },
      { label: "Created",  key: "created", width: 12 },
    ];
    const keepRows = willKeep
      .sort((a, b) => a.role.localeCompare(b.role))
      .map(u => ({
        id:      String(u._id),
        role:    u.role,
        name:    (u.name || "—").slice(0, 22),
        email:   (u.email || "—").slice(0, 32),
        created: u.createdAt ? u.createdAt.toISOString().slice(0, 10) : "—",
      }));
    table(keepRows, keepCols);
  }

  // 6. Accounts that would be DELETED  (summary + optional detail)
  section("6. ACCOUNTS THAT WOULD BE DELETED  (everyone else)");
  console.log(`  Total to delete: ${willDelete.length}\n`);

  // Sub-counts by role
  const deleteCounts = {};
  for (const u of willDelete) {
    deleteCounts[u.role] = (deleteCounts[u.role] || 0) + 1;
  }
  const deleteCountRows = Object.entries(deleteCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));
  table(deleteCountRows, [
    { label: "Role",  key: "role",  width: 20 },
    { label: "Count", key: "count", width: 8  },
  ]);

  // Optionally list them (cap at 200 to avoid flooding the terminal)
  const LIST_LIMIT = 200;
  const toList = willDelete.slice(0, LIST_LIMIT);
  console.log(`\n  First ${toList.length} of ${willDelete.length} accounts that would be deleted:`);
  const deleteCols = [
    { label: "ID",       key: "id",    width: 26 },
    { label: "Role",     key: "role",  width: 16 },
    { label: "Name",     key: "name",  width: 24 },
    { label: "Email",    key: "email", width: 34 },
    { label: "Onboard",  key: "onboarding", width: 10 },
    { label: "Photo",    key: "photo",      width: 7  },
    { label: "Blocked",  key: "blocked",    width: 8  },
  ];
  const deleteRows = toList
    .sort((a, b) => a.role.localeCompare(b.role) || (a.email || "").localeCompare(b.email || ""))
    .map(u => ({
      id:          String(u._id),
      role:        u.role,
      name:        (u.name || "—").slice(0, 22),
      email:       (u.email || "—").slice(0, 32),
      onboarding:  u.onboardingComplete ? "✓" : "✗",
      photo:       hasPhoto(u) ? "✓" : "✗",
      blocked:     u.isBlocked ? "yes" : "no",
    }));
  table(deleteRows, deleteCols);

  if (willDelete.length > LIST_LIMIT) {
    console.log(`\n  … and ${willDelete.length - LIST_LIMIT} more (increase LIST_LIMIT in the script to see all).`);
  }

  // 7. Footer
  console.log("\n" + hr("═"));
  console.log("  ✅  Report complete.  NO data was modified.");
  console.log(hr("═") + "\n");

  await mongoose.disconnect();
}

run().catch(err => {
  console.error("❌  Script failed:", err);
  process.exit(1);
});
