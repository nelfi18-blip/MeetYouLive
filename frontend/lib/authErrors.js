/**
 * Maps NextAuth error codes to user-facing Spanish messages.
 * Used by both the login page (/login?error=...) and the dedicated
 * auth error page (/auth/error?error=...).
 */
export const AUTH_ERROR_MESSAGES = {
  OAuthCallback:
    "Hubo un problema al conectar con Google. Por favor, inténtalo de nuevo.",
  OAuthSignin:
    "No se pudo iniciar el flujo de autenticación con Google. Inténtalo de nuevo.",
  OAuthCreateAccount:
    "No se pudo crear la cuenta con Google. Por favor, inténtalo de nuevo.",
  OAuthAccountNotLinked:
    "Este email ya está asociado a otra cuenta. Usa el método de inicio de sesión original.",
  Callback:
    "Ocurrió un error durante la autenticación. Por favor, inténtalo de nuevo.",
  AccessDenied: "Acceso denegado. No tienes permiso para iniciar sesión.",
  Configuration:
    "Error de configuración del servidor. Contacta al administrador.",
  Verification:
    "El enlace de verificación ha expirado o ya fue utilizado.",
  Default: "Ocurrió un error al iniciar sesión. Por favor, inténtalo de nuevo.",
};
