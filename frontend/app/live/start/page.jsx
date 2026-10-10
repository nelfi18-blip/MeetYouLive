"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { clearToken } from "@/lib/token";
import { isApprovedCreator as hasApprovedCreatorAccess } from "@/lib/creatorUtils";
import { trackAnalyticsEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function StartLivePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [entryCost, setEntryCost] = useState(10);
  const [isVipOnly, setIsVipOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isApprovedCreator, setIsApprovedCreator] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data) return;
        const approved = hasApprovedCreatorAccess(data);
        setIsApprovedCreator(approved);
        if (!approved) {
          setError(t("liveStart.creatorRequired"));
        }
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [router, t]);

  const startLive = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("liveStart.titleRequired"));
      return;
    }
    if (isPrivate && (!entryCost || entryCost < 1)) {
      setError(t("liveStart.entryCostMin"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/lives/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          language,
          isPrivate,
          entryCost: isPrivate ? Number(entryCost) : 0,
          isVipOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("liveStart.startError"));
        return;
      }
      trackAnalyticsEvent("first_live_started");
      router.push(`/live/${data._id}`);
    } catch {
      setError(t("liveStart.connectionError"));
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="start-page">
        <div className="checking-auth">
          <div className="spinner" />
        </div>
        <style jsx>{`
          .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; margin: 0 auto; }
          .checking-auth { display: flex; justify-content: center; padding: 4rem; }
          .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,15,138,0.2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!isApprovedCreator) {
    return (
      <div className="start-page">
        <div className="error-banner">
          {error || t("liveStart.creatorRequired")}
        </div>
        <Link href="/live" className="btn btn-secondary">← {t("liveStart.backToLives")}</Link>
        <style jsx>{`
          .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; margin: 0 auto; }
          .error-banner {
            background: rgba(244,67,54,0.1);
            border: 1px solid var(--error);
            color: var(--error);
            border-radius: var(--radius-sm);
            padding: 0.75rem 1rem;
            font-size: 0.875rem;
          }

        `}</style>
      </div>
    );
  }

  const audienceBadge = isPrivate
    ? `🔒 ${t("liveStart.privateEntryAudience")
        .replace("{coins}", entryCost || 0)
        .replace("{currency}", t("common.coins"))}`
    : `🌐 ${t("liveStart.public")}`;
  const accessBadge = isVipOnly ? `💎 ${t("liveStart.vipOnly")}` : `🌍 ${t("liveStart.everyone")}`;

  return (
    <div className="start-page">
      <div className="start-header">
        <div>
          <h1 className="start-title">🎥 {t("liveStart.pageTitle")}</h1>
          <p className="start-sub">{t("liveStart.pageSubtitle")}</p>
        </div>
        <Link href="/live" className="btn btn-secondary">← {t("liveStart.backToLives")}</Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form className="start-form card" onSubmit={startLive}>
        <div className="form-group">
          <label className="form-label">{t("liveStart.titleLabel")}</label>
          <input
            className="input"
            type="text"
            placeholder={t("liveStart.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t("liveStart.privacyLabel")}</label>
          <div className="privacy-toggle">
            <button
              type="button"
              className={`privacy-btn${!isPrivate ? " active" : ""}`}
              onClick={() => setIsPrivate(false)}
            >
              🌐 {t("liveStart.public")}
            </button>
            <button
              type="button"
              className={`privacy-btn${isPrivate ? " active" : ""}`}
              onClick={() => setIsPrivate(true)}
            >
              🔒 {t("liveStart.privateCoins")}
            </button>
          </div>
          {isPrivate && <p className="privacy-hint">{t("liveStart.privateHint")}</p>}
        </div>

        {isPrivate && (
          <div className="form-group">
            <label className="form-label">{t("liveStart.entryCostLabel")}</label>
            <input
              className="input"
              type="number"
              min={1}
              max={10000}
              value={entryCost}
              onChange={(e) => setEntryCost(Number(e.target.value))}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{t("liveStart.vipAccessLabel")}</label>
          <div className="privacy-toggle">
            <button
              type="button"
              className={`privacy-btn${!isVipOnly ? " active" : ""}`}
              onClick={() => setIsVipOnly(false)}
            >
              🌍 {t("liveStart.everyone")}
            </button>
            <button
              type="button"
              className={`privacy-btn${isVipOnly ? " privacy-btn-vip-active" : ""}`}
              onClick={() => setIsVipOnly(true)}
            >
              💎 {t("liveStart.vipOnly")}
            </button>
          </div>
          {isVipOnly && <p className="privacy-hint">{t("liveStart.vipHint")}</p>}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg btn-block start-cta"
          disabled={loading}
        >
          {loading ? t("liveStart.starting") : `🔴 ${t("liveStart.startStream")}`}
        </button>

        <div className="live-summary" aria-label={t("liveStart.previewAriaLabel")}>
          <span className="summary-kicker">{t("liveStart.summaryTitle")}</span>
          <div className="summary-tags">
            <span>{audienceBadge}</span>
            <span>{accessBadge}</span>
            <span>🎁 {t("liveStart.summaryGiftsAvailable")}</span>
            <span>👥 {t("liveStart.summaryMultiGuestAvailable")}</span>
            <span>⚔️ {t("liveStart.summaryBattlesAvailable")}</span>
          </div>
          <p className="summary-hint">{t("liveStart.summaryAfterLiveHint")}</p>
        </div>

        <details className="advanced-details">
          <summary>
            <span className="advanced-summary-icon">✨</span>
            <span className="advanced-summary-text">{t("liveStart.prepareRoom")}</span>
            <span className="advanced-summary-chevron" aria-hidden="true">▾</span>
          </summary>
          <div className="advanced-fields">
            <div className="form-group">
              <label className="form-label">{t("liveStart.descriptionLabel")}</label>
              <textarea
                className="input textarea"
                placeholder={t("liveStart.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t("liveStart.categoryLabel")}</label>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">{t("liveStart.noCategory")}</option>
                <option value="Gaming">{t("liveStart.categoryGaming")}</option>
                <option value="Música">{t("liveStart.categoryMusic")}</option>
                <option value="Charla">{t("liveStart.categoryTalk")}</option>
                <option value="Arte">{t("liveStart.categoryArt")}</option>
                <option value="Educación">{t("liveStart.categoryEducation")}</option>
                <option value="Otro">{t("liveStart.categoryOther")}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t("liveStart.languageLabel")}</label>
              <select
                className="input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="">{t("liveStart.languageUnspecified")}</option>
                <option value="es">{t("liveStart.languageSpanish")}</option>
                <option value="en">{t("liveStart.languageEnglish")}</option>
                <option value="pt">{t("liveStart.languagePortuguese")}</option>
              </select>
            </div>
          </div>
        </details>
      </form>

      <style jsx>{`
        .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 640px; margin: 0 auto; }

        .start-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .start-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .start-sub { color: var(--text-muted); margin-top: 0.25rem; }

        .start-form { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.9rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .textarea { resize: vertical; min-height: 80px; }

        /* Primary CTA — high visual priority, appears before secondary/info blocks */
        .start-cta {
          font-size: 1.05rem;
          box-shadow: 0 8px 24px rgba(255,15,138,0.35);
        }

        /* Compact live summary replacing the old large preview card */
        .live-summary {
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: var(--radius-sm);
          background:
            radial-gradient(circle at 20% 0%, rgba(224,64,251,0.16), transparent 32%),
            rgba(15,8,32,0.7);
          padding: 0.85rem 1rem;
        }
        .summary-kicker {
          display: inline-flex;
          margin-bottom: 0.55rem;
          color: var(--accent-cyan);
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .summary-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .summary-tags span {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          background: rgba(255,255,255,0.045);
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 800;
          padding: 0.35rem 0.6rem;
        }
        .summary-hint {
          margin-top: 0.55rem;
          color: var(--text-muted);
          font-size: 0.76rem;
          line-height: 1.45;
        }

        /* Optional pre-live info, collapsed by default to reduce scroll */
        .advanced-details {
          position: relative;
          border: 1px solid rgba(224,64,251,0.22);
          border-radius: var(--radius-sm);
          background:
            radial-gradient(circle at 100% 0%, rgba(34,211,238,0.1), transparent 45%),
            linear-gradient(160deg, rgba(43,20,84,0.55) 0%, rgba(15,8,33,0.6) 100%);
          padding: 0.8rem 0.95rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .advanced-details:hover {
          border-color: rgba(224,64,251,0.4);
        }
        .advanced-details[open] {
          border-color: var(--border-glow);
          box-shadow: 0 0 0 1px rgba(224,64,251,0.12), 0 12px 28px rgba(124,58,237,0.18);
        }
        .advanced-details summary {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          color: var(--text);
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.01em;
          list-style: none;
          user-select: none;
        }
        .advanced-details summary::-webkit-details-marker { display: none; }
        .advanced-summary-icon {
          font-size: 0.95rem;
          filter: drop-shadow(0 0 6px rgba(224,64,251,0.5));
        }
        .advanced-summary-text {
          flex: 1;
          background: var(--grad-primary);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .advanced-summary-chevron {
          color: var(--accent-cyan);
          font-weight: 900;
          transition: transform 0.25s ease;
          transform: rotate(-90deg);
        }
        .advanced-details[open] .advanced-summary-chevron {
          transform: rotate(0deg);
        }
        .advanced-fields {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          margin-top: 0.9rem;
          padding-top: 0.85rem;
          border-top: 1px solid rgba(255,255,255,0.08);
          animation: advanced-fields-in 0.22s ease;
        }
        @keyframes advanced-fields-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Privacy toggle */
        .privacy-toggle {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .privacy-btn {
          flex: 1;
          padding: 0.6rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .privacy-btn.active {
          border-color: var(--accent);
          background: rgba(255, 15, 138, 0.1);
          color: var(--accent);
        }

        .privacy-btn-vip-active {
          border-color: rgba(251,191,36,0.6);
          background: rgba(251,191,36,0.15);
          color: #fbbf24;
        }

        .privacy-btn-vip-active:hover {
          background: rgba(251,191,36,0.22);
          box-shadow: 0 0 10px rgba(251,191,36,0.25);
        }

        .privacy-hint {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        @media (max-width: 760px) {
          .start-page { gap: 1rem; }
          .start-title { font-size: 1.4rem; }
          .start-form { padding: 1rem; gap: 0.75rem; }
          .privacy-btn { padding: 0.55rem 0.75rem; font-size: 0.8rem; }
        }
      `}</style>
    </div>
  );
}
