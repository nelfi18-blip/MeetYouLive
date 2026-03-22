const mongoose = require("mongoose");

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB conectado");
  } catch (error) {
    console.error("❌ Error MongoDB:", error.message);
    throw error;
  }
};

module.exports = { connectDB };