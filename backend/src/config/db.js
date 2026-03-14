const mongoose = require("mongoose");

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error(
      "Configuration error: MONGO_URI environment variable is required. Please set it in your .env file or deployment environment."
    );
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB conectado");
  } catch (error) {
    console.error("❌ Error MongoDB:", error.message);
    throw error;
  }
};

module.exports = { connectDB };