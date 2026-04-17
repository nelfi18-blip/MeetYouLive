"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { resetPassword } from "@/lib/auth.service";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(decodeURIComponent(emailParam));
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !code.trim() || !password || !confirmPassword) {
      setError("Completa todos los campos.");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("El código debe tener 6 dígitos.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const data = await resetPassword({
      email: email.trim().toLowerCase(),
      code: code.trim(),
      password,
    });
    setLoading(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    setSuccess(data.message || "Contraseña actualizada correctamente.");
    setTimeout(() => router.push("/login"), 1500);
  };

  return (
    <div className="rp-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="grid-overlay" aria-hidden="true" />

      <div className="rp-card">
        <div className="rp-logo">
          <Image src="/logo.svg" alt="MeetYouLive" width={64} height={64} priority />
          <span className="rp-logo-text">Meet You<span className="rp-logo-accent">Live</span></span>
        </div>

        <h1 className="rp-title">Restablecer contraseña</h1>
        <p className="rp-subtitle">Ingresa el código recibido y tu nueva contraseña.</p>

        {error && <div className="banner-error">{error}</div>}
        {success && <div className="banner-success">{success}</div>}

        <form onSubmit={handleSubmit} className="rp-form">
          <input
            className="input input-lg"
            type="email"
            placeholder="EMAIL"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
          />
          <input
            className="input input-lg"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="CÓDIGO DE VERIFICACIÓN"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={loading}
          />
          <input
            className="input input-lg"
            type="password"
            placeholder="NUEVA CONTRASEÑA"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={loading}
          />
          <input
            className="input input-lg"
            type="password"
            placeholder="CONFIRMAR CONTRASEÑA"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={loading}
          />

          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
            {loading ? "Actualizando…" : "Guardar nueva contraseña"}
          </button>
        </form>

        <div className="rp-footer">
          <Link href="/login">← Volver al inicio de sesión</Link>
        </div>
      </div>

      <style jsx>{`
        .rp-bg {
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

        .rp-card {
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

        .rp-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          margin-bottom: 1.25rem;
        }
        .rp-logo-text {
          font-size: 1.3rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }
        .rp-logo-accent {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .rp-title {
          font-size: 1.45rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
          text-align: center;
          margin-bottom: 0.5rem;
        }
        .rp-subtitle {
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

        .rp-form {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .rp-footer {
          margin-top: 1.25rem;
          text-align: center;
        }
        .rp-footer :global(a) {
          color: #a78bfa;
          font-size: 0.85rem;
          text-decoration: none;
          font-weight: 600;
        }
        .rp-footer :global(a):hover {
          color: #e040fb;
        }

        @media (max-width: 480px) {
          .rp-card {
            padding: 1.8rem 1.25rem;
          }
          .rp-title {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#060411" }} />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
