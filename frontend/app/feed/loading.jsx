"use client";

import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const FEED_LOADING_DEBUG_PREFIX = "[feed-loading-debug]";
const FEED_LOADING_DEBUG_ENABLED = process.env.NEXT_PUBLIC_ENABLE_FEED_DEBUG !== "false";

function getLoadingViewportDebugSnapshot() {
  if (typeof window === "undefined") return {};

  const visualViewport = window.visualViewport;
  return {
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: visualViewport ? Math.round(visualViewport.width) : null,
      visualHeight: visualViewport ? Math.round(visualViewport.height) : null,
      visualScale: visualViewport ? visualViewport.scale : null,
      documentWidth: document.documentElement?.clientWidth || null,
      documentHeight: document.documentElement?.clientHeight || null,
      bodyWidth: document.body?.clientWidth || null,
      bodyHeight: document.body?.clientHeight || null,
    },
  };
}

function getLoadingElementMetrics(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    className: element.className || "",
  };
}

function debugFeedLoading(message, details = {}) {
  if (!FEED_LOADING_DEBUG_ENABLED) return;
  try {
    console.info(`${FEED_LOADING_DEBUG_PREFIX} ${message}`, details);
  } catch {}
}

export default function FeedLoading() {
  const { t } = useLanguage();

  useEffect(() => {
    if (!FEED_LOADING_DEBUG_ENABLED) return;
    const page = document.querySelector(".feed-page--initial-loading");
    const deck = page?.querySelector(".feed-swipe-deck");
    debugFeedLoading("initial loading shell mounted", {
      ...getLoadingViewportDebugSnapshot(),
      page: getLoadingElementMetrics(page),
      deck: getLoadingElementMetrics(deck),
    });
  }, []);

  return (
    <div className="feed-page feed-page--initial-loading">
      <header className="feed-header" aria-label="MeetYouLive">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="feed-header-logo" />
      </header>

      <section className="feed-section feed-match-section" aria-label={t("feed.recommendedProfilesAria")}>
        <div className="feed-swipe-deck feed-swipe-deck--state" role="status" aria-live="polite">
          <div className="feed-loading">
            <div className="feed-loading__pulse" aria-hidden="true" />
            <div className="spinner" aria-hidden="true" />
            <p>{t("feed.loadingLabel")}</p>
          </div>
        </div>
      </section>

      <style jsx>{`
        .feed-page {
          --feed-safe-top: env(safe-area-inset-top);
          --feed-safe-bottom: env(safe-area-inset-bottom);
          --feed-header-logo-size: clamp(52px, 15vw, 76px);
          --feed-header-content-height: calc(var(--feed-header-logo-size) + 1rem);
          --feed-bottom-nav-content-height: 68px;
          --feed-section-top-padding: 6px;
          --feed-header-height: calc(var(--feed-header-content-height) + var(--feed-safe-top));
          --feed-bottom-nav-height: calc(var(--feed-bottom-nav-content-height) + var(--feed-safe-bottom));
          --feed-viewport-height: 100vh;
          --feed-stable-viewport-height: var(--feed-viewport-height);
          --feed-available-height: calc(var(--feed-viewport-height) - var(--feed-header-height) - var(--feed-bottom-nav-height));
          --feed-deck-width: min(96vw, 440px);
          --feed-deck-height: clamp(600px, calc(var(--feed-stable-viewport-height) * 0.72), 720px);
          min-height: var(--feed-viewport-height);
          padding-bottom: var(--feed-bottom-nav-height);
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
          overflow-x: hidden;
          width: 100%;
          min-width: 0;
        }

        .feed-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          padding-top: calc(0.5rem + env(safe-area-inset-top));
          background: rgba(15, 8, 33, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .feed-header-logo {
          width: var(--feed-header-logo-size, clamp(52px, 15vw, 76px));
          height: var(--feed-header-logo-size, clamp(52px, 15vw, 76px));
          display: block;
          object-fit: contain;
        }

        .feed-section {
          padding: 0;
        }

        .feed-match-section {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: max(var(--feed-available-height), calc(var(--feed-deck-height) + var(--feed-section-top-padding)));
          height: max(var(--feed-available-height), calc(var(--feed-deck-height) + var(--feed-section-top-padding)));
          padding: var(--feed-section-top-padding) 0 0;
          box-sizing: border-box;
        }

        .feed-swipe-deck {
          position: relative;
          flex: 0 0 auto;
          width: var(--feed-deck-width);
          min-width: var(--feed-deck-width);
          max-width: var(--feed-deck-width);
          height: var(--feed-deck-height);
          min-height: var(--feed-deck-height);
          max-height: var(--feed-deck-height);
          display: flex;
          justify-content: center;
          contain: layout paint;
          border-radius: 22px;
        }

        .feed-swipe-deck--state {
          margin: 0;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(20, 12, 46, 0.92), rgba(15, 8, 33, 0.96));
          border: 1px solid rgba(224, 64, 251, 0.14);
          box-shadow: 0 22px 54px rgba(0, 0, 0, 0.26);
        }

        .feed-loading {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 2rem 1.5rem;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          margin: 0 auto;
          text-align: center;
          color: var(--text-muted, #a39ec0);
        }

        .feed-loading__pulse {
          width: 68px;
          height: 68px;
          border-radius: 24px;
          background:
            radial-gradient(circle at 72% 24%, rgba(34, 211, 238, 0.54), transparent 30%),
            linear-gradient(135deg, rgba(224, 64, 251, 0.9), rgba(124, 58, 237, 0.86) 58%, rgba(34, 211, 238, 0.82));
          box-shadow: 0 20px 60px rgba(124, 58, 237, 0.28);
          animation: feed-loading-breathe 1.6s ease-in-out infinite;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(224, 64, 251, 0.2);
          border-top-color: var(--accent, #e040fb);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .feed-loading p {
          margin: 0;
          font-weight: 700;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes feed-loading-breathe {
          0%, 100% {
            transform: scale(0.96);
            opacity: 0.78;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @media (min-width: 641px) {
          .feed-page {
            --feed-bottom-nav-content-height: 72px;
          }
        }

        @supports (height: 100dvh) {
          .feed-page {
            min-height: max(100dvh, var(--feed-viewport-height));
          }
        }

        @supports (height: 100lvh) {
          .feed-page {
            --feed-viewport-height: 100lvh;
            --feed-stable-viewport-height: 100lvh;
          }
        }

        @media (min-width: 769px) {
          .feed-page {
            --feed-deck-width: min(calc(100vw - 32px), 440px);
            --feed-deck-height: clamp(520px, calc(var(--feed-available-height) - var(--feed-section-top-padding)), 720px);
          }
        }
      `}</style>
    </div>
  );
}
