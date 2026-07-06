const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

  if (!uri) {
    console.error("❌ MONGODB_URI o DATABASE_URL no está configurado");
    process.exit(1);
  }

  try {
    if (mongoose.connection.readyState >= 1) return;

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000, // Increased to 30s for cold starts on Render
      socketTimeoutMS: 45000, // Socket timeout to prevent mid-query disconnects
      connectTimeoutMS: 30000, // Initial connection timeout
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
    // In development, throw error to allow caller to handle retry logic
    console.error("⚠️ Development mode: Throwing error for caller to handle");
    throw error;
  }
};

module.exports = connectDB;