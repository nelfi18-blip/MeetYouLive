/**
 * seed-admin.js
 * Creates or updates the platform administrator account.
 *
 * Usage:
 *   ADMIN_PASSWORD=<password> npm run seed:admin
 *
 * Optional env vars (defaults shown):
 *   ADMIN_USERNAME  – default: meetyoulive
 *   ADMIN_EMAIL     – default: admin@meetyoulive.net
 *   ADMIN_PASSWORD  – REQUIRED (no default)
 *
 * The script uses MONGODB_URI and JWT_SECRET from your .env file (or the
 * environment), so run it from the backend/ directory after filling in .env.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/User.js");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "meetyoulive";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@meetyoulive.net";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error("❌  ADMIN_PASSWORD env var is required.");
  console.error("    Example: ADMIN_PASSWORD=yourpassword npm run seed:admin");
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 6) {
  console.error("❌  ADMIN_PASSWORD must be at least 6 characters.");
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error("❌  MONGODB_URI env var is not set. Check your .env file.");
  process.exit(1);
}

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅  Connected to MongoDB");
  } catch (err) {
    console.error("❌  Could not connect to MongoDB:", err.message);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // Try to find an existing admin (by username or email) and update it,
  // otherwise create a brand-new admin account.
  let admin = await User.findOne({
    $or: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }],
  });

  if (admin) {
    admin.username = ADMIN_USERNAME;
    admin.email = ADMIN_EMAIL;
    admin.password = hashed;
    admin.role = "admin";
    admin.isBlocked = false;
    await admin.save();
    console.log(`✅  Admin account updated  →  username: ${ADMIN_USERNAME}  |  email: ${ADMIN_EMAIL}`);
  } else {
    await User.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: hashed,
      role: "admin",
    });
    console.log(`✅  Admin account created  →  username: ${ADMIN_USERNAME}  |  email: ${ADMIN_EMAIL}`);
  }

  await mongoose.disconnect();
  console.log("✅  Done.");
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err.message);
  process.exit(1);
});
