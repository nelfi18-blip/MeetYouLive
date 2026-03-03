"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    <div>
      <h1>MeetYouLive — Iniciar sesión</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={login}>Entrar</button>
      <button onClick={() => signIn("google")}>Entrar con Google</button>
    </div>
  );
}
