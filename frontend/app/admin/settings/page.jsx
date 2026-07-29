"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const SETTINGS_META = [
  { key: "boostPriceCrush", label: "Precio Boost Crush (coins)", description: "Coste de un boost de crush individual.", min: 1 },
  { key: "boostPackPrice", label: "Precio Pack Boost (coins)", description: "Coste de un paquete de boosts.", min: 1 },
  { key: "hiddenLikePrice", label: "Precio Like Oculto (coins)", description: "Coste para desbloquear un like oculto.", min: 1 },
  { key: "dailyRewardBaseCoins", label: "Recompensa diaria base (coins)", description: "Coins otorgados en el día 1 de racha.", min: 1 },
  { key: "referralRewardCoins", label: "Recompensa por referido (coins)", description: "Coins otorgados por cada referido completado.", min: 0 },
  { key: "creatorPlatformSplitPercent", label: "Comisión plataforma (%)", description: "Porcentaje que retiene la plataforma de los regalos (0-100).", min: 0, max: 100 },
];

const CHAT_PROTECTION_TOGGLES = [
  { key: "chatProtectionEnabled", label: "Protección general", description: "Bloquea intentos tempranos de compartir contacto externo." },
  { key: "blockPhones", label: "Teléfonos", description: "Detecta números de teléfono y variaciones separadas." },
  { key: "blockEmails", label: "Emails", description: "Detecta correos escritos normal u ofuscados." },
  { key: "blockUrls", label: "Enlaces y dominios", description: "Detecta URLs, www y dominios comunes." },
  { key: "blockSocialMedia", label: "Redes sociales", description: "Detecta WhatsApp, Telegram, Instagram, TikTok y similares." },
];

const CHAT_PROTECTION_NUMBERS = [
  { key: "minimumDaysSinceMatch", label: "Días mínimos desde match", min: 0, max: 3650 },
  { key: "minimumMessages", label: "Mensajes mínimos en conversación", min: 0, max: 100000 },
  { key: "minimumCompletedCalls", label: "Llamadas completadas mínimas", min: 0, max: 10000 },
  { key: "minimumCoinsSpent", label: "Coins gastadas mínimas", min: 0, max: 100000000 },
];

