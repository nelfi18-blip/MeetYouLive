const dotenv = require("dotenv");
dotenv.config();

const app = require("./src/app.js");
const { connectDB } = require("./src/config/db.js");

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    return res.status(503).json({ ok: false, message: "Service unavailable" });
  }
  return app(req, res);
};
