"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { setToken, clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CARDS = [
  {
    href: "/explore",
    title: "Explorar",
    sub: "Descubre streamers y personas",
    icon: ExploreIcon,
    color: "indigo",
    size: "normal",
  },
  {
    href: "/matches",
    title: "Matches",
    sub: "Tus conexiones mutuas",
    icon: MatchIcon,
    color: "pink",
    size: "normal",
  },
  {
    href: "/live",
    title: "Directos",
    sub: "Ve transmisiones en tiempo real",
    icon: LiveIcon,
    color: "red",
    size: "normal",
  },
  {
    href: "/chats",
    title: "Chats",
    sub: "Tus conversaciones privadas",
    icon: ChatIcon,
    color: "cyan",
    size: "normal",
  },
  {
    href: "/coins",
    title: "Comprar monedas",
    sub: "Apoya a tus streamers favoritos",
    icon: CoinIcon,
    color: "orange",
    size: "normal",
  },
  {
    href: "/profile",
    title: "Mi perfil",
    sub: "Gestiona tu cuenta",
    icon: ProfileIcon,
    color: "purple",
    size: "normal",
  },
];

function ExploreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function MatchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}
function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/>
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function BroadcastIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}
function StudioIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
    </svg>
  );
}
function EarningsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  );
}
function PrivateCallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.05 5A5 5 0 0119 8.95M15.05 1A9 9 0 0123 8.94m-1 7.98v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.17 19.79 19.79 0 01.1 .5 2 2 0 012.11-1.5h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 6.5a16 16 0 006.59 6.59l.94-.94a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0121.07 14.5z"/>
    </svg>
  );
}
function ExclusiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
function CreatorRequestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}
function PendingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
function AgencyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

const COLOR_MAP = {
  indigo: { bg: "rgba(129,140,248,0.08)", border: "rgba(129,140,248,0.2)", glow: "rgba(129,140,248,0.3)", icon: "#818cf8" },
  pink:   { bg: "rgba(244,114,182,0.08)", border: "rgba(244,114,182,0.2)", glow: "rgba(244,114,182,0.3)", icon: "#f472b6" },
  cyan:   { bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.2)",  glow: "rgba(34,211,238,0.3)",  icon: "#22d3ee" },
  orange: { bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.2)",  glow: "rgba(251,146,60,0.3)",  icon: "#fb923c" },
  purple: { bg: "rgba(224,64,251,0.08)",  border: "rgba(224,64,251,0.2)",  glow: "rgba(224,64,251,0.3)",  icon: "#e040fb" },
  red:    { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)", glow: "rgba(248,113,113,0.3)", icon: "#f87171" },
  green:  { bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)",  glow: "rgba(52,211,153,0.3)",  icon: "#34d399" },
};

