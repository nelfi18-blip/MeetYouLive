const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function createAdminIfNotExists() {
  try {
    const adminName = process.env.ADMIN_NAME;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminName || !adminEmail || !adminPassword) {
      console.log("Admin env vars incompletas, se omite creación de admin");
      return;
    }

    const existing = await User.findOne({ email: adminEmail });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
        name: adminName,
        username: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        coins: 0,
        earningsCoins: 0,
      });

      console.log("Admin creado automáticamente");
      return;
    }

    let changed = false;

    if (existing.name !== adminName) {
      existing.name = adminName;
      changed = true;
    }

    if (existing.username !== adminName) {
      existing.username = adminName;
      changed = true;
    }

    if (existing.role !== "admin") {
      existing.role = "admin";
      changed = true;
    }

    const passwordMatch = await bcrypt.compare(adminPassword, existing.password);
    if (!passwordMatch) {
      existing.password = await bcrypt.hash(adminPassword, 10);
      changed = true;
    }

    if (changed) {
      await existing.save();
      console.log("Admin actualizado automáticamente");
    }
  } catch (error) {
    console.error("Error creando/actualizando admin:", error.message);
  }
}

module.exports = { createAdminIfNotExists };
