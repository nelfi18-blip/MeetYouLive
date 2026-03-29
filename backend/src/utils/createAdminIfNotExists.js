const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function createAdminIfNotExists() {
  try {
    const adminName = process.env.ADMIN_NAME;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminName || !adminEmail || !adminPassword) {
      console.log("⚠️ Admin env vars incompletas, se omite creación de admin");
      return;
    }

    const existing = await User.findOne({ email: adminEmail });
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    if (!existing) {
      await User.create({
        name: adminName,
        username: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        coins: 0,
        earningsCoins: 0,
      });

      console.log("✅ Admin creado automáticamente");
      return;
    }

    existing.name = adminName;
    existing.username = adminName;
    existing.email = adminEmail;
    existing.password = hashedPassword;
    existing.role = "admin";

    await existing.save();
    console.log("🔁 Admin actualizado automáticamente");
  } catch (error) {
    console.error("Error creando/actualizando admin:", error.message);
  }
}

module.exports = createAdminIfNotExists;
