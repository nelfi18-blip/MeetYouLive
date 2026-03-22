/**
 * test-db-connection.js
 * Verifies that the backend can reach MongoDB using the configured MONGODB_URI.
 *
 * Usage:
 *   npm run test:db
 *
 * The script reads MONGODB_URI from your .env file (or the environment).
 * Run it from the backend/ directory.
 */

require("dotenv").config();

const mongoose = require("mongoose");

console.log("--- MEETYOULIVE DATABASE CONNECTION TEST ---");
console.log(
  "MONGODB_URI configured:",
  process.env.MONGODB_URI ? "YES ✅" : "NO ❌"
);

if (!process.env.MONGODB_URI) {
  console.error(
    "❌  MONGODB_URI env var is not set. Check your .env file or Render environment."
  );
  process.exit(1);
}

async function runTest() {
  try {
    console.log("Attempting to connect to the database...");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ Connection successful! The server can reach the database.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("--- CONNECTION ERROR ---");
    console.error("Message:", err.message);
    console.error("Error code:", err.code);
    console.error("-----------------------");
    process.exit(1);
  }
}

runTest();
