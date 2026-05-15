"use client";

/**
 * /feed — Premium stable feed (rebuilt from scratch).
 *
 * Goals:
 *  - Render immediately (no blocking spinner, no infinite loading)
 *  - 8s max timeout on data fetch, then graceful fallback
 *  - Mobile-first, no horizontal overflow
 *  - Safe image rendering with elegant gradient avatar fallback
 *    (purple / pink / cyan brand palette only — never orange/yellow)
 *  - Inline SVG icons everywhere (no emoji rendering inconsistencies)
 *  - No duplicated header / navbar — top Navbar + BottomNav are already
 *    rendered by `app/layout.jsx`
 *
 * This file intentionally has NO dependency on `ModernTopBar` or any of the
 * old broken feed helpers. It is self-contained on purpose so future
 * design enhancements can land as small, targeted PRs.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const FETCH_TIMEOUT_MS = 8000;

/* ----------------------------- Brand helpers ------------------------------ */

// Premium brand-only gradients. NO orange / yellow / warm tones.
// Used for avatar fallbacks and section accents.
const BRAND_GRADIENTS = [
  "linear-gradient(135deg, #e040fb, #8b5cf6)", // pink → purple
  "linear-gradient(135deg, #ff4fa3, #c026d3)", // pink → magenta
  "linear-gradient(135deg, #8b5cf6, #22d3ee)", // purple → cyan
  "linear-gradient(135deg, #7c3aed, #db2777)", // deep purple → pink
  "linear-gradient(135deg, #a855f7, #ec4899)", // violet → rose
  "linear-gradient(135deg, #6366f1, #a855f7)", // indigo → violet
];

function brandGradient(seed) {
  const s = typeof seed === "string" && seed.length > 0 ? seed : "myl";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BRAND_GRADIENTS[Math.abs(hash) % BRAND_GRADIENTS.length];
}

function getDisplayName(user) {
  if (!user) return "Usuario";
  if (typeof user.name === "string" && user.name.trim()) return user.name.trim();
  if (typeof user.username === "string" && user.username.trim()) return user.username.trim();
  return "Usuario";
}

function getInitial(name) {
  if (!name || typeof name !== "string") return "?";
  const t = name.trim();
  return t.length ? t[0].toUpperCase() : "?";
}

function getUserImage(user) {
  if (!user) return null;
  if (Array.isArray(user.profilePhotos) && user.profilePhotos.length > 0) {
    const first = user.profilePhotos[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  if (typeof user.avatar === "string" && user.avatar.trim()) return user.avatar.trim();
  return null;
}

function getLiveThumbnail(live) {
  if (!live) return null;
  if (typeof live.thumbnail === "string" && live.thumbnail.trim()) return live.thumbnail.trim();
  if (live.user && typeof live.user.avatar === "string" && live.user.avatar.trim()) {
    return live.user.avatar.trim();
  }
  return null;
}

/* -------------------------------- Icons ---------------------------------- */
// All icons are inline SVG so rendering is identical on iOS / Android / web
// in-app browsers (Facebook, Instagram, WhatsApp).

const Icon = ({ children, size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IconCoin = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9.5a2.5 2.5 0 0 1 5 0c0 1.4-1 2-2.5 2.5S9 13 9 14.5a2.5 2.5 0 0 0 5 0" />
  </Icon>
);
const IconBell = (p) => (
  <Icon {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </Icon>
);
const IconClose = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
const IconHeart = (p) => (
  <Icon {...p}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </Icon>
);
const IconBolt = (p) => (
  <Icon {...p}>
    <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
  </Icon>
);
const IconStar = (p) => (
  <Icon {...p}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
  </Icon>
);
const IconVideo = (p) => (
  <Icon {...p}>
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </Icon>
);
const IconBroadcast = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
  </Icon>
);

/* ------------------------------ Image cell -------------------------------- */
// Safe image with elegant gradient fallback. Never shows a broken-image icon
// or an orange/yellow block.
function SafeImage({ src, alt, seed, fallbackInitial, className, style }) {
  const [errored, setErrored] = useState(false);
  const hasSrc = typeof src === "string" && src.trim().length > 0;
  const showImage = hasSrc && !errored;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: brandGradient(seed),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || ""}
          onError={() => setErrored(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            color: "rgba(255,255,255,0.95)",
            fontSize: "clamp(2rem, 8vw, 3rem)",
            fontWeight: 700,
            letterSpacing: "0.02em",
            textShadow: "0 2px 12px rgba(0,0,0,0.25)",
            userSelect: "none",
          }}
        >
          {fallbackInitial || "?"}
        </span>
      )}
    </div>
  );
}

