"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setAdminToken, clearAdminToken } from "@/lib/token";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already logged in as admin, redirect directly to /admin
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) {
          // Ensure the admin-session cookie is in sync
          setAdminToken(token);
          router.replace("/admin");
        } else {
          clearAdminToken();
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div
        aria-busy="true"
        aria-label="Verificando sesión…"
        style={{ minHeight: "100vh", background: "#060411" }}
      />
    );
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message || "No se pudo iniciar sesión");
        return;
      }

      setAdminToken(data.token);
      localStorage.setItem("admin_user", JSON.stringify(data.user));

      window.location.href = "/admin";
    } catch (error) {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleLogin(); }
  };

  return (
    <div className="admin-login-bg">
      {/* Aurora orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Grid overlay */}
      <div className="grid-overlay" aria-hidden="true" />

      {/* Particles */}
      <div className="particles" aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <div key={i} className={`particle particle-${i + 1}`} />
        ))}
      </div>

      <div className="admin-login-card">
        {/* Shield icon + branding */}
        <div className="admin-login-logo">
          <div className="shield-icon" aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L4 5.5V11C4 15.418 7.582 19.546 12 21C16.418 19.546 20 15.418 20 11V5.5L12 2Z"
                fill="url(#shieldGrad)"
                stroke="rgba(224,64,251,0.6)"
                strokeWidth="0.5"
              />
              <path
                d="M9 12L11 14L15 10"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="shieldGrad" x1="4" y1="2" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(224,64,251,0.7)" />
                  <stop offset="100%" stopColor="rgba(139,92,246,0.7)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="admin-login-logo-text">
            Meet You<span className="logo-live">Live</span>
          </div>
        </div>

        <div className="admin-login-header">
          <h1 className="admin-login-title">Acceso de Administrador</h1>
          <p className="admin-login-subtitle">Solo para personal autorizado</p>
        </div>

        {error && <div className="banner-error">{error}</div>}

        <div className="admin-login-form">
          <input
            className="input input-lg"
            type="email"
            placeholder="Correo del administrador"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="email"
          />

          <div className="password-field">
            <input
              className="input input-lg input-password"
              type={showPassword ? "text" : "password"}
              placeholder="CONTRASEÑA"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <button
            className="btn btn-admin btn-lg btn-block submit-btn"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Verificando…
              </>
            ) : (
              "Entrar al Panel →"
            )}
          </button>
        </div>

        <div className="admin-login-footer">
          <p className="footer-link">
            <Link href="/login">← Volver al inicio de sesión</Link>
          </p>

        </div>
      </div>

      <style jsx>{`
        /* ── Background ── */
        .admin-login-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.30) 0%, transparent 55%),
            radial-gradient(ellipse at 20% 100%, rgba(224,64,251,0.18) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 60%, rgba(59,130,246,0.12) 0%, transparent 40%),
            #060411;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        /* ── Aurora orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: orb-float 10s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(139,92,246,0.24), transparent 70%);
          top: -200px; left: 50%;
          transform: translateX(-50%);
          animation-delay: 0s;
        }
        .orb-2 {
          width: 360px; height: 360px;
          background: radial-gradient(circle, rgba(224,64,251,0.16), transparent 70%);
          bottom: -140px; left: -80px;
          animation-delay: -4s;
        }
        .orb-3 {
          width: 260px; height: 260px;
          background: radial-gradient(circle, rgba(59,130,246,0.14), transparent 70%);
          top: 50%; right: -80px;
          animation-delay: -7s;
        }

        @keyframes orb-float {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(20px, 18px) scale(1.05); }
        }

        /* ── Grid overlay ── */
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(139,92,246,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.05) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 72%);
          pointer-events: none;
        }

        /* ── Particles ── */
        .particles { position: absolute; inset: 0; pointer-events: none; }

        .particle {
          position: absolute;
          width: 3px; height: 3px;
          border-radius: 50%;
          background: rgba(139,92,246,0.55);
          animation: particle-rise 8s ease-in-out infinite;
        }

        .particle-1  { left:  5%; top: 75%; animation-delay: 0s;   animation-duration: 9s; }
        .particle-2  { left: 12%; top: 85%; animation-delay: 1.2s; animation-duration: 11s; }
        .particle-3  { left: 22%; top: 65%; animation-delay: 2.1s; animation-duration: 8s; }
        .particle-4  { left: 33%; top: 90%; animation-delay: 0.6s; animation-duration: 7s; background: rgba(224,64,251,0.5); }
        .particle-5  { left: 48%; top: 78%; animation-delay: 1.8s; animation-duration: 12s; width: 4px; height: 4px; }
        .particle-6  { left: 57%; top: 82%; animation-delay: 3.2s; animation-duration: 9s; }
        .particle-7  { left: 68%; top: 70%; animation-delay: 0.9s; animation-duration: 10s; background: rgba(59,130,246,0.4); width: 4px; height: 4px; }
        .particle-8  { left: 79%; top: 88%; animation-delay: 2.7s; animation-duration: 8s; }
        .particle-9  { left: 88%; top: 60%; animation-delay: 1.4s; animation-duration: 7s; }
        .particle-10 { left: 43%; top: 93%; animation-delay: 4s;   animation-duration: 13s; width: 2px; height: 2px; }
        .particle-11 { left: 18%; top: 42%; animation-delay: 5s;   animation-duration: 9s; background: rgba(224,64,251,0.5); }
        .particle-12 { left: 75%; top: 35%; animation-delay: 0.4s; animation-duration: 10s; width: 2px; height: 2px; }

        @keyframes particle-rise {
          0%   { transform: translateY(0) scale(1);      opacity: 0; }
          10%  { opacity: 0.8; }
          70%  { opacity: 0.6; }
          100% { transform: translateY(-140px) scale(0.5); opacity: 0; }
        }

        /* ── Card ── */
        .admin-login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: rgba(8,4,20,0.92);
          border: 1px solid rgba(139,92,246,0.22);
          border-radius: 32px;
          padding: 2.5rem 2.25rem 2.25rem;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.75),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 80px rgba(139,92,246,0.14);
          backdrop-filter: blur(32px) saturate(1.6);
        }

        /* ── Logo ── */
        .admin-login-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 1.5rem;
        }

        .shield-icon {
          filter: drop-shadow(0 0 18px rgba(139,92,246,0.6)) drop-shadow(0 0 36px rgba(224,64,251,0.3));
        }

        .admin-login-logo-text {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
          line-height: 1;
        }

        .logo-live {
          font-style: italic;
          background: linear-gradient(135deg, #8b5cf6 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Header ── */
        .admin-login-header {
          text-align: center;
          margin-bottom: 1.75rem;
        }

        .admin-login-title {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }

        .admin-login-subtitle {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 0.3rem;
        }

        /* ── Error banner ── */
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

        /* ── Form ── */
        .admin-login-form {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .password-field { position: relative; }
        .input-password { padding-right: 2.75rem; }
        .password-toggle {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0;
        }
        .password-toggle:hover { color: var(--text); }

        /* ── Admin button ── */
        .btn-admin {
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
          color: #fff;
          border: none;
          border-radius: var(--radius);
          padding: 0.9rem 1.5rem;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          width: 100%;
          transition: all 0.2s;
          font-family: inherit;
          letter-spacing: 0.01em;
          box-shadow: 0 4px 20px rgba(124,58,237,0.35);
          margin-top: 0.35rem;
        }

        .btn-admin:hover:not(:disabled) {
          background: linear-gradient(135deg, #6d28d9 0%, #9333ea 100%);
          box-shadow: 0 6px 28px rgba(124,58,237,0.5);
          transform: translateY(-1px);
        }

        .btn-admin:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ── Spinner ── */
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ── Footer ── */
        .admin-login-footer {
          margin-top: 1.75rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .footer-link {
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .footer-link-dim {
          font-size: 0.8rem;
          opacity: 0.6;
        }

        .footer-link :global(a) {
          color: #a78bfa;
          font-weight: 600;
          transition: color 0.15s;
        }

        .footer-link :global(a):hover {
          color: #e040fb;
        }

        @media (max-width: 480px) {
          .admin-login-card { padding: 2rem 1.5rem; }
          .admin-login-title { font-size: 1.2rem; }
          .admin-login-logo-text { font-size: 1.55rem; }
        }
      `}</style>
    </div>
  );
}
