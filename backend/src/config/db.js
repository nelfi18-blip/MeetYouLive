const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;

  if (!uri) {
    console.error("❌ MONGODB_URI o DATABASE_URL no está configurado");
    process.exit(1);
  }

  try {
    if (mongoose.connection.readyState >= 1) return;

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB conectado exitosamente");
  } catch (error) {
    console.error("❌ Error MongoDB:", error.message);
    // In production, fail fast if DB connection fails
    // The backend cannot operate without a database connection
    if (process.env.NODE_ENV === 'production') {
      console.error("❌ Cannot start backend without database connection in production");
      process.exit(1);
    }
    // In development, allow retry
    throw error;
  }
};

module.exports = connectDB;