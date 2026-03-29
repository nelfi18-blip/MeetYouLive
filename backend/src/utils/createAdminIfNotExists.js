const bcrypt = require("bcryptjs");
const User = require("../models/User");

const createAdminIfNotExists = async () => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME;

    if (!email || !password || !name) {
      console.log("❌ ADMIN env variables faltantes");
      return;
    }

    let admin = await User.findOne({ email });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (!admin) {
      admin = new User({
        name,
        username: name,
        email,
        password: hashedPassword,
        role: "admin",
      });

      await admin.save();
      console.log("✅ Admin creado");
    } else {
      admin.password = hashedPassword;
      admin.role = "admin";
      admin.name = name;
      admin.username = name;

      await admin.save();
      console.log("🔁 Admin actualizado correctamente");
    }
  } catch (error) {
    console.error("❌ Error creando admin:", error);
  }
};

module.exports = createAdminIfNotExists;
