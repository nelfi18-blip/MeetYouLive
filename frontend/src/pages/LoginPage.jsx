import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;
const GOOGLE_URL = API_URL ? `${API_URL}/api/auth/google` : "";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = async () => {
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Error al iniciar sesión");
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
        window.location.href = "/dashboard";
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">MeetYouLive</div>
        <p className="auth-subtitle">Inicia sesión para continuar</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={login}>
          Entrar
        </button>
        {GOOGLE_URL && (
          <>
            <div className="divider">o</div>
            <a className="btn btn-outline" href={GOOGLE_URL}>
              🔍 Entrar con Google
            </a>
          </>
        )}
      </div>
    </div>
  );
}
