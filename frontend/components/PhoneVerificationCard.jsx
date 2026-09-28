"use client";

import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** Fallback cooldown in seconds when the server does not return resendAfter. */
const DEFAULT_RESEND_COOLDOWN_S = 60;

/**
 * Private phone number verification card for the Profile/Account area.
 *
 * Flow: enter/edit number → send code (SMS) → enter code → verify → "Verificado".
 * If the number is changed, the account goes back to "No verificado" and a new
 * code must be requested. The phone number is never shown publicly — this
 * card only renders in the authenticated user's own profile.
 *
 * The backend is the single source of truth for the masked representation
 * (`user.phoneMasked`); this component never derives a "mask" from the raw
 * number itself. The only place a full, unmasked number exists is transiently
 * in `phoneInput`/`pendingPhone` while the user is actively entering/editing
 * it to request or resend a code — it is never persisted or read back from
 * `user`.
 */
export default function PhoneVerificationCard({ user, onUserChange }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [editingPhone, setEditingPhone] = useState(!user?.phoneMasked);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  // The exact phone number a code was actually sent to. Resend must always
  // use this value explicitly, never the (possibly edited/blank) phoneInput.
  const [pendingPhone, setPendingPhone] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef(null);

  const phoneVerified = Boolean(user?.phoneVerified);
  const maskedPhone = user?.phoneMasked || "";

  // Real 60s (or server-provided) countdown: ticks down once per second and
  // is cleared on unmount / whenever it changes, so "Reenviar código" only
  // becomes enabled once it actually reaches 0.
  useEffect(() => {
    if (resendCountdown > 0) {
      countdownRef.current = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(countdownRef.current);
  }, [resendCountdown]);

  const authHeaders = () => {
    const token = getToken();
    return { "Content-Type": "application/json", Authorization: "Bearer " + token };
  };

  /**
   * Requests (or resends) a verification code for `phoneValue`. Used both by
   * the initial "Enviar código" submit and by the "Reenviar código" button —
   * the latter always passes `pendingPhone` explicitly instead of relying on
   * `phoneInput`. The 60s frontend countdown is UX-only; the backend keeps
   * enforcing its own per-user resend cooldown and per-IP rate limits
   * regardless of what the client displays or sends.
   */
  const requestCode = async (phoneValue) => {
    setError("");
    setSuccess("");
    const trimmed = (phoneValue || "").trim();
    if (!trimmed) {
      setError("Introduce un número de teléfono");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/user/me/phone/request-verification`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "No se pudo enviar el código. Inténtalo de nuevo más tarde.");
        if (typeof data.resendAfter === "number") setResendCountdown(data.resendAfter);
        return;
      }
      setSuccess(data.message || "Código enviado por SMS.");
      setCodeRequested(true);
      setEditingPhone(false);
      setPendingPhone(trimmed);
      setResendCountdown(data.resendAfter || DEFAULT_RESEND_COOLDOWN_S);
      onUserChange?.((prev) => ({
        ...prev,
        phoneMasked: data.phoneMasked || prev.phoneMasked,
        phoneVerified: false,
      }));
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo más tarde.");
    } finally {
      setSending(false);
    }
  };

  const handleSendCode = (e) => {
    e.preventDefault();
    requestCode(phoneInput);
  };

  const handleResendCode = () => {
    // Explicit, non-submit action: never depends on phoneInput being filled,
    // and always targets the phone number the pending code was sent to.
    requestCode(pendingPhone);
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!code.trim()) {
      setError("Introduce el código recibido por SMS");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/user/me/phone/verify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Código incorrecto. Inténtalo de nuevo.");
        return;
      }
      setSuccess(data.message || "Teléfono verificado correctamente.");
      setCode("");
      setCodeRequested(false);
      setPendingPhone("");
      setResendCountdown(0);
      onUserChange?.((prev) => ({
        ...prev,
        phoneMasked: data.phoneMasked || prev.phoneMasked,
        phoneVerified: true,
      }));
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo más tarde.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="form-card">
      <div className="form-card-heading">
        <span className="form-card-kicker">Seguridad de la cuenta</span>
        <h2 className="form-card-title">📱 Teléfono</h2>
      </div>
      <p className="profile-section-copy">
        Tu teléfono es privado: nunca se muestra en tu perfil público, Discover, Live ni en ningún otro lugar visible
        para otros usuarios.
      </p>

      <div className="profile-summary-row" style={{ marginBottom: "0.75rem" }}>
        <strong>Estado</strong>
        <span className={`role-badge${phoneVerified ? " verified" : ""}`}>
          {phoneVerified ? "✓ Verificado" : "No verificado"}
        </span>
      </div>

      {error && <div className="banner-error">{error}</div>}
      {success && <div className="banner-success">{success}</div>}

      {!editingPhone && maskedPhone && (
        <div className="form-actions" style={{ marginBottom: "0.75rem" }}>
          <span className="profile-section-copy" style={{ margin: 0 }}>{maskedPhone}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setEditingPhone(true);
              setPhoneInput("");
              setCodeRequested(false);
              setPendingPhone("");
              setResendCountdown(0);
              setError("");
              setSuccess("");
            }}
          >
            Cambiar número
          </button>
        </div>
      )}

      {editingPhone && (
        <form onSubmit={handleSendCode} className="form-fields">
          <div className="form-group">
            <label className="form-label">Número de teléfono</label>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+34123456789"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? "Enviando…" : "Enviar código"}
            </button>
            {Boolean(maskedPhone) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingPhone(false);
                  setPhoneInput("");
                  setError("");
                }}
                disabled={sending}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {!editingPhone && codeRequested && !phoneVerified && (
        <form onSubmit={handleVerifyCode} className="form-fields">
          <div className="form-group">
            <label className="form-label">Código de verificación</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={verifying}>
              {verifying ? "Verificando…" : "Verificar"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResendCode}
              disabled={sending || resendCountdown > 0}
            >
              {resendCountdown > 0 ? `Reenviar código (${resendCountdown}s)` : "Reenviar código"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
