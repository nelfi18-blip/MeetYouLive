require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../src/models/User.js");

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

const googleEvidenceFilter = {
  $or: [
    { authProvider: "google" },
    { googleId: { $exists: true, $nin: [null, ""] } },
    { password: { $not: /^\$2[aby]\$/ } },
  ],
};

async function main() {
  if (!uri) {
    throw new Error("MONGO_URI, MONGODB_URI o DATABASE_URL no está configurado");
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
  });

  const [
    emailVerifiedTrue,
    emailVerifiedFalse,
    emailVerifiedMissing,
    googleAccounts,
    googleAccountsEmailVerifiedNotTrue,
  ] = await Promise.all([
    User.countDocuments({ emailVerified: true }),
    User.countDocuments({ emailVerified: false }),
    User.countDocuments({ emailVerified: { $exists: false } }),
    User.countDocuments(googleEvidenceFilter),
    User.countDocuments({ ...googleEvidenceFilter, emailVerified: { $ne: true } }),
  ]);

  console.log(JSON.stringify({
    emailVerifiedTrue,
    emailVerifiedFalse,
    emailVerifiedMissing,
    googleAccounts,
    googleAccountsEmailVerifiedNotTrue,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
