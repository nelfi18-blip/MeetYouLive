"use client";

/**
 * /feed — Brand-new premium discovery feed for MeetYouLive.
 *
 * Architecture (intentionally simple and resilient):
 *   1. Sticky brand header (logo, coins pill, notifications, avatar)
 *   2. Horizontal "Stories" rail of currently active live streams
 *   3. Segmented tabs: Para ti · En vivo · Creadores
 *   4. Responsive 2-column card grid driven by the active tab
 *   5. Floating CTA (Go Live for creators, Explore for everyone else)
 *
 * Safety / UX invariants preserved from prior iterations:
 *   - Waits for `status === "authenticated"` before fetching.
 *   - AbortController with a 15 s timeout (Render cold starts can be slow).
 *   - `cache: "no-store"` to avoid stale data after login.
 *   - Admins are redirected to /admin (they don't belong on the feed).
 *   - Errors always render a friendly fallback with a retry button — never an
 *     infinite spinner.
 *   - Reuses the shared `LiveCard` component and `imageHelpers` so visual
 *     conventions stay consistent across the app.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import { filterActiveLives } from "@/lib/liveFilters";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getUserImage,
  getDisplayName,
  getInitial,
  getGradientForUser,
} from "@/lib/imageHelpers";
import { fetchUserRole } from "@/lib/token";
import { isApprovedCreator } from "@/lib/creatorUtils";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const FETCH_TIMEOUT_MS = 15000;
// In the "Para ti" feed, inject one featured creator card after every Nth
// recommended profile so the discovery surface always mixes both worlds.
const CREATOR_INJECTION_INTERVAL = 4;

const TABS = [
  { id: "foryou", label: "Para ti" },
  { id: "live", label: "En vivo" },
  { id: "creators", label: "Creadores" },
];

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [activeLives, setActiveLives] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState("foryou");
  const [likedIds, setLikedIds] = useState(() => new Set());

  /* ------------------------------------------------------------------ */
  /* Auth gating                                                         */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  // Admins should not see the consumer feed.
  useEffect(() => {
    if (!session?.backendToken) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchUserRole(session.backendToken);
        if (!cancelled && user?.role === "admin") router.replace("/admin");
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.backendToken, router]);

  /* ------------------------------------------------------------------ */
  /* Data fetch                                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (status !== "authenticated" || !session?.backendToken) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = {
          Authorization: `Bearer ${session.backendToken}`,
        };
        const [feedRes, meRes] = await Promise.all([
          fetch(`${API_URL}/api/feed`, {
            headers,
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`${API_URL}/api/user/me`, {
            headers,
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (cancelled) return;

        if (!feedRes.ok) {
          if (feedRes.status === 401 || feedRes.status === 403) {
            throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
          }
          throw new Error(t("feed.genericError"));
        }

        const data = await feedRes.json();
        const lives = filterActiveLives(data.activeLives || []);
        const uniqBy = (arr) =>
          Array.from(new Map((arr || []).map((i) => [i._id, i])).values());

        setActiveLives(lives);
        setProfiles(uniqBy(data.recommendedProfiles));
        setFeaturedCreators(uniqBy(data.featuredCreators));

        if (meRes.ok) {
          const meJson = await meRes.json();
          setMe(meJson);
        }
      } catch (err) {
        if (cancelled) return;
        if (err.name === "AbortError") {
          setError(t("feed.serverStarting"));
        } else if (err.name === "TypeError") {
          setError(t("feed.networkError"));
        } else {
          setError(err.message || t("feed.genericError"));
        }
      } finally {
        if (!cancelled) {
          clearTimeout(timeout);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [status, session?.backendToken, session?.user?.id, refreshKey, t]);

  /* ------------------------------------------------------------------ */
  /* Derived UI state                                                    */
  /* ------------------------------------------------------------------ */

  // "Para ti" interleaves recommended users with featured creators so the
  // first screen always feels alive even when one of the lists is sparse.
  const forYouItems = useMemo(() => {
    const result = [];
    const maxLen = Math.max(profiles.length, featuredCreators.length);
    for (let i = 0; i < maxLen; i++) {
      if (profiles[i]) result.push({ kind: "profile", data: profiles[i] });
      // Every Nth profile, slot in a featured creator to keep the grid varied.
      if (i % CREATOR_INJECTION_INTERVAL === CREATOR_INJECTION_INTERVAL - 1) {
        const creatorIdx = Math.floor(i / CREATOR_INJECTION_INTERVAL);
        if (featuredCreators[creatorIdx]) {
          result.push({ kind: "creator", data: featuredCreators[creatorIdx] });
        }
      }
    }
    return result;
  }, [profiles, featuredCreators]);

  const isCreator = isApprovedCreator(me);
  const coinsBalance = Number.isFinite(me?.coinsBalance) ? me.coinsBalance : 0;

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  const handleLike = useCallback(
    async (userId) => {
      if (!userId || !session?.backendToken) return;
      // Optimistic UI: mark immediately, revert on failure.
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
      try {
        const res = await fetch(`${API_URL}/api/match/like/${userId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.backendToken}`,
          },
        });
        if (!res.ok) throw new Error("like failed");
      } catch (err) {
        console.warn("[Feed] Like failed, reverting optimistic UI", err);
        setLikedIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [session?.backendToken],
  );

  const refresh = () => setRefreshKey((k) => k + 1);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  // Auth still resolving — render the skeleton frame, not a blank page.
  const isInitialLoading = status === "loading" || (loading && !error);

  return (
    <div className="feed-shell">
      {/* ============ Header ============ */}
      <header className="feed-header">
        <Link href="/" className="feed-brand" aria-label="MeetYouLive">
          <span className="feed-brand-dot" />
          MeetYouLive
        </Link>
        <div className="feed-header-actions">
          <Link href="/coins" className="feed-coins-pill" aria-label="Monedas">
            <span className="feed-coins-icon">🪙</span>
            <span className="feed-coins-amount">
              {coinsBalance.toLocaleString()}
            </span>
          </Link>
          <Link
            href="/notifications"
            className="feed-icon-btn"
            aria-label="Notificaciones"
          >
            🔔
          </Link>
          <Link href="/profile" className="feed-avatar-btn" aria-label="Perfil">
            {getUserImage(me) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getUserImage(me)}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span
                className="feed-avatar-fallback"
                style={{ background: getGradientForUser(me?._id || "me") }}
              >
                {getInitial(getDisplayName(me))}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* ============ Lives "stories" rail ============ */}
      <LivesRail
        lives={activeLives}
        loading={isInitialLoading && !activeLives.length}
      />

      {/* ============ Tabs ============ */}
      <nav className="feed-tabs" role="tablist" aria-label="Secciones del feed">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            role="tab"
            aria-selected={tab === tabDef.id}
            className={`feed-tab ${tab === tabDef.id ? "is-active" : ""}`}
            onClick={() => setTab(tabDef.id)}
          >
            {tabDef.label}
            {tabDef.id === "live" && activeLives.length > 0 && (
              <span className="feed-tab-count">{activeLives.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ============ Main content ============ */}
      <main className="feed-main">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : isInitialLoading ? (
          <SkeletonGrid />
        ) : tab === "foryou" ? (
          forYouItems.length === 0 ? (
            <EmptyState
              icon="✨"
              title="Aún no hay sugerencias para ti"
              hint="Vuelve en unos minutos — nuevos perfiles llegan todo el tiempo."
              actionLabel="Actualizar"
              onAction={refresh}
            />
          ) : (
            <div className="feed-grid">
              {forYouItems.map((item) =>
                item.kind === "profile" ? (
                  <ProfileCard
                    key={`p-${item.data._id}`}
                    profile={item.data}
                    liked={likedIds.has(item.data._id)}
                    onLike={() => handleLike(item.data._id)}
                  />
                ) : (
                  <CreatorCard
                    key={`c-${item.data._id}`}
                    creator={item.data}
                  />
                ),
              )}
            </div>
          )
        ) : tab === "live" ? (
          activeLives.length === 0 ? (
            <EmptyState
              icon="📡"
              title="Nadie está en vivo ahora mismo"
              hint="Sé el primero — abre tu transmisión y reúne a tu comunidad."
              actionLabel={isCreator ? "Empezar a transmitir" : "Explorar"}
              onAction={() =>
                router.push(isCreator ? "/live/start" : "/explore")
              }
            />
          ) : (
            <div className="feed-grid">
              {activeLives.map((live, idx) => (
                <LiveCard key={live._id} live={live} index={idx} />
              ))}
            </div>
          )
        ) : (
          // creators tab
          featuredCreators.length === 0 ? (
            <EmptyState
              icon="⭐"
              title="No hay creadores destacados todavía"
              hint="Pronto verás aquí a los talentos más populares de la plataforma."
              actionLabel="Actualizar"
              onAction={refresh}
            />
          ) : (
            <div className="feed-grid">
              {featuredCreators.map((c) => (
                <CreatorCard key={c._id} creator={c} large />
              ))}
            </div>
          )
        )}
      </main>

      {/* ============ Floating CTA ============ */}
      {!error && !isInitialLoading && (
        <Link
          href={isCreator ? "/live/start" : "/explore"}
          className="feed-fab"
          aria-label={isCreator ? "Empezar a transmitir" : "Explorar"}
        >
          <span className="feed-fab-icon">{isCreator ? "🎥" : "🔭"}</span>
          <span className="feed-fab-label">
            {isCreator ? "Go Live" : "Explorar"}
          </span>
        </Link>
      )}

      <FeedStyles />
    </div>
  );
}

