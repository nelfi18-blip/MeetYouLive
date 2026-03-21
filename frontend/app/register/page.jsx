"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect to dashboard if the user is already authenticated.
  useEffect(() => {
    if (status === "loading") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token || status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const handleSubmit = (e) => {
    e.preventDefault();
    register();
  };

  const register = async () => {
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
      if (!API_URL) {
        setError("Error de configuración: no se puede contactar el servidor");
        return;
      }

      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      let data = {};
      let jsonParseError = false;
      try {
        data = await res.json();
      } catch {
        // Response was not valid JSON (e.g. HTML error page from proxy)
        jsonParseError = true;
      }

      if (!res.ok || jsonParseError) {
        const rawMsg = data.message || "El servidor no respondió correctamente. Por favor, intente de nuevo más tarde.";
        const lowerMsg = rawMsg.toLowerCase();
        // Show a friendlier message when the email is already registered.
        if (lowerMsg.includes("email") && lowerMsg.includes("exist")) {
          setError("Esta cuenta ya existe. Inicia sesión o continúa con Google.");
        } else {
          setError(rawMsg);
        }
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
        setSuccess("¡Cuenta creada! Redirigiendo al dashboard…");
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      } else {
        setSuccess("¡Cuenta creada! Redirigiendo al inicio de sesión…");
        setTimeout(() => {
          router.push("/login");
        }, 1500);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-bg">
      {/* Decorative blobs */}
      <div className="register-blob register-blob-1" />
      <div className="register-blob register-blob-2" />

      <div className="register-card">
        {/* Logo */}
        <div className="register-logo">
          <div className="register-logo-icon">▶</div>
          <span className="register-logo-text">MeetYouLive</span>
        </div>

        <h1 className="register-title">Crear cuenta</h1>
        <p className="register-subtitle">Únete a la comunidad de streaming</p>

        {error && <div className="register-error">{error}</div>}
        {success && <div className="register-success">{success}</div>}

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre de usuario</label>
            <input
              className="input"
              type="text"
              placeholder="tunombredeusuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>

        <div className="divider-text">o continúa con</div>

        <button
          className="btn btn-google btn-lg btn-block"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Entrar con Google
        </button>

        <p className="register-login-link">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login">Inicia sesión</Link>
        </p>
      </div>

      <style jsx>{`
        .register-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 1rem;
          position: relative;
          overflow: hidden;
        }

        .register-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          opacity: 0.25;
        }

        .register-blob-1 {
          width: 500px;
          height: 500px;
          background: var(--accent);
          top: -200px;
          left: -150px;
        }

        .register-blob-2 {
          width: 400px;
          height: 400px;
          background: #3d1a78;
          bottom: -180px;
          right: -100px;
        }

        .register-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 2.5rem;
          width: 100%;
          max-width: 420px;
          box-shadow: var(--shadow);
          position: relative;
          z-index: 1;
        }

        .register-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 2rem;
          justify-content: center;
        }

        .register-logo-icon {
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

        .register-logo-text {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.03em;
        }

        .register-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--text);
          text-align: center;
          margin-bottom: 0.4rem;
        }

        .register-subtitle {
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 1.75rem;
          font-size: 0.95rem;
        }

        .register-error {
          background: rgba(244, 67, 54, 0.12);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }

        .register-success {
          background: rgba(76, 175, 80, 0.12);
          border: 1px solid var(--success);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }

        .register-form { display: flex; flex-direction: column; gap: 1rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .btn-google {
          background: var(--card);
          color: var(--text);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
        }

        .btn-google:hover {
          background: var(--card-hover);
          border-color: #4285F4;
        }

        .register-login-link {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
