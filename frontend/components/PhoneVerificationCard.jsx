"use client";

import { useState } from "react";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Private phone number verification card for the Profile/Account area.
 *
 * Flow: enter/edit number → send code (SMS) → enter code → verify → "Verificado".
 * If the number is changed, the account goes back to "No verificado" and a new
 * code must be requested. The phone number is never shown publicly — this
 * card only renders in the authenticated user's own profile.
 */
export default function PhoneVerificationCard({ user, onUserChange }) {
  const [phoneInput, setPhoneInput] = useState(user?.phone || "");
  const [editingPhone, setEditingPhone] = useState(!user?.phone);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);

  const phoneVerified = Boolean(user?.phoneVerified);
  const maskedPhone = user?.phone || "";

  const authHeaders = () => {
    const token = getToken();
    return { "Content-Type": "application/json", Authorization: "Bearer " + token };
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!phoneInput.trim()) {
      setError("Introduce un número de teléfono");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/user/me/phone/request-verification`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "No se pudo enviar el código. Inténtalo de nuevo más tarde.");
        return;
      }
      setSuccess(data.message || "Código enviado por SMS.");
      setCodeRequested(true);
      setEditingPhone(false);
      setResendAfter(data.resendAfter || 60);
      onUserChange?.((prev) => ({ ...prev, phone: data.phone || prev.phone, phoneVerified: false }));
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo más tarde.");
    } finally {
      setSending(false);
    }
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
      onUserChange?.((prev) => ({ ...prev, phone: data.phone || prev.phone, phoneVerified: true }));
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
            {Boolean(user?.phone) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingPhone(false);
                  setPhoneInput(user?.phone || "");
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
              onClick={handleSendCode}
              disabled={sending || resendAfter > 0}
            >
              Reenviar código
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