/* ====================================================================== */
/* Sub-components                                                          */
/* ====================================================================== */

function LivesRail({ lives, loading }) {
  if (loading) {
    return (
      <div className="lives-rail" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="lives-rail-item">
            <div className="lives-rail-skeleton" />
            <div className="lives-rail-skeleton-label" />
          </div>
        ))}
      </div>
    );
  }

  if (!lives || lives.length === 0) return null;

  return (
    <div className="lives-rail" aria-label="Transmisiones en vivo">
      {lives.map((live) => {
        const name = getDisplayName(live.user);
        const img =
          (live.user && getUserImage(live.user)) || live.thumbnail || null;
        return (
          <Link
            key={live._id}
            href={`/live/${live._id}`}
            className="lives-rail-item"
          >
            <div className="lives-rail-ring">
              <div className="lives-rail-avatar">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" />
                ) : (
                  <span
                    className="lives-rail-fallback"
                    style={{
                      background: getGradientForUser(live.user?._id || live._id),
                    }}
                  >
                    {getInitial(name)}
                  </span>
                )}
              </div>
              <span className="lives-rail-badge">LIVE</span>
            </div>
            <span className="lives-rail-label">{name}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ProfileCard({ profile, liked, onLike }) {
  const name = getDisplayName(profile);
  const img = getUserImage(profile);
  const age = Number.isFinite(profile?.age) ? profile.age : null;
  const trimmedLocation =
    typeof profile?.location === "string" ? profile.location.trim() : "";
  const location = trimmedLocation || null;

  return (
    <article className="feed-card">
      <Link
        href={`/profile/${profile._id}`}
        className="feed-card-media"
        aria-label={`Ver perfil de ${name}`}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div
            className="feed-card-fallback"
            style={{ background: getGradientForUser(profile._id || name) }}
          >
            <span>{getInitial(name)}</span>
          </div>
        )}
        {profile?.isOnline && <span className="feed-card-online" />}
        <div className="feed-card-gradient" aria-hidden="true" />
        <div className="feed-card-meta">
          <span className="feed-card-name">
            {name}
            {age != null && <span className="feed-card-age">, {age}</span>}
          </span>
          {location && <span className="feed-card-location">{location}</span>}
        </div>
      </Link>
      <button
        type="button"
        className={`feed-card-like ${liked ? "is-liked" : ""}`}
        aria-pressed={liked}
        aria-label={liked ? "Te gusta" : "Me gusta"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!liked) onLike();
        }}
      >
        {liked ? "💖" : "🤍"}
      </button>
    </article>
  );
}

