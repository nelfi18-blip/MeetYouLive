/**
 * createAdmin.js
 * Creates or updates the platform administrator account using env vars.
 *
 * Usage:
 *   npm run create-admin
 *
 * Required env vars:
 *   ADMIN_NAME      – Display name for the admin user
 *   ADMIN_EMAIL     – Email address for the admin user
 *   ADMIN_PASSWORD  – Plain-text password (will be hashed)
 *   MONGODB_URI (or MONGO_URI) – MongoDB connection string
 */

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/User.js");

async function createAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("Falta MONGODB_URI o MONGO_URI");
    }

    if (
      !process.env.ADMIN_NAME ||
      !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD
    ) {
      throw new Error(
        "Faltan ADMIN_NAME, ADMIN_EMAIL o ADMIN_PASSWORD en variables de entorno"
      );
    }

    await mongoose.connect(mongoUri);

    const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

    if (existing) {
      existing.name = process.env.ADMIN_NAME;
      existing.username = process.env.ADMIN_NAME;
      existing.email = process.env.ADMIN_EMAIL;
      existing.password = hashedPassword;
      existing.role = "admin";
      await existing.save();
      console.log("✅  Administrador actualizado correctamente");
    } else {
      await User.create({
        name: process.env.ADMIN_NAME,
        username: process.env.ADMIN_NAME,
        email: process.env.ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
        coins: 0,
        earningsCoins: 0,
      });
      console.log("✅  Administrador creado correctamente");
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌  Error creando administrador:", error.message);
    process.exit(1);
  }
}

createAdmin();
