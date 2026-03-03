const dotenv = require("dotenv");
dotenv.config();

const app = require("./src/app.js");
const { connectDB } = require("./src/config/db.js");

const PORT = process.env.PORT || 10000;

connectDB();

app.listen(PORT, () => {
  console.log("✅ MeetYouLive backend corriendo en puerto " + PORT);
});