const SOCIAL_CALL_NUMBERS = [
  { key: "maxDurationSeconds", label: "Duración máxima (segundos)", min: 60, max: 14400 },
  { key: "timeoutSeconds", label: "Tiempo de espera (segundos)", min: 10, max: 300 },
];

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setSettings(data.settings || {});
      const chatProtection = data.settings?.chatProtection || {};
      const socialCalls = data.settings?.socialCalls || {};
      setForm(
        {
          ...Object.fromEntries(
            Object.entries(data.settings || {})
              .filter(([k]) => k !== "chatProtection" && k !== "socialCalls")
              .map(([k, v]) => [k, String(v)])
          ),
          socialCalls: {
            ...socialCalls,
            enabled: socialCalls.enabled !== false,
            ...Object.fromEntries(
              SOCIAL_CALL_NUMBERS.map((meta) => [meta.key, String(socialCalls[meta.key] ?? 0)])
            ),
            futureRules: socialCalls.futureRules || {},
          },
          chatProtection: {
            ...chatProtection,
            ...Object.fromEntries(
              CHAT_PROTECTION_NUMBERS.map((meta) => [meta.key, String(chatProtection[meta.key] ?? 0)])
            ),
            trustRuleMode: chatProtection.trustRuleMode || "all",
          },
        }
      );
    } catch {
      setError("Error cargando configuración.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = Object.fromEntries(
        Object.entries(form)
          .filter(([k]) => k !== "chatProtection" && k !== "socialCalls")
          .map(([k, v]) => [k, Number(v)])
      );
      body.socialCalls = {
        enabled: form.socialCalls?.enabled !== false,
        ...Object.fromEntries(
          SOCIAL_CALL_NUMBERS.map((meta) => [meta.key, Number(form.socialCalls?.[meta.key] ?? 0)])
        ),
        futureRules: form.socialCalls?.futureRules || {},
      };
      body.chatProtection = {
        ...(form.chatProtection || {}),
        ...Object.fromEntries(
          CHAT_PROTECTION_NUMBERS.map((meta) => [meta.key, Number(form.chatProtection?.[meta.key] ?? 0)])
        ),
      };
      const res = await fetch(`${API_URL}/api/admin/settings`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message || "Error al guardar."); return; }
      setSettings(data.settings || settings);
      setSuccess("Configuración guardada correctamente.");
      setTimeout(() => setSuccess(""), 4000);
    } catch {
      setError("Error de conexión.");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleChatProtectionChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      chatProtection: {
        ...(prev.chatProtection || {}),
        [key]: value,
      },
    }));
  };

  const handleSocialCallsChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      socialCalls: {
        ...(prev.socialCalls || {}),
        [key]: value,
      },
    }));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-sub">Parámetros operativos de la plataforma</p>
        </div>
      </div>

      <div className="warning-banner">
        ⚠️ Los cambios aquí afectan directamente el comportamiento de la plataforma. Modifica con cuidado.
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading-state">Cargando configuración…</div>
      ) : (
        <form onSubmit={handleSubmit} className="settings-form">
          {SETTINGS_META.map((meta) => (
            <div key={meta.key} className="setting-row">
              <div className="setting-info">
                <label className="setting-label" htmlFor={meta.key}>{meta.label}</label>
                <p className="setting-desc">{meta.description}</p>
              </div>
              <div className="setting-input-wrap">
                <input
                  id={meta.key}
                  type="number"
                  className="setting-input"
                  value={form[meta.key] ?? ""}
                  onChange={(e) => handleChange(meta.key, e.target.value)}
                  min={meta.min ?? 0}
                  max={meta.max}
                  step="1"
                  required
                />
                {settings && settings[meta.key] !== undefined && (
                  <div className="setting-current">
                    Actual: <strong>{settings[meta.key]}</strong>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="form-footer">
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? "Guardando…" : "💾 Guardar cambios"}
            </button>
            <button type="button" className="btn-reset" onClick={loadSettings} disabled={loading || saving}>
              ↺ Restablecer
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <section className="settings-form social-calls-panel" aria-labelledby="social-calls-title">
          <div className="panel-heading">
            <h2 id="social-calls-title">Llamadas de voz sociales</h2>
            <p>Configura llamadas entre usuarios con Match sin afectar videollamadas Premium ni Live Streaming.</p>
          </div>
          <div className="setting-row toggle-row">
            <div className="setting-info">
              <span className="setting-label">Activar llamadas sociales</span>
              <p className="setting-desc">Permite iniciar llamadas de voz entre matches cuando ambos usuarios pueden interactuar.</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={form.socialCalls?.enabled !== false}
                onChange={(e) => handleSocialCallsChange("enabled", e.target.checked)}
                disabled={saving}
              />
              <span>{form.socialCalls?.enabled !== false ? "Activo" : "Inactivo"}</span>
            </label>
          </div>
          {SOCIAL_CALL_NUMBERS.map((meta) => (
            <div key={meta.key} className="setting-row">
              <div className="setting-info">
                <label className="setting-label" htmlFor={`social-${meta.key}`}>{meta.label}</label>
                <p className="setting-desc">Se guarda en PlatformSettings y aplica solo a llamadas sociales.</p>
              </div>
              <div className="setting-input-wrap">
                <input
                  id={`social-${meta.key}`}
                  type="number"
                  className="setting-input"
                  value={form.socialCalls?.[meta.key] ?? "0"}
                  onChange={(e) => handleSocialCallsChange(meta.key, e.target.value)}
                  min={meta.min}
                  max={meta.max}
                  step="1"
                  disabled={saving}
                  required
                />
              </div>
            </div>
          ))}
          <div className="form-footer">
            <button type="button" className="btn-save" onClick={handleSubmit} disabled={saving}>
              {saving ? "Guardando…" : "💾 Guardar llamadas sociales"}
            </button>
          </div>
        </section>
      )}

      {!loading && (
        <section className="settings-form chat-protection-panel" aria-labelledby="chat-protection-title">
          <div className="panel-heading">
            <h2 id="chat-protection-title">Protección inteligente del chat</h2>
            <p>Configura cuándo se permite compartir información de contacto externo.</p>
          </div>
          {CHAT_PROTECTION_TOGGLES.map((meta) => (
            <div key={meta.key} className="setting-row toggle-row">
              <div className="setting-info">
                <span className="setting-label">{meta.label}</span>
                <p className="setting-desc">{meta.description}</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.chatProtection?.[meta.key] !== false}
                  onChange={(e) => handleChatProtectionChange(meta.key, e.target.checked)}
                  disabled={saving}
                />
                <span>{form.chatProtection?.[meta.key] !== false ? "Activo" : "Inactivo"}</span>
              </label>
            </div>
          ))}
          {CHAT_PROTECTION_NUMBERS.map((meta) => (
            <div key={meta.key} className="setting-row">
              <div className="setting-info">
                <label className="setting-label" htmlFor={meta.key}>{meta.label}</label>
                <p className="setting-desc">Usa 0 para desactivar esta condición de confianza.</p>
              </div>
              <div className="setting-input-wrap">
                <input
                  id={meta.key}
                  type="number"
                  className="setting-input"
                  value={form.chatProtection?.[meta.key] ?? "0"}
                  onChange={(e) => handleChatProtectionChange(meta.key, e.target.value)}
                  min={meta.min}
                  max={meta.max}
                  step="1"
                  disabled={saving}
                  required
                />
              </div>
            </div>
          ))}
          <div className="setting-row">
            <div className="setting-info">
              <label className="setting-label" htmlFor="trustRuleMode">Modo de reglas de confianza</label>
              <p className="setting-desc">Define si deben cumplirse todas las condiciones activas o cualquiera de ellas.</p>
            </div>
            <select
              id="trustRuleMode"
              className="setting-input"
              value={form.chatProtection?.trustRuleMode || "all"}
              onChange={(e) => handleChatProtectionChange("trustRuleMode", e.target.value)}
              disabled={saving}
            >
              <option value="all">Cumplir todas</option>
              <option value="any">Cumplir cualquiera</option>
            </select>
          </div>
          <div className="form-footer">
            <button type="button" className="btn-save" onClick={handleSubmit} disabled={saving}>
              {saving ? "Guardando…" : "💾 Guardar protección"}
            </button>
          </div>
        </section>
      )}

      <div className="note-panel">
        <h3 className="note-title">📋 Notas importantes</h3>
        <ul className="note-list">
          <li>Los precios de boost y like oculto se leen al momento de la transacción.</li>
          <li>El porcentaje de comisión de la plataforma es solo referencial en esta versión — el split real se configura en el modelo de agencia.</li>
          <li>La recompensa diaria base afecta el día 1 de racha; los días siguientes tienen multiplicadores propios.</li>
          <li>Los cambios se guardan en MongoDB y se aplican sin redeploy.</li>
          <li>Coins mínimas usa lectura de transacciones completadas del usuario; no modifica balances ni Stripe.</li>
        </ul>
      </div>

      <style jsx>{`
        .page { max-width: 800px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0 0 0.2rem; }
        .page-sub { font-size: 0.85rem; color: #64748b; margin: 0; }
        .warning-banner {
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.2);
          color: #fbbf24;
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
        }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; margin-bottom: 1rem; }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .alert-success { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }
        .loading-state { text-align: center; padding: 3rem; color: #64748b; }
        .settings-form { background: #161b27; border: 1px solid #1e2535; border-radius: 14px; overflow: hidden; margin-bottom: 1.5rem; }
        .chat-protection-panel,
        .social-calls-panel { margin-top: 1rem; }
        .panel-heading { padding: 1rem 1.25rem; border-bottom: 1px solid #1a2030; }
        .panel-heading h2 { color: #e2e8f0; font-size: 1rem; margin: 0 0 0.25rem; }
        .panel-heading p { color: #64748b; font-size: 0.82rem; margin: 0; }
        .setting-row {
          display: grid;
          grid-template-columns: 1fr 180px;
          gap: 1rem;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #1a2030;
        }
        .setting-row:last-of-type { border-bottom: none; }
        @media (max-width: 600px) {
          .setting-row { grid-template-columns: 1fr; }
        }
        .setting-label { font-size: 0.875rem; font-weight: 600; color: #e2e8f0; display: block; margin-bottom: 0.2rem; }
        .setting-desc { font-size: 0.78rem; color: #64748b; margin: 0; }
        .setting-input-wrap { display: flex; flex-direction: column; gap: 0.25rem; }
        .setting-input {
          background: #0f1117;
          border: 1px solid #2d3748;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.55rem 0.85rem;
          font-size: 0.95rem;
          font-weight: 600;
          font-family: inherit;
          width: 100%;
          outline: none;
          text-align: right;
        }
        .setting-input:focus { border-color: #7c3aed; }
        select.setting-input { text-align: left; }
        .toggle-row { grid-template-columns: 1fr 150px; }
        .switch { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; color: #cbd5e1; font-size: 0.82rem; font-weight: 700; }
        .switch input { width: 1.1rem; height: 1.1rem; accent-color: #7c3aed; }
        .setting-current { font-size: 0.72rem; color: #64748b; text-align: right; }
        .setting-current strong { color: #94a3b8; }
        .form-footer {
          display: flex;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          border-top: 1px solid #1e2535;
          background: #0f1117;
        }
        .btn-save {
          background: #7c3aed;
          border: none;
          color: #fff;
          border-radius: 8px;
          padding: 0.6rem 1.5rem;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .btn-save:hover:not(:disabled) { background: #6d28d9; }
        .btn-save:disabled { opacity: 0.55; cursor: not-allowed; }
        .btn-reset {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.6rem 1rem;
          font-size: 0.875rem;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-reset:hover:not(:disabled) { background: #2d3748; }
        .btn-reset:disabled { opacity: 0.45; cursor: not-allowed; }
        .note-panel { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.25rem; }
        .note-title { font-size: 0.875rem; font-weight: 700; color: #e2e8f0; margin: 0 0 0.75rem; }
        .note-list { margin: 0; padding-left: 1.25rem; }
        .note-list li { font-size: 0.82rem; color: #64748b; margin-bottom: 0.4rem; line-height: 1.5; }
      `}</style>
    </div>
  );
}
