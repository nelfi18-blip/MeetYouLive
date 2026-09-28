"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const SETTINGS_META = [
  { key: "boostPriceCrush", labelKey: "adminSettings.boostPriceCrushLabel", descriptionKey: "adminSettings.boostPriceCrushDescription", min: 1 },
  { key: "boostPackPrice", labelKey: "adminSettings.boostPackPriceLabel", descriptionKey: "adminSettings.boostPackPriceDescription", min: 1 },
  { key: "hiddenLikePrice", labelKey: "adminSettings.hiddenLikePriceLabel", descriptionKey: "adminSettings.hiddenLikePriceDescription", min: 1 },
  { key: "dailyRewardBaseCoins", labelKey: "adminSettings.dailyRewardBaseCoinsLabel", descriptionKey: "adminSettings.dailyRewardBaseCoinsDescription", min: 1 },
  { key: "referralRewardCoins", labelKey: "adminSettings.referralRewardCoinsLabel", descriptionKey: "adminSettings.referralRewardCoinsDescription", min: 0 },
  { key: "creatorPlatformSplitPercent", labelKey: "adminSettings.creatorPlatformSplitPercentLabel", descriptionKey: "adminSettings.creatorPlatformSplitPercentDescription", min: 0, max: 100 },
];

const CHAT_PROTECTION_TOGGLES = [
  { key: "chatProtectionEnabled", labelKey: "adminSettings.chatProtectionEnabledLabel", descriptionKey: "adminSettings.chatProtectionEnabledDescription" },
  { key: "blockPhones", labelKey: "adminSettings.blockPhonesLabel", descriptionKey: "adminSettings.blockPhonesDescription" },
  { key: "blockEmails", labelKey: "adminSettings.blockEmailsLabel", descriptionKey: "adminSettings.blockEmailsDescription" },
  { key: "blockUrls", labelKey: "adminSettings.blockUrlsLabel", descriptionKey: "adminSettings.blockUrlsDescription" },
  { key: "blockSocialMedia", labelKey: "adminSettings.blockSocialMediaLabel", descriptionKey: "adminSettings.blockSocialMediaDescription" },
];

const CHAT_PROTECTION_NUMBERS = [
  { key: "minimumDaysSinceMatch", labelKey: "adminSettings.minimumDaysSinceMatchLabel", min: 0, max: 3650 },
  { key: "minimumMessages", labelKey: "adminSettings.minimumMessagesLabel", min: 0, max: 100000 },
  { key: "minimumCompletedCalls", labelKey: "adminSettings.minimumCompletedCallsLabel", min: 0, max: 10000 },
  { key: "minimumCoinsSpent", labelKey: "adminSettings.minimumCoinsSpentLabel", min: 0, max: 100000000 },
];

const SOCIAL_CALL_NUMBERS = [
  { key: "maxDurationSeconds", labelKey: "adminSettings.maxDurationSecondsLabel", min: 60, max: 14400 },
  { key: "timeoutSeconds", labelKey: "adminSettings.timeoutSecondsLabel", min: 10, max: 300 },
];

