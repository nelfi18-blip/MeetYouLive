require("dotenv").config();
const http = require("http");
const path = require("path");

const app = require(path.join(__dirname, "src", "app"));
const connectDB = require(path.join(__dirname, "src", "config", "db"));
const createAdminIfNotExists = require(path.join(__dirname, "src", "utils", "createAdminIfNotExists"));
const migrateCreatorPending = require(path.join(__dirname, "src", "utils", "migrateCreatorPending"));
const { initSocket } = require(path.join(__dirname, "src", "lib", "socket"));
const { startReactivationJob } = require(path.join(__dirname, "src", "jobs", "reactivation.job"));
const { startPushJob } = require(path.join(__dirname, "src", "jobs", "push.job"));
const { startDailyRewardReminderJob } = require(path.join(__dirname, "src", "jobs", "dailyRewardReminder.job"));

const PORT = process.env.PORT || 10000;

const server = http.createServer(app);
initSocket(server);

// Iniciar base de datos y luego el servidor
connectDB()
  .then(async () => {
    await createAdminIfNotExists();
    await migrateCreatorPending();
    startReactivationJob();
    startPushJob();
    startDailyRewardReminderJob();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Servidor MeetYouLive listo en puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  });
