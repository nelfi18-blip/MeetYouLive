"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SwipeCard from "@/components/SwipeCard";
import { filterActiveLives } from "@/lib/liveFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUserImage, getLiveThumbnail, getDisplayName } from "@/lib/imageHelpers";
import { fetchUserRole } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Hard ceiling on how long we wait for the NextAuth session / backend token
// to hydrate before surfacing a friendly fallback. Prevents the page from
// sitting on a spinner indefinitely on slow connections or Render cold starts.
const TOKEN_WAIT_TIMEOUT_MS = 8000;

// Hard ceiling for the feed API request itself.
const FETCH_TIMEOUT_MS = 15000;

// Brand-only gradient palette (purples / pinks / cyans). Intentionally
// excludes orange/yellow tones to avoid the jarring fullscreen blocks that
// previously broke /feed (the "orange/yellow overlay" symptom).
const BRAND_GRADIENTS = [
  "linear-gradient(135deg, #e040fb, #8b5cf6)",
  "linear-gradient(135deg, #ff4fa3, #e040fb)",
  "linear-gradient(135deg, #8b5cf6, #22d3ee)",
  "linear-gradient(135deg, #e040fb, #7c3aed)",
  "linear-gradient(135deg, #7c3aed, #22d3ee)",
  "linear-gradient(135deg, #ec4899, #8b5cf6)",
];

function brandGradient(seed) {
  if (!seed || typeof seed !== "string") return BRAND_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BRAND_GRADIENTS[Math.abs(hash) % BRAND_GRADIENTS.length];
}

