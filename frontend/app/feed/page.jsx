"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchUserRole, getToken, setToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SwipeCard = dynamic(() => import("@/components/SwipeCard"), { ssr: false });

// Hard ceiling on how long we wait for the NextAuth session / backend token
// to hydrate before surfacing a friendly fallback. Prevents the page from
// sitting on a spinner indefinitely on slow connections or Render cold starts.
// This is longer than the backend-token request timeout so recovery can settle.
const INIT_TIMEOUT_MS = 30000;
const BACKEND_TOKEN_FETCH_TIMEOUT_MS = 22000;
const SWIPE_LOCK_TIMEOUT_MS = 1400;

// Hard ceiling for the feed API request itself.
const FETCH_TIMEOUT_MS = 15000;

async function requestBackendToken(signal) {
  try {
    const response = await fetch("/api/auth/backend-token", {
      method: "POST",
      signal,
    });

    if (!response.ok) {
      return { token: null, status: response.status };
    }

    try {
      const data = await response.json();
      return { token: data?.token || null, status: response.status };
    } catch {
      return { token: null, status: response.status };
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return { token: null, status: 0 };
  }
}

/* ------------------------ Inline SVG icon set ------------------------ */
const IconAlert = (props) => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconX = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const IconHeart = (props) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
  </svg>
);

const IconStar = (props) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="m12 2.7 2.86 5.8 6.4.93-4.63 4.52 1.1 6.38L12 17.32l-5.73 3.01 1.1-6.38-4.63-4.52 6.4-.93L12 2.7Z" />
  </svg>
);

