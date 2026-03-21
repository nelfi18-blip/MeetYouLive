"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Logo from "../../components/Logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
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
        setError(
          data.message ||
            "El servidor no respondió correctamente. Por favor, intente de nuevo más tarde."
        );
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
        window.location.href = "/dashboard";
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") login();
  };

  return (
    <div className="login-bg">
      {/* Animated background blobs */}
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />
      <div className="login-blob login-blob-3" />

      {/* Subtle particle dots */}
      <div className="login-particles" aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <div key={i} className={`login-particle login-particle-${i + 1}`} />
        ))}
      </div>

      <div className="login-card">
        {/* New logo */}
        <div className="login-logo-wrap">
          <Logo size="md" />
        </div>

        <h1 className="login-title">Bienvenido de nuevo</h1>
        <p className="login-subtitle">Inicia sesión para continuar</p>

        {error && <div className="login-error">{error}</div>}

        <div className="login-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="input input-lg"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="input input-lg"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <button
            className="btn btn-primary btn-lg btn-block login-submit-btn"
            onClick={login}
            disabled={loading}
          >
            {loading ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
        </div>

        <div className="divider-text">o continúa con</div>

        <button
          className="btn btn-google btn-lg btn-block"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-label="Google" role="img">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>

        <p className="login-register-link">
          ¿No tienes cuenta?{" "}
          <Link href="/register">Regístrate gratis</Link>
        </p>

        <p className="login-setup-link">
          ¿Primera vez aquí?{" "}
          <Link href="/setup">Configurar administrador</Link>
        </p>
      </div>

      <style jsx>{`
        .login-bg {
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

        /* ---- Animated background blobs ---- */
        .login-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          animation: blob-drift 8s ease-in-out infinite alternate;
        }

        .login-blob-1 {
          width: 520px;
          height: 520px;
          background: radial-gradient(circle, rgba(233,30,140,0.32), transparent 70%);
          top: -220px;
          right: -160px;
          animation-delay: 0s;
        }

        .login-blob-2 {
          width: 420px;
          height: 420px;
          background: radial-gradient(circle, rgba(61,26,120,0.38), transparent 70%);
          bottom: -200px;
          left: -110px;
          animation-delay: -3s;
        }

        .login-blob-3 {
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(156,39,176,0.22), transparent 70%);
          top: 40%;
          left: 60%;
          animation-delay: -5s;
        }

        @keyframes blob-drift {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(30px, 20px) scale(1.07); }
        }

        /* ---- Subtle floating particles ---- */
        .login-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .login-particle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(233,30,140,0.5);
          animation: particle-rise 6s ease-in-out infinite;
        }

        .login-particle-1  { left:  8%; top: 70%; animation-delay: 0s;    animation-duration: 7s; }
        .login-particle-2  { left: 15%; top: 85%; animation-delay: 1s;    animation-duration: 9s; }
        .login-particle-3  { left: 25%; top: 60%; animation-delay: 2s;    animation-duration: 8s; }
        .login-particle-4  { left: 35%; top: 90%; animation-delay: 0.5s;  animation-duration: 6s; }
        .login-particle-5  { left: 50%; top: 75%; animation-delay: 1.5s;  animation-duration: 10s; width: 3px; height: 3px; }
        .login-particle-6  { left: 60%; top: 80%; animation-delay: 3s;    animation-duration: 7s; }
        .login-particle-7  { left: 72%; top: 65%; animation-delay: 0.8s;  animation-duration: 9s; width: 5px; height: 5px; background: rgba(156,39,176,0.4); }
        .login-particle-8  { left: 82%; top: 88%; animation-delay: 2.5s;  animation-duration: 8s; }
        .login-particle-9  { left: 90%; top: 55%; animation-delay: 1.2s;  animation-duration: 6s; }
        .login-particle-10 { left: 45%; top: 92%; animation-delay: 3.5s;  animation-duration: 11s; width: 3px; height: 3px; }
        .login-particle-11 { left: 20%; top: 40%; animation-delay: 4s;    animation-duration: 8s;  background: rgba(255,77,184,0.4); }
        .login-particle-12 { left: 78%; top: 30%; animation-delay: 0.3s;  animation-duration: 9s;  width: 3px; height: 3px; }

        @keyframes particle-rise {
          0%   { transform: translateY(0) scale(1);   opacity: 0.6; }
          50%  { transform: translateY(-60px) scale(1.3); opacity: 1;   }
          100% { transform: translateY(-120px) scale(0.8); opacity: 0; }
        }

        /* ---- Card ---- */
        .login-card {
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

        /* ---- Logo wrapper ---- */
        .login-logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 2rem;
        }

        /* ---- Headings ---- */
        .login-title {
          font-size: 1.65rem;
          font-weight: 700;
          color: var(--text);
          text-align: center;
          margin-bottom: 0.4rem;
        }

        .login-subtitle {
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 1.75rem;
          font-size: 0.95rem;
        }

        /* ---- Error ---- */
        .login-error {
          background: rgba(244, 67, 54, 0.12);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }

        /* ---- Form ---- */
        .login-form { display: flex; flex-direction: column; gap: 1.1rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.45rem; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        /* ---- Submit button shimmer ---- */
        .login-submit-btn {
          margin-top: 0.25rem;
          background: linear-gradient(135deg, #e91e8c, #9c27b0);
          border: none;
          position: relative;
          overflow: hidden;
        }

        .login-submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.12) 60%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.4s ease;
          pointer-events: none;
        }

        .login-submit-btn:hover:not(:disabled)::after {
          transform: translateX(100%);
        }

        .login-submit-btn:hover:not(:disabled) {
          box-shadow: 0 6px 28px rgba(233,30,140,0.45);
          transform: translateY(-1px);
        }

        /* ---- Google button ---- */
        .btn-google {
          background: rgba(255,255,255,0.05);
          color: var(--text);
          border: 1px solid rgba(255,255,255,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.7rem;
          transition: all 0.2s ease;
          font-weight: 600;
        }

        .btn-google:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(66,133,244,0.6);
          box-shadow: 0 4px 20px rgba(66,133,244,0.2);
          transform: translateY(-1px);
        }

        /* ---- Register link ---- */
        .login-register-link {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--text-muted);
        }

        .login-setup-link {
          text-align: center;
          margin-top: 0.6rem;
          font-size: 0.8rem;
          color: var(--text-muted);
          opacity: 0.65;
        }
      `}</style>
    </div>
  );
}