// Approximate USD value per earned coin (based on retail coin packages)
const USD_PER_COIN = 0.008;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [creatorDash, setCreatorDash] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
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
        fetch("/api/auth/backend-token", { method: "POST" })
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
            return r.ok ? r.json() : null;
          })
          .then((data) => {
            if (data) {
              setUser(data);
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
    })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) {
          setUser(data);
          if (data.onboardingComplete === false) {
            router.replace("/onboarding");
          }
        }
      })
      .catch(() => {
        // Network error – show a placeholder so the page still renders.
        setUser({
          username:
            session?.user?.name ||
            session?.user?.email?.split("@")[0] ||
            "Usuario",
          coins: 0,
          role: "user",
        });
      })
      .finally(() => setUserLoading(false));
  }, [status, session, router]);

  useEffect(() => {
    if (!user || user.role !== "creator" || user.creatorStatus !== "approved") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setDashLoading(true);
    fetch(`${API_URL}/api/creator/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setCreatorDash(data); })
      .catch(() => {})
      .finally(() => setDashLoading(false));
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
          <div className="skeleton" style={{ width: 64, height: 64, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
            <div className="skeleton" style={{ width: "200px", height: 24 }} />
            <div className="skeleton" style={{ width: "160px", height: 16 }} />
          </div>
        </div>
        <div className="cards-grid">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: "var(--radius)" }} />
          ))}
        </div>
        <style jsx>{`
          .dashboard { display: flex; flex-direction: column; gap: 1.75rem; }
          .hero-skeleton { display: flex; align-items: center; gap: 1.25rem; padding: 2rem; background: rgba(15,8,32,0.6); border: 1px solid var(--border); border-radius: var(--radius); }
          .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
        `}</style>
      </div>
    );
  }

  const displayName =
    user?.username ||
    user?.name ||
    session?.backendUser?.username ||
    session?.backendUser?.name ||
    session?.user?.name ||
    session?.user?.email?.split("@")[0] ||
    "Usuario";
  const isCreator = user?.role === "creator";
  const creatorStatus = user?.creatorStatus || "none";

  const isApprovedCreator = isCreator && creatorStatus === "approved";

  // "Transmitir" is available to all authenticated users (not shown to approved creators – they use the Live Control Panel)
  const streamCard = !isApprovedCreator
    ? [{ href: "/live/start", title: "Transmitir", sub: "Inicia tu directo ahora", icon: BroadcastIcon, color: "red", size: "normal" }]
    : [];

  // Monetization tools are only available to approved creators
  // (approved creators now see these in the panels + quick actions, not the cards grid)
  const creatorCards = isApprovedCreator
    ? [
        { href: "/creator",       title: "Mis ganancias",       sub: "Consulta tus ingresos",               icon: EarningsIcon,    color: "green",  size: "normal" },
        { href: "/gifts",         title: "Mis regalos",         sub: "Regalos recibidos de tus fans",       icon: GiftIcon,        color: "pink",   size: "normal" },
        { href: "/private-calls", title: "Sesiones privadas",   sub: "Llamadas privadas de pago",           icon: PrivateCallIcon, color: "cyan",   size: "normal" },
        { href: "/exclusive",     title: "Contenido exclusivo", sub: "Publica contenido para suscriptores", icon: ExclusiveIcon,   color: "purple", size: "normal" },
        ...(user?.agencyProfile?.enabled
          ? [{ href: "/agency", title: "Mi Agencia", sub: "Gestiona sub-creadores y comisiones", icon: AgencyIcon, color: "indigo", size: "normal" }]
          : []),
      ]
    : [];

  const requestCard =
    !isCreator && creatorStatus === "none"
      ? [{ href: "/creator-request", title: "Solicitar ser creador", sub: "Aplica para monetizar tus directos y ganar", icon: CreatorRequestIcon, color: "green", size: "normal", _noNav: false }]
      : [];

  const pendingCard =
    !isCreator && creatorStatus === "pending"
      ? [{ href: "#", title: "Solicitud pendiente", sub: "Tu solicitud de creador está en revisión", icon: PendingIcon, color: "orange", size: "normal", _disabled: true }]
      : [];

  const rejectedCard =
    !isCreator && creatorStatus === "rejected"
      ? [{ href: "/creator-request", title: "Solicitar ser creador", sub: "Rechazada. Vuelve a aplicar.", icon: CreatorRequestIcon, color: "green", size: "normal" }]
      : [];

  // Approved creators get their tool access via the Quick Actions section; show only nav cards below
  const allCards = isApprovedCreator
    ? [...CARDS]
    : [...CARDS, ...streamCard, ...creatorCards, ...requestCard, ...pendingCard, ...rejectedCard];

  return (
    <div className="dashboard">
      {/* Hero welcome card */}
      <div className={`hero-card${isApprovedCreator ? " hero-card-creator" : ""}`}>
        <div className="hero-bg-orb hero-orb-1" />
        <div className="hero-bg-orb hero-orb-2" />
        {isApprovedCreator && <div className="hero-bg-orb hero-orb-3" />}
        <div className="hero-content">
          <div className={`hero-avatar${isApprovedCreator ? " hero-avatar-creator" : ""}`}>
            {displayName[0].toUpperCase()}
          </div>
          <div className="hero-text">
            <div className="hero-badges">
              {isApprovedCreator && (
                <>
                  <span className="badge-creator">⭐ CREATOR</span>
                  <span className="badge-status">✓ APROBADO</span>
                </>
              )}
            </div>
            <h1 className="hero-title">
              {isApprovedCreator ? (
                <>¡Hola, <span className="hero-name">{displayName}</span>! 🎬</>
              ) : (
                <>¡Hola, <span className="hero-name">{displayName}</span>! 👋</>
              )}
            </h1>
            <p className="hero-sub">
              {isApprovedCreator ? "Tu centro de control de creador" : "Bienvenido/a de nuevo a MeetYouLive"}
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
            {isApprovedCreator && user && (
              <div className="earnings-pill">
                <span className="earnings-pill-icon">💰</span>
                <span className="earnings-pill-value">{user.earningsCoins ?? 0}</span>
                <span className="earnings-pill-label">ganancias</span>
              </div>
            )}
            {isApprovedCreator && (user?.agencyEarningsCoins ?? 0) > 0 && (
              <div className="agency-pill">
                <span className="agency-pill-icon">🏢</span>
                <span className="agency-pill-value">{user.agencyEarningsCoins}</span>
                <span className="agency-pill-label">agencia</span>
              </div>
            )}
            {isApprovedCreator && (
              <Link href="/live/start" className="hero-start-live-btn">
                <BroadcastIcon />
                Iniciar live
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Navigation cards grid */}
      {!isApprovedCreator && (
        <div className="stream-notice">
          📡 Transmites como usuario normal.{" "}
          <a href="/creator-request">Solicita acceso creator</a> para monetizar tus directos.
        </div>
      )}

      {/* ── LIVE CONTROL PANEL (approved creators only) ── */}
      {isApprovedCreator && (
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
                      🪙 {creatorDash?.todayCoins ?? 0}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Total ganancias</span>
                    <span className="stat-value">
                      🪙 {creatorDash?.earningsCoins ?? 0}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Ganancias agencia</span>
                    <span className="stat-value stat-agency">
                      🏢 {creatorDash?.agencyEarningsCoins ?? 0}
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
                      Pago pendiente: <strong>🪙 {creatorDash.pendingPayout.amountCoins}</strong>
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
                          <span className="gift-coins">+{g.creatorShare} 🪙</span>
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

      {/* ── QUICK ACTIONS (approved creators only) ── */}
      {isApprovedCreator && (
        <div className="quick-actions-section">
          <h2 className="section-label">Acciones rápidas</h2>
          <div className="quick-actions-grid">
            <Link href="/live/start" className="qa-tile qa-live">
              <span className="qa-icon"><BroadcastIcon /></span>
              <span className="qa-title">Iniciar live</span>
            </Link>
            <Link href="/creator" className="qa-tile qa-earnings">
              <span className="qa-icon"><EarningsIcon /></span>
              <span className="qa-title">Ganancias</span>
            </Link>
            <Link href="/creator" className="qa-tile qa-payouts">
              <span className="qa-icon"><CoinIcon /></span>
              <span className="qa-title">Pagos</span>
            </Link>
            <Link href="/agency" className="qa-tile qa-agency">
              <span className="qa-icon"><AgencyIcon /></span>
              <span className="qa-title">Agency</span>
            </Link>
            <Link href="/exclusive" className="qa-tile qa-exclusive">
              <span className="qa-icon"><ExclusiveIcon /></span>
              <span className="qa-title">Exclusivo</span>
            </Link>
            <Link href="/private-calls" className="qa-tile qa-calls">
              <span className="qa-icon"><PrivateCallIcon /></span>
              <span className="qa-title">Llamadas</span>
            </Link>
          </div>
        </div>
      )}

      <div className="cards-grid">
        {allCards.map((card) => {
          const Icon = card.icon;
          const c = COLOR_MAP[card.color];
          if (card._disabled) {
            return (
              <div
                key={card.href + card.title}
                className="dash-card dash-card-disabled"
                style={{ "--c-bg": c.bg, "--c-border": c.border, "--c-glow": c.glow, "--c-icon": c.icon }}
              >
                <div className="dash-card-icon-wrap">
                  <Icon />
                </div>
                <div className="dash-card-body">
                  <div className="dash-card-title">{card.title}</div>
                  <div className="dash-card-sub">{card.sub}</div>
                </div>
              </div>
            );
          }
          return (
            <Link
              key={card.href}
              href={card.href}
              className="dash-card"
              style={{ "--c-bg": c.bg, "--c-border": c.border, "--c-glow": c.glow, "--c-icon": c.icon }}
            >
              <div className="dash-card-icon-wrap">
                <Icon />
              </div>
              <div className="dash-card-body">
                <div className="dash-card-title">{card.title}</div>
                <div className="dash-card-sub">{card.sub}</div>
              </div>
              <span className="dash-card-arrow">
                <ArrowIcon />
              </span>
            </Link>
          );
        })}
      </div>

      <style jsx>{`
        .dashboard { display: flex; flex-direction: column; gap: 1.75rem; }

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
        .earnings-pill-icon { font-size: 0.9rem; line-height: 1; }
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
        .agency-pill-icon { font-size: 0.9rem; line-height: 1; }
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
        .stream-notice {
          background: rgba(129,140,248,0.08);
          border: 1px solid rgba(129,140,248,0.22);
          color: var(--text-muted);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1.1rem;
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .stream-notice a {
          color: var(--accent-3);
          text-decoration: underline;
          font-weight: 600;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 1rem;
        }

        .dash-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.4rem 1.5rem;
          cursor: pointer;
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition), background var(--transition);
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--c-border, var(--border));
          border-radius: var(--radius);
          position: relative;
          overflow: hidden;
        }

        .dash-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--c-bg, transparent);
          opacity: 0;
          transition: opacity var(--transition);
        }

        .dash-card:hover::before { opacity: 1; }

        .dash-card:hover {
          transform: translateY(-4px);
          border-color: var(--c-border);
          box-shadow: var(--shadow), 0 0 24px var(--c-glow, transparent);
        }

        .dash-card:hover .dash-card-arrow { opacity: 1; transform: translateX(0); }

        .dash-card-disabled {
          cursor: default;
          opacity: 0.7;
        }
        .dash-card-disabled:hover {
          transform: none;
          box-shadow: none;
        }
        .dash-card-disabled::before { display: none; }

        .dash-card-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-sm);
          background: var(--c-bg, rgba(255,255,255,0.05));
          border: 1px solid var(--c-border, var(--border));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--c-icon, var(--text-muted));
          flex-shrink: 0;
          position: relative;
          z-index: 1;
          transition: box-shadow var(--transition);
        }

        .dash-card-icon-wrap :global(svg) {
          width: 22px;
          height: 22px;
        }

        .dash-card:hover .dash-card-icon-wrap {
          box-shadow: 0 0 14px var(--c-glow, transparent);
        }

        .dash-card-body { flex: 1; position: relative; z-index: 1; }

        .dash-card-title {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
          letter-spacing: -0.01em;
        }

        .dash-card-sub {
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 0.22rem;
          line-height: 1.4;
        }

        .dash-card-arrow {
          color: var(--c-icon, var(--text-muted));
          opacity: 0;
          transform: translateX(-6px);
          transition: all var(--transition);
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .hero-title { font-size: 1.3rem; }
          .hero-card { padding: 1.5rem; }
          .hero-pills { gap: 0.4rem; }
          .hero-start-live-btn { padding: 0.5rem 1rem; font-size: 0.8rem; }
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

        /* ── Quick Actions ─────────────────────── */
        .quick-actions-section { display: flex; flex-direction: column; gap: 0.75rem; }

        .section-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0;
        }

        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 0.65rem;
        }
        @media (max-width: 700px) {
          .quick-actions-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 400px) {
          .quick-actions-grid { grid-template-columns: repeat(2, 1fr); }
        }

        .qa-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem 0.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(139,92,246,0.15);
          background: rgba(15,8,32,0.7);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition), background var(--transition);
          cursor: pointer;
          text-align: center;
          backdrop-filter: blur(6px);
        }
        .qa-tile:hover {
          transform: translateY(-3px);
          border-color: rgba(244,114,182,0.4);
          background: rgba(244,114,182,0.06);
          box-shadow: 0 0 20px rgba(244,114,182,0.15);
        }

        .qa-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qa-icon :global(svg) { width: 22px; height: 22px; }

        .qa-title {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: -0.01em;
        }

        .qa-live { border-color: rgba(239,68,68,0.2); }
        .qa-live:hover { border-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.06); box-shadow: 0 0 20px rgba(239,68,68,0.15); }
        .qa-live .qa-icon { color: #f87171; }
        .qa-live:hover .qa-title { color: #f87171; }

        .qa-earnings { border-color: rgba(52,211,153,0.2); }
        .qa-earnings:hover { border-color: rgba(52,211,153,0.4); background: rgba(52,211,153,0.06); box-shadow: 0 0 20px rgba(52,211,153,0.15); }
        .qa-earnings .qa-icon { color: #34d399; }
        .qa-earnings:hover .qa-title { color: #34d399; }

        .qa-payouts { border-color: rgba(245,158,11,0.2); }
        .qa-payouts:hover { border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.06); box-shadow: 0 0 20px rgba(245,158,11,0.15); }
        .qa-payouts .qa-icon { color: #f59e0b; }
        .qa-payouts:hover .qa-title { color: #f59e0b; }

        .qa-agency { border-color: rgba(99,102,241,0.2); }
        .qa-agency:hover { border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.06); box-shadow: 0 0 20px rgba(99,102,241,0.15); }
        .qa-agency .qa-icon { color: #818cf8; }
        .qa-agency:hover .qa-title { color: #818cf8; }

        .qa-exclusive { border-color: rgba(139,92,246,0.2); }
        .qa-exclusive:hover { border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.06); box-shadow: 0 0 20px rgba(139,92,246,0.15); }
        .qa-exclusive .qa-icon { color: var(--accent-3); }
        .qa-exclusive:hover .qa-title { color: var(--accent-3); }

        .qa-calls { border-color: rgba(34,211,238,0.2); }
        .qa-calls:hover { border-color: rgba(34,211,238,0.4); background: rgba(34,211,238,0.06); box-shadow: 0 0 20px rgba(34,211,238,0.15); }
        .qa-calls .qa-icon { color: #22d3ee; }
        .qa-calls:hover .qa-title { color: #22d3ee; }
      `}</style>
    </div>
  );
}