/* --------------------------- Action button -------------------------------- */

const ACTIONS = [
  {
    key: "fade",
    label: "FADE",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.45)",
    Icon: IconClose,
  },
  {
    key: "spark",
    label: "SPARK",
    color: "#ec4899",
    glow: "rgba(236,72,153,0.55)",
    Icon: IconHeart,
  },
  {
    key: "pulse",
    label: "PULSE",
    color: "#22d3ee",
    glow: "rgba(34,211,238,0.5)",
    Icon: IconBolt,
  },
  {
    key: "magnet",
    label: "MAGNET",
    color: "#c026d3",
    glow: "rgba(192,38,211,0.55)",
    Icon: IconStar,
  },
  {
    key: "flash",
    label: "FLASH LIVE",
    color: "#8b5cf6",
    glow: "rgba(139,92,246,0.55)",
    Icon: IconVideo,
  },
];

function ActionButton({ action, onClick, big }) {
  const { color, glow, Icon: ActionIcon, label } = action;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        appearance: "none",
        background: "rgba(20, 10, 40, 0.7)",
        color,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.25rem",
        width: big ? 64 : 56,
        height: big ? 64 : 56,
        borderRadius: "50%",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 18px ${glow}, inset 0 0 12px rgba(255,255,255,0.04)`,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        flexShrink: 0,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.94)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <ActionIcon size={big ? 26 : 22} />
    </button>
  );
}

/* ============================== Page ===================================== */

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Render-first, fetch-second. Start with empty data — UI must show
  // immediately even if the API is slow or unreachable.
  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [userCoins, setUserCoins] = useState(null);

  // dataState: "loading" | "ready" | "error"
  const [dataState, setDataState] = useState("loading");
  const [currentIndex, setCurrentIndex] = useState(0);

  const mountedRef = useRef(true);

  /* ---------------------- Auth / admin redirects ------------------------- */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  /* ----------------------------- Data fetch ------------------------------ */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Only fetch once we have a backend token. We DO NOT block render on this.
    if (status !== "authenticated" || !session?.backendToken) return;
    if (!API_URL) {
      // No API configured (preview / misconfig) — show graceful fallback.
      setDataState("error");
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const headers = { Authorization: `Bearer ${session.backendToken}` };

    const fetchFeed = fetch(`${API_URL}/api/feed`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`feed ${r.status}`))))
      .catch((err) => {
        console.warn("[feed] feed request failed:", err?.message || err);
        return null;
      });

    const fetchMe = fetch(`${API_URL}/api/user/me`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    Promise.all([fetchFeed, fetchMe]).then(([feedData, meData]) => {
      clearTimeout(timeoutId);
      if (!mountedRef.current) return;

      if (feedData && typeof feedData === "object") {
        const lives = Array.isArray(feedData.activeLives) ? feedData.activeLives : [];
        const recs = Array.isArray(feedData.recommendedProfiles)
          ? feedData.recommendedProfiles
          : [];
        const creators = Array.isArray(feedData.featuredCreators)
          ? feedData.featuredCreators
          : [];

        // Deduplicate by _id (defensive).
        const uniq = (arr) =>
          Array.from(new Map(arr.filter((x) => x && x._id).map((x) => [x._id, x])).values());

        setActiveLives(uniq(lives));
        setProfiles(uniq(recs));
        setFeaturedCreators(uniq(creators));
        setDataState("ready");
      } else {
        // Feed failed but we still render gracefully.
        setDataState("error");
      }

      if (meData && typeof meData.coinsBalance === "number") {
        setUserCoins(meData.coinsBalance);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [status, session?.backendToken]);

  /* --------------------------- Derived data ------------------------------ */
  const currentProfile = profiles[currentIndex] || null;
  const sessionUser = session?.user;
  const sessionAvatar = useMemo(
    () => (sessionUser ? getUserImage(sessionUser) || sessionUser.image || null : null),
    [sessionUser]
  );

  /* ----------------------------- Handlers -------------------------------- */
  const advance = () => {
    setCurrentIndex((i) => i + 1);
  };

  const sendLike = async (profileId) => {
    if (!API_URL || !session?.backendToken || !profileId) return;
    try {
      await fetch(`${API_URL}/api/match/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ userId: profileId }),
      });
    } catch (err) {
      // Non-fatal — UI already advanced.
      console.warn("[feed] like failed:", err?.message || err);
    }
  };

  const handleAction = (actionKey) => {
    const profile = profiles[currentIndex];
    switch (actionKey) {
      case "fade":
        advance();
        break;
      case "spark":
        if (profile?._id) sendLike(profile._id);
        advance();
        break;
      case "pulse":
        // Boost — navigate to coins / boost page (handled elsewhere).
        router.push("/coins");
        break;
      case "magnet":
        if (profile?._id) {
          router.push(`/profile/${profile._id}`);
        }
        break;
      case "flash":
        if (profile?._id) {
          router.push(`/call/${profile._id}`);
        } else {
          router.push("/live");
        }
        break;
      default:
        break;
    }
  };

  /* ------------------------------ Render --------------------------------- */
  // We always render. We never block on the API. If the user is loading
  // session, that's fine — the layout below is fully rendered with empty
  // states until data arrives.

  return (
    <div className="feed-root">
      {/* Premium header (NOT a duplicate of the global Navbar — this is the
          feed's own slim brand strip; the global top Navbar is hidden on
          /feed routes via existing site styling). */}
      <header className="feed-header">
        <Link href="/feed" className="feed-brand" aria-label="MeetYouLive">
          <span className="feed-brand-mark" aria-hidden="true">
            <IconBroadcast size={18} />
          </span>
          <span className="feed-brand-text">MeetYouLive</span>
        </Link>

        <div className="feed-header-actions">
          <Link href="/coins" className="feed-chip" aria-label="Monedas">
            <IconCoin size={16} />
            <span>{userCoins === null ? "—" : userCoins}</span>
          </Link>
          <Link href="/notifications" className="feed-icon-btn" aria-label="Notificaciones">
            <IconBell size={18} />
          </Link>
          <Link href="/profile" className="feed-avatar-btn" aria-label="Perfil">
            <SafeImage
              src={sessionAvatar}
              alt=""
              seed={sessionUser?.id || sessionUser?.email || "me"}
              fallbackInitial={getInitial(getDisplayName(sessionUser))}
              style={{ borderRadius: "50%" }}
            />
          </Link>
        </div>
      </header>

      <main className="feed-main">
        {/* ---------------- Match / profile card ---------------- */}
        <section className="feed-match-section" aria-label="Sugerencia para ti">
          {currentProfile ? (
            <MatchCard profile={currentProfile} key={currentProfile._id} />
          ) : dataState === "loading" ? (
            <MatchSkeleton />
          ) : (
            <MatchEmptyState />
          )}

          {/* Action buttons — visible above the bottom nav. They render
              regardless of API state so the user always has something to
              interact with. */}
          <div className="feed-actions" role="toolbar" aria-label="Acciones">
            {ACTIONS.map((a) => (
              <ActionButton
                key={a.key}
                action={a}
                big={a.key === "spark"}
                onClick={() => handleAction(a.key)}
              />
            ))}
          </div>
        </section>

        {/* ---------------- Live preview ---------------- */}
        <section className="feed-section" aria-label="Directos ahora">
          <div className="feed-section-head">
            <h2 className="feed-section-title">
              <span className="feed-live-dot" aria-hidden="true" />
              En vivo ahora
            </h2>
            <Link href="/live" className="feed-section-link">
              Ver todos
            </Link>
          </div>

          {activeLives.length > 0 ? (
            <div className="feed-hscroll">
              {activeLives.slice(0, 12).map((live) => (
                <LiveCard key={live._id || live.streamId} live={live} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconBroadcast size={28} />}
              title="No hay directos ahora"
              subtitle="Vuelve pronto o inicia el tuyo."
              cta={{ href: "/live", label: "Empezar live" }}
            />
          )}
        </section>

        {/* ---------------- Top creators ---------------- */}
        <section className="feed-section" aria-label="Top creadores">
          <div className="feed-section-head">
            <h2 className="feed-section-title">
              <IconStar size={16} />
              <span>Top creadores</span>
            </h2>
            <Link href="/ranking" className="feed-section-link">
              Ranking
            </Link>
          </div>

          {featuredCreators.length > 0 ? (
            <div className="feed-hscroll">
              {featuredCreators.slice(0, 16).map((c) => (
                <CreatorChip key={c._id} creator={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconStar size={28} />}
              title="Aún no hay creadores destacados"
              subtitle="Descubre y sigue a tus favoritos."
              cta={{ href: "/explore", label: "Explorar" }}
            />
          )}
        </section>

        {/* Bottom safe spacing — keeps the floating action buttons + the
            global BottomNav from overlapping any content. */}
        <div className="feed-bottom-safe" aria-hidden="true" />
      </main>

      <style jsx>{`
        .feed-root {
          width: 100%;
          min-height: 100vh;
          background: radial-gradient(
              120% 60% at 50% 0%,
              rgba(139, 92, 246, 0.18) 0%,
              rgba(15, 8, 33, 0) 60%
            ),
            linear-gradient(180deg, #0f0821 0%, #0a0518 100%);
          color: #f5f3ff;
          overflow-x: hidden;
        }

        .feed-header {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.6rem 1rem;
          padding-top: calc(0.6rem + env(safe-area-inset-top));
          background: rgba(15, 8, 33, 0.72);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(139, 92, 246, 0.15);
        }
        :global(.feed-brand) {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          color: inherit;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .feed-brand-mark {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          box-shadow: 0 6px 18px rgba(139, 92, 246, 0.45);
        }
        .feed-brand-text {
          font-size: 0.95rem;
          background: linear-gradient(90deg, #f0abfc, #c4b5fd);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .feed-header-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        :global(.feed-chip) {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.65rem;
          border-radius: 999px;
          background: rgba(139, 92, 246, 0.16);
          border: 1px solid rgba(139, 92, 246, 0.35);
          color: #f5f3ff;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          line-height: 1;
        }
        :global(.feed-icon-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f5f3ff;
          text-decoration: none;
        }
        :global(.feed-avatar-btn) {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          border: 1.5px solid rgba(236, 72, 153, 0.6);
          flex-shrink: 0;
          display: block;
        }

        .feed-main {
          max-width: 720px;
          margin: 0 auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        /* Match card */
        .feed-match-section {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .feed-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.5rem 0.25rem;
        }

        /* Sections */
        .feed-section {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .feed-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .feed-section-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #f5f3ff;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          letter-spacing: 0.01em;
        }
        :global(.feed-section-link) {
          font-size: 0.85rem;
          color: #c4b5fd;
          text-decoration: none;
          font-weight: 600;
        }
        .feed-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ec4899;
          box-shadow: 0 0 10px rgba(236, 72, 153, 0.8);
          animation: feedPulse 1.6s ease-in-out infinite;
        }
        @keyframes feedPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.7; }
        }

        .feed-hscroll {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 0.25rem 0.1rem 0.5rem;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .feed-hscroll::-webkit-scrollbar { display: none; }

        /* Bottom safe space — clears floating buttons + global BottomNav */
        .feed-bottom-safe {
          height: calc(120px + env(safe-area-inset-bottom));
        }

        @media (min-width: 768px) {
          .feed-bottom-safe { height: 60px; }
          .feed-main { padding: 1.25rem 1.5rem; }
        }
      `}</style>
    </div>
  );
}

/* ============================= Sub-components ============================ */

function MatchCard({ profile }) {
  const name = getDisplayName(profile);
  const img = getUserImage(profile);
  const seed = profile?._id || name;
  const age = typeof profile?.age === "number" ? profile.age : null;
  const city =
    (typeof profile?.city === "string" && profile.city) ||
    (typeof profile?.location === "string" && profile.location) ||
    null;

  return (
    <article
      className="match-card"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 4",
        maxHeight: "min(72vh, 620px)",
        borderRadius: "24px",
        overflow: "hidden",
        background: "rgba(20, 10, 40, 0.6)",
        border: "1px solid rgba(139, 92, 246, 0.35)",
        boxShadow:
          "0 30px 60px -20px rgba(139, 92, 246, 0.45), 0 0 0 1px rgba(236, 72, 153, 0.12) inset",
      }}
    >
      <SafeImage
        src={img}
        alt={name}
        seed={seed}
        fallbackInitial={getInitial(name)}
      />

      {/* Bottom gradient + meta */}
      <div
        style={{
          position: "absolute",
          inset: "auto 0 0 0",
          padding: "1.25rem 1.1rem 1.1rem",
          background:
            "linear-gradient(180deg, rgba(15,8,33,0) 0%, rgba(15,8,33,0.7) 60%, rgba(15,8,33,0.92) 100%)",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 800,
              letterSpacing: "0.01em",
              textShadow: "0 2px 12px rgba(0,0,0,0.55)",
            }}
          >
            {name}
            {age != null ? `, ${age}` : ""}
          </h3>
        </div>
        {city ? (
          <p
            style={{
              margin: "0.3rem 0 0",
              fontSize: "0.9rem",
              color: "rgba(245,243,255,0.85)",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            {city}
          </p>
        ) : null}
      </div>

      {/* Subtle neon top accent */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background:
            "linear-gradient(90deg, transparent, #ec4899 40%, #8b5cf6 60%, transparent)",
          opacity: 0.85,
        }}
      />
    </article>
  );
}

function MatchSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        aspectRatio: "3 / 4",
        maxHeight: "min(72vh, 620px)",
        borderRadius: "24px",
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.16))",
        border: "1px solid rgba(139, 92, 246, 0.25)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
          animation: "feedShimmer 1.6s ease-in-out infinite",
        }}
      />
      <style jsx>{`
        @keyframes feedShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function MatchEmptyState() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "3 / 4",
        maxHeight: "min(72vh, 620px)",
        borderRadius: "24px",
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.14))",
        border: "1px solid rgba(139, 92, 246, 0.3)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "1.5rem",
        color: "#f5f3ff",
        gap: "0.6rem",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #e040fb, #8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 14px 30px rgba(139,92,246,0.45)",
        }}
      >
        <IconHeart size={28} />
      </div>
      <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
        Sin sugerencias por ahora
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: "0.9rem",
          color: "rgba(245,243,255,0.75)",
          maxWidth: 320,
        }}
      >
        Vuelve más tarde o explora creadores en vivo.
      </p>
      <Link
        href="/explore"
        style={{
          marginTop: "0.4rem",
          padding: "0.55rem 1.1rem",
          borderRadius: 999,
          background: "linear-gradient(135deg, #e040fb, #8b5cf6)",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: "0.9rem",
          boxShadow: "0 10px 24px rgba(139,92,246,0.4)",
        }}
      >
        Explorar
      </Link>
    </div>
  );
}

function LiveCard({ live }) {
  const host = live?.user || live?.host || {};
  const name = getDisplayName(host);
  const thumb = getLiveThumbnail(live);
  const seed = live?._id || host?._id || name;
  const viewers =
    typeof live?.viewers === "number"
      ? live.viewers
      : typeof live?.viewerCount === "number"
      ? live.viewerCount
      : null;
  const href = `/live/${live?._id || live?.streamId || ""}`;

  return (
    <Link
      href={href}
      style={{
        position: "relative",
        flex: "0 0 auto",
        width: 150,
        height: 220,
        borderRadius: 18,
        overflow: "hidden",
        scrollSnapAlign: "start",
        textDecoration: "none",
        color: "#fff",
        border: "1px solid rgba(236, 72, 153, 0.35)",
        boxShadow: "0 14px 30px -10px rgba(236, 72, 153, 0.35)",
        display: "block",
      }}
    >
      <SafeImage
        src={thumb}
        alt={name}
        seed={seed}
        fallbackInitial={getInitial(name)}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          padding: "2px 8px",
          borderRadius: 999,
          background: "#ec4899",
          color: "#fff",
          fontSize: "0.65rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          boxShadow: "0 4px 12px rgba(236,72,153,0.6)",
        }}
      >
        LIVE
      </span>
      {viewers != null && (
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            fontSize: "0.7rem",
            fontWeight: 600,
          }}
        >
          {viewers}
        </span>
      )}
      <div
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 10,
          fontSize: "0.85rem",
          fontWeight: 700,
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </div>
    </Link>
  );
}

function CreatorChip({ creator }) {
  const name = getDisplayName(creator);
  const img = getUserImage(creator);
  const seed = creator?._id || name;

  return (
    <Link
      href={`/profile/${creator?._id || ""}`}
      style={{
        flex: "0 0 auto",
        width: 88,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        textDecoration: "none",
        color: "#f5f3ff",
        scrollSnapAlign: "start",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          overflow: "hidden",
          border: "2px solid transparent",
          backgroundImage:
            "linear-gradient(#0f0821, #0f0821), linear-gradient(135deg, #e040fb, #8b5cf6)",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
          boxShadow: "0 8px 20px rgba(139,92,246,0.35)",
        }}
      >
        <SafeImage
          src={img}
          alt={name}
          seed={seed}
          fallbackInitial={getInitial(name)}
          style={{ borderRadius: "50%" }}
        />
      </div>
      <span
        style={{
          fontSize: "0.78rem",
          fontWeight: 600,
          maxWidth: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
    </Link>
  );
}

function EmptyState({ icon, title, subtitle, cta }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "1.25rem 1rem",
        borderRadius: 16,
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.10))",
        border: "1px dashed rgba(139, 92, 246, 0.35)",
        color: "#f5f3ff",
        textAlign: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #e040fb, #8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          boxShadow: "0 10px 24px rgba(139,92,246,0.4)",
        }}
      >
        {icon}
      </div>
      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>{title}</h4>
      {subtitle ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.82rem",
            color: "rgba(245,243,255,0.75)",
            maxWidth: 360,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      {cta ? (
        <Link
          href={cta.href}
          style={{
            marginTop: 6,
            padding: "0.45rem 1rem",
            borderRadius: 999,
            background: "linear-gradient(135deg, #e040fb, #8b5cf6)",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "0.85rem",
            boxShadow: "0 8px 18px rgba(139,92,246,0.4)",
          }}
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