/* --------------------------- Feed page --------------------------- */
export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [profiles, setProfiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [actionSignal, setActionSignal] = useState({ id: 0, direction: null });
  const [swipeLocked, setSwipeLocked] = useState(false);
  const tokenRecoveryAttemptedRef = useRef(false);
  const swipeUnlockTimeoutRef = useRef(null);

  // Redirect unauthenticated users to login (preserving callbackUrl=/feed so
  // they come back here after sign-in; authenticated refresh always stays on
  // /feed and never bounces to an alternate layout).
  useEffect(() => {
    if (status === "unauthenticated" && !getToken()) {
      router.replace("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  useEffect(() => {
    return () => {
      if (swipeUnlockTimeoutRef.current) {
        clearTimeout(swipeUnlockTimeoutRef.current);
      }
    };
  }, []);

  // Admins shouldn't see the consumer feed.
  useEffect(() => {
    if (!authToken) return;
    let mounted = true;
    fetchUserRole(authToken)
      .then((u) => {
        if (mounted && u?.role === "admin") router.replace("/admin");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [authToken, router]);

  // Resolve a usable backend JWT for refresh and SPA navigation paths. On hard
  // refresh, NextAuth can be authenticated before session.backendToken is
  // available, so recover it through the server-side proxy or fall back to the
  // locally persisted backend token.
  useEffect(() => {
    let cancelled = false;
    let timeoutId;
    let controller;

    const localToken = getToken();

    if (session?.backendToken) {
      setToken(session.backendToken);
      setAuthToken(session.backendToken);
      setError(null);
      return undefined;
    }

    if (localToken) {
      setAuthToken(localToken);
      return undefined;
    }

    if (status === "loading") return undefined;

    if (status === "unauthenticated") {
      setLoading(false);
      return undefined;
    }

    if (status !== "authenticated") return undefined;

    if (!session?.googleEmail) {
      setError(t("feed.genericError"));
      setLoading(false);
      return undefined;
    }

    if (tokenRecoveryAttemptedRef.current) return undefined;
    tokenRecoveryAttemptedRef.current = true;
    setLoading(true);
    setError(null);

    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), BACKEND_TOKEN_FETCH_TIMEOUT_MS);

    (async () => {
      try {
        const { token: recoveredToken, status: recoveryStatus } = await requestBackendToken(controller.signal);

        if (cancelled) return;

        if (recoveredToken) {
          setToken(recoveredToken);
          setAuthToken(recoveredToken);
          setError(null);
          return;
        }

        let message = t("feed.genericError");
        if (recoveryStatus === 401 || recoveryStatus === 403) {
          message = t("feed.sessionExpired");
        } else if (recoveryStatus === 0) {
          message = t("feed.networkError");
        } else if (recoveryStatus >= 500) {
          message = t("feed.serverStarting");
        }
        setError(message);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err.name === "AbortError") {
          setError(t("feed.serverStarting"));
        } else {
          setError(t("feed.genericError"));
        }
        setLoading(false);
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [status, session?.backendToken, session?.googleEmail, t]);

  // Safety net: never sit on the loading spinner forever waiting for the
  // session/token to hydrate.
  useEffect(() => {
    if (authToken) return;
    if (status === "unauthenticated") return;
    const timer = setTimeout(() => {
      setLoading(false);
      setError(
        (t && t("feed.serverStarting")) ||
          "El servidor está tardando en responder. Por favor, intenta de nuevo."
      );
    }, INIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, authToken, t]);

  // Fetch feed data once a backend token is ready.
  useEffect(() => {
    if (!authToken) return;

    setLoading(true);
    setError(null);

    if (!API_URL) {
      setError(t("feed.genericError"));
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    (async () => {
      try {
        const feedRes = await fetch(`${API_URL}/api/feed`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
          cache: "no-store",
        });

        if (cancelled) return;

        if (!feedRes.ok) {
          if (
            (feedRes.status === 401 || feedRes.status === 403) &&
            status === "authenticated" &&
            session?.googleEmail
          ) {
            let recoveredToken = null;
            try {
              ({ token: recoveredToken } = await requestBackendToken(controller.signal));
            } catch (err) {
              if (err.name === "AbortError") throw err;
            }
            if (cancelled) return;
            // Only restart the feed request when the proxy gives us a different token;
            // if it matches, the 401/403 is not caused by a stale localStorage token.
            if (recoveredToken && recoveredToken !== authToken) {
              setToken(recoveredToken);
              setAuthToken(recoveredToken);
              return;
            }
          }

          let msg = t("feed.genericError");
          if (feedRes.status === 401 || feedRes.status === 403) {
            msg = t("feed.sessionExpired");
          } else if (feedRes.status >= 500) {
            msg = t("feed.serverError");
          }
          throw new Error(msg);
        }

        const data = await feedRes.json();
        const uniqueProfiles = Array.from(
          new Map((data.recommendedProfiles || []).map((p) => [p._id, p])).values()
        );

        setCurrentIndex(0);
        setProfiles(uniqueProfiles);

        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err.name === "AbortError") {
          setError(t("feed.serverStarting"));
        } else {
          setError(err.message || t("feed.genericError"));
        }
      } finally {
        clearTimeout(timeoutId);
        // A replacement request owns the loading state after cancellation.
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [authToken, session?.googleEmail, session?.user?.id, status, t]);

  const visibleProfileStack = [];
  for (let i = Math.min(currentIndex + 2, profiles.length - 1); i >= currentIndex; i -= 1) {
    visibleProfileStack.push({ profile: profiles[i], stackIndex: i - currentIndex });
  }

  /* --------------------------- Actions --------------------------- */
  const unlockSwipe = () => {
    if (swipeUnlockTimeoutRef.current) {
      clearTimeout(swipeUnlockTimeoutRef.current);
      swipeUnlockTimeoutRef.current = null;
    }
    setSwipeLocked(false);
  };

  const advance = () => {
    setCurrentIndex((i) => i + 1);
    unlockSwipe();
  };

  const handleSwipe = async (profileId, direction) => {
    const shouldRecordLike = direction === "right" || direction === "up";

    if (!shouldRecordLike) {
      advance();
      return;
    }

    if (!profileId) {
      unlockSwipe();
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/match/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ userId: profileId }),
      });
      if (!res.ok) throw new Error("Failed to record like");
      advance();
    } catch (err) {
      console.error("Like error:", err);
      unlockSwipe();
      setError(t("feed.likeError"));
    }
  };

  const requestSwipe = (direction) => {
    if (!currentProfile || swipeLocked) return;
    setSwipeLocked(true);
    if (swipeUnlockTimeoutRef.current) {
      clearTimeout(swipeUnlockTimeoutRef.current);
    }
    swipeUnlockTimeoutRef.current = setTimeout(unlockSwipe, SWIPE_LOCK_TIMEOUT_MS);
    setActionSignal((signal) => ({ id: signal.id + 1, direction }));
  };

  /* --------------------------- Render --------------------------- */
  // Loading spinner only while auth/data are pending and no error yet.
  if (!error && loading) {
    return (
      <div className="feed-page">
        <FeedHeader />
        <div className="feed-loading">
          <div className="spinner" />
          <p>Cargando tu feed...</p>
        </div>
      </div>
    );
  }

  // Error fallback (no floating initials, no orange overlay — just a clean card).
  if (error) {
    return (
      <div className="feed-page">
        <FeedHeader />
        <div className="feed-error">
          <IconAlert />
          <h3>No pudimos cargar tu feed</h3>
          <p>{error}</p>
          <button
            type="button"
            className="feed-retry-btn"
            onClick={() => window.location.reload()}
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const hasMoreProfiles = currentIndex < profiles.length && !!currentProfile;

  return (
    <div className="feed-page">
      {/* 1. APPROVED BRAND HEADER */}
      <FeedHeader />

      {/* 2. MODERN SWIPE DECK */}
      <section
        className={`feed-section feed-match-section${hasMoreProfiles ? "" : " feed-match-section--empty"}`}
        aria-label={t("feed.recommendedProfilesAria")}
      >
        {hasMoreProfiles ? (
          <div className="feed-swipe-deck" aria-live="polite" suppressHydrationWarning>
            {visibleProfileStack.map(({ profile, stackIndex }) => {
              const isTopCard = stackIndex === 0;
              return (
                <SwipeCard
                  key={profile._id}
                  profile={profile}
                  isActive={isTopCard}
                  onSwipe={isTopCard ? handleSwipe : undefined}
                  actionSignal={isTopCard ? actionSignal : undefined}
                  zIndex={30 - stackIndex}
                  style={{
                    y: stackIndex * 10,
                    scale: 1 - stackIndex * 0.035,
                    opacity: 1 - stackIndex * 0.12,
                    pointerEvents: isTopCard ? "auto" : "none",
                  }}
                />
              );
            })}

            <div className="feed-action-dock" aria-label={t("feed.actionDockAria")}>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--pass"
                aria-label={t("feed.dislikeLabel")}
                disabled={swipeLocked}
                onClick={() => requestSwipe("left")}
              >
                <IconX />
                <span>{t("feed.dislikeLabel")}</span>
              </button>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--super"
                aria-label={t("feed.superLikeLabel")}
                disabled={swipeLocked}
                onClick={() => requestSwipe("up")}
              >
                <IconStar />
                <span>{t("feed.superLikeShortLabel")}</span>
              </button>
              <button
                type="button"
                className="feed-action-btn feed-action-btn--like"
                aria-label={t("feed.likeLabel")}
                disabled={swipeLocked}
                onClick={() => requestSwipe("right")}
              >
                <IconHeart />
                <span>{t("feed.likeLabel")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="feed-empty">
            <h3>That's everyone for now</h3>
            <p>Check back later for new people.</p>
            <Link href="/explore" className="feed-empty-btn">
              Explorar creadores
            </Link>
          </div>
        )}
      </section>

      {/* 3. Bottom nav is rendered by the root layout's BottomNavWrapper. */}

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
          --feed-available-height: calc(var(--feed-viewport-height) - var(--feed-header-height) - var(--feed-bottom-nav-height));
          --feed-info-panel-height: clamp(190px, 32%, 236px);
          /* Older browsers use 100vh; browsers with lvh support upgrade below for stable refresh sizing. */
          min-height: var(--feed-viewport-height);
          padding-bottom: var(--feed-bottom-nav-height);
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
          overflow-x: hidden;
        }

        .feed-loading,
        .feed-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          min-height: max(280px, var(--feed-available-height));
          padding: 4rem 1.5rem;
          text-align: center;
          color: var(--text-muted, #a39ec0);
        }
        .feed-error :global(svg) {
          color: #e040fb;
          margin-bottom: 0.5rem;
        }
        .feed-error h3 {
          margin: 0;
          color: var(--text, #fff);
          font-size: 1.1rem;
        }
        .feed-error p {
          margin: 0;
          max-width: 420px;
        }
        .feed-retry-btn {
          margin-top: 0.5rem;
          padding: 0.75rem 1.75rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-weight: 700;
          border: none;
          border-radius: 999px;
          cursor: pointer;
          font-size: 0.95rem;
          box-shadow: 0 4px 16px rgba(224, 64, 251, 0.35);
        }

        .feed-section {
          padding: 0;
        }
        .feed-match-section {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: var(--feed-available-height);
          height: var(--feed-available-height);
          padding: var(--feed-section-top-padding) 0 0;
          box-sizing: border-box;
        }
        .feed-match-section--empty {
          align-items: center;
          padding: 0.75rem 1rem 1rem;
        }

        .feed-swipe-deck {
          position: relative;
          width: min(96vw, 440px);
          max-width: 440px;
          /* Subtract the section's top padding so the deck fits its stable viewport slot exactly. */
          height: clamp(520px, calc(var(--feed-available-height) - var(--feed-section-top-padding)), 720px);
          display: flex;
          justify-content: center;
          touch-action: pan-y;
          contain: layout paint;
          border-radius: 22px;
          transition: opacity 0.16s ease;
        }

        :global(.feed-swipe-deck .swipe-card-modern) {
          width: 100%;
          max-width: none;
          height: 100%;
          left: 0;
          right: 0;
          margin: 0 auto;
          background: linear-gradient(180deg, rgba(20, 12, 46, 0.98), rgba(15, 8, 33, 0.98));
          border: 1px solid rgba(224, 64, 251, 0.18);
          border-radius: inherit;
          transform-origin: center center;
          will-change: transform, opacity;
        }

        :global(.feed-swipe-deck .swipe-card-image-wrapper) {
          height: calc(100% - var(--feed-info-panel-height));
          border-radius: inherit;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          overflow: hidden;
        }

        :global(.feed-swipe-deck .swipe-card-info) {
          box-sizing: border-box;
          min-height: 0;
          height: var(--feed-info-panel-height);
          padding: clamp(1rem, 3.5vw, 1.25rem) clamp(1rem, 4vw, 1.35rem) clamp(5rem, 12dvh, 6.5rem);
          background:
            radial-gradient(circle at 80% 15%, rgba(224, 64, 251, 0.16), transparent 34%),
            linear-gradient(180deg, rgba(20, 12, 46, 0.96), rgba(15, 8, 33, 0.99));
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        :global(.feed-swipe-deck .swipe-card-name) {
          font-size: clamp(1.55rem, 7vw, 2rem);
          line-height: 1.05;
        }

        :global(.feed-swipe-deck .swipe-card-age) {
          font-size: clamp(1.25rem, 5.5vw, 1.65rem);
        }

        :global(.feed-swipe-deck .swipe-card-location),
        :global(.feed-swipe-deck .interest-tag) {
          font-size: clamp(0.72rem, 3vw, 0.86rem);
        }

        .feed-action-dock {
          position: absolute;
          left: 50%;
          bottom: clamp(14px, 3dvh, 26px);
          z-index: 70;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: clamp(0.65rem, 2.5vw, 1rem);
          width: min(92%, 374px);
          transform: translateX(-50%);
          pointer-events: none;
        }

        .feed-action-btn {
          pointer-events: auto;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          min-width: 0;
          min-height: 64px;
          padding: 0.55rem 0.7rem;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          color: #fff;
          font-weight: 800;
          font-size: clamp(0.65rem, 2.6vw, 0.76rem);
          letter-spacing: -0.01em;
          text-align: center;
          cursor: pointer;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
        }

        .feed-action-btn:disabled {
          cursor: default;
          opacity: 0.58;
        }

        .feed-action-btn:not(:disabled):active {
          transform: scale(0.93);
        }

        .feed-action-btn--pass {
          background: linear-gradient(135deg, rgba(20, 12, 46, 0.92), rgba(30, 30, 40, 0.88));
          color: #d9d7e8;
        }

        .feed-action-btn--super {
          width: clamp(62px, 17vw, 74px);
          height: clamp(62px, 17vw, 74px);
          min-height: 0;
          padding: 0;
          background: linear-gradient(135deg, #22d3ee, #8b5cf6);
          box-shadow: 0 0 26px rgba(34, 211, 238, 0.38), 0 16px 36px rgba(0, 0, 0, 0.42);
        }

        .feed-action-btn--like {
          background: linear-gradient(135deg, #ff4fa3, #e040fb);
          box-shadow: 0 0 28px rgba(224, 64, 251, 0.36), 0 16px 36px rgba(0, 0, 0, 0.42);
        }

        :global(.feed-swipe-deck .swipe-card-initial) {
          font-size: clamp(2.5rem, 14vw, 4.5rem);
        }

        @media (min-width: 641px) {
          .feed-page {
            --feed-bottom-nav-content-height: 72px;
          }
        }

        @supports (height: 100lvh) {
          .feed-page {
            --feed-viewport-height: 100lvh;
          }
        }

        @media (min-width: 769px) {
          .feed-swipe-deck {
            width: min(calc(100vw - 32px), 440px);
          }
        }

        .feed-empty {
          padding: 3rem 1rem;
          text-align: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
        }
        .feed-empty h3 {
          margin: 0 0 0.5rem;
          font-size: 1.05rem;
        }
        .feed-empty p {
          margin: 0 0 1.25rem;
          color: var(--text-muted, #a39ec0);
          font-size: 0.9rem;
        }
        .feed-empty-btn {
          display: inline-block;
          padding: 0.7rem 1.4rem;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-weight: 700;
          border-radius: 999px;
          font-size: 0.85rem;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(224, 64, 251, 0.3);
        }
      `}</style>
    </div>
  );
}

/* --------------------------- Sub-components --------------------------- */

function FeedHeader() {
  return (
    <header className="feed-header">
      <Link href="/feed" className="feed-header-brand" aria-label="MeetYouLive">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="feed-header-logo" />
      </Link>

      <style jsx>{`
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
        .feed-header-brand {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
        }
        .feed-header-logo {
          width: var(--feed-header-logo-size, clamp(52px, 15vw, 76px));
          height: var(--feed-header-logo-size, clamp(52px, 15vw, 76px));
          display: block;
          object-fit: contain;
        }
      `}</style>
    </header>
  );
}
