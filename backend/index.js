const dotenv = require("dotenv");
dotenv.config();

const app = require("./src/app.js");
const { connectDB } = require("./src/config/db.js");

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error("❌ Serverless function error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
