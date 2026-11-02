"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { GIFT_ANIMATION_PREVIEWS } from "@/lib/giftAnimationsPreviewCatalog";
import {
  createIdlePlaybackState,
  requestPlay,
  completePlay,
  isCardPlaying,
} from "@/lib/giftPreviewPlayback";

/**
 * Interactive content for /dev/gift-animations-preview.
 *
 * This is a plain client component with no access-control logic of its
 * own — the decision to mount it at all is made by the server component
 * in page.jsx via lib/giftAnimationsPreviewAccess.js, so the gating logic
 * never has to be duplicated (or risk drifting) here.
 *
 * CPU/GPU/memory note: playback is coordinated from this parent component
 * via a single `playback` state (see lib/giftPreviewPlayback.js), not by
 * each card independently. Only the one card whose id matches
 * `playback.activeId` is allowed to mount its heavy SVG/CSS animation
 * component — starting another gift immediately flips every other card's
 * `isPlaying` prop to false, which unmounts its animation before the new
 * one mounts. So with 12 gifts on one page there is never more than one
 * animated component running at a time, even if a user clicks two
 * different "Play" buttons back-to-back.
 */
function GiftPreviewCard({ item, isPlaying, playToken, onPlay, onComplete }) {
  const { t } = useLanguage();
  const [hasPlayed, setHasPlayed] = useState(false);
  const Animation = item.Component;

  const handleComplete = () => {
    setHasPlayed(true);
    onComplete();
  };

  const handlePlayClick = () => {
    setHasPlayed(false);
    onPlay();
  };

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
        {isPlaying ? (
          <Animation key={playToken} onComplete={handleComplete} />
        ) : (
          <div className="gap-poster" aria-hidden="true">
            <span className="gap-poster-icon">{item.icon}</span>
          </div>
        )}
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
        disabled={isPlaying}
        onClick={handlePlayClick}
      >
        {isPlaying
          ? t("giftAnimationsPreview.labels.playing")
          : hasPlayed
          ? t("giftAnimationsPreview.labels.replay")
          : t("giftAnimationsPreview.labels.play")}
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
        .gap-poster {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(124, 58, 237, 0.35), rgba(192, 132, 252, 0.08));
          border: 1px solid rgba(192, 132, 252, 0.3);
        }
        .gap-poster-icon {
          font-size: 2.5rem;
          line-height: 1;
          opacity: 0.85;
        }
        .gap-replay-btn:disabled {
          opacity: 0.6;
          cursor: default;
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
  // Single source of truth for "which gift (if any) is currently playing".
  // See lib/giftPreviewPlayback.js: only one card's id can ever match
  // `playback.activeId`, so requesting a new gift always stops the
  // previous one first.
  const [playback, setPlayback] = useState(createIdlePlaybackState());

  return (
    <main className="gap-page">
      <header className="gap-page-header">
        <h1>{t("giftAnimationsPreview.title")}</h1>
        <p>{t("giftAnimationsPreview.subtitle")}</p>
        <p className="gap-disclaimer">{t("giftAnimationsPreview.disclaimer")}</p>
      </header>

      <div className="gap-grid">
        {GIFT_ANIMATION_PREVIEWS.map((item) => (
          <GiftPreviewCard
            key={item.id}
            item={item}
            isPlaying={isCardPlaying(playback, item.id)}
            playToken={playback.activeId === item.id ? playback.token : 0}
            onPlay={() => setPlayback((prev) => requestPlay(prev, item.id))}
            onComplete={() => setPlayback((prev) => completePlay(prev, item.id))}
          />
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
