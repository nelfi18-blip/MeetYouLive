export function getAdminUserEmailStatus(user = {}) {
  if (user.role === "admin") {
    return { label: "Administrador", className: "status-admin-account", canVerifyManually: false };
  }

  if (user.isGoogleAccount === true || user.authProvider === "google" || Boolean(user.googleId)) {
    return { label: "Cuenta Google", className: "status-google", canVerifyManually: false };
  }

  if (user.authProvider === "local" && user.emailVerified === true) {
    return { label: "Cuenta local verificada", className: "status-email-verified", canVerifyManually: false };
  }

  if (user.authProvider === "local" && user.emailVerified !== true) {
    return { label: "Cuenta local sin verificar", className: "status-email-unverified", canVerifyManually: true };
  }

  return { label: "Sin información", className: "status-email-unknown", canVerifyManually: false };
}
