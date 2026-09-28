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

  const previewTitle = title.trim() || t("liveStart.previewDefaultTitle");
  const previewDescription = description.trim() || t("liveStart.previewDefaultDescription");
  const previewAudience = isVipOnly
    ? t("liveStart.vipOnly")
    : isPrivate
      ? t("liveStart.privateEntryAudience")
        .replace("{coins}", entryCost || 0)
        .replace("{currency}", t("common.coins"))
      : t("liveStart.public");
  const readyChecks = [
    { label: t("liveStart.checklistClearTitle"), done: Boolean(title.trim()) },
    { label: t("liveStart.checklistCategory"), done: Boolean(category) },
    { label: t("liveStart.checklistLanguage"), done: Boolean(language) },
    { label: t("liveStart.checklistAccess"), done: !isPrivate || entryCost >= 1 },
  ];

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

      <div className="start-layout">
        <form className="start-form card" onSubmit={startLive}>
          <div className="form-section-title">
            <span>1</span>
            <div>
              <strong>{t("liveStart.prepareRoom")}</strong>
              <small>{t("liveStart.prepareRoomHint")}</small>
            </div>
          </div>
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

          <div className="form-section-title">
            <span>2</span>
            <div>
              <strong>{t("liveStart.defineAccess")}</strong>
              <small>{t("liveStart.defineAccessHint")}</small>
            </div>
          </div>

          {/* Privacy toggle — all users reaching this page are approved creators */}
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
            {isPrivate && (
              <p className="privacy-hint">
                {t("liveStart.privateHint")}
              </p>
            )}
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

          {/* VIP-only toggle */}
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
            {isVipOnly && (
              <p className="privacy-hint">
                {t("liveStart.vipHint")}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
          >
            {loading ? t("liveStart.starting") : `🔴 ${t("liveStart.startStream")}`}
          </button>
        </form>

        <aside className="start-side-panel" aria-label={t("liveStart.previewAriaLabel")}>
          <div className="live-preview-card">
            <span className="preview-kicker">{t("liveStart.previewKicker")}</span>
            <h2>{previewTitle}</h2>
            <p>{previewDescription}</p>
            <div className="preview-tags">
              <span>🔴 {t("liveStart.liveBadge")}</span>
              <span>{category || t("liveStart.noCategory")}</span>
              <span>{language || t("liveStart.anyLanguage")}</span>
              <span>{previewAudience}</span>
            </div>
          </div>

          <div className="creator-checklist">
            <span className="preview-kicker">{t("liveStart.beforeGoingLive")}</span>
            {readyChecks.map((item) => (
              <div className="check-row" data-done={item.done ? "true" : "false"} key={item.label}>
                <span>{item.done ? "✓" : "•"}</span>
                {item.label}
              </div>
            ))}
            <p>
              {t("liveStart.shareTip")}
            </p>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .start-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 1080px; margin: 0 auto; }

        .start-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .start-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .start-sub { color: var(--text-muted); margin-top: 0.25rem; }

        .start-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
          gap: 1.25rem;
          align-items: start;
        }

        .start-form { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.1rem; }

        .form-section-title {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.85rem;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.035);
        }
        .form-section-title span {
          display: grid;
          place-items: center;
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 50%;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 900;
          flex-shrink: 0;
        }
        .form-section-title strong { display: block; color: var(--text); }
        .form-section-title small { display: block; margin-top: 0.15rem; color: var(--text-muted); line-height: 1.45; }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .textarea { resize: vertical; min-height: 80px; }

        .start-side-panel {
          position: sticky;
          top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .live-preview-card,
        .creator-checklist {
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: var(--radius);
          background:
            radial-gradient(circle at 20% 0%, rgba(224,64,251,0.18), transparent 32%),
            rgba(15,8,32,0.78);
          box-shadow: var(--shadow);
          padding: 1.25rem;
        }
        .preview-kicker {
          display: inline-flex;
          margin-bottom: 0.7rem;
          color: var(--accent-cyan);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .live-preview-card h2 {
          margin: 0;
          color: var(--text);
          font-size: clamp(1.4rem, 3vw, 2rem);
          letter-spacing: -0.04em;
        }
        .live-preview-card p,
        .creator-checklist p {
          color: var(--text-muted);
          line-height: 1.55;
        }
        .preview-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 1rem;
        }
        .preview-tags span,
        .check-row {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          background: rgba(255,255,255,0.045);
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 800;
          padding: 0.4rem 0.65rem;
        }
        .check-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-bottom: 0.45rem;
        }
        .check-row[data-done="true"] {
          border-color: rgba(52,211,153,0.24);
          background: rgba(52,211,153,0.08);
          color: #bbf7d0;
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
          .start-layout { grid-template-columns: 1fr; }
          .start-side-panel { position: static; }
          .start-form { padding: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
