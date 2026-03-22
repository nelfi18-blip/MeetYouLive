require("dotenv").config();

const path = require("path");

const app = require(path.join(__dirname, "src", "app"));
const { connectDB } = require(path.join(__dirname, "src", "config", "db"));

const PORT = process.env.PORT || 10000;

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ MeetYouLive API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error starting backend:", error);
    process.exit(1);
  }
}

startServer();
