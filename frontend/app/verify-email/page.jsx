"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyEmail, resendVerification } from "@/lib/auth.service";
import { setToken } from "@/lib/token";
import AuthBrandLogo from "@/components/AuthBrandLogo";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef([]);
  const cooldownRef = useRef(null);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(decodeURIComponent(emailParam));
  }, [searchParams]);

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(cooldownRef.current);
  }, [resendCooldown]);

  const handleCodeChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError("");

    if (digit && index < code.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || "";
    }
    setCode(newCode);
    const nextEmpty = newCode.findIndex((d) => !d);
    inputRefs.current[nextEmpty === -1 ? code.length - 1 : nextEmpty]?.focus();
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Introduce los 6 dígitos del código");
      return;
    }
    if (!email) {
      setError("Email no encontrado. Vuelve a la página de registro.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await verifyEmail({ email, code: fullCode });
      if (data.error) {
        if (data.code === "CODE_EXPIRED") {
          setError("El código ha caducado. Solicita uno nuevo con el botón de abajo.");
        } else {
          setError(data.error);
        }
        return;
      }
      if (data.token) {
        setToken(data.token);
        setSuccess("¡Email verificado! Configurando tu perfil…");
        setTimeout(() => router.replace("/onboarding"), 1500);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendCooldown > 0) return;
    setResending(true);
    setResendSuccess("");
    setError("");
    try {
      const data = await resendVerification(email);
      if (data.error) {
        setError(data.error);
      } else {
        setResendSuccess(data.message || "Código reenviado. Revisa tu email.");
        setResendCooldown(60);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setResending(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleVerify();
  };

  return (
    <div className="ve-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="grid-overlay" aria-hidden="true" />

      <div className="ve-card">
        <div className="ve-logo">
          <AuthBrandLogo size="sm" />
        </div>

        <div className="ve-icon">📧</div>
        <h1 className="ve-title">Verifica tu email</h1>
        <p className="ve-subtitle">
          Hemos enviado un código de 6 dígitos a<br />
          <strong className="ve-email">{email || "tu correo"}</strong>
        </p>

        {error && <div className="banner-error">{error}</div>}
        {success && <div className="banner-success">{success}</div>}
        {resendSuccess && !error && <div className="banner-info">{resendSuccess}</div>}

        <form onSubmit={handleFormSubmit} className="ve-form">
          <div className="ve-code-row" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`ve-digit${digit ? " filled" : ""}`}
                aria-label={`Dígito ${i + 1} del código`}
                autoComplete="off"
                disabled={loading}
              />
            ))}
          </div>

          <button
            type="submit"
            className="btn btn-primary ve-submit"
            disabled={loading || code.join("").length !== 6}
          >
            {loading ? "Verificando…" : "Verificar código"}
          </button>
        </form>

        <div className="ve-resend-row">
          <span className="ve-resend-hint">¿No recibiste el código?</span>
          <button
            type="button"
            className="ve-resend-btn"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
          >
            {resending
              ? "Enviando…"
              : resendCooldown > 0
              ? `Reenviar en ${resendCooldown}s`
              : "Reenviar código"}
          </button>
        </div>

        <div className="ve-footer">
          <Link href="/login" className="ve-back-link">← Volver al inicio de sesión</Link>
        </div>
      </div>

      <style jsx>{`
        .ve-bg {
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
          width: 520px; height: 520px;
          background: radial-gradient(circle, rgba(224,64,251,0.22), transparent 70%);
          top: -220px; left: 50%;
          transform: translateX(-50%);
        }
        .orb-2 {
          width: 380px; height: 380px;
          background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%);
          bottom: -160px; left: -80px;
        }
        .orb-3 {
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(96,165,250,0.12), transparent 70%);
          top: 50%; right: -80px;
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

        .ve-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          background: rgba(10,5,22,0.92);
          border: 1px solid rgba(224,64,251,0.18);
          border-radius: 28px;
          padding: 2.5rem 2.25rem 2.25rem;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.75),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 80px rgba(224,64,251,0.12);
          backdrop-filter: blur(32px) saturate(1.6);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
        }

        .ve-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          margin-bottom: 1.5rem;
        }
        .ve-logo-text {
          font-size: 1.3rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
        }
        .ve-logo-accent {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .ve-icon {
          font-size: 3rem;
          margin-bottom: 0.75rem;
          filter: drop-shadow(0 0 12px rgba(224,64,251,0.5));
        }

        .ve-title {
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text);
          text-align: center;
          margin-bottom: 0.6rem;
        }

        .ve-subtitle {
          color: var(--text-muted);
          font-size: 0.9rem;
          text-align: center;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }

        .ve-email {
          color: #e040fb;
          font-weight: 700;
        }

        .banner-error {
          width: 100%;
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.35);
          color: #f87171;
          border-radius: 10px;
          padding: 0.7rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1rem;
          text-align: center;
        }

        .banner-success {
          width: 100%;
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.35);
          color: #34d399;
          border-radius: 10px;
          padding: 0.7rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1rem;
          text-align: center;
        }

        .banner-info {
          width: 100%;
          background: rgba(96,165,250,0.1);
          border: 1px solid rgba(96,165,250,0.35);
          color: #60a5fa;
          border-radius: 10px;
          padding: 0.7rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1rem;
          text-align: center;
        }

        .ve-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
        }

        .ve-code-row {
          display: flex;
          gap: 0.6rem;
          justify-content: center;
        }

        .ve-digit {
          width: 52px;
          height: 60px;
          text-align: center;
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          background: rgba(255,255,255,0.05);
          border: 2px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          caret-color: transparent;
        }

        .ve-digit:focus {
          border-color: rgba(224,64,251,0.6);
          box-shadow: 0 0 0 3px rgba(224,64,251,0.15);
        }

        .ve-digit.filled {
          border-color: rgba(224,64,251,0.4);
          background: rgba(224,64,251,0.06);
        }

        .ve-submit {
          width: 100%;
          padding: 0.9rem;
          font-size: 1rem;
          font-weight: 700;
          border-radius: 12px;
        }

        .ve-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .ve-resend-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1.25rem;
          font-size: 0.875rem;
        }

        .ve-resend-hint {
          color: var(--text-muted);
        }

        .ve-resend-btn {
          background: none;
          border: none;
          color: #e040fb;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: opacity 0.15s;
        }

        .ve-resend-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .ve-resend-btn:not(:disabled):hover {
          text-decoration: underline;
        }

        .ve-footer {
          margin-top: 1.5rem;
        }

        .ve-back-link {
          color: var(--text-muted);
          font-size: 0.85rem;
          text-decoration: none;
          transition: color 0.15s;
        }

        .ve-back-link:hover {
          color: var(--text);
        }

        @media (max-width: 480px) {
          .ve-card { padding: 2rem 1.25rem; }
          .ve-digit { width: 42px; height: 52px; font-size: 1.35rem; }
          .ve-code-row { gap: 0.4rem; }
        }
      `}</style>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#060411" }} />}>
      <VerifyEmailForm />
    </Suspense>
  );
}
