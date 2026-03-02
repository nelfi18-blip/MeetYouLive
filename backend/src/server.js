const dotenv = require("dotenv");
dotenv.config();

const app = require("./app.js");
const { connectDB } = require("./config/db.js");

const PORT = process.env.PORT || 10000;

connectDB();

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