function CreatorCard({ creator, large = false }) {
  const name = getDisplayName(creator);
  const img = getUserImage(creator);
  const earnings = Number.isFinite(creator?.earningsCoins)
    ? creator.earningsCoins
    : 0;

  return (
    <Link
      href={`/profile/${creator._id}`}
      className={`feed-card feed-card--creator ${large ? "is-large" : ""}`}
    >
      <div className="feed-card-media">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={name} loading="lazy" />
        ) : (
          <div
            className="feed-card-fallback"
            style={{ background: getGradientForUser(creator._id || name) }}
          >
            <span>{getInitial(name)}</span>
          </div>
        )}
        <div className="feed-card-gradient" aria-hidden="true" />
        <span className="feed-card-tag">⭐ Creador</span>
        <div className="feed-card-meta">
          <span className="feed-card-name">{name}</span>
          {earnings > 0 && (
            <span className="feed-card-location">
              🪙 {earnings.toLocaleString()} ganados
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="feed-grid" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="feed-card feed-card-skeleton">
          <div className="feed-card-media" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, hint, actionLabel, onAction }) {
  return (
    <div className="feed-state">
      <div className="feed-state-icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="feed-state-title">{title}</h2>
      {hint && <p className="feed-state-hint">{hint}</p>}
      {actionLabel && (
        <button
          type="button"
          className="feed-state-btn"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="feed-state">
      <div className="feed-state-icon" aria-hidden="true">
        ⚠️
      </div>
      <h2 className="feed-state-title">Algo salió mal</h2>
      <p className="feed-state-hint">{message}</p>
      <button type="button" className="feed-state-btn" onClick={onRetry}>
        Intentar de nuevo
      </button>
    </div>
  );
}

/* ====================================================================== */
/* Scoped styles                                                           */
/* ====================================================================== */

function FeedStyles() {
  return (
    <style jsx global>{`
      .feed-shell {
        /* Layout tokens — adjust these if header/bottom-nav heights change. */
        --feed-header-height: 64px;
        --feed-bottom-nav-height: 96px;

        min-height: 100vh;
        background:
          radial-gradient(
            1200px 600px at 20% -10%,
            rgba(224, 64, 251, 0.18),
            transparent 60%
          ),
          radial-gradient(
            900px 500px at 90% 10%,
            rgba(34, 211, 238, 0.14),
            transparent 60%
          ),
          #0a0a14;
        color: #f3f4f6;
        padding-bottom: calc(
          var(--feed-bottom-nav-height) + 24px + env(safe-area-inset-bottom)
        );
      }

      /* ---------------- Header ---------------- */
      .feed-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        background: rgba(10, 10, 20, 0.72);
        backdrop-filter: saturate(140%) blur(14px);
        -webkit-backdrop-filter: saturate(140%) blur(14px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .feed-brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 800;
        letter-spacing: 0.3px;
        color: #fff;
        text-decoration: none;
        font-size: 16px;
      }
      .feed-brand-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e040fb, #22d3ee);
        box-shadow: 0 0 12px rgba(224, 64, 251, 0.7);
      }
      .feed-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .feed-coins-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.22), rgba(251, 146, 60, 0.18));
        border: 1px solid rgba(251, 191, 36, 0.35);
        color: #fde68a;
        font-weight: 700;
        font-size: 13px;
        text-decoration: none;
        white-space: nowrap;
      }
      .feed-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 16px;
        text-decoration: none;
        color: #fff;
      }
      .feed-avatar-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid rgba(224, 64, 251, 0.5);
        background: #1a1a2e;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
      }
      .feed-avatar-btn img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .feed-avatar-fallback {
        width: 100%;
        height: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        color: #fff;
        font-size: 14px;
      }

      /* ---------------- Lives rail ---------------- */
      .lives-rail {
        display: flex;
        gap: 14px;
        padding: 14px 18px 4px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
      }
      .lives-rail::-webkit-scrollbar {
        display: none;
      }
      .lives-rail-item {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-decoration: none;
        color: inherit;
        scroll-snap-align: start;
        max-width: 72px;
      }
      .lives-rail-ring {
        position: relative;
        width: 68px;
        height: 68px;
        border-radius: 50%;
        padding: 3px;
        background: conic-gradient(
          from 0deg,
          #ff4fa3,
          #e040fb,
          #8b5cf6,
          #22d3ee,
          #ff4fa3
        );
        animation: feed-rail-spin 6s linear infinite;
      }
      @keyframes feed-rail-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .lives-rail-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        overflow: hidden;
        background: #1a1a2e;
        border: 2px solid #0a0a14;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .lives-rail-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .lives-rail-fallback {
        width: 100%;
        height: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 700;
        font-size: 18px;
      }
      .lives-rail-badge {
        position: absolute;
        bottom: -4px;
        left: 50%;
        transform: translateX(-50%) rotate(0deg);
        background: linear-gradient(135deg, #ef4444, #ff4fa3);
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.5px;
        padding: 2px 8px;
        border-radius: 999px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.45);
      }
      .lives-rail-label {
        font-size: 11px;
        color: #cbd5e1;
        max-width: 72px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        animation: none;
      }
      .lives-rail-skeleton {
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.04),
          rgba(255, 255, 255, 0.1),
          rgba(255, 255, 255, 0.04)
        );
        background-size: 200% 100%;
        animation: feed-shimmer 1.4s ease-in-out infinite;
      }
      .lives-rail-skeleton-label {
        width: 50px;
        height: 8px;
        margin-top: 2px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.07);
      }
      @keyframes feed-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* ---------------- Tabs ---------------- */
      .feed-tabs {
        position: sticky;
        top: var(--feed-header-height);
        z-index: 20;
        display: flex;
        gap: 6px;
        padding: 10px 14px;
        margin: 6px 0 0;
        background: rgba(10, 10, 20, 0.6);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .feed-tabs::-webkit-scrollbar {
        display: none;
      }
      .feed-tab {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #cbd5e1;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .feed-tab:hover {
        background: rgba(255, 255, 255, 0.07);
        color: #fff;
      }
      .feed-tab.is-active {
        background: linear-gradient(135deg, #e040fb, #8b5cf6);
        color: #fff;
        border-color: transparent;
        box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
      }
      .feed-tab-count {
        background: rgba(0, 0, 0, 0.25);
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
      }

      /* ---------------- Grid ---------------- */
      .feed-main {
        padding: 14px 14px 20px;
      }
      .feed-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      @media (min-width: 640px) {
        .feed-grid {
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
      }
      @media (min-width: 960px) {
        .feed-grid {
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
      }

      /* ---------------- Card ---------------- */
      .feed-card {
        position: relative;
        border-radius: 18px;
        overflow: hidden;
        background: #14142a;
        border: 1px solid rgba(255, 255, 255, 0.05);
        aspect-ratio: 3 / 4;
        isolation: isolate;
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .feed-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(139, 92, 246, 0.25);
      }
      .feed-card-media {
        position: absolute;
        inset: 0;
        display: block;
        text-decoration: none;
        color: inherit;
      }
      .feed-card-media img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .feed-card-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .feed-card-fallback span {
        font-size: 3rem;
        font-weight: 800;
        color: rgba(255, 255, 255, 0.92);
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
      }
      .feed-card-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          180deg,
          transparent 45%,
          rgba(0, 0, 0, 0.78) 100%
        );
        pointer-events: none;
      }
      .feed-card-meta {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 1;
        color: #fff;
        pointer-events: none;
      }
      .feed-card-name {
        font-weight: 700;
        font-size: 15px;
        line-height: 1.2;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
      }
      .feed-card-age {
        font-weight: 500;
        opacity: 0.9;
      }
      .feed-card-location {
        font-size: 12px;
        opacity: 0.85;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
      }
      .feed-card-online {
        position: absolute;
        top: 10px;
        left: 10px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #22c55e;
        border: 2px solid #0a0a14;
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
        z-index: 2;
      }
      .feed-card-tag {
        position: absolute;
        top: 10px;
        right: 10px;
        background: linear-gradient(135deg, #fbbf24, #fb923c);
        color: #1a1a2e;
        font-size: 10px;
        font-weight: 800;
        padding: 4px 8px;
        border-radius: 999px;
        z-index: 2;
        box-shadow: 0 4px 10px rgba(251, 146, 60, 0.35);
      }
      .feed-card-like {
        position: absolute;
        right: 10px;
        bottom: 10px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #fff;
        font-size: 18px;
        cursor: pointer;
        z-index: 3;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition:
          transform 0.18s ease,
          background 0.18s ease;
      }
      .feed-card-like:hover {
        transform: scale(1.08);
      }
      .feed-card-like.is-liked {
        background: linear-gradient(135deg, #ff4fa3, #e040fb);
        border-color: transparent;
        box-shadow: 0 6px 16px rgba(224, 64, 251, 0.5);
      }
      .feed-card--creator.is-large {
        aspect-ratio: 4 / 5;
      }
      .feed-card-skeleton .feed-card-media {
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.04),
          rgba(255, 255, 255, 0.1),
          rgba(255, 255, 255, 0.04)
        );
        background-size: 200% 100%;
        animation: feed-shimmer 1.4s ease-in-out infinite;
      }

      /* ---------------- Empty / Error ---------------- */
      .feed-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 10px;
        padding: 60px 20px;
        color: #e5e7eb;
      }
      .feed-state-icon {
        font-size: 48px;
        filter: drop-shadow(0 4px 16px rgba(224, 64, 251, 0.4));
      }
      .feed-state-title {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }
      .feed-state-hint {
        margin: 0;
        max-width: 320px;
        color: #94a3b8;
        font-size: 14px;
        line-height: 1.45;
      }
      .feed-state-btn {
        margin-top: 8px;
        padding: 10px 22px;
        border-radius: 999px;
        background: linear-gradient(135deg, #e040fb, #8b5cf6);
        color: #fff;
        font-weight: 700;
        border: none;
        cursor: pointer;
        box-shadow: 0 8px 22px rgba(139, 92, 246, 0.45);
        transition: transform 0.18s ease;
      }
      .feed-state-btn:hover {
        transform: translateY(-1px);
      }

      /* ---------------- Floating CTA ---------------- */
      .feed-fab {
        position: fixed;
        right: 16px;
        bottom: calc(var(--feed-bottom-nav-height) + env(safe-area-inset-bottom));
        z-index: 25;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 18px;
        border-radius: 999px;
        background: linear-gradient(135deg, #e040fb, #ff4fa3);
        color: #fff;
        font-weight: 700;
        text-decoration: none;
        box-shadow: 0 12px 30px rgba(255, 79, 163, 0.5);
        transition: transform 0.18s ease;
      }
      .feed-fab:hover {
        transform: translateY(-2px);
      }
      .feed-fab-icon {
        font-size: 18px;
      }

      /* Hide the floating CTA on desktop where users have full nav */
      @media (min-width: 1024px) {
        .feed-fab {
          right: 28px;
          bottom: 28px;
        }
      }
    `}</style>
  );
}
