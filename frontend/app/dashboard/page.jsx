"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { setToken, clearToken } from "@/lib/token";
import { isApprovedCreator } from "@/lib/creatorUtils";
import DailyRewardPopup from "@/components/DailyRewardPopup";
import FuturisticCard from "@/components/ui/FuturisticCard";
import { filterActiveLives } from "@/lib/liveFilters";
import { getDisplayName, getLiveThumbnail, getUserImage } from "@/lib/imageHelpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const CONNECTION_LIMIT = 3;

const DASH_ICON_PROPS = {
  width: "24",
  height: "24",
  "aria-hidden": "true",
  focusable: "false",
};

function MatchIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/>
    </svg>
  );
}
function BroadcastIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
    </svg>
  );
}
function EarningsIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  );
}
function ExclusiveIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
function RankingIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}
function AgencyIcon() {
  return (
    <svg {...DASH_ICON_PROPS} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="6" height="13"/><rect x="9" y="4" width="6" height="16"/><rect x="16" y="10" width="6" height="10"/><line x1="2" y1="21" x2="22" y2="21"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function ChatBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeLive(live) {
  return {
    ...live,
    title: typeof live?.title === "string" ? live.title.trim() : "",
    viewerCount: normalizeNumber(live?.viewerCount ?? live?.viewers ?? live?.viewersCount),
  };
}

function getStableLiveRank(live) {
  return normalizeNumber(live?.viewerCount) * 100000 + new Date(live?.startedAt || live?.createdAt || 0).getTime();
}

function getProfileId(profile) {
  return String(profile?._id || profile?.userId || "");
}

function HomeConnectionAvatar({ user, name, className = "" }) {
  const [broken, setBroken] = useState(false);
  const image = !broken ? getUserImage(user) : null;
  const initial = (name || getDisplayName(user) || "U")[0]?.toUpperCase() || "U";

  return (
    <span className={`connection-avatar ${className}`}>
      {image ? (
        <img
          src={image}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="connection-avatar-fallback">{initial}</span>
      )}
    </span>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState(false);
  const [creatorDash, setCreatorDash] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [rankStats, setRankStats] = useState(null);
  const [activeLives, setActiveLives] = useState([]);
  const [livesLoading, setLivesLoading] = useState(true);
  const [livesError, setLivesError] = useState(false);
  const [socialData, setSocialData] = useState({ matches: [], likes: null });
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialErrors, setSocialErrors] = useState({ matches: false, likes: false });
  const [endingLive, setEndingLive] = useState(false);
  const [togglingKey, setTogglingKey] = useState(null);
  // Prevents a second recovery attempt if the first one is already in flight.
  const backendTokenAttempted = useRef(false);

  useEffect(() => {
    if (status === "loading") return;

    const localToken =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    // Sync backend token from Google OAuth session into localStorage so all
    // other pages (which read localStorage) can find it.
    if (status === "authenticated" && session?.backendToken && !localToken) {
      setToken(session.backendToken);
    }

    const token =
      localToken ||
      (status === "authenticated" && session?.backendToken
        ? session.backendToken
        : null);

    if (!token) {
      // Google OAuth user whose backend token wasn't captured in the NextAuth
      // jwt() callback (e.g. the Render backend was cold-starting).
      // Try the server-side proxy once before bouncing the user to /login.
      if (
        status === "authenticated" &&
        session?.googleEmail &&
        !backendTokenAttempted.current
      ) {
        backendTokenAttempted.current = true;
        fetch("/api/auth/backend-token", { method: "POST", cache: "no-store" })
          .then((r) => {
            if (!r.ok) {
              console.error("[dashboard] backend-token proxy failed:", r.status);
              return null;
            }
            return r.json();
          })
          .then((data) => {
            if (data?.token) {
              setToken(data.token);
              return fetch(`${API_URL}/api/user/me`, {
                headers: { Authorization: `Bearer ${data.token}` },
                cache: "no-store",
              });
            }
            router.replace("/login");
            return null;
          })
          .then((r) => {
            if (!r) return null;
            if (r.status === 401 || r.status === 403) {
              clearToken();
              router.replace("/login");
              return null;
            }
            if (!r.ok) {
              setUserError(true);
              return null;
            }
            return r.json();
          })
          .then((data) => {
            if (data) {
              setUser(data);
              if (data.role === "admin") {
                router.replace("/admin");
                return;
              }
              if (data.onboardingComplete === false) {
                router.replace("/onboarding");
              }
            }
          })
          .catch((err) => {
            console.error("[dashboard] backend-token recovery error:", err);
            router.replace("/login");
          })
          .finally(() => setUserLoading(false));
        return;
      }
      // Neither email/password token nor Google OAuth backend token found.
      router.replace("/login");
      return;
    }

    // Fetch real user data from the backend.
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          clearToken();
          router.replace("/login");
          return null;
        }
        if (!r.ok) {
          // Non-auth API error (e.g. 500) – signal load failure so we don't
          // render the page as if the user is a normal non-creator user.
          setUserError(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setUser(data);
          if (data.role === "admin") {
            router.replace("/admin");
            return;
          }
          if (data.onboardingComplete === false) {
            router.replace("/onboarding");
          }
        }
      })
      .catch(() => {
        // Network error – signal load failure so we don't render the page as
        // if the user is a normal non-creator user (which would misidentify
        // an approved creator whose role/creatorStatus cannot be confirmed).
        setUserError(true);
      })
      .finally(() => setUserLoading(false));
  }, [status, session, router]);

  useEffect(() => {
    if (!API_URL) {
      setLivesLoading(false);
      setLivesError(true);
      return;
    }
    let cancelled = false;
    setLivesLoading(true);
    setLivesError(false);
    fetch(`${API_URL}/api/lives`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("lives");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const lives = filterActiveLives(data)
          .filter((live) => live && live._id)
          .map(normalizeLive)
          .sort((a, b) => getStableLiveRank(b) - getStableLiveRank(a));
        setActiveLives(lives);
      })
      .catch(() => {
        if (!cancelled) setLivesError(true);
      })
      .finally(() => {
        if (!cancelled) setLivesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user || userError) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token || !API_URL) return;
    let cancelled = false;
    const getJson = async (path) => {
      const response = await fetch(`${API_URL}${path}`, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(path);
      return response.json();
    };

    setSocialLoading(true);
    setSocialErrors({ matches: false, likes: false });
    Promise.allSettled([
      getJson("/api/matches"),
      getJson("/api/matches/likes-received"),
    ])
      .then(([matchesResult, likesResult]) => {
        if (cancelled) return;
        setSocialData({
          matches: matchesResult.status === "fulfilled" && Array.isArray(matchesResult.value?.matches) ? matchesResult.value.matches : [],
          likes: likesResult.status === "fulfilled" ? likesResult.value : null,
        });
        setSocialErrors({
          matches: matchesResult.status === "rejected",
          likes: likesResult.status === "rejected",
        });
      })
      .finally(() => {
        if (!cancelled) setSocialLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, userError]);

  useEffect(() => {
    if (!isApprovedCreator(user)) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setDashLoading(true);
    fetch(`${API_URL}/api/creator/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setCreatorDash(data); })
      .catch(() => {})
      .finally(() => setDashLoading(false));
  }, [user]);

  useEffect(() => {
    if (!isApprovedCreator(user)) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/rankings/my-stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setRankStats(data); })
      .catch(() => {});
  }, [user]);

  const handleEndLive = useCallback(async () => {
    if (!creatorDash?.activeLive?._id) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setEndingLive(true);
    try {
      const r = await fetch(`${API_URL}/api/lives/${creatorDash.activeLive._id}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (r.ok) setCreatorDash((prev) => ({ ...prev, activeLive: null }));
    } catch {}
    setEndingLive(false);
  }, [creatorDash]);

  const handleToggle = useCallback(async (key) => {
    if (!creatorDash?.activeLive?._id) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setTogglingKey(key);
    const currentVal = creatorDash.activeLive[key];
    try {
      const r = await fetch(`${API_URL}/api/lives/${creatorDash.activeLive._id}/settings`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: !currentVal }),
        cache: "no-store",
      });
      if (r.ok) {
        const updated = await r.json();
        setCreatorDash((prev) => ({
          ...prev,
          activeLive: { ...prev.activeLive, [key]: updated[key] },
        }));
      }
    } catch {}
    setTogglingKey(null);
  }, [creatorDash]);

  if (status === "loading" || userLoading) {
    return (
      <div className="dashboard">
        <div className="hero-skeleton">
          <div className="skeleton" style={{ width: 72, height: 72, borderRadius: "28px", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
            <div className="skeleton" style={{ width: "180px", height: 26 }} />
            <div className="skeleton" style={{ width: "230px", maxWidth: "75%", height: 16 }} />
          </div>
        </div>
        <div className="social-skeleton-grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 108, borderRadius: "22px" }} />
          ))}
        </div>
        <style jsx>{`
          .dashboard { display: flex; flex-direction: column; justify-content: center; gap: 1rem; min-height: calc(100dvh - 140px); width: 100%; }
          .hero-skeleton { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: rgba(15,8,32,0.6); border: 1px solid var(--border); border-radius: 24px; }
          .social-skeleton-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; }
        `}</style>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="dashboard" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "calc(100dvh - 140px)", width: "100%", gap: "1.75rem" }}>
        <div style={{ width: "100%", boxSizing: "border-box", padding: "2rem", background: "rgba(15,8,32,0.6)", border: "1px solid var(--border)", borderRadius: "var(--radius)", textAlign: "center" }}>
          <p style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
            No se pudo cargar tu perfil. Verifica tu conexión o intenta más tarde.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "0.5rem 1.5rem", borderRadius: "var(--radius)", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const displayName =
    (user ? getDisplayName(user) : "") ||
    (session?.backendUser ? getDisplayName(session.backendUser) : "") ||
    session?.user?.name ||
    "Usuario";
  const isCreatorApproved = isApprovedCreator(user);
  const visibleMatches = socialData.matches
    .filter((match) => getProfileId(match))
    .slice(0, CONNECTION_LIMIT);
  const revealedLikes = Array.isArray(socialData.likes?.revealed) ? socialData.likes.revealed : [];
  const lockedLikesCount = normalizeNumber(socialData.likes?.lockedCount);
  const totalLikesCount = revealedLikes.length + lockedLikesCount;
  const hasSocialConnections = visibleMatches.length > 0 || totalLikesCount > 0;
  const socialHasPartialError = Object.values(socialErrors).some(Boolean);

  const profileImage =
    user?.profilePhoto ||
    user?.avatar ||
    user?.avatarUrl ||
    user?.photoURL ||
    user?.image ||
    (Array.isArray(user?.photos) ? user.photos[0]?.url || user.photos[0] : null);

  const handleRewardClaimed = ({ newBalance }) => {
    if (newBalance !== undefined) {
      setUser((prev) => prev ? { ...prev, coins: newBalance } : prev);
    }
  };

  const renderLiveCard = (live, index) => {
    const creatorName = getDisplayName(live.user);
    const thumbnail = getLiveThumbnail(live);
    const liveTitle = live.title || live.category || "Directo en vivo";
    return (
      <Link
        href={`/live/${live._id}`}
        className={`home-live-card${activeLives.length === 1 ? " home-live-card-featured" : ""}`}
        key={live._id}
        aria-label={`Entrar al live de ${creatorName}`}
      >
        <div className="home-live-media">
          {thumbnail ? <img src={thumbnail} alt="" /> : <span className="home-live-fallback">{creatorName[0]?.toUpperCase()}</span>}
          <span className="home-live-rank">{index === 0 ? "Destacado" : "En vivo"}</span>
          <span className="home-live-badge"><span /> LIVE</span>
        </div>
        <div className="home-live-info">
          <strong>{liveTitle}</strong>
          <span>@{creatorName}</span>
          <div className="home-live-meta">
            <span>{live.viewerCount} espectadores</span>
            {live.category && <span>{live.category}</span>}
          </div>
        </div>
      </Link>
    );
  };

  const renderMatchConnection = (match) => {
    const matchId = getProfileId(match);
    const name = getDisplayName(match);
    const interests = Array.isArray(match.sharedInterests) ? match.sharedInterests.filter(Boolean).slice(0, 2) : [];
    const score = Number(match.compatibilityScore);
    const meta = interests.length
      ? interests.join(" · ")
      : Number.isFinite(score)
      ? `${Math.round(score)}% compatible`
      : "Match real";
    return (
      <Link href={matchId ? `/profile/${matchId}` : "/matches"} className="connection-card" key={`match-${matchId}`}>
        <HomeConnectionAvatar user={match} name={name} />
        <span className="connection-copy">
          <span className="connection-title">
            {name}
            {match.isLive && <span className="connection-live-badge">LIVE</span>}
          </span>
          <span className="connection-subtitle">{meta}</span>
        </span>
      </Link>
    );
  };

  const renderLikesConnection = () => {
    const visibleRevealedLikes = revealedLikes
      .filter(({ user: likedUser }) => getProfileId(likedUser))
      .slice(0, Math.max(0, CONNECTION_LIMIT - (lockedLikesCount > 0 ? 1 : 0)));

    return (
      <>
        {visibleRevealedLikes.map(({ likeId, user: likedUser, crushType }) => {
          const name = getDisplayName(likedUser);
          const likedUserId = getProfileId(likedUser);
          return (
            <Link href={`/profile/${likedUserId}`} className="connection-card" key={`like-${likeId}`}>
              <HomeConnectionAvatar user={likedUser} name={name} />
              <span className="connection-copy">
                <span className="connection-title">{name}</span>
                <span className="connection-subtitle">
                  {crushType === "super_crush" ? "Te envió un Super Crush" : "Te dio like"}
                </span>
              </span>
            </Link>
          );
        })}
        {lockedLikesCount > 0 && (
          <Link href="/matches" className="connection-card connection-card-locked">
            <span className="connection-avatar connection-avatar-locked">
              <LockIcon />
            </span>
            <span className="connection-copy">
              <span className="connection-title">
                {lockedLikesCount} {lockedLikesCount === 1 ? "like oculto" : "likes ocultos"}
              </span>
              <span className="connection-subtitle">Identidad protegida por el flujo de desbloqueo</span>
            </span>
          </Link>
        )}
      </>
    );
  };

  return (
    <div className="dashboard">
      {/* Daily reward popup — auto-opens when reward is available */}
      {user && <DailyRewardPopup onClaimed={handleRewardClaimed} />}

      {/* Hero welcome card */}
      <FuturisticCard className={`hero-card${isCreatorApproved ? " hero-card-creator" : ""}`} accent={isCreatorApproved ? "pink" : "purple"} hover={false}>
        <div className="hero-bg-orb hero-orb-1" />
        <div className="hero-bg-orb hero-orb-2" />
        {isCreatorApproved && <div className="hero-bg-orb hero-orb-3" />}
        <div className="hero-content">
          <div className={`hero-avatar${isCreatorApproved ? " hero-avatar-creator" : ""}`}>
            {profileImage ? (
              <img src={profileImage} alt="" />
            ) : (
              displayName[0].toUpperCase()
            )}
          </div>
          <div className="hero-text">
            <div className="hero-badges">
              {isCreatorApproved && (
                <>
                  <span className="badge-creator">⭐ CREATOR</span>
                  <span className="badge-status">✓ APROBADO</span>
                </>
              )}
            </div>
            <h1 className="hero-title">
              {isCreatorApproved ? (
                <>Hola, <span className="hero-name">{displayName}</span></>
              ) : (
                <>Hola, <span className="hero-name">{displayName}</span></>
              )}
            </h1>
            <p className="hero-sub">
              {isCreatorApproved
                ? "Empieza por tu comunidad: descubre personas, conversa o sal en vivo."
                : "Encuentra personas, entra a lives reales o continúa una conversación."}
            </p>
          </div>
          <div className="hero-pills">
            {user && (
              <Link href="/coins" className="coins-pill">
                <span className="coins-pill-icon"><CoinIcon /></span>
                <span className="coins-pill-value">{user.coins ?? 0}</span>
                <span className="coins-pill-label">monedas</span>
              </Link>
            )}
              {isCreatorApproved && user && (
                <div className="earnings-pill">
                  <span className="earnings-pill-icon"><EarningsIcon /></span>
                  <span className="earnings-pill-value">{user.earningsCoins ?? 0}</span>
                  <span className="earnings-pill-label">ganancias</span>
                </div>
              )}
              {isCreatorApproved && (user?.agencyEarningsCoins ?? 0) > 0 && (
                <div className="agency-pill">
                  <span className="agency-pill-icon"><AgencyIcon /></span>
                  <span className="agency-pill-value">{user.agencyEarningsCoins}</span>
                  <span className="agency-pill-label">agencia</span>
                </div>
            )}
            {isCreatorApproved && (
              <Link href="/live/start" className="hero-start-live-btn">
                <BroadcastIcon />
                Iniciar live
              </Link>
            )}
          </div>
        </div>
      </FuturisticCard>

      <section className="live-discovery-section" aria-labelledby="live-discovery-title">
        <div className="content-section-heading">
          <div>
            <span className="section-label">Actividad real</span>
            <h2 id="live-discovery-title">Lives ahora</h2>
          </div>
          <Link href="/live">Ver todos</Link>
        </div>
        {livesLoading ? (
          <div className="home-live-carousel" aria-label="Cargando lives activos">
            {[...Array(2)].map((_, i) => <div key={i} className="home-live-card home-live-skeleton skeleton" />)}
          </div>
        ) : activeLives.length > 0 ? (
          <div className={`home-live-carousel${activeLives.length === 1 ? " single-live" : ""}`} aria-label="Lives activos">
            {activeLives.map(renderLiveCard)}
          </div>
        ) : (
          <div className="compact-empty-state">
            <span>{livesError ? "No se pudieron cargar los directos" : "No hay directos ahora"}</span>
          </div>
        )}
      </section>

      <section className="home-connections-section" aria-labelledby="home-connections-title">
        <div className="content-section-heading">
          <div>
            <span className="section-label">Actividad para ti</span>
            <h2 id="home-connections-title">Tus conexiones</h2>
          </div>
          {hasSocialConnections && <Link href="/matches">Ver más</Link>}
        </div>
        {socialLoading && !hasSocialConnections ? (
          <div className="connections-list" aria-label="Cargando conexiones">
            {[...Array(3)].map((_, i) => <div key={i} className="connection-skeleton skeleton" />)}
          </div>
        ) : hasSocialConnections ? (
          <div className="connections-panel">
            {visibleMatches.length > 0 && (
              <div className="connection-group">
                <div className="connection-group-title">Matches</div>
                <div className="connection-carousel" aria-label="Matches reales">{visibleMatches.map(renderMatchConnection)}</div>
              </div>
            )}
            {totalLikesCount > 0 && (
              <div className="connection-group">
                <div className="connection-group-title">Likes recibidos</div>
                <div className="connection-carousel" aria-label="Likes recibidos">{renderLikesConnection()}</div>
              </div>
            )}
            {socialHasPartialError && (
              <div className="connections-partial-note">Algunas conexiones no se pudieron actualizar ahora.</div>
            )}
          </div>
        ) : (
          <div className="compact-empty-state">
            <span>{socialHasPartialError ? "No se pudieron cargar conexiones ahora" : "Aún no tienes conexiones nuevas"}</span>
          </div>
        )}
      </section>

      <Link href="/coins" className="coins-compact-card" aria-label="Comprar o administrar monedas">
        <span className="coins-compact-icon"><CoinIcon /></span>
        <span className="coins-compact-copy">
          <strong>Coins</strong>
          <span>{(user?.coins ?? 0).toLocaleString()} disponibles · Comprar monedas</span>
        </span>
      </Link>

      {/* ── 🤝 CREATOR INVITE CARD (full creators only, not subCreators) ── */}
      {user?.role === "creator" && isCreatorApproved && user?.creatorInviteCode && (
        <div className="creator-invite-card">
          <div className="creator-invite-orb" />
          <div className="creator-invite-left">
            <span className="creator-invite-icon"><AgencyIcon /></span>
            <div className="creator-invite-text">
              <span className="creator-invite-title">Invita creadores y gana comisión</span>
              <span className="creator-invite-sub">
                Comparte tu código de invitación · Los invitados se convierten en sub-creadores
              </span>
            </div>
          </div>
          <div className="creator-invite-actions">
            <button
              className="creator-invite-copy"
              onClick={() => {
                const link = `${typeof window !== "undefined" ? window.location.origin : ""}/creator-request?creatorInvite=${user.creatorInviteCode}`;
                navigator.clipboard.writeText(link).catch(() => {});
              }}
            >
              Copiar enlace
            </button>
            <Link href="/agency" className="creator-invite-btn">Ver agencia</Link>
          </div>
        </div>
      )}

      {/* ── LIVE CONTROL PANEL (approved creators only) ── */}
      {isCreatorApproved && (
        <div className="creator-panels">
          <div className="panel live-control-panel">
            <div className="panel-header">
              <span className="panel-dot" style={{ background: creatorDash?.activeLive ? "#ef4444" : "#6b7280" }} />
              <h2 className="panel-title">Control del Directo</h2>
              {creatorDash?.activeLive && (
                <span className="live-badge-label">EN DIRECTO</span>
              )}
            </div>

            {dashLoading && !creatorDash ? (
              <div className="panel-loading">
                <div className="skeleton" style={{ width: "100%", height: 48, borderRadius: 8 }} />
              </div>
            ) : creatorDash?.activeLive ? (
              <div className="live-active">
                <div className="live-info-row">
                  <span className="live-title-text">{creatorDash.activeLive.title}</span>
                  <span className="viewer-chip">
                    <EyeIcon />
                    {creatorDash.activeLive.viewerCount ?? 0} espectadores
                  </span>
                </div>

                <div className="live-toggles">
                  <button
                    className={`toggle-btn ${creatorDash.activeLive.chatEnabled ? "toggle-on" : "toggle-off"}`}
                    onClick={() => handleToggle("chatEnabled")}
                    disabled={togglingKey === "chatEnabled"}
                  >
                    <ChatBubbleIcon />
                    Chat {creatorDash.activeLive.chatEnabled ? "ON" : "OFF"}
                  </button>
                  <button
                    className={`toggle-btn ${creatorDash.activeLive.giftsEnabled ? "toggle-on" : "toggle-off"}`}
                    onClick={() => handleToggle("giftsEnabled")}
                    disabled={togglingKey === "giftsEnabled"}
                  >
                    <GiftIcon />
                    Regalos {creatorDash.activeLive.giftsEnabled ? "ON" : "OFF"}
                  </button>
                  <button
                    className={`toggle-btn ${creatorDash.activeLive.isPrivate ? "toggle-on" : "toggle-off"}`}
                    onClick={() => handleToggle("isPrivate")}
                    disabled={togglingKey === "isPrivate"}
                  >
                    <LockIcon />
                    Privado {creatorDash.activeLive.isPrivate ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="live-actions-row">
                  <Link href={`/live/${creatorDash.activeLive._id}`} className="btn-view-live">
                    Ver directo
                  </Link>
                  <button
                    className="btn-end-live"
                    onClick={handleEndLive}
                    disabled={endingLive}
                  >
                    {endingLive ? "Finalizando…" : "Finalizar directo"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="live-idle">
                <p className="live-idle-text">No estás en directo ahora mismo</p>
                <Link href="/live/start" className="btn-start-live">
                  <BroadcastIcon />
                  Iniciar directo
                </Link>
              </div>
            )}
          </div>

          {/* ── EARNINGS PANEL ── */}
          <div className="panel earnings-panel">
            <div className="panel-header">
              <EarningsIcon />
              <h2 className="panel-title">Ganancias</h2>
            </div>

            {dashLoading && !creatorDash ? (
              <div className="panel-loading">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ width: "100%", height: 40, borderRadius: 8 }} />
                ))}
              </div>
            ) : (
              <>
                <div className="earnings-stats">
                  <div className="stat-box">
                    <span className="stat-label">Hoy</span>
                    <span className="stat-value stat-today">
                      {creatorDash?.todayCoins ?? 0}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Total ganancias</span>
                    <span className="stat-value">
                      {creatorDash?.earningsCoins ?? 0}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Ganancias agencia</span>
                    <span className="stat-value stat-agency">
                      {creatorDash?.agencyEarningsCoins ?? 0}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Regalos totales</span>
                    <span className="stat-value">{creatorDash?.totalGifts ?? 0}</span>
                  </div>
                </div>

                {creatorDash?.pendingPayout && (
                  <div className="payout-status">
                    <span className="payout-dot" />
                    <span className="payout-text">
                      Pago pendiente: <strong>{creatorDash.pendingPayout.amountCoins}</strong>
                      {" "}— <span className="payout-state">{creatorDash.pendingPayout.status}</span>
                    </span>
                  </div>
                )}

                {creatorDash?.recentGifts?.length > 0 && (
                  <div className="recent-gifts">
                    <p className="recent-gifts-label">Últimos regalos</p>
                    <ul className="gifts-list">
                      {creatorDash.recentGifts.map((g) => (
                        <li key={g._id} className="gift-item">
                          <span className="gift-icon-label">{g.giftIcon}</span>
                          <span className="gift-detail">
                            <span className="gift-name">{g.giftName}</span>
                            <span className="gift-sender">de {g.senderName}</span>
                          </span>
                          <span className="gift-coins">+{g.creatorShare}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="earnings-actions">
                  <Link href="/creator" className="btn-earnings-link">Ver ganancias completas</Link>
                  <Link href="/exclusive" className="btn-earnings-link">Contenido exclusivo</Link>
                </div>
              </>
            )}
          </div>

          {/* ── AGENCY PANEL ── */}
          <div className="panel agency-panel">
            <div className="panel-header">
              <AgencyIcon />
              <h2 className="panel-title">Agencia</h2>
              {creatorDash?.agencyEnabled ? (
                <span className="agency-badge-on">ACTIVA</span>
              ) : (
                <span className="agency-badge-off">INACTIVA</span>
              )}
            </div>
            {dashLoading && !creatorDash ? (
              <div className="panel-loading">
                <div className="skeleton" style={{ width: "100%", height: 40, borderRadius: 8 }} />
              </div>
            ) : (
              <>
                <div className="agency-stats">
                  <div className="stat-box">
                    <span className="stat-label">Total</span>
                    <span className="stat-value">{creatorDash?.agencyCounts?.total ?? 0}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Activos</span>
                    <span className="stat-value stat-agency-active">
                      {creatorDash?.agencyCounts?.active ?? 0}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Pendientes</span>
                    <span className="stat-value stat-agency-pending">
                      {creatorDash?.agencyCounts?.pending ?? 0}
                    </span>
                  </div>
                </div>
                <Link href="/agency" className="btn-panel-action">
                  Gestionar agency →
                </Link>
              </>
            )}
          </div>

          {/* ── EXCLUSIVE CONTENT PANEL ── */}
          <div className="panel exclusive-panel">
            <div className="panel-header">
              <ExclusiveIcon />
              <h2 className="panel-title">Contenido Exclusivo</h2>
            </div>
            {dashLoading && !creatorDash ? (
              <div className="panel-loading">
                <div className="skeleton" style={{ width: "100%", height: 40, borderRadius: 8 }} />
              </div>
            ) : (
              <>
                <div className="exclusive-stat">
                  <span className="exclusive-count">{creatorDash?.exclusiveContentCount ?? 0}</span>
                  <span className="exclusive-label">
                    {creatorDash?.exclusiveContentCount === 1 ? "elemento premium" : "elementos premium"}
                  </span>
                </div>
                <Link href="/exclusive" className="btn-panel-action btn-panel-exclusive">
                  Gestionar contenido exclusivo →
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── RANKING PANEL (approved creators only) ── */}
      {isCreatorApproved && (
        <div className="ranking-panel">
          {/* decorative background orb */}
          <div className="rp-orb" />

            <div className="panel-header rp-header">
              <span className="rp-trophy"><RankingIcon /></span>
              <h2 className="panel-title">Mi Ranking</h2>
              {rankStats?.rankWeek && (
                <span className={`rank-badge-label${rankStats.rankWeek <= 3 ? " rank-badge-podium" : ""}`}>
                  #{rankStats.rankWeek} esta semana
                </span>
              )}
          </div>

          <div className="rp-body">
            {/* Big rank number */}
            <div className="rp-rank-block">
              <div className={`rp-rank-number${rankStats?.rankWeek === 1 ? " rp-rank-gold" : rankStats?.rankWeek === 2 ? " rp-rank-silver" : rankStats?.rankWeek === 3 ? " rp-rank-bronze" : ""}`}>
                {rankStats?.rankWeek ? `#${rankStats.rankWeek}` : "—"}
              </div>
              <span className="rp-rank-sub">
                {rankStats?.totalRanked ? `de ${rankStats.totalRanked} creadores` : "posición semanal"}
              </span>
            </div>

            {/* Stats row */}
            <div className="rp-stats-row">
              <div className="rp-stat-card rp-stat-gifts">
                <span className="rp-stat-icon"><CoinIcon /></span>
                <span className="rp-stat-value">
                  {(rankStats?.todayCoins ?? 0).toLocaleString()}
                </span>
                <span className="rp-stat-label">
                  regalos hoy
                  <span className="rp-period-chip rp-period-daily">HOY</span>
                </span>
              </div>

              {rankStats?.topFanToday ? (
                <div className="rp-stat-card rp-stat-fan">
                  <span className="rp-stat-icon"><MatchIcon /></span>
                  <span className="rp-fan-name">
                    @{rankStats.topFanToday.username || rankStats.topFanToday.name}
                  </span>
                  <span className="rp-stat-label">
                    top fan hoy
                    <span className="rp-fan-coins">{rankStats.topFanToday.totalCoins}</span>
                  </span>
                </div>
              ) : (
                <div className="rp-stat-card rp-stat-fan rp-stat-empty">
                  <span className="rp-stat-icon"><MatchIcon /></span>
                  <span className="rp-fan-name rp-empty-dash">—</span>
                  <span className="rp-stat-label">top fan hoy</span>
                </div>
              )}
            </div>

            {/* Psychology message */}
            {rankStats?.rankWeek && (
              <div className="rp-psychology">
                {rankStats.rankWeek === 1
                  ? "👑 ¡Eres el #1 esta semana! Mantén tu posición"
                  : rankStats.rankWeek <= 3
                  ? `🏆 ¡Estás en el podio! Posición #${rankStats.rankWeek}`
                  : rankStats.rankWeek <= 10
                  ? `🔥 ¡Top 10! Posición #${rankStats.rankWeek} — sigue así`
                  : `🎯 Posición #${rankStats.rankWeek} — Envía más regalos para subir`}
              </div>
            )}

            <Link href="/ranking" className="rp-see-all">Ver ranking completo →</Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .dashboard { display: flex; flex-direction: column; gap: 1.75rem; max-width: 100%; overflow-x: clip; }
        .live-discovery-section,
        .home-connections-section {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .content-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
        }

        .content-section-heading h2 {
          margin: 0.1rem 0 0;
          color: var(--text);
          font-size: 1.18rem;
          letter-spacing: -0.035em;
          line-height: 1.1;
        }

        .content-section-heading a {
          color: var(--accent-3);
          font-size: 0.82rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .home-live-carousel {
          display: flex;
          gap: 0.85rem;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scroll-snap-type: x proximity;
          scrollbar-width: none;
          margin-inline: -0.25rem;
          padding: 0.1rem 1.1rem 0.15rem 0.25rem;
        }

        .home-live-carousel::-webkit-scrollbar {
          display: none;
        }

        .home-live-card {
          position: relative;
          flex: 0 0 min(78vw, 330px);
          min-height: 236px;
          border-radius: 26px;
          overflow: hidden;
          background: linear-gradient(145deg, rgba(24,12,50,0.96), rgba(12,6,26,0.98));
          border: 1px solid rgba(224,64,251,0.18);
          scroll-snap-align: start;
          box-shadow: var(--shadow), 0 0 30px rgba(139,92,246,0.08);
        }

        .home-live-card-featured {
          flex-basis: min(100%, 430px);
        }

        .home-live-media {
          position: relative;
          height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 40% 20%, rgba(224,64,251,0.32), rgba(24,12,50,0.95) 58%);
        }

        .home-live-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .home-live-media::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(8,4,18,0.05), rgba(8,4,18,0.42));
          pointer-events: none;
        }

        .home-live-fallback {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 1.8rem;
          font-weight: 900;
          background: var(--grad-primary);
          box-shadow: 0 0 28px rgba(224,64,251,0.35);
        }

        .home-live-badge,
        .home-live-rank {
          position: absolute;
          z-index: 1;
          border-radius: 999px;
          font-weight: 900;
          letter-spacing: 0.04em;
          backdrop-filter: blur(10px);
        }

        .home-live-badge {
          top: 0.75rem;
          left: 0.75rem;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.28rem 0.62rem;
          color: #fff;
          font-size: 0.64rem;
          background: rgba(239,68,68,0.86);
        }

        .home-live-badge span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #fff;
          animation: liveEntryPulse 1.4s infinite;
        }

        .home-live-rank {
          right: 0.75rem;
          bottom: 0.75rem;
          padding: 0.28rem 0.62rem;
          color: rgba(255,255,255,0.92);
          font-size: 0.62rem;
          background: rgba(10,6,24,0.72);
          border: 1px solid rgba(255,255,255,0.16);
        }

        .home-live-info {
          display: flex;
          flex-direction: column;
          gap: 0.28rem;
          padding: 0.85rem 0.95rem 1rem;
        }

        .home-live-info strong {
          display: block;
          min-width: 0;
          max-width: 100%;
          color: var(--text);
          font-size: 0.88rem;
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .home-live-info span {
          display: block;
          min-width: 0;
          max-width: 100%;
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .home-live-meta {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          margin-top: 0.15rem;
        }

        .home-live-meta span {
          max-width: 100%;
          padding: 0.22rem 0.5rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 0.68rem;
        }

        .compact-empty-state {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.72rem 0.9rem;
          border-radius: 18px;
          background: rgba(15,8,32,0.62);
          border: 1px solid rgba(139,92,246,0.14);
        }

        .compact-empty-state span {
          min-width: 0;
          color: var(--text-muted);
          font-size: 0.84rem;
        }

        .compact-empty-state a {
          flex-shrink: 0;
          color: var(--accent-3);
          font-size: 0.82rem;
          font-weight: 800;
        }

        .connections-panel {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .connection-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .connection-group-title {
          color: rgba(255,255,255,0.72);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .connections-list,
        .connection-carousel {
          display: flex;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scroll-snap-type: x proximity;
          gap: 0.55rem;
          margin-inline: -0.25rem;
          padding: 0.05rem 1rem 0.1rem 0.25rem;
          scrollbar-width: none;
        }

        .connection-carousel::-webkit-scrollbar {
          display: none;
        }

        .connection-card {
          display: flex;
          align-items: center;
          gap: 0.72rem;
          min-width: 0;
          flex: 0 0 min(74vw, 250px);
          padding: 0.7rem 0.78rem;
          border-radius: 20px;
          color: inherit;
          background:
            radial-gradient(circle at 0% 50%, rgba(224,64,251,0.12), transparent 42%),
            rgba(15,8,32,0.72);
          border: 1px solid rgba(139,92,246,0.18);
          box-sizing: border-box;
          scroll-snap-align: start;
          transition: transform var(--transition), border-color var(--transition), background var(--transition);
        }

        .connection-card:hover {
          transform: translateY(-1px);
          border-color: rgba(34,211,238,0.28);
          background: rgba(22,12,45,0.9);
        }

        :global(.connection-avatar) {
          width: 46px;
          height: 46px;
          min-width: 46px;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: #fff;
          background: radial-gradient(circle at 35% 25%, rgba(224,64,251,0.55), rgba(124,58,237,0.82));
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 10px 24px rgba(4,2,12,0.26);
        }

        :global(.connection-avatar img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        :global(.connection-avatar-fallback) {
          font-size: 1rem;
          font-weight: 950;
        }

        :global(.connection-avatar-locked) {
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border-color: rgba(251,191,36,0.25);
        }

        :global(.connection-avatar-locked svg) {
          width: 18px;
          height: 18px;
        }

        .connection-copy {
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
          flex: 1;
          min-width: 0;
        }

        .connection-title {
          display: flex;
          align-items: center;
          gap: 0.38rem;
          min-width: 0;
          color: var(--text);
          font-size: 0.9rem;
          font-weight: 900;
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .connection-subtitle {
          display: block;
          min-width: 0;
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .connection-open {
          flex-shrink: 0;
          color: var(--accent-3);
          font-size: 0.78rem;
          font-weight: 800;
        }

        .connection-live-badge {
          flex-shrink: 0;
          padding: 0.12rem 0.35rem;
          border-radius: 999px;
          color: #fff;
          background: rgba(239,68,68,0.9);
          font-size: 0.52rem;
          font-weight: 950;
          letter-spacing: 0.05em;
        }

        .connection-card-locked {
          border-color: rgba(251,191,36,0.2);
          background:
            radial-gradient(circle at 0% 50%, rgba(251,191,36,0.08), transparent 44%),
            rgba(15,8,32,0.72);
        }

        .connection-skeleton {
          height: 68px;
          border-radius: 20px;
        }

        .connections-partial-note {
          color: var(--text-muted);
          font-size: 0.76rem;
          padding: 0.1rem 0.1rem 0;
        }

        .coins-compact-card {
          display: flex;
          align-items: center;
          gap: 0.72rem;
          padding: 0.82rem 0.95rem;
          border-radius: 18px;
          color: inherit;
          background:
            radial-gradient(circle at 0% 50%, rgba(251,146,60,0.12), transparent 45%),
            rgba(15,8,32,0.7);
          border: 1px solid rgba(251,146,60,0.2);
          box-shadow: 0 10px 26px rgba(4,2,12,0.16);
        }

        .coins-compact-icon {
          width: 36px;
          height: 36px;
          border-radius: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--accent-orange);
          background: rgba(251,146,60,0.1);
          border: 1px solid rgba(251,146,60,0.24);
        }

        .coins-compact-icon :global(svg) {
          width: 18px;
          height: 18px;
        }

        .coins-compact-copy {
          display: flex;
          flex-direction: column;
          gap: 0.14rem;
          min-width: 0;
        }

        .coins-compact-copy strong {
          color: var(--text);
          font-size: 0.9rem;
          line-height: 1.15;
        }

        .coins-compact-copy span {
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── Hero ─────────── */
        .hero-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(22,12,45,0.95) 0%, rgba(15,8,32,0.98) 100%);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          padding: 2rem 2.25rem;
          box-shadow: var(--shadow), 0 0 60px rgba(139,92,246,0.08);
        }

        .hero-card-creator {
          border-color: rgba(244,114,182,0.3);
          box-shadow: var(--shadow), 0 0 80px rgba(224,64,251,0.12);
        }

        .hero-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
        }
        .hero-orb-1 {
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(224,64,251,0.15), transparent 70%);
          top: -80px; right: -60px;
        }
        .hero-orb-2 {
          width: 200px; height: 200px;
          background: radial-gradient(circle, rgba(129,140,248,0.12), transparent 70%);
          bottom: -60px; left: 30%;
        }
        .hero-orb-3 {
          width: 160px; height: 160px;
          background: radial-gradient(circle, rgba(244,114,182,0.1), transparent 70%);
          top: 20px; left: -40px;
        }

        .hero-content {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        .hero-avatar {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.6rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.3);
        }

        .hero-avatar-creator {
          width: 72px;
          height: 72px;
          font-size: 1.8rem;
          box-shadow: 0 0 0 3px rgba(244,114,182,0.5), 0 0 28px rgba(224,64,251,0.5);
          animation: avatar-glow 3s ease-in-out infinite;
        }

        .hero-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: inherit;
          display: block;
        }

        @keyframes avatar-glow {
          0%, 100% { box-shadow: 0 0 0 3px rgba(244,114,182,0.5), 0 0 28px rgba(224,64,251,0.5); }
          50%       { box-shadow: 0 0 0 3px rgba(244,114,182,0.8), 0 0 40px rgba(224,64,251,0.7); }
        }

        .hero-text { flex: 1; min-width: 180px; }

        .hero-badges {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin-bottom: 0.4rem;
        }

        .badge-creator {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #fff;
          background: linear-gradient(135deg, #e040fb, #a855f7);
          padding: 0.2rem 0.6rem;
          border-radius: 100px;
          box-shadow: 0 0 12px rgba(224,64,251,0.4);
        }

        .badge-status {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #34d399;
          background: rgba(52,211,153,0.12);
          border: 1px solid rgba(52,211,153,0.3);
          padding: 0.2rem 0.6rem;
          border-radius: 100px;
        }

        .hero-title {
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
          line-height: 1.2;
        }

        .hero-name {
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-sub {
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          margin-top: 0.25rem;
        }

        /* Pills row */
        .hero-pills {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .coins-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(251,146,60,0.1);
          border: 1px solid rgba(251,146,60,0.25);
          border-radius: var(--radius-pill);
          padding: 0.55rem 1.1rem;
          transition: all var(--transition);
          flex-shrink: 0;
        }
        .coins-pill:hover {
          background: rgba(251,146,60,0.18);
          box-shadow: 0 0 16px rgba(251,146,60,0.25);
        }

        .coins-pill-icon {
          width: 18px;
          height: 18px;
          color: var(--accent-orange);
          display: flex;
        }
        .coins-pill-value {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--accent-orange);
          line-height: 1;
        }
        .coins-pill-label {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .earnings-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.2);
          border-radius: var(--radius-pill);
          padding: 0.55rem 1.1rem;
          flex-shrink: 0;
        }
        .earnings-pill-icon {
          width: 15px;
          height: 15px;
          display: inline-flex;
          color: #34d399;
        }
        .earnings-pill-icon :global(svg) { width: 15px; height: 15px; }
        .earnings-pill-value {
          font-size: 1.05rem;
          font-weight: 800;
          color: #34d399;
          line-height: 1;
        }
        .earnings-pill-label {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .agency-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(129,140,248,0.08);
          border: 1px solid rgba(129,140,248,0.2);
          border-radius: var(--radius-pill);
          padding: 0.55rem 1.1rem;
          flex-shrink: 0;
        }
        .agency-pill-icon {
          width: 15px;
          height: 15px;
          display: inline-flex;
          color: #818cf8;
        }
        .agency-pill-icon :global(svg) { width: 15px; height: 15px; }
        .agency-pill-value {
          font-size: 1.05rem;
          font-weight: 800;
          color: #818cf8;
          line-height: 1;
        }
        .agency-pill-label {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .hero-start-live-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.6rem 1.3rem;
          border-radius: var(--radius-pill);
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          font-weight: 700;
          font-size: 0.875rem;
          letter-spacing: -0.01em;
          transition: all var(--transition);
          box-shadow: 0 0 20px rgba(239,68,68,0.4);
          flex-shrink: 0;
        }
        .hero-start-live-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 28px rgba(239,68,68,0.6);
        }
        .hero-start-live-btn :global(svg) { width: 16px; height: 16px; }

        /* ── Cards grid ──────── */
        .creator-invite-card {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.08) 100%);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: 14px;
          padding: 0.9rem 1rem;
          flex-wrap: wrap;
        }
        .creator-invite-orb {
          position: absolute;
          width: 160px; height: 160px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.18), transparent 70%);
          top: -70px; right: -50px;
          pointer-events: none;
          filter: blur(40px);
        }
        .creator-invite-left {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex: 1;
          min-width: 0;
        }
        .creator-invite-icon {
          width: 26px; height: 26px;
          flex-shrink: 0;
          color: #818cf8;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .creator-invite-icon :global(svg) { width: 26px; height: 26px; }
        .creator-invite-text {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }
        .creator-invite-title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .creator-invite-sub {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .creator-invite-actions {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .creator-invite-copy {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.3);
          color: #a5b4fc;
          border-radius: 8px;
          padding: 0.38rem 0.75rem;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .creator-invite-copy:hover { background: rgba(99,102,241,0.25); color: #c7d2fe; }
        .creator-invite-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          border-radius: 8px;
          padding: 0.38rem 0.85rem;
          font-size: 0.78rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
          transition: opacity 0.15s;
        }
        .creator-invite-btn:hover { opacity: 0.88; }
        @media (max-width: 480px) {
          .creator-invite-card { flex-direction: column; align-items: flex-start; }
          .creator-invite-actions { width: 100%; }
          .creator-invite-copy, .creator-invite-btn { flex: 1; text-align: center; }
        }

        @media (max-width: 480px) {
          .dashboard { gap: 1rem; }
          .hero-title { font-size: 1.3rem; }
          .hero-card { padding: 1.15rem; border-radius: 24px; }
          .hero-orb-1 {
            width: 150px;
            height: 150px;
            top: -48px;
            right: 0;
          }
          .hero-orb-3 {
            left: 0;
          }
          .rp-orb {
            width: 130px;
            height: 130px;
            right: 0;
          }
          .hero-content { align-items: flex-start; gap: 0.9rem; }
          .hero-avatar,
          .hero-avatar-creator { width: 58px; height: 58px; font-size: 1.35rem; }
          .hero-sub { font-size: 0.84rem; }
          .hero-pills { gap: 0.4rem; }
          .coins-pill,
          .earnings-pill,
          .agency-pill { padding: 0.45rem 0.75rem; }
          .coins-pill-label,
          .earnings-pill-label,
          .agency-pill-label { display: none; }
          .hero-start-live-btn { padding: 0.5rem 1rem; font-size: 0.8rem; }
          .content-section-heading h2 { font-size: 1.08rem; }
          .home-live-carousel {
            gap: 0.7rem;
            padding-right: 1.3rem;
          }
          .home-live-card {
            flex-basis: 82vw;
            min-height: 218px;
            border-radius: 22px;
          }
          .home-live-card-featured {
            flex-basis: 100%;
          }
          .home-live-media {
            height: 138px;
          }
          .connection-card {
            flex-basis: 76vw;
            padding: 0.62rem 0.68rem;
            border-radius: 18px;
            gap: 0.6rem;
          }
          :global(.connection-avatar) {
            width: 42px;
            height: 42px;
            min-width: 42px;
            border-radius: 15px;
          }
          .connection-title { font-size: 0.86rem; }
          .connection-subtitle { font-size: 0.74rem; }
          .connection-open { font-size: 0.72rem; }
          .compact-empty-state {
            padding: 0.65rem 0.75rem;
          }
        }

        /* ── Creator Panels ────────────────────────── */
        .creator-panels {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        @media (max-width: 768px) {
          .creator-panels { grid-template-columns: 1fr; }
        }

        .panel {
          background: linear-gradient(135deg, rgba(22,12,45,0.95) 0%, rgba(15,8,32,0.98) 100%);
          border: 1px solid rgba(139,92,246,0.18);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          backdrop-filter: blur(8px);
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .panel-header :global(svg) { width: 18px; height: 18px; color: var(--accent-3); }
        .panel-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .panel-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.01em;
          flex: 1;
        }
        .live-badge-label {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #fff;
          background: #ef4444;
          padding: 0.2rem 0.55rem;
          border-radius: 100px;
          animation: pulse-live 2s ease-in-out infinite;
        }
        @keyframes pulse-live {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }

        .agency-badge-on {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #34d399;
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.3);
          padding: 0.2rem 0.55rem;
          border-radius: 100px;
        }
        .agency-badge-off {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          background: rgba(156,163,175,0.08);
          border: 1px solid rgba(156,163,175,0.2);
          padding: 0.2rem 0.55rem;
          border-radius: 100px;
        }

        .panel-loading { display: flex; flex-direction: column; gap: 0.6rem; }

        /* Live active state */
        .live-active { display: flex; flex-direction: column; gap: 0.9rem; }
        .live-info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .live-title-text {
          font-weight: 600;
          color: var(--text);
          font-size: 0.9rem;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .viewer-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.25);
          color: #f87171;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.25rem 0.65rem;
          border-radius: 100px;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .viewer-chip :global(svg) { flex-shrink: 0; }

        .live-toggles {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.35rem 0.85rem;
          border-radius: 100px;
          border: 1px solid;
          cursor: pointer;
          transition: all var(--transition);
          background: transparent;
        }
        .toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .toggle-on {
          border-color: rgba(52,211,153,0.4);
          color: #34d399;
          background: rgba(52,211,153,0.08);
        }
        .toggle-on:hover:not(:disabled) {
          background: rgba(52,211,153,0.16);
          box-shadow: 0 0 12px rgba(52,211,153,0.2);
        }
        .toggle-off {
          border-color: rgba(156,163,175,0.3);
          color: var(--text-muted);
          background: rgba(156,163,175,0.05);
        }
        .toggle-off:hover:not(:disabled) {
          background: rgba(156,163,175,0.1);
        }

        .live-actions-row {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .btn-view-live {
          flex: 1;
          text-align: center;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(129,140,248,0.3);
          color: #818cf8;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all var(--transition);
          background: rgba(129,140,248,0.07);
        }
        .btn-view-live:hover {
          background: rgba(129,140,248,0.15);
          box-shadow: 0 0 14px rgba(129,140,248,0.2);
        }
        .btn-end-live {
          flex: 1;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(239,68,68,0.35);
          color: #f87171;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          background: rgba(239,68,68,0.08);
          transition: all var(--transition);
        }
        .btn-end-live:hover:not(:disabled) {
          background: rgba(239,68,68,0.18);
          box-shadow: 0 0 14px rgba(239,68,68,0.25);
        }
        .btn-end-live:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Live idle state */
        .live-idle {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 0.5rem 0;
        }
        .live-idle-text {
          color: var(--text-muted);
          font-size: 0.875rem;
        }
        .btn-start-live {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.75rem;
          border-radius: var(--radius-sm);
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          font-weight: 700;
          font-size: 0.95rem;
          letter-spacing: -0.01em;
          transition: all var(--transition);
          box-shadow: 0 0 24px rgba(239,68,68,0.35);
        }
        .btn-start-live:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 32px rgba(239,68,68,0.5);
        }
        .btn-start-live :global(svg) { width: 18px; height: 18px; }

        /* ── Earnings Panel ──────────────────────── */
        .earnings-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.65rem;
        }
        .stat-box {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-value {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text);
        }
        .stat-today   { color: #f59e0b; }
        .stat-usd     { color: #34d399; }
        .stat-agency  { color: #818cf8; }

        .payout-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(245,158,11,0.07);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: var(--radius-sm);
          padding: 0.55rem 0.85rem;
        }
        .payout-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f59e0b;
          flex-shrink: 0;
          animation: pulse-live 2s ease-in-out infinite;
        }
        .payout-text { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }
        .payout-state { color: #f59e0b; font-weight: 600; }

        .recent-gifts { display: flex; flex-direction: column; gap: 0.5rem; }
        .recent-gifts-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .gifts-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
        .gift-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.45rem 0.75rem;
          background: rgba(244,114,182,0.05);
          border: 1px solid rgba(244,114,182,0.12);
          border-radius: var(--radius-sm);
        }
        .gift-icon-label { font-size: 1.1rem; flex-shrink: 0; }
        .gift-detail { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
        .gift-name {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gift-sender { font-size: 0.72rem; color: var(--text-muted); }
        .gift-coins {
          font-size: 0.8rem;
          font-weight: 700;
          color: #f59e0b;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .earnings-actions {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .btn-earnings-link {
          flex: 1;
          text-align: center;
          padding: 0.55rem 0.75rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(139,92,246,0.25);
          color: var(--accent-3);
          font-size: 0.8rem;
          font-weight: 600;
          background: rgba(139,92,246,0.06);
          transition: all var(--transition);
          white-space: nowrap;
        }
        .btn-earnings-link:hover {
          background: rgba(139,92,246,0.14);
          box-shadow: 0 0 12px rgba(139,92,246,0.18);
        }

        /* ── Agency Panel ──────────────────────── */
        .agency-panel { border-color: rgba(99,102,241,0.2); }
        .agency-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.55rem;
        }
        .stat-agency-active { color: #34d399; }
        .stat-agency-pending { color: #f59e0b; }

        /* ── Exclusive Panel ───────────────────── */
        .exclusive-panel { border-color: rgba(139,92,246,0.25); }
        .exclusive-stat {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .exclusive-count {
          font-size: 2.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #e040fb, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
        }
        .exclusive-label {
          font-size: 0.85rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .btn-panel-action {
          display: block;
          text-align: center;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(99,102,241,0.3);
          color: #818cf8;
          font-size: 0.85rem;
          font-weight: 600;
          background: rgba(99,102,241,0.07);
          transition: all var(--transition);
          margin-top: auto;
        }
        .btn-panel-action:hover {
          background: rgba(99,102,241,0.15);
          box-shadow: 0 0 14px rgba(99,102,241,0.2);
        }
        .btn-panel-exclusive {
          border-color: rgba(139,92,246,0.3);
          color: var(--accent-3);
          background: rgba(139,92,246,0.07);
        }
        .btn-panel-exclusive:hover {
          background: rgba(139,92,246,0.15);
          box-shadow: 0 0 14px rgba(139,92,246,0.22);
        }

        /* ── Ranking Panel ── */
        .ranking-panel {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(22,12,45,0.97) 0%, rgba(15,8,32,0.99) 100%);
          border: 1px solid rgba(255,215,0,0.3);
          border-radius: var(--radius);
          padding: 1.5rem 1.75rem;
          box-shadow: var(--shadow), 0 0 50px rgba(255,215,0,0.08);
        }

        .rp-orb {
          position: absolute;
          top: -60px;
          right: -60px;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,215,0,0.1) 0%, transparent 70%);
          filter: blur(30px);
          pointer-events: none;
        }

        .rp-header { position: relative; }

        .rp-trophy {
          width: 18px;
          height: 18px;
          color: #fbbf24;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          animation: trophyBob 4s ease-in-out infinite;
        }
        .rp-trophy :global(svg) { width: 18px; height: 18px; }

        @keyframes trophyBob {
          0%, 100% { transform: rotate(-8deg) scale(1); }
          50%       { transform: rotate(8deg) scale(1.1); }
        }

        .rank-badge-label {
          margin-left: auto;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #ffd700;
          background: rgba(255,215,0,0.1);
          border: 1px solid rgba(255,215,0,0.3);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.65rem;
        }

        .rank-badge-podium {
          background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,140,0,0.15));
          border-color: rgba(255,215,0,0.6);
          box-shadow: 0 0 12px rgba(255,215,0,0.25);
          animation: rankGlow 2s ease-in-out infinite;
        }

        @keyframes rankGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(255,215,0,0.2); }
          50%       { box-shadow: 0 0 18px rgba(255,215,0,0.4); }
        }

        .rp-body {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-top: 1.25rem;
          flex-wrap: wrap;
        }

        .rp-rank-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          flex-shrink: 0;
        }

        .rp-rank-number {
          font-size: 3rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
          color: var(--text-muted);
          transition: color 0.3s;
        }

        .rp-rank-gold {
          background: linear-gradient(135deg, #ffd700, #ff8c00);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 0 10px rgba(255,215,0,0.4));
          animation: rankPulse 2.5s ease-in-out infinite;
        }

        .rp-rank-silver {
          background: linear-gradient(135deg, #e2e8f0, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .rp-rank-bronze {
          background: linear-gradient(135deg, #cd7f32, #92400e);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        @keyframes rankPulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(255,215,0,0.35)); }
          50%       { filter: drop-shadow(0 0 18px rgba(255,215,0,0.6)); }
        }

        .rp-rank-sub {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.02em;
          text-align: center;
          white-space: nowrap;
        }

        .rp-stats-row {
          display: flex;
          flex: 1;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .rp-stat-card {
          flex: 1;
          min-width: 130px;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          padding: 0.9rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .rp-stat-gifts {
          border-color: rgba(255,215,0,0.2);
          background: rgba(255,215,0,0.05);
        }

        .rp-stat-fan {
          border-color: rgba(167,139,250,0.25);
          background: rgba(167,139,250,0.05);
        }

        .rp-stat-empty { opacity: 0.6; }

        .rp-stat-icon {
          width: 16px;
          height: 16px;
          color: #fbbf24;
          display: inline-flex;
        }
        .rp-stat-icon :global(svg) { width: 16px; height: 16px; }

        .rp-stat-value {
          font-size: 1.4rem;
          font-weight: 900;
          color: #ffd700;
          letter-spacing: -0.02em;
          line-height: 1;
        }

        .rp-fan-name {
          font-size: 0.88rem;
          font-weight: 800;
          color: #a78bfa;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rp-empty-dash {
          color: var(--text-muted);
        }

        .rp-stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }

        .rp-period-chip {
          font-size: 0.55rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          padding: 0.1rem 0.35rem;
          border-radius: 100px;
        }

        .rp-period-daily {
          color: #fbbf24;
          background: rgba(251,191,36,0.15);
          border: 1px solid rgba(251,191,36,0.3);
        }

        .rp-fan-coins {
          color: #fbbf24;
          font-weight: 700;
        }

        .rp-psychology {
          margin-top: 0.6rem;
          padding: 0.6rem 0.85rem;
          background: rgba(224,64,251,0.08);
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          text-align: center;
        }

        .rp-see-all {
          display: inline-block;
          margin-top: 0.75rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: #e040fb;
          text-decoration: none;
          letter-spacing: 0.02em;
        }

        .rp-see-all:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
