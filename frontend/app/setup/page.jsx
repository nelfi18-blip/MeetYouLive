"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/check-admin`);
        const data = await res.json();
        if (data.adminExists) {
          router.replace("/login");
        } else {
          setChecking(false);
        }
      } catch {
        setChecking(false);
      }
    };
    check();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !email.trim() || !password) {
      setError("Todos los campos son obligatorios");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        setError("El servidor devolvió una respuesta inválida. Por favor, inténtalo de nuevo.");
        return;
      }

      if (!res.ok) {
        setError(data.message || "Error al crear el administrador");
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      setSuccess("¡Administrador creado! Redirigiendo…");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="setup-bg">
        <div className="setup-spinner" aria-label="Cargando…" />
      </div>
    );
  }

  return (
    <div className="setup-bg">
      <div className="setup-blob setup-blob-1" />
      <div className="setup-blob setup-blob-2" />

      <div className="setup-card">
        <div className="setup-logo">
          <div className="setup-logo-icon">▶</div>
          <span className="setup-logo-text">MeetYouLive</span>
        </div>

        <h1 className="setup-title">Configuración inicial</h1>
        <p className="setup-subtitle">Crea la cuenta de administrador para comenzar</p>

        <div className="setup-info">
          <span className="setup-info-icon">ℹ️</span>
          <span>
            Elige el <strong>nombre de usuario</strong>, <strong>email</strong> y{" "}
            <strong>contraseña</strong> que deseas usar para acceder como administrador.
            No hay credenciales predeterminadas — tú las defines aquí.
          </span>
        </div>

        {error && <div className="setup-error">{error}</div>}
        {success && <div className="setup-success">{success}</div>}

        <form className="setup-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre de usuario</label>
            <input
              className="input"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="admin@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="input"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar contraseña</label>
            <input
              className="input"
              type="password"
              placeholder="Repite tu contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block setup-submit-btn"
            disabled={loading}
          >
            {loading ? "Creando administrador…" : "Crear administrador"}
          </button>
        </form>

        <p className="setup-login-link">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login">Inicia sesión</Link>
        </p>
      </div>

      <style jsx>{`
        .setup-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse at 70% 20%, rgba(233,30,140,0.12) 0%, transparent 60%),
                      radial-gradient(ellipse at 20% 80%, rgba(61,26,120,0.18) 0%, transparent 55%),
                      var(--bg);
          padding: 1rem;
          position: relative;
          overflow: hidden;
        }

        .setup-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          opacity: 0.25;
        }

        .setup-blob-1 {
          width: 500px;
          height: 500px;
          background: var(--accent);
          top: -200px;
          right: -150px;
        }

        .setup-blob-2 {
          width: 400px;
          height: 400px;
          background: #3d1a78;
          bottom: -180px;
          left: -100px;
        }

        .setup-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(255,255,255,0.12);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .setup-card {
          background: rgba(24, 24, 24, 0.92);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 24px;
          padding: 2.75rem 2.5rem;
          width: 100%;
          max-width: 430px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(233,30,140,0.08);
          position: relative;
          z-index: 1;
          backdrop-filter: blur(12px);
        }

        .setup-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 2rem;
          justify-content: center;
        }

        .setup-logo-icon {
          width: 40px;
          height: 40px;
          background: var(--accent);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          color: #fff;
        }

        .setup-logo-text {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.03em;
        }

        .setup-title {
          font-size: 1.65rem;
          font-weight: 700;
          color: var(--text);
          text-align: center;
          margin-bottom: 0.4rem;
        }

        .setup-subtitle {
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 1.75rem;
          font-size: 0.95rem;
        }

        .setup-info {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          background: rgba(66, 133, 244, 0.1);
          border: 1px solid rgba(66, 133, 244, 0.35);
          border-radius: var(--radius-sm);
          padding: 0.85rem 1rem;
          font-size: 0.875rem;
          color: var(--text);
          line-height: 1.5;
          margin-bottom: 1.25rem;
        }

        .setup-info-icon {
          font-size: 1rem;
          flex-shrink: 0;
          margin-top: 0.05rem;
        }

        .setup-error {
          background: rgba(244, 67, 54, 0.12);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }

        .setup-success {
          background: rgba(76, 175, 80, 0.12);
          border: 1px solid var(--success);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }

        .setup-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .form-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .setup-submit-btn {
          margin-top: 0.25rem;
          background: linear-gradient(135deg, #e91e8c, #9c27b0);
          border: none;
          position: relative;
          overflow: hidden;
        }

        .setup-submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.12) 60%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.4s ease;
          pointer-events: none;
        }

        .setup-submit-btn:hover:not(:disabled)::after {
          transform: translateX(100%);
        }

        .setup-submit-btn:hover:not(:disabled) {
          box-shadow: 0 6px 28px rgba(233,30,140,0.45);
          transform: translateY(-1px);
        }

        .setup-login-link {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