export default function AdminSettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
      if (res.status === 403) { setError(t("adminSettings.noPermissions")); return; }
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
      setError(t("adminSettings.loadError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, t]);

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
      if (!res.ok) { setError(data.message || t("adminSettings.saveError")); return; }
      setSettings(data.settings || settings);
      setSuccess(t("adminSettings.saveSuccess"));
      setTimeout(() => setSuccess(""), 4000);
    } catch {
      setError(t("adminSettings.connectionError"));
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
          <h1 className="page-title">{t("adminSettings.title")}</h1>
          <p className="page-sub">{t("adminSettings.pageSubtitle")}</p>
        </div>
      </div>

      <div className="warning-banner">
        {t("adminSettings.warningBanner")}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading-state">{t("adminSettings.loading")}</div>
      ) : (
        <form onSubmit={handleSubmit} className="settings-form">
          {SETTINGS_META.map((meta) => (
            <div key={meta.key} className="setting-row">
              <div className="setting-info">
                <label className="setting-label" htmlFor={meta.key}>{t(meta.labelKey)}</label>
                <p className="setting-desc">{t(meta.descriptionKey)}</p>
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
                    {t("adminSettings.currentValue")}: <strong>{settings[meta.key]}</strong>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="form-footer">
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? t("profile.saving") : t("adminSettings.saveChanges")}
            </button>
            <button type="button" className="btn-reset" onClick={loadSettings} disabled={loading || saving}>
              {t("adminSettings.reset")}
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <section className="settings-form social-calls-panel" aria-labelledby="social-calls-title">
          <div className="panel-heading">
          <h2 id="social-calls-title">{t("adminSettings.socialCallsTitle")}</h2>
          <p>{t("adminSettings.socialCallsDescription")}</p>
          </div>
          <div className="setting-row toggle-row">
            <div className="setting-info">
            <span className="setting-label">{t("adminSettings.enableSocialCallsLabel")}</span>
            <p className="setting-desc">{t("adminSettings.enableSocialCallsDescription")}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={form.socialCalls?.enabled !== false}
                onChange={(e) => handleSocialCallsChange("enabled", e.target.checked)}
                disabled={saving}
              />
              <span>{form.socialCalls?.enabled !== false ? t("adminSettings.statusActive") : t("adminSettings.statusInactive")}</span>
            </label>
          </div>
          {SOCIAL_CALL_NUMBERS.map((meta) => (
            <div key={meta.key} className="setting-row">
              <div className="setting-info">
                <label className="setting-label" htmlFor={`social-${meta.key}`}>{t(meta.labelKey)}</label>
                <p className="setting-desc">{t("adminSettings.socialCallSettingDescription")}</p>
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
              {saving ? t("profile.saving") : t("adminSettings.saveSocialCalls")}
            </button>
          </div>
        </section>
      )}

      {!loading && (
        <section className="settings-form chat-protection-panel" aria-labelledby="chat-protection-title">
          <div className="panel-heading">
          <h2 id="chat-protection-title">{t("adminSettings.chatProtectionTitle")}</h2>
          <p>{t("adminSettings.chatProtectionDescription")}</p>
          </div>
          {CHAT_PROTECTION_TOGGLES.map((meta) => (
            <div key={meta.key} className="setting-row toggle-row">
              <div className="setting-info">
              <span className="setting-label">{t(meta.labelKey)}</span>
              <p className="setting-desc">{t(meta.descriptionKey)}</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.chatProtection?.[meta.key] !== false}
                  onChange={(e) => handleChatProtectionChange(meta.key, e.target.checked)}
                  disabled={saving}
                />
                <span>{form.chatProtection?.[meta.key] !== false ? t("adminSettings.statusActive") : t("adminSettings.statusInactive")}</span>
              </label>
            </div>
          ))}
          {CHAT_PROTECTION_NUMBERS.map((meta) => (
            <div key={meta.key} className="setting-row">
              <div className="setting-info">
                <label className="setting-label" htmlFor={meta.key}>{t(meta.labelKey)}</label>
                <p className="setting-desc">{t("adminSettings.disableTrustConditionHint")}</p>
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
              <label className="setting-label" htmlFor="trustRuleMode">{t("adminSettings.trustRuleModeLabel")}</label>
              <p className="setting-desc">{t("adminSettings.trustRuleModeDescription")}</p>
            </div>
            <select
              id="trustRuleMode"
              className="setting-input"
              value={form.chatProtection?.trustRuleMode || "all"}
              onChange={(e) => handleChatProtectionChange("trustRuleMode", e.target.value)}
              disabled={saving}
            >
              <option value="all">{t("adminSettings.trustRuleModeAll")}</option>
              <option value="any">{t("adminSettings.trustRuleModeAny")}</option>
            </select>
          </div>
          <div className="form-footer">
            <button type="button" className="btn-save" onClick={handleSubmit} disabled={saving}>
              {saving ? t("profile.saving") : t("adminSettings.saveProtection")}
            </button>
          </div>
        </section>
      )}

      <div className="note-panel">
        <h3 className="note-title">{t("adminSettings.notesTitle")}</h3>
        <ul className="note-list">
          <li>{t("adminSettings.noteBoostPrices")}</li>
          <li>{t("adminSettings.notePlatformCommission")}</li>
          <li>{t("adminSettings.noteDailyReward")}</li>
          <li>{t("adminSettings.notePersistence")}</li>
          <li>{t("adminSettings.noteMinimumCoinsSpent")}</li>
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
