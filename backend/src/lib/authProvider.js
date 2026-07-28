const AUTH_PROVIDERS = Object.freeze({
  LOCAL: "local",
  GOOGLE: "google",
});

function isBcryptPassword(password) {
  return typeof password === "string" && /^\$2[aby]\$/.test(password);
}

function isGoogleAccount(user = {}) {
  if (user.authProvider === AUTH_PROVIDERS.GOOGLE) return true;
  if (user.googleId) return true;
  return typeof user.password === "string" && !isBcryptPassword(user.password);
}

function resolveAuthProvider(user = {}) {
  if (isGoogleAccount(user)) return AUTH_PROVIDERS.GOOGLE;
  if (user.authProvider === AUTH_PROVIDERS.LOCAL) return AUTH_PROVIDERS.LOCAL;
  if (isBcryptPassword(user.password)) return AUTH_PROVIDERS.LOCAL;
  return "unknown";
}

function getEmailVerificationState(user = {}) {
  if (user.emailVerified === true) return "verified";
  if (user.emailVerified === false) return "unverified";
  return "unknown";
}

module.exports = {
  AUTH_PROVIDERS,
  getEmailVerificationState,
  isBcryptPassword,
  isGoogleAccount,
  resolveAuthProvider,
};
