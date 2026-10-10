"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PremiumProfileCard from "@/components/PremiumProfileCard";
import LiveCard from "@/components/LiveCard";
import UrgencyBanner from "@/components/UrgencyBanner";
import EmptyState from "@/components/ui/EmptyState";
import { useLanguage } from "@/contexts/LanguageContext";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { filterActiveLives } from "@/lib/liveFilters";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USERS_PER_PAGE = 20;

const CATEGORIES = ["Todos", "Música", "Gaming", "Chat", "Dating"];
const CAT_ICONS = {
  Todos: "🌐", 
  Música: "🎵", 
  Gaming: "🎮", 
  Chat: "💬",
  Dating: "💕",
};

function LiveTabIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  );
}
function MatchTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}
function RandomTabIcon() {
  return (
    <svg
      className="random-entry-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3h5v5"/>
      <path d="M4 20L21 3"/>
      <path d="M21 16v5h-5"/>
      <path d="M15 15l6 6"/>
      <path d="M4 4l5 5"/>
    </svg>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const categoryLabels = {
    Todos: t("explore.categoryAll"),
    Música: t("explore.categoryMusic"),
    Gaming: t("explore.categoryGaming"),
    Chat: t("explore.categoryChat"),
    Dating: t("explore.categoryDating"),
  };
  const [tab, setTab] = useState("live");

  // ── Live tab state ──────────────────────────────────────────
  const [lives, setLives] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [liveError, setLiveError] = useState("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [localToken, setLocalToken] = useState(null);

  // ── Discover tab state ─────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [matchIds, setMatchIds] = useState(new Set());
  const [discoverPage, setDiscoverPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [callError, setCallError] = useState("");
  const [superCrushPrice, setSuperCrushPrice] = useState(50);
  const [boostPrice] = useState(100);
  const [passedIds, setPassedIds] = useState(new Set());
  const authToken = session?.backendToken || localToken;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocalToken(localStorage.getItem("token"));
    }
  }, []);

  // ── Load lives ─────────────────────────────────────────────
  const loadLives = useCallback(async () => {
    setLiveLoading(true);
    setLiveError("");
    try {
      const res = await fetch(`${API_URL}/api/lives`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLives(filterActiveLives(data));
    } catch {
      setLiveError("explore.errorLoadingLives");
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLives();
  }, []);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      return;
    }

    fetch(`${API_URL}/api/user/me`, { headers: { Authorization: "Bearer " + authToken } })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setCurrentUser(d || null))
      .catch(() => setCurrentUser(null));

    // Fetch crush config for super crush price
    fetch(`${API_URL}/api/matches/config`, { headers: { Authorization: "Bearer " + authToken } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.superCrushPrice) setSuperCrushPrice(d.superCrushPrice); })
      .catch(() => {});
  }, [authToken]);
  // ── Filter lives ───────────────────────────────────────────
  useEffect(() => {
    let result = lives;
    if (category !== "Todos") {
      result = result.filter((l) =>
        (l.category || "").toLowerCase() === category.toLowerCase()
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title?.toLowerCase().includes(q) ||
          l.user?.username?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [lives, category, search]);

  // ── Load discover users ────────────────────────────────────
  const loadUsers = useCallback(async (page) => {
    const token = authToken;
    if (!token) return;
    setDiscoverLoading(true);
    setDiscoverError("");
    try {
      const res = await fetch(
        `${API_URL}/api/user/discover?page=${page}&limit=${USERS_PER_PAGE}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newUsers = (data.users || [])
        .filter(u => u && u.role !== "admin" && u.role !== "moderator"); // Defensive filter
      setUsers((prev) => (page === 1 ? newUsers : [...prev, ...newUsers]));
      setHasMore(newUsers.length === USERS_PER_PAGE);
    } catch {
      setDiscoverError(t("explore.loadProfilesError"));
    } finally {
      setDiscoverLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (tab === "discover" && users.length === 0) {
      loadUsers(1);
    }
  }, [tab, loadUsers, users.length]);

  // ── Like / unlike ──────────────────────────────────────────
  const handleLike = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    const alreadyLiked = likedIds.has(userId);
    try {
      if (alreadyLiked) {
        await fetch(`${API_URL}/api/matches/like/${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setLikedIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
        setMatchIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      } else {
        const res = await fetch(`${API_URL}/api/matches/like/${userId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLikedIds((prev) => new Set([...prev, userId]));
          if (data.match) {
            setMatchIds((prev) => new Set([...prev, userId]));
          }
        }
      }
    } catch { /* ignore */ }
  };

  const handleMessage = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/chats/${data._id}`);
      } else {
        router.push("/chats");
      }
    } catch {
      router.push("/chats");
    }
  };

  const handleVideoCall = (userId) => {
    router.push(`/call/${userId}`);
  };

  const handlePrivateCall = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId, type: "paid_creator" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/call/${data._id}`);
      } else {
        setCallError(data.message || t("explore.privateCallError"));
      }
    } catch {
      setCallError(t("common.connectionError"));
    }
  };

  const loadMore = () => {
    const next = discoverPage + 1;
    setDiscoverPage(next);
    loadUsers(next);
  };

  const handleSuperCrush = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/matches/super-crush/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLikedIds((prev) => new Set([...prev, userId]));
        if (data.match) {
          setMatchIds((prev) => new Set([...prev, userId]));
        }
      } else {
        setCallError(data.message || t("explore.superCrushError"));
      }
    } catch {
      setCallError(t("common.connectionError"));
    }
  };

  const handlePass = async (userId) => {
    const token = authToken;
    if (!token) { router.push("/login"); return; }
    setDiscoverError("");
    try {
      const res = await fetch(`${API_URL}/api/matches/like/${encodeURIComponent(userId)}?action=dislike`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success !== true) {
        throw new Error(data?.message || t("explore.passProfileError"));
      }
      setPassedIds((prev) => new Set([...prev, userId]));
    } catch (err) {
      setDiscoverError(err.message || t("explore.passProfileError"));
    }
  };

  const handleBoost = async (userId) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/matches/boost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCallError("");
        alert(t("explore.boostSuccess"));
      } else {
        setCallError(data.message || t("explore.boostError"));
      }
    } catch {
      setCallError(t("common.connectionError"));
    }
  };

  const handleExploreLiveRefresh = () => {
    setTab("live");
    loadLives();
  };

  const hasNoLiveStreams = lives.length === 0;
  const hasLivesButNoMatches = lives.length > 0 && filtered.length === 0;
  const canGoLive = isApprovedCreator(currentUser);

  return (
    <div className="explore">
      {/* ── Urgency banner ── */}
      <UrgencyBanner />

      {/* ── Header ── */}
      <div className="explore-header">
        <div className="explore-header-left">
          <h1 className="page-title">{t("explore.title")}</h1>
          <p className="page-subtitle">{t("explore.subtitle")}</p>
        </div>
        {tab === "live" && (
          <div className="search-wrap">
            <span className="search-icon-inner">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              className="input search-input"
              type="text"
              placeholder={t("explore.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="explore-tabs">
        <button
          className={`explore-tab${tab === "live" ? " active" : ""}`}
          onClick={() => setTab("live")}
        >
          <LiveTabIcon /> {t("explore.liveTab")}
        </button>
        <button
          className={`explore-tab${tab === "discover" ? " active" : ""}`}
          onClick={() => setTab("discover")}
        >
          <PeopleIcon /> {t("explore.peopleTab")}
        </button>
        <Link href="/crush" className="explore-tab crush-link">
          ⚡ {t("explore.crushTab")}
        </Link>
        <Link href="/matches" className="explore-tab matches-link">
          <MatchTabIcon /> {t("explore.matchesTab")}
        </Link>
        <Link href="/random" className="explore-tab random-link" aria-label={t("nav.random")}>
          <span className="random-link-halo" aria-hidden="true" />
          <RandomTabIcon />
          <span>{t("nav.random")}</span>
        </Link>
      </div>

      {/* ── Live tab ── */}
      {tab === "live" && (
        <>
          <div className="category-bar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`cat-pill${category === cat ? " active" : ""}`}
                onClick={() => setCategory(cat)}
              >
                <span className="cat-icon">{CAT_ICONS[cat]}</span>
                <span>{categoryLabels[cat]}</span>
              </button>
            ))}
          </div>

          {liveError && <div className="banner-error">{t(liveError)}</div>}

          {hasNoLiveStreams ? (
            <div className="explore-empty-wrap">
              <EmptyState
                icon="📡"
                kicker={t("explore.realActivity")}
                title={t("explore.noLiveTitle")}
                description={t("explore.noLiveDescription")}
                action={canGoLive ? (
                  <Link href="/live/start" className="btn btn-primary live-start-btn">
                    <span aria-hidden="true">🎥</span> {t("explore.startLive")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary live-start-btn"
                    onClick={handleExploreLiveRefresh}
                    disabled={liveLoading}
                  >
                    <span aria-hidden="true">📡</span> {t("explore.viewLiveStreams")}
                  </button>
                )}
              />
              <div className="wait-actions">
                <p className="wait-title">{t("explore.whileWaiting")}</p>
                <div className="wait-action-grid">
                  <Link href="/crush" className="wait-action crush-action">
                    <span aria-hidden="true">⚡</span> {t("explore.viewCrush")}
                  </Link>
                  <Link href="/matches" className="wait-action matches-action">
                    <span aria-hidden="true">❤️</span> {t("explore.reviewMatches")}
                  </Link>
                  <Link href="/profile" className="wait-action profile-action">
                    <span aria-hidden="true">👤</span> {t("explore.completeProfile")}
                  </Link>
                </div>
              </div>
            </div>
          ) : hasLivesButNoMatches ? (
            <EmptyState
              compact
              icon="📡"
              kicker={t("explore.noMatchesKicker")}
              title={t("explore.noResultsTitle")}
              description={search || category !== "Todos"
                ? t("explore.noResultsDescription")
                : t("explore.noStreamsNow")}
            />
          ) : (
            <div className="streams-grid">
              {filtered.map((live) => (
                <LiveCard key={live._id} live={live} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Discover tab ── */}
      {tab === "discover" && (
        <>
          {callError && <div className="banner-error">{callError}</div>}
          {discoverError && <div className="banner-error">{discoverError}</div>}

          {discoverLoading && users.length === 0 && (
            <div className="discover-grid">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 280, borderRadius: "var(--radius)" }} />
              ))}
            </div>
          )}

          {!discoverLoading && users.length === 0 && !discoverError && (
            <EmptyState
              icon="👥"
              kicker={t("explore.realProfiles")}
              title={t("explore.noProfilesTitle")}
              description={t("explore.noProfilesDescription")}
              action={<Link href="/profile" className="btn btn-primary">{t("explore.completeProfile")}</Link>}
              secondaryAction={<button type="button" className="btn" onClick={() => loadUsers(1)}>{t("explore.retry")}</button>}
            />
          )}

          {users.length > 0 && (
            <>
              <div className="discover-grid">
                {users
                  .filter(user => !passedIds.has(user._id))
                  .map((user) => (
                    <PremiumProfileCard
                      key={user._id}
                      user={user}
                      liked={likedIds.has(user._id)}
                      matched={matchIds.has(user._id)}
                      onLike={handleLike}
                      onPass={handlePass}
                      onSuperCrush={handleSuperCrush}
                      onBoost={handleBoost}
                      onFlashLive={handlePrivateCall}
                      superCrushPrice={superCrushPrice}
                      boostPrice={boostPrice}
                      loading={discoverLoading}
                    />
                  ))}
              </div>

              {hasMore && (
                <div style={{ textAlign: "center", marginTop: "1rem" }}>
                  <button
                    className="btn"
                    onClick={loadMore}
                    disabled={discoverLoading}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "var(--text-muted)",
                      padding: "0.7rem 2rem",
                      borderRadius: "var(--radius-pill)",
                    }}
                  >
                    {discoverLoading ? t("common.loading") : t("explore.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <style jsx>{`
        .explore { display: flex; flex-direction: column; gap: 1.5rem; }

        .explore-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .explore-header-left { flex: 1; }

        .explore-tabs {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
          padding: 11px;
          border-radius: 28px;
          background: linear-gradient(135deg, rgba(20,12,42,0.78), rgba(9,7,20,0.78));
          border: 1px solid rgba(139,92,246,0.16);
          box-shadow: 0 10px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }
        /* Directos en vivo */
        .explore-tabs > :nth-child(1) { grid-column: span 3; }
        /* Personas */
        .explore-tabs > :nth-child(2) { grid-column: span 3; }
        /* Crush */
        .explore-tabs > :nth-child(3) { grid-column: span 2; }
        /* Mis Matches */
        .explore-tabs > :nth-child(4) { grid-column: span 2; }
        /* Random */
        .explore-tabs > :nth-child(5) { grid-column: span 2; }
        .explore-tab {
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
          width: 100%;
          min-width: 0;
          min-height: 44px;
          box-sizing: border-box;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          padding: 0.55rem 0.6rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-size: 0.84rem; font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
        }
        .explore-tab:hover { color: var(--text); background: rgba(255,255,255,0.06); }
        .explore-tab.active { background: var(--grad-primary); border-color: transparent; color: #fff; box-shadow: 0 2px 14px rgba(224,64,251,0.4); }
        .matches-link { background: rgba(255,45,120,0.08); border-color: rgba(255,45,120,0.2); color: var(--accent) !important; }
        .matches-link:hover { background: rgba(255,45,120,0.15); }
        .crush-link { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.2); color: #fbbf24 !important; }
        .crush-link:hover { background: rgba(251,191,36,0.15); }

        .random-link {
          position: relative;
          min-height: 44px;
          background: linear-gradient(135deg, rgba(18,10,36,0.85), rgba(10,8,24,0.85));
          border: 1px solid rgba(139,92,246,0.45);
          color: #c4b5fd !important;
          box-shadow: 0 0 0 rgba(139,92,246,0);
          overflow: hidden;
        }
        .random-link:hover {
          background: linear-gradient(135deg, rgba(28,16,54,0.9), rgba(14,10,32,0.9));
          border-color: rgba(96,165,250,0.6);
          box-shadow: 0 0 14px rgba(139,92,246,0.35);
        }
        .random-link:active {
          transform: scale(0.97);
          box-shadow: 0 0 8px rgba(96,165,250,0.4) inset;
        }
        .random-link:focus-visible {
          outline: 2px solid #a78bfa;
          outline-offset: 2px;
        }
        .random-link-halo {
          position: absolute;
          inset: -40% -10%;
          background: radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%);
          opacity: 0.6;
          animation: random-halo-pulse 2.6s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .random-entry-icon { position: relative; z-index: 1; filter: drop-shadow(0 0 4px rgba(167,139,250,0.7)); }
        .random-link > span { position: relative; z-index: 1; }

        @keyframes random-halo-pulse {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.08); }
        }

        @media (prefers-reduced-motion: reduce) {
          .random-link-halo { animation: none; opacity: 0.5; }
        }

        @media (min-width: 640px) {
          .explore-tabs { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.5rem; }
          .explore-tabs > :nth-child(1),
          .explore-tabs > :nth-child(2),
          .explore-tabs > :nth-child(3),
          .explore-tabs > :nth-child(4),
          .explore-tabs > :nth-child(5) { grid-column: span 1; }
          .explore-tab { padding: 0.55rem 1.2rem; }
        }

        .search-wrap { position: relative; width: 280px; max-width: 100%; }
        .search-icon-inner { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-dim); display: flex; pointer-events: none; }
        .search-input { padding-left: 2.4rem !important; }

        .category-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cat-pill { display: flex; align-items: center; gap: 0.35rem; padding: 0.42rem 1rem; border-radius: var(--radius-pill); border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text-muted); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all var(--transition); }
        .cat-pill:hover { color: var(--text); }
        .cat-pill.active { background: rgba(224,64,251,0.12); border-color: rgba(224,64,251,0.3); color: var(--accent-2); box-shadow: 0 0 10px rgba(224,64,251,0.15); }
        .cat-icon { font-size: 0.9rem; }

        .streams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1.25rem; }

        .discover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 1.1rem; }

        @media (max-width: 639px) {
          .discover-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 1.5rem;
          }
          .discover-grid :global(.premium-profile-card) {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 0;
            padding: 0;
            min-width: 0;
            border-radius: 28px;
            background: linear-gradient(155deg, #170b30, #09051a);
            border-color: rgba(192,132,252,0.35);
            box-shadow: 0 16px 40px rgba(0,0,0,0.35), 0 0 24px rgba(139,92,246,0.12);
            transform: none;
          }
          .discover-grid :global(.premium-profile-card.matched),
          .discover-grid :global(.premium-profile-card.creator-live) {
            border-color: rgba(255,79,163,0.65);
          }
          .discover-grid :global(.card-avatar-wrap) {
            grid-area: 1 / 1;
            align-self: stretch;
            width: 100%;
            min-height: 380px;
            aspect-ratio: 4 / 5;
            overflow: hidden;
            border-radius: 27px 27px 0 0;
            pointer-events: none;
          }
          .discover-grid :global(.card-avatar-wrap::after) {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(9,5,26,0.12) 0%, transparent 30%, rgba(9,5,26,0.6) 65%, #09051a 100%);
          }
          .discover-grid :global(.card-avatar-img),
          .discover-grid :global(.card-avatar-placeholder) {
            width: 100%;
            height: 100%;
            border: 0;
            border-radius: 0;
            box-shadow: none;
          }
          .discover-grid :global(.card-avatar-img) {
            position: absolute;
            inset: 0;
            object-fit: cover;
            object-position: center top;
          }
          .discover-grid :global(.card-avatar-placeholder) {
            position: absolute;
            inset: 0;
            font-size: 5rem;
          }
          .discover-grid :global(.avatar-live-dot) {
            top: 1rem;
            left: 1rem;
            bottom: auto;
            transform: none;
            z-index: 1;
          }
          .discover-grid :global(.card-ribbon) {
            top: 1rem;
            right: 1rem;
            z-index: 4;
            pointer-events: none;
          }
          .discover-grid :global(.card-body) {
            grid-area: 1 / 1;
            z-index: 4;
            align-self: end;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 4rem 1.25rem 1.25rem;
            text-align: left;
            pointer-events: none;
            background: linear-gradient(transparent, rgba(9,5,26,0.82));
            border-radius: 27px 27px 0 0;
          }
          .discover-grid :global(.card-name) {
            font-size: clamp(1.5rem, 6vw, 2rem);
            line-height: 1.15;
            color: #fff;
            text-shadow: 0 2px 12px rgba(0,0,0,0.6);
            overflow-wrap: anywhere;
          }
          .discover-grid :global(.card-badges-row),
          .discover-grid :global(.card-interests) {
            justify-content: flex-start;
            gap: 0.4rem;
          }
          .discover-grid :global(.card-location),
          .discover-grid :global(.card-langs-list),
          .discover-grid :global(.card-bio) {
            font-size: 0.875rem;
            color: #ede9f5;
            overflow-wrap: anywhere;
          }
          .discover-grid :global(.card-location svg) { color: #ff70c8; }
          .discover-grid :global(.card-interest-tag) {
            padding: 0.3rem 0.65rem;
            font-size: 0.75rem;
            background: rgba(124,58,237,0.3);
            border-color: rgba(192,132,252,0.35);
            color: #f3e8ff;
            overflow-wrap: anywhere;
          }
          .discover-grid :global(.card-link-overlay) {
            grid-area: 1 / 1;
            position: relative;
            inset: auto;
            align-self: stretch;
            border-radius: 27px 27px 0 0;
            z-index: 3;
          }
          .discover-grid :global(.sb) {
            pointer-events: auto;
            z-index: 4;
          }
          .discover-grid :global(.card-premium-actions) {
            grid-area: 2 / 1;
            margin: 0;
            padding: 1rem;
            gap: 0.75rem;
            border-top: 1px solid rgba(192,132,252,0.12);
          }
          .discover-grid :global(.actions-row) {
            gap: 0.75rem;
            align-items: stretch;
          }
          .discover-grid :global(.actions-row > div) { min-width: 0; }
          .discover-grid :global(.actions-row-secondary:empty) { display: none; }
          .discover-grid :global(.interaction-button) {
            min-height: 64px;
            height: 100%;
            border-radius: 20px;
            box-shadow: 0 4px 16px rgba(139,92,246,0.2);
          }
          .discover-grid :global(.interaction-button.action-compact) {
            min-width: 64px !important;
            padding: 0.75rem 0.5rem !important;
          }
          .discover-grid :global(.interaction-button.spark) {
            min-height: 80px;
            border-radius: 24px;
            box-shadow: 0 6px 24px rgba(224,64,251,0.3);
          }
          .discover-grid :global(.interaction-button.fade) {
            background: linear-gradient(135deg, #36264f, #201632);
            border-color: rgba(192,132,252,0.3);
          }
          .discover-grid :global(.interaction-coin-badge) {
            position: static;
            white-space: nowrap;
          }
          .discover-grid :global(.interaction-button.action-secondary) { min-height: 48px; }
          .discover-grid :global(.card-link-overlay:focus-visible),
          .discover-grid :global(.interaction-button:focus-visible) {
            outline: 3px solid var(--accent-cyan);
            outline-offset: -3px;
          }
        }

        @media (max-width: 639px) and (prefers-reduced-motion: reduce) {
          .discover-grid :global(.premium-profile-card),
          .discover-grid :global(.premium-profile-card *),
          .discover-grid :global(.premium-profile-card *::before),
          .discover-grid :global(.premium-profile-card *::after) {
            animation: none !important;
            transition: none !important;
          }
          .discover-grid :global(.interaction-button:hover:not(:disabled)),
          .discover-grid :global(.interaction-button:active:not(:disabled)),
          .discover-grid :global(.interaction-button.pressed) {
            transform: none;
          }
        }

        .banner-error { background: var(--error-bg); border: 1px solid rgba(248,113,113,0.35); color: var(--error); border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 500; }

        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 2rem; text-align: center; border: 1px dashed rgba(139,92,246,0.2); border-radius: var(--radius); background: rgba(15,8,32,0.4); }
        .empty-icon { font-size: 2.5rem; }
        .empty-state h3 { color: var(--text); font-size: 1.15rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }
        .live-empty-state {
          padding: 3.25rem 1.25rem;
          border: 1px solid rgba(224,64,251,0.2);
          background:
            radial-gradient(circle at top, rgba(224,64,251,0.14), transparent 34%),
            rgba(15,8,32,0.5);
          box-shadow: 0 18px 45px rgba(0,0,0,0.2);
        }
        .live-empty-icon {
          display: grid;
          place-items: center;
          width: 4.25rem;
          height: 4.25rem;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 0 24px rgba(224,64,251,0.18);
        }
        .live-empty-state h3 { font-size: 1.5rem; }
        .live-empty-state > p { max-width: 35rem; line-height: 1.6; }
        .explore-empty-wrap { display: flex; flex-direction: column; gap: 1rem; }
        .live-start-btn { margin-top: 0.25rem; }
        .wait-actions {
          width: 100%;
          max-width: 42rem;
          margin-top: 0.5rem;
          padding: 1rem;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius);
          background: rgba(255,255,255,0.035);
          backdrop-filter: blur(16px);
        }
        .live-empty-state .wait-title {
          margin-bottom: 0.8rem;
          color: var(--text);
          font-weight: 700;
        }
        .wait-action-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.65rem;
        }
        .wait-action {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 3rem;
          padding: 0.72rem 0.9rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          font-size: 0.84rem;
          font-weight: 700;
          transition: all var(--transition);
        }
        .wait-action:hover { color: var(--text); transform: translateY(-1px); }
        .crush-action { border-color: rgba(251,191,36,0.2); color: #fbbf24; background: rgba(251,191,36,0.08); }
        .matches-action { border-color: rgba(255,45,120,0.2); color: var(--accent); background: rgba(255,45,120,0.08); }
        .profile-action { border-color: rgba(224,64,251,0.22); color: var(--accent-2); background: rgba(224,64,251,0.08); }

        @media (max-width: 760px) {
          .wait-action-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 600px) {
          .explore-header { flex-direction: column; align-items: flex-start; }
          .search-wrap { width: 100%; }
          .explore-tabs { gap: 6px; padding: 9px; border-radius: 24px; }
          .explore-tab { padding: 0.5rem 0.35rem; font-size: 0.74rem; gap: 0.3rem; }
          .live-empty-state { padding: 2.5rem 1rem; }
          .wait-action-grid { grid-template-columns: 1fr; }
          .wait-action { min-height: 3.25rem; }
        }

        @media (max-width: 380px) {
          .explore-tabs { gap: 5px; padding: 8px; }
          .explore-tab { padding: 0.45rem 0.25rem; font-size: 0.68rem; gap: 0.25rem; }
        }
      `}</style>
    </div>
  );
}
