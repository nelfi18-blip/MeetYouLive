"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { signUp } from "@/lib/auth.service";

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
  // Prevents flashing the register form while we verify existing auth state.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token || status === "authenticated") {
      router.replace("/dashboard");
    } else {
      setChecking(false);
    }
  }, [status, router]);

  if (checking) return (
    <div
      aria-busy="true"
      aria-label="Verificando sesión…"
      style={{ minHeight: "100vh", background: "#060411" }}
    />
  );

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
      const data = await signUp({ username, email, password });

      if (data.error) {
        const lowerMsg = data.error.toLowerCase();
        if (lowerMsg.includes("email") && lowerMsg.includes("exist")) {
          router.push(`/login?email=${encodeURIComponent(email.trim())}`);
          return;
        }
        setError(data.error);
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
        setSuccess("¡Cuenta creada! Redirigiendo al dashboard…");
        setTimeout(() => { router.push("/dashboard"); }, 1500);
      } else {
        setSuccess("¡Cuenta creada! Redirigiendo al inicio de sesión…");
        setTimeout(() => { router.push("/login"); }, 1500);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="grid-overlay" aria-hidden="true" />

      <div className="register-card">
        {/* Logo */}
        <div className="register-logo">
          <div className="register-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
          <span className="register-logo-text">MeetYou<span>Live</span></span>
        </div>

        <div className="register-header">
          <h1 className="register-title">Crear cuenta</h1>
          <p className="register-subtitle">Únete a la comunidad de streaming</p>
        </div>

        {error && <div className="banner-error">{error}</div>}
        {success && <div className="banner-success">{success}</div>}

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre de usuario</label>
            <input
              className="input input-lg"
              type="text"
              placeholder="tunombredeusuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="input input-lg"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="input input-lg"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar contraseña</label>
            <input
              className="input input-lg"
              type="password"
              placeholder="Repite tu contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block submit-btn"
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner" />Creando cuenta…</>
            ) : "Crear cuenta"}
          </button>
        </form>

        <div className="divider-text">o continúa con</div>

        <button
          className="btn-google"
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

        <p className="login-link">
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
          background:
            radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.2) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 90%, rgba(224,64,251,0.15) 0%, transparent 50%),
            #060411;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: orb-float 10s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 450px; height: 450px;
          background: radial-gradient(circle, rgba(139,92,246,0.22), transparent 70%);
          top: -180px; left: -120px;
          animation-delay: 0s;
        }
        .orb-2 {
          width: 380px; height: 380px;
          background: radial-gradient(circle, rgba(224,64,251,0.18), transparent 70%);
          bottom: -160px; right: -100px;
          animation-delay: -5s;
        }
        .orb-3 {
          width: 260px; height: 260px;
          background: radial-gradient(circle, rgba(34,211,238,0.1), transparent 70%);
          top: 50%; right: 20%;
          animation-delay: -3s;
        }

        @keyframes orb-float {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(20px, 12px) scale(1.04); }
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px);
          background-size: 50px 50px;
          mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 75%);
          pointer-events: none;
        }

        .register-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          background: rgba(12,7,26,0.88);
          border: 1px solid rgba(139,92,246,0.22);
          border-radius: 28px;
          padding: 2.75rem 2.5rem;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.7),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 80px rgba(139,92,246,0.1);
          backdrop-filter: blur(32px) saturate(1.6);
        }

        .register-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          margin-bottom: 2rem;
        }

        .register-logo-icon {
          width: 44px;
          height: 44px;
          background: var(--grad-primary);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 24px rgba(224,64,251,0.5);
        }

        .register-logo-text {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--text);
        }

        .register-logo-text span {
          background: var(--grad-warm);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .register-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .register-title {
          font-size: 1.65rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }

        .register-subtitle {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-top: 0.3rem;
        }

        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1.25rem;
        }

        .banner-success {
          background: var(--success-bg);
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1.25rem;
        }

        .register-form { display: flex; flex-direction: column; gap: 1.1rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.5rem; }

        .form-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .submit-btn { margin-top: 0.35rem; gap: 0.6rem; }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .divider-text {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-dim);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin: 1.75rem 0 1.25rem;
        }

        .divider-text::before,
        .divider-text::after {
          content: "";
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(139,92,246,0.2), transparent);
        }

        .btn-google {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.875rem;
          background: rgba(255,255,255,0.04);
          color: var(--text);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
        }

        .btn-google:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(66,133,244,0.4);
          box-shadow: 0 4px 20px rgba(66,133,244,0.15);
          transform: translateY(-1px);
        }

        .login-link {
          text-align: center;
          margin-top: 1.75rem;
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .login-link :global(a) {
          color: var(--accent-3);
          font-weight: 600;
          transition: color var(--transition);
        }

        .login-link :global(a):hover { color: var(--accent-2); }

        @media (max-width: 480px) {
          .register-card { padding: 2rem 1.5rem; }
          .register-title { font-size: 1.4rem; }
        }
      `}</style>
    </div>
  );
}
