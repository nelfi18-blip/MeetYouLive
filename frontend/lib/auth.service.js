const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
      return { error: errorData.message || "Error en el servidor", code: errorData.code };
    }

    return await response.json();
  } catch (error) {
    console.error("Connection Error:", error);
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo más tarde." };
  }
};
