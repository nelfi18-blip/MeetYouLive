export function isGoogleUser(user = {}) {
  return user.authProvider === "google" || user.isGoogleAccount === true;
}

export function canAdminVerifyEmail(user = {}) {
  if (typeof user.canAdminVerifyEmail === "boolean") return user.canAdminVerifyEmail;
  return user.authProvider === "local" && user.emailVerified === false && user.role !== "admin";
}

export function getEmailStatusLabel(user = {}) {
  if (isGoogleUser(user)) return "Cuenta Google";
  if (user.emailVerified === true) return "Email verificado";
  if (user.authProvider === "local" && user.emailVerified === false) return "Email sin verificar";
  return "Email pendiente de diagnóstico";
}

export function getEmailStatusClassName(user = {}) {
  if (isGoogleUser(user)) return "status-google";
  if (user.emailVerified === true) return "status-email-verified";
  if (user.authProvider === "local" && user.emailVerified === false) return "status-email-unverified";
  return "status-email-unknown";
}
