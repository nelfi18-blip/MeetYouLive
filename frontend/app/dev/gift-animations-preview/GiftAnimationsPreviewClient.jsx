"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { GIFT_ANIMATION_PREVIEWS } from "@/lib/giftAnimationsPreviewCatalog";

/**
 * Interactive content for /dev/gift-animations-preview.
 *
 * This is a plain client component with no access-control logic of its
 * own — the decision to mount it at all is made by the server component
 * in page.jsx via lib/giftAnimationsPreviewAccess.js, so the gating logic
 * never has to be duplicated (or risk drifting) here.
 */
function GiftPreviewCard({ item }) {
  const { t } = useLanguage();
  const [playKey, setPlayKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const Animation = item.Component;

  return (
    <div className="gap-card">
      <div className="gap-card-header">
        <span className="gap-icon" aria-hidden="true">
          {item.icon}
        </span>
        <div>
          <h2 className="gap-name">{t(item.nameKey)}</h2>
          <p className="gap-description">{t(item.descriptionKey)}</p>
        </div>
      </div>

      <div className="gap-stage">
        <Animation key={playKey} onComplete={() => setIsPlaying(false)} />
      </div>

      <dl className="gap-meta">
        <div>
          <dt>{t("giftAnimationsPreview.labels.proposedPrice")}</dt>
          <dd>{item.proposedCoins.toLocaleString()} {t("giftAnimationsPreview.labels.coinsSuffix")}</dd>
        </div>
        <div>
          <dt>{t("giftAnimationsPreview.labels.duration")}</dt>
          <dd>{(item.durationMs / 1000).toFixed(0)}s</dd>
        </div>
        <div>
          <dt>{t("giftAnimationsPreview.labels.tier")}</dt>
          <dd>{t(`giftAnimationsPreview.tiers.${item.tierKey}`)}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="gap-replay-btn"
        onClick={() => {
          setIsPlaying(true);
          setPlayKey((k) => k + 1);
        }}
      >
        {isPlaying
          ? t("giftAnimationsPreview.labels.playing")
          : t("giftAnimationsPreview.labels.replay")}
      </button>

      <style jsx>{`
        .gap-card {
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .gap-card-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .gap-icon {
          font-size: 1.75rem;
          line-height: 1;
        }
        .gap-name {
          margin: 0 0 0.25rem;
          font-size: 1.1rem;
          color: #f8fafc;
        }
        .gap-description {
          margin: 0;
          font-size: 0.85rem;
          color: #94a3b8;
        }
        .gap-stage {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 160px;
          background: radial-gradient(circle at center, rgba(30, 41, 59, 0.9), rgba(2, 6, 23, 0.95));
          border-radius: 12px;
          padding: 1rem;
        }
        .gap-meta {
          display: flex;
          gap: 1.25rem;
          margin: 0;
          flex-wrap: wrap;
        }
        .gap-meta dt {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
        }
        .gap-meta dd {
          margin: 0;
          font-size: 0.95rem;
          color: #e2e8f0;
          font-weight: 700;
        }
        .gap-replay-btn {
          align-self: flex-start;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 0.5rem 1.25rem;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default function GiftAnimationsPreviewClient() {
  const { t } = useLanguage();

  return (
    <main className="gap-page">
      <header className="gap-page-header">
        <h1>{t("giftAnimationsPreview.title")}</h1>
        <p>{t("giftAnimationsPreview.subtitle")}</p>
        <p className="gap-disclaimer">{t("giftAnimationsPreview.disclaimer")}</p>
      </header>

      <div className="gap-grid">
        {GIFT_ANIMATION_PREVIEWS.map((item) => (
          <GiftPreviewCard key={item.id} item={item} />
        ))}
      </div>

      <style jsx>{`
        .gap-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 2rem 1.25rem 4rem;
          color: #e2e8f0;
        }
        .gap-page-header h1 {
          margin: 0 0 0.5rem;
          font-size: 1.6rem;
          color: #f8fafc;
        }
        .gap-page-header p {
          margin: 0 0 0.5rem;
          color: #94a3b8;
        }
        .gap-disclaimer {
          font-size: 0.8rem;
          color: #fbbf24;
          border: 1px dashed rgba(251, 191, 36, 0.4);
          border-radius: 10px;
          padding: 0.6rem 0.9rem;
          display: inline-block;
        }
        .gap-grid {
          margin-top: 1.5rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.25rem;
        }
        @media (max-width: 480px) {
          .gap-page {
            padding: 1.25rem 0.75rem 3rem;
          }
        }
      `}</style>
    </main>
  );
}
