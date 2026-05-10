require("dotenv").config();
const http = require("http");
const path = require("path");

// Validate required environment variables at startup
const requiredEnvVars = [
  'JWT_SECRET',
  'FRONTEND_URL'
];

// MONGO_URI or MONGODB_URI (at least one required)
// This validation ensures at least one MongoDB connection string is present
// The actual connection in db.js will use MONGODB_URI || DATABASE_URL
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!mongoUri) {
  console.error("❌ FATAL: MONGO_URI, MONGODB_URI, or DATABASE_URL must be set");
  process.exit(1);
}

// Check other required vars
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

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
