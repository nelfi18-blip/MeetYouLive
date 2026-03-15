if (session?.backendToken) {
  localStorage.setItem("token", session.backendToken);
}

const token = localStorage.getItem("token");

if (!token) {
  setError("No se pudo obtener el token de sesión. Por favor, inicia sesión de nuevo.");
  return;
}
