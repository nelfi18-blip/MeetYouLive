export function getAdminUserEmailStatus(user = {}) {
  if (user.isGoogleAccount === true || user.authProvider === "google") {
    return { label: "Cuenta Google", className: "status-google", canVerifyManually: false };
  }

  if (user.emailVerified === true) {
    return { label: "Email verificado", className: "status-email-verified", canVerifyManually: false };
  }

  if (user.emailVerified === false) {
    return { label: "Email sin verificar", className: "status-email-unverified", canVerifyManually: true };
  }

  return { label: "Email sin estado", className: "status-email-unknown", canVerifyManually: false };
}
