const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;

  try {
    if (mongoose.connection.readyState >= 1) return;

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB conectado exitosamente");
  } catch (error) {
    console.error("❌ Error MongoDB:", error.message);
    // No cerramos el proceso para permitir que Render intente reconectar automáticamente
  }
};

module.exports = connectDB;