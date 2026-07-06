const REQUIRED_ENV_VARS = ["JWT_SECRET", "FRONTEND_URL"];
const DATABASE_ENV_VARS = ["MONGO_URI", "MONGODB_URI", "DATABASE_URL"];

function getMissingEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (!DATABASE_ENV_VARS.some((name) => process.env[name])) {
    missing.push(`one of (${DATABASE_ENV_VARS.join(", ")})`);
  }
  return missing;
}

function validateEnv() {
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  getMissingEnvVars,
  validateEnv,
};
