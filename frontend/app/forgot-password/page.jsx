"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { forgotPassword } from "@/lib/auth.service";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const REDIRECT_DELAY_MS = 1500;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Ingresa tu email para continuar.");
      return;
    }

    setLoading(true);
    let data;
    try {
      data = await forgotPassword(normalizedEmail);
    } finally {
      setLoading(false);
    }

    if (data.error) {
      setError(data.error);
      return;
    }

    setSuccess(data.message || "Si el correo existe, se enviará un código.");
    setTimeout(() => {
      router.push(`/reset-password?email=${encodeURIComponent(normalizedEmail)}`);
    }, REDIRECT_DELAY_MS);
  };

  return (
    <div className="fp-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="grid-overlay" aria-hidden="true" />

      <div className="fp-card">
        <div className="fp-logo">
          <Image src="/logo.svg" alt="MeetYouLive" width={64} height={64} priority />
          <span className="fp-logo-text">Meet You<span className="fp-logo-accent">Live</span></span>
        </div>

        <h1 className="fp-title">¿Olvidaste tu contraseña?</h1>
        <p className="fp-subtitle">Ingresa tu email y te enviaremos un código para restablecerla.</p>

        {error && <div className="banner-error">{error}</div>}
        {success && <div className="banner-success">{success}</div>}

        <form onSubmit={handleSubmit} className="fp-form">
          <input
            className="input input-lg"
            type="email"
            placeholder="EMAIL"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
          />

          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
            {loading ? "Enviando…" : "Enviar código"}
          </button>
        </form>

        <div className="fp-footer">
          <Link href="/login">← Volver al inicio de sesión</Link>
        </div>
      </div>

      <style jsx>{`
        .fp-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(224,64,251,0.28) 0%, transparent 55%),
            radial-gradient(ellipse at 20% 100%, rgba(139,92,246,0.22) 0%, transparent 50%),
            #06020f;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
        }
        .orb-1 {
          width: 520px;
          height: 520px;
          background: radial-gradient(circle, rgba(224,64,251,0.22), transparent 70%);
          top: -220px;
          left: 50%;
          transform: translateX(-50%);
        }
        .orb-2 {
          width: 340px;
          height: 340px;
          background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%);
          bottom: -120px;
          left: -60px;
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(224,64,251,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(224,64,251,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 72%);
          pointer-events: none;
        }

        .fp-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 430px;
          background: rgba(10,5,22,0.92);
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: 28px;
          padding: 2.25rem 2rem;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.75),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 80px rgba(224,64,251,0.12);
          backdrop-filter: blur(32px) saturate(1.6);
        }

        .fp-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          margin-bottom: 1.25rem;
        }
        .fp-logo-text {
          font-size: 1.3rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }
        .fp-logo-accent {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .fp-title {
          font-size: 1.45rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
          text-align: center;
          margin-bottom: 0.5rem;
        }
        .fp-subtitle {
          color: var(--text-muted);
          text-align: center;
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 1.25rem;
        }

        .banner-error,
        .banner-success {
          border-radius: 10px;
          padding: 0.7rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 0.9rem;
          text-align: center;
        }
        .banner-error {
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.35);
          color: #f87171;
        }
        .banner-success {
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.35);
          color: #34d399;
        }

        .fp-form {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .fp-footer {
          margin-top: 1.25rem;
          text-align: center;
        }
        .fp-footer :global(a) {
          color: #a78bfa;
          font-size: 0.85rem;
          text-decoration: none;
          font-weight: 600;
        }
        .fp-footer :global(a):hover {
          color: #e040fb;
        }

        @media (max-width: 480px) {
          .fp-card {
            padding: 1.8rem 1.25rem;
          }
          .fp-title {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </div>
  );
}
