require("dotenv").config();
const path = require("path");

const app = require(path.join(__dirname, "src", "app"));
const connectDB = require(path.join(__dirname, "src", "config", "db"));
const createAdminIfNotExists = require(path.join(__dirname, "src", "utils", "createAdminIfNotExists"));
const migrateCreatorPending = require(path.join(__dirname, "src", "utils", "migrateCreatorPending"));

const PORT = process.env.PORT || 10000;

// Iniciar base de datos y luego el servidor
connectDB()
  .then(async () => {
    await createAdminIfNotExists();
    await migrateCreatorPending();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Servidor MeetYouLive listo en puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  });
