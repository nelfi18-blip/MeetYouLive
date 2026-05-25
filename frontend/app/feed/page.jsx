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
const TOKEN_WAIT_TIMEOUT_MS = 30000;
const TOKEN_RECOVERY_TIMEOUT_MS = 22000;

// Hard ceiling for the feed API request itself.
const FETCH_TIMEOUT_MS = 15000;
const MOBILE_BREAKPOINT_PX = 768;

// Mobile browsers can settle their visual viewport after first paint; recheck
// shortly after mount so a hard refresh gets the same dimensions as SPA nav.
const VIEWPORT_STABILIZATION_DELAYS_MS = [120, 400, 900];

const getSmallestViewportValue = (...values) => {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);
  return validValues.length ? Math.round(Math.min(...validValues)) : null;
};

/* ------------------------ Inline SVG icon set ------------------------ */
const IconAlert = (props) => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
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
  const tokenRecoveryAttemptedRef = useRef(false);
  const [viewport, setViewport] = useState({
    ready: false,
    width: null,
    height: null,
    isMobile: false,
  });

  useEffect(() => {
    let frameId;
    const measureViewport = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const width = getSmallestViewportValue(
          window.visualViewport?.width,
          window.innerWidth,
          document.documentElement?.clientWidth,
          window.screen?.width
        );
        const height = getSmallestViewportValue(
          window.visualViewport?.height,
          window.innerHeight,
          document.documentElement?.clientHeight,
          window.screen?.height
        );

        setViewport({
          ready: true,
          width,
          height,
          isMobile: (width || 0) <= MOBILE_BREAKPOINT_PX,
        });
      });
    };

    measureViewport();
    const timeoutIds = VIEWPORT_STABILIZATION_DELAYS_MS.map((delay) =>
      setTimeout(measureViewport, delay)
    );
    window.addEventListener("resize", measureViewport);
    window.addEventListener("orientationchange", measureViewport);
    window.visualViewport?.addEventListener("resize", measureViewport);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      timeoutIds.forEach(clearTimeout);
      window.removeEventListener("resize", measureViewport);
      window.removeEventListener("orientationchange", measureViewport);
      window.visualViewport?.removeEventListener("resize", measureViewport);
    };
  }, []);

  // Redirect unauthenticated users to login (preserving callbackUrl=/feed so
  // they come back here after sign-in; authenticated refresh always stays on
  // /feed and never bounces to an alternate layout).
  useEffect(() => {
    if (status === "unauthenticated" && !getToken()) {
      router.replace("/login?callbackUrl=/feed");
    }
  }, [status, router]);

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
      setError("No se pudo conectar con el servidor. Por favor, inicia sesión de nuevo.");
      setLoading(false);
      return undefined;
    }

    if (tokenRecoveryAttemptedRef.current) return undefined;
    tokenRecoveryAttemptedRef.current = true;
    setLoading(true);
    setError(null);

    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), TOKEN_RECOVERY_TIMEOUT_MS);

    (async () => {
      try {
        const response = await fetch("/api/auth/backend-token", {
          method: "POST",
          signal: controller.signal,
        });

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          if (data?.token) {
            setToken(data.token);
            setAuthToken(data.token);
            setError(null);
            return;
          }
        }

        let message = "No pudimos recuperar tu sesión. Por favor, intenta de nuevo.";
        if (response.status === 401 || response.status === 403) {
          message = "Sesión expirada. Por favor, inicia sesión de nuevo.";
        } else if (response.status >= 500) {
          message = "El servidor está tardando en responder. Por favor, intenta de nuevo.";
        }
        setError(message);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err.name === "AbortError") {
          setError("El servidor está tardando en responder. Por favor, intenta de nuevo.");
        } else {
          setError("No pudimos recuperar tu sesión. Por favor, intenta de nuevo.");
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
  }, [status, session?.backendToken, session?.googleEmail]);

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
    }, TOKEN_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, authToken, t]);

  // Fetch feed data once a backend token is ready.
  useEffect(() => {
    if (!authToken) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    setLoading(true);
    setError(null);

    if (!API_URL) {
      clearTimeout(timeoutId);
      controller.abort();
      setError("No pudimos cargar tu feed. La API no está configurada.");
      setLoading(false);
      return undefined;
    }

    (async () => {
      try {
        const feedRes = await fetch(`${API_URL}/api/feed`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
          cache: "no-store",
        });

        if (cancelled) return;

        if (!feedRes.ok) {
          let msg = (t && t("feed.genericError")) || "No pudimos cargar tu feed";
          if (feedRes.status === 401 || feedRes.status === 403) {
            msg = "Sesión expirada. Por favor, inicia sesión de nuevo.";
          } else if (feedRes.status >= 500) {
            msg = "Error del servidor. Por favor, intenta de nuevo.";
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
          setError((t && t("feed.serverStarting")) || "El servidor está tardando en responder.");
        } else {
          setError(err.message || (t && t("feed.genericError")) || "No pudimos cargar tu feed");
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [authToken, session?.user?.id, t]);

  const visibleProfileStack = [];
  for (let i = Math.min(currentIndex + 2, profiles.length - 1); i >= currentIndex; i -= 1) {
    visibleProfileStack.push({ profile: profiles[i], stackIndex: i - currentIndex });
  }

  /* --------------------------- Actions --------------------------- */
  const advance = () => setCurrentIndex((i) => i + 1);

  const handleSwipe = async (profileId, direction) => {
    if (direction !== "right") {
      advance();
      return;
    }

    if (!profileId) return;

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
      setError(t("feed.likeError"));
    }
  };

  /* --------------------------- Render --------------------------- */
  const feedPageClassName = viewport.isMobile
    ? "feed-page feed-page--mobile"
    : "feed-page";
  const feedPageStyle = {
    ...(viewport.width ? { "--feed-vw": `${viewport.width}px` } : {}),
    ...(viewport.height ? { "--feed-vh": `${viewport.height}px` } : {}),
  };

  // Loading spinner only while auth/data are pending and no error yet.
  if (!error && loading) {
    return (
      <div className={feedPageClassName} style={feedPageStyle}>
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
      <div className={feedPageClassName} style={feedPageStyle}>
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
    <div className={feedPageClassName} style={feedPageStyle}>
      {/* 1. APPROVED BRAND HEADER */}
      <FeedHeader />

      {/* 2. MODERN SWIPE DECK */}
      <section className="feed-section feed-match-section" aria-label={t("feed.recommendedProfilesAria")}>
        {hasMoreProfiles ? (
          <div className="feed-swipe-deck" aria-live="polite" suppressHydrationWarning>
            {viewport.ready
              ? visibleProfileStack.map(({ profile, stackIndex }) => {
                  const isTopCard = stackIndex === 0;
                  return (
                    <SwipeCard
                      key={profile._id}
                      profile={profile}
                      isActive={isTopCard}
                      onSwipe={isTopCard ? handleSwipe : undefined}
                      zIndex={30 - stackIndex}
                      style={{
                        y: stackIndex * 10,
                        scale: 1 - stackIndex * 0.045,
                        opacity: 1 - stackIndex * 0.12,
                        pointerEvents: isTopCard ? "auto" : "none",
                      }}
                    />
                  );
                })
              : null}
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
          --feed-mobile-reserved-space: 168px;
          --feed-mobile-min-card-height: 430px;
          --feed-mobile-max-card-height: 610px;
          min-height: 100dvh;
          padding-bottom: calc(96px + env(safe-area-inset-bottom));
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
          padding: 1rem;
        }
        .feed-match-section {
          display: flex;
          justify-content: stretch;
          padding: 0.75rem 0.75rem 1rem;
        }

        .feed-swipe-deck {
          position: relative;
          width: 100%;
          max-width: none;
          height: min(68vh, 620px);
          min-height: 480px;
          display: flex;
          justify-content: center;
          touch-action: pan-y;
        }

        .feed-swipe-deck :global(.swipe-card-modern) {
          width: 100%;
          max-width: none;
          height: 100%;
          left: 0;
          right: 0;
          margin: 0 auto;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(224, 64, 251, 0.18);
        }

        .feed-swipe-deck :global(.swipe-card-initial) {
          font-size: 3rem;
        }

        @media (max-width: 480px) {
          .feed-swipe-deck {
            height: calc(100dvh - 168px);
            min-height: 430px;
            max-height: 610px;
          }
        }

        @media (min-width: 769px) {
          .feed-match-section {
            justify-content: center;
            padding-inline: 1rem;
          }
          .feed-swipe-deck {
            max-width: 420px;
          }
          .feed-swipe-deck :global(.swipe-card-modern) {
            max-width: 420px;
          }
        }

        .feed-page--mobile .feed-match-section {
          padding: 0.75rem 0.75rem 1rem;
        }
        .feed-page--mobile .feed-swipe-deck {
          width: 100%;
          max-width: none;
          height: clamp(
            var(--feed-mobile-min-card-height),
            calc(var(--feed-vh, 100dvh) - var(--feed-mobile-reserved-space)),
            var(--feed-mobile-max-card-height)
          );
          min-height: var(--feed-mobile-min-card-height);
          max-height: var(--feed-mobile-max-card-height);
        }
        .feed-page--mobile .feed-swipe-deck :global(.swipe-card-modern) {
          width: 100%;
          max-width: none;
          height: 100%;
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
          padding: 0.75rem 1rem;
          padding-top: calc(0.75rem + env(safe-area-inset-top));
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
          width: 44px;
          height: 44px;
          display: block;
          object-fit: contain;
        }
      `}</style>
    </header>
  );
}
