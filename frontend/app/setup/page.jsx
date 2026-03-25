"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setToken } from "@/lib/token";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If an admin already exists, redirect to admin login
  useEffect(() => {
    fetch(`${apiUrl}/api/auth/check-admin`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.adminExists) {
          router.replace("/admin/login");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div
        aria-busy="true"
        aria-label="Verificando…"
        style={{ minHeight: "100vh", background: "#060411" }}
      />
    );
  }

  const handleSetup = async () => {
    if (!username || !email || !password || !confirmPassword) {
      setError("Por favor, completa todos los campos.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Error al crear el administrador.");
        return;
      }

      setToken(data.token);
      router.push("/admin");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleSetup(); }
  };

  return (
    <div className="setup-bg">
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

      <div className="setup-card">
        {/* Icon + branding */}
        <div className="setup-logo">
          <div className="key-icon" aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <circle cx="8" cy="14" r="5" fill="url(#keyGrad)" stroke="rgba(224,64,251,0.5)" strokeWidth="0.5" />
              <path
                d="M12.5 9.5L19 3M19 3H16M19 3V6"
                stroke="url(#keyGrad2)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="14" r="2" fill="rgba(255,255,255,0.85)" />
              <defs>
                <linearGradient id="keyGrad" x1="3" y1="9" x2="13" y2="19" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(139,92,246,0.8)" />
                  <stop offset="100%" stopColor="rgba(224,64,251,0.8)" />
                </linearGradient>
                <linearGradient id="keyGrad2" x1="12" y1="3" x2="19" y2="10" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#e040fb" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="setup-logo-text">
            Meet You<span className="logo-live">Live</span>
          </div>
        </div>

        <div className="setup-header">
          <h1 className="setup-title">Configurar Administrador</h1>
          <p className="setup-subtitle">Crea la cuenta de administrador principal</p>
        </div>

        {error && <div className="banner-error">{error}</div>}

        <div className="setup-form">
          <input
            className="input input-lg"
            type="text"
            placeholder="NOMBRE DE USUARIO"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="username"
          />
          <input
            className="input input-lg"
            type="email"
            placeholder="EMAIL"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="email"
          />
          <input
            className="input input-lg"
            type="password"
            placeholder="CONTRASEÑA (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="new-password"
          />
          <input
            className="input input-lg"
            type="password"
            placeholder="CONFIRMAR CONTRASEÑA"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="new-password"
          />

          <button
            className="btn-setup btn-lg btn-block"
            onClick={handleSetup}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Creando administrador…
              </>
            ) : (
              "Crear cuenta de administrador →"
            )}
          </button>
        </div>

        <div className="setup-footer">
          <p className="footer-link">
            <Link href="/admin/login">← Ya tengo cuenta de administrador</Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        /* ── Background ── */
        .setup-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.28) 0%, transparent 55%),
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
          background: radial-gradient(circle, rgba(139,92,246,0.22), transparent 70%);
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
          background: radial-gradient(circle, rgba(59,130,246,0.12), transparent 70%);
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
        .setup-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
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
        .setup-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 1.5rem;
        }

        .key-icon {
          filter: drop-shadow(0 0 18px rgba(139,92,246,0.6)) drop-shadow(0 0 36px rgba(224,64,251,0.3));
        }

        .setup-logo-text {
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
        .setup-header {
          text-align: center;
          margin-bottom: 1.75rem;
        }

        .setup-title {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }

        .setup-subtitle {
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
        .setup-form {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        /* ── Setup button ── */
        .btn-setup {
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

        .btn-setup:hover:not(:disabled) {
          background: linear-gradient(135deg, #6d28d9 0%, #9333ea 100%);
          box-shadow: 0 6px 28px rgba(124,58,237,0.5);
          transform: translateY(-1px);
        }

        .btn-setup:disabled {
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
        .setup-footer {
          margin-top: 1.75rem;
          text-align: center;
        }

        .footer-link {
          font-size: 0.875rem;
          color: var(--text-muted);
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
          .setup-card { padding: 2rem 1.5rem; }
          .setup-title { font-size: 1.2rem; }
          .setup-logo-text { font-size: 1.55rem; }
        }
      `}</style>
    </div>
  );
}