/* ------------------------ Inline SVG icon set ------------------------ */
const IconCoin = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <circle cx="12" cy="12" r="10" opacity="0.2" />
    <path d="M12 6a6 6 0 100 12 6 6 0 000-12zm.9 9.4v1.1h-1.8v-1.1c-1.2-.2-2.1-.9-2.3-2h1.6c.1.5.6.9 1.6.9.9 0 1.4-.4 1.4-.9 0-.4-.3-.8-1.5-1.1-1.6-.4-2.6-.9-2.6-2.2 0-1 .8-1.7 1.9-1.9V7.1h1.8v1.1c1.2.2 2 .9 2.1 2h-1.6c-.1-.5-.5-.9-1.4-.9-.9 0-1.3.4-1.3.8 0 .4.3.7 1.5 1 1.7.4 2.6 1 2.6 2.3 0 1.1-.8 1.7-1.8 2z" />
  </svg>
);
const IconBell = (props) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2v1h16v-1l-2-2z" />
    <path d="M10 21a2 2 0 004 0" />
  </svg>
);
const IconUser = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
  </svg>
);
const IconBroadcast = (props) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <circle cx="12" cy="12" r="4" />
  </svg>
);
const IconStar = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
  </svg>
);
const IconEye = (props) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" />
  </svg>
);
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

  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userCoins, setUserCoins] = useState(0);

  // Redirect unauthenticated users to login (preserving callbackUrl=/feed so
  // they come back here after sign-in; authenticated refresh always stays on
  // /feed and never bounces to an alternate layout).
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  // Admins shouldn't see the consumer feed.
  useEffect(() => {
    if (!session?.backendToken) return;
    let mounted = true;
    fetchUserRole(session.backendToken)
      .then((u) => {
        if (mounted && u?.role === "admin") router.replace("/admin");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [session?.backendToken, router]);

  // Safety net: never sit on the loading spinner forever waiting for the
  // session/token to hydrate.
  useEffect(() => {
    if (status === "authenticated" && session?.backendToken) return;
    if (status === "unauthenticated") return;
    const timer = setTimeout(() => {
      setLoading(false);
      setError(
        (t && t("feed.serverStarting")) ||
          "El servidor está tardando en responder. Por favor, intenta de nuevo."
      );
    }, TOKEN_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, session?.backendToken, t]);

  // Fetch feed data once we're authenticated and the backend token is ready.
  useEffect(() => {
    if (status !== "authenticated" || !session?.backendToken) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    (async () => {
      try {
        const [feedRes, userRes] = await Promise.all([
          fetch(`${API_URL}/api/feed`, {
            headers: { Authorization: `Bearer ${session.backendToken}` },
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`${API_URL}/api/user/me`, {
            headers: { Authorization: `Bearer ${session.backendToken}` },
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (cancelled) return;
        clearTimeout(timeoutId);

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
        const safeLives = filterActiveLives(data.activeLives || []);
        const uniqueProfiles = Array.from(
          new Map((data.recommendedProfiles || []).map((p) => [p._id, p])).values()
        );
        const uniqueCreators = Array.from(
          new Map((data.featuredCreators || []).map((c) => [c._id, c])).values()
        );

        setActiveLives(safeLives);
        setProfiles(uniqueProfiles);
        setFeaturedCreators(uniqueCreators);

        if (userRes.ok) {
          const u = await userRes.json();
          setUserCoins(u.coinsBalance || 0);
        }

        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          setError((t && t("feed.serverStarting")) || "El servidor está tardando en responder.");
        } else {
          setError(err.message || (t && t("feed.genericError")) || "No pudimos cargar tu feed");
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [status, session?.backendToken, session?.user?.id, t]);

  const visibleProfileStack = useMemo(
    () =>
      profiles
        .slice(currentIndex, currentIndex + 3)
        .map((profile, stackIndex) => ({ profile, stackIndex }))
        .reverse(),
    [profiles, currentIndex]
  );

  /* --------------------------- Actions --------------------------- */
  const advance = () => setCurrentIndex((i) => i + 1);

  const handleSwipe = (profileId, direction) => {
    advance();
    if (direction !== "right" || !profileId) return;

    fetch(`${API_URL}/api/match/like`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.backendToken}`,
      },
      body: JSON.stringify({ userId: profileId }),
    }).catch((err) => {
      console.error("Spark error:", err);
    });
  };

  /* --------------------------- Render --------------------------- */
  // Loading spinner only while auth/data are pending and no error yet.
  if (!error && (status === "loading" || (status === "authenticated" && loading))) {
    return (
      <div className="feed-page">
        <FeedHeader coins={userCoins} session={session} />
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
        <FeedHeader coins={userCoins} session={session} />
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
      {/* 1. HEADER */}
      <FeedHeader coins={userCoins} session={session} />

      {/* 2. MODERN SWIPE DECK */}
      <section className="feed-section feed-match-section" aria-label="Perfiles recomendados">
        {hasMoreProfiles ? (
          <div className="feed-swipe-deck" aria-live="polite">
            {visibleProfileStack.map(({ profile, stackIndex }) => {
              const isTopCard = stackIndex === 0;
              return (
                <SwipeCard
                  key={profile._id}
                  profile={profile}
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
            })}
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

      {/* 3. LIVE SECTION */}
      <section className="feed-section feed-live-section">
        <header className="feed-section-header">
          <span className="feed-section-icon feed-section-icon--live">
            <IconBroadcast />
          </span>
          <h2>LIVE NOW</h2>
          <Link href="/explore" className="feed-section-link">
            Ver todos
          </Link>
        </header>

        {activeLives.length > 0 ? (
          <div className="feed-live-scroll">
            {activeLives.map((live) => (
              <LiveCard key={live._id} live={live} />
            ))}
          </div>
        ) : (
          <div className="feed-live-empty">
            <p>No hay directos ahora. Vuelve pronto.</p>
          </div>
        )}
      </section>

      {/* 4. TOP CREATORS */}
      {featuredCreators.length > 0 && (
        <section className="feed-section feed-creators-section">
          <header className="feed-section-header">
            <span className="feed-section-icon feed-section-icon--star">
              <IconStar />
            </span>
            <h2>TOP CREATORS</h2>
            <Link href="/explore?tab=creators" className="feed-section-link">
              Ver todos
            </Link>
          </header>

          <div className="feed-creators-scroll">
            {featuredCreators.map((c) => (
              <CreatorPill key={c._id} creator={c} />
            ))}
          </div>
        </section>
      )}

      {/* 5. Bottom nav is rendered by the root layout's BottomNavWrapper. */}

      <style jsx>{`
        .feed-page {
          min-height: 100vh;
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
          justify-content: center;
          padding: 0.75rem 1rem 1rem;
        }

        .feed-swipe-deck {
          position: relative;
          width: min(100%, 420px);
          height: min(68vh, 620px);
          min-height: 480px;
          display: flex;
          justify-content: center;
          touch-action: pan-y;
        }

        .feed-swipe-deck :global(.swipe-card-modern) {
          width: 100%;
          max-width: 420px;
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
          .feed-match-section {
            padding-inline: 0.75rem;
          }
          .feed-swipe-deck {
            height: calc(100dvh - 168px);
            min-height: 430px;
            max-height: 610px;
          }
        }

        .feed-section-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .feed-section-header h2 {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--text, #fff);
        }
        .feed-section-link {
          margin-left: auto;
          font-size: 0.8rem;
          font-weight: 600;
          color: #c4b5fd;
          text-decoration: none;
        }
        .feed-section-icon {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .feed-section-icon--live {
          background: rgba(244, 63, 94, 0.18);
          color: #f43f5e;
          animation: pulseLive 1.6s ease-in-out infinite;
        }
        .feed-section-icon--star {
          background: rgba(224, 64, 251, 0.18);
          color: #e040fb;
        }
        @keyframes pulseLive {
          0%, 100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.45); }
          50%      { box-shadow: 0 0 0 8px rgba(244, 63, 94, 0); }
        }

        .feed-live-scroll,
        .feed-creators-scroll {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .feed-live-scroll::-webkit-scrollbar,
        .feed-creators-scroll::-webkit-scrollbar {
          display: none;
        }

        .feed-live-empty {
          padding: 1rem;
          text-align: center;
          color: var(--text-muted, #a39ec0);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          font-size: 0.9rem;
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

function FeedHeader({ coins, session }) {
  const userImage = session?.user?.image;
  return (
    <header className="feed-header">
      <Link href="/feed" className="feed-header-brand" aria-label="MeetYouLive">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="feed-header-logo" />
        <span>
          MeetYou<span className="feed-header-brand-accent">Live</span>
        </span>
      </Link>

      <div className="feed-header-actions">
        <Link href="/coins" className="feed-header-chip" aria-label="Monedas">
          <IconCoin />
          <span>{coins}</span>
        </Link>
        <Link
          href="/notifications"
          className="feed-header-icon-btn"
          aria-label="Notificaciones"
        >
          <IconBell />
        </Link>
        <Link
          href="/profile"
          className="feed-header-avatar"
          aria-label="Mi perfil"
        >
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt="" />
          ) : (
            <IconUser width="20" height="20" />
          )}
        </Link>
      </div>

      <style jsx>{`
        .feed-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 0.75rem;
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
          gap: 0.5rem;
          color: #fff;
          font-weight: 800;
          font-size: 1.05rem;
          text-decoration: none;
          letter-spacing: -0.01em;
        }
        .feed-header-logo {
          width: 32px;
          height: 32px;
          display: block;
          object-fit: contain;
        }
        .feed-header-brand-accent {
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .feed-header-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .feed-header-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.7rem;
          background: rgba(251, 191, 36, 0.12);
          border: 1px solid rgba(251, 191, 36, 0.25);
          border-radius: 999px;
          color: #fbbf24;
          font-weight: 700;
          font-size: 0.85rem;
          text-decoration: none;
        }
        .feed-header-icon-btn,
        .feed-header-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text, #fff);
          text-decoration: none;
          overflow: hidden;
        }
        .feed-header-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      `}</style>
    </header>
  );
}

function LiveCard({ live }) {
  const thumb = getLiveThumbnail(live);
  const creatorName = getDisplayName(live.user);
  const gradient = brandGradient(live.user?._id || live._id);

  return (
    <Link href={`/live/${live._id}`} className="live-card">
      <div className="live-card-thumb">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={creatorName} />
        ) : (
          <div className="live-card-placeholder" style={{ background: gradient }}>
            <IconUser className="live-card-placeholder-icon" width="32" height="32" />
          </div>
        )}
        <span className="live-card-badge">
          <IconBroadcast />
          LIVE
        </span>
        {live.viewerCount > 0 && (
          <span className="live-card-viewers">
            <IconEye />
            {live.viewerCount}
          </span>
        )}
      </div>
      <div className="live-card-meta">
        <p className="live-card-title">{live.title || "Live Stream"}</p>
        <p className="live-card-name">{creatorName}</p>
      </div>

      <style jsx>{`
        .live-card {
          flex: 0 0 160px;
          display: flex;
          flex-direction: column;
          text-decoration: none;
          color: inherit;
        }
        .live-card-thumb {
          position: relative;
          width: 100%;
          aspect-ratio: 3 / 4;
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
        }
        .live-card-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .live-card-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .live-card-placeholder :global(.live-card-placeholder-icon) {
          color: rgba(255, 255, 255, 0.55);
        }
        .live-card-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.2rem 0.5rem;
          background: rgba(244, 63, 94, 0.9);
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          border-radius: 999px;
        }
        .live-card-viewers {
          position: absolute;
          top: 8px;
          right: 8px;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          font-size: 0.7rem;
          font-weight: 700;
          border-radius: 999px;
        }
        .live-card-meta {
          padding: 0.5rem 0.1rem 0;
        }
        .live-card-title {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text, #fff);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .live-card-name {
          margin: 0.1rem 0 0;
          font-size: 0.75rem;
          color: var(--text-muted, #a39ec0);
        }
      `}</style>
    </Link>
  );
}

function CreatorPill({ creator }) {
  const avatar = getUserImage(creator);
  const name = getDisplayName(creator);
  const gradient = brandGradient(creator._id);

  return (
    <Link href={`/profile/${creator._id}`} className="creator-pill">
      <div className="creator-pill-avatar">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} />
        ) : (
          <div className="creator-pill-placeholder" style={{ background: gradient }}>
            <IconUser className="creator-pill-placeholder-icon" width="24" height="24" />
          </div>
        )}
      </div>
      <p className="creator-pill-name">{name}</p>

      <style jsx>{`
        .creator-pill {
          flex: 0 0 72px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          text-decoration: none;
          color: inherit;
        }
        .creator-pill-avatar {
          width: 64px;
          height: 64px;
          border-radius: 999px;
          overflow: hidden;
          border: 2px solid rgba(224, 64, 251, 0.5);
          background: rgba(255, 255, 255, 0.04);
        }
        .creator-pill-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .creator-pill-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .creator-pill-placeholder :global(.creator-pill-placeholder-icon) {
          color: rgba(255, 255, 255, 0.6);
        }
        .creator-pill-name {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text, #fff);
          text-align: center;
          max-width: 72px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </Link>
  );
}
