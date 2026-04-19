const API_URL = process.env.NEXT_PUBLIC_API_URL;
const REQUEST_TIMEOUT_MS = 15000;

export const signUp = async (userData) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.message || "Error en el servidor", code: errorData.code };
    }

    return await response.json();
  } catch (error) {
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  }
};

export const login = async (credentials) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.message || "Error en el servidor", code: errorData.code, email: errorData.email };
    }

    return await response.json();
  } catch (error) {
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  }
};

export const verifyEmail = async ({ email, code }) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.message || "Código incorrecto", code: errorData.code };
    }

    return await response.json();
  } catch (error) {
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  }
};

export const resendVerification = async (email) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.message || "Error al reenviar" };
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      return { error: "La solicitud tardó demasiado. Intenta de nuevo." };
    }
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const forgotPassword = async (email) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.message || "Error al enviar el código" };
    }

    return await response.json();
  } catch (error) {
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  }
};

export const resetPassword = async ({ email, code, newPassword, password }) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword: newPassword || password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.message || "No se pudo restablecer la contraseña" };
    }

    return await response.json();
  } catch (error) {
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  }
};
