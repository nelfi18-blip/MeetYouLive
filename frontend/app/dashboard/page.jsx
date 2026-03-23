"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { setToken, clearToken, getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CARDS = [
  {
    href: "/explore",
    title: "Explorar",
    sub: "Descubre streamers en vivo",
    icon: ExploreIcon,
    color: "indigo",
    size: "normal",
  },
  {
    href: "/live",
    title: "Directos",
    sub: "Ve transmisiones en tiempo real",
    icon: LiveIcon,
    color: "pink",
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
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);

  const backendToken = session?.backendToken ?? null;

  useEffect(() => {
    if (status === "loading") return;

    if (backendToken) {
      setToken(backendToken);
    }

    const token = getToken();
    if (!token) {
      if (status === "authenticated") {
        signOut({ callbackUrl: "/login" }).catch(() => {
          router.replace("/login");
        });
      } else {
        router.replace("/login");
      }
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) {
            clearToken();
            router.replace("/login");
          }
          return null;
        }
        return r.json();
      })
      .then((d) => { if (d) setUser(d); })
      .catch(() => {});
  }, [status, backendToken]);

  if (status === "loading") {
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

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const allCards = user?.role === "creator"
    ? [...CARDS, { href: "/live/start", title: "Iniciar directo", sub: "Comienza a transmitir en vivo", icon: BroadcastIcon, color: "red", size: "normal" }]
    : CARDS;

  return (
    <div className="dashboard">
      {/* Hero welcome card */}
      <div className="hero-card">
        <div className="hero-bg-orb hero-orb-1" />
        <div className="hero-bg-orb hero-orb-2" />
        <div className="hero-content">
          <div className="hero-avatar">
            {displayName[0].toUpperCase()}
          </div>
          <div className="hero-text">
            <h1 className="hero-title">
              ¡Hola, <span className="hero-name">{displayName}</span>! 👋
            </h1>
            <p className="hero-sub">Bienvenido/a de nuevo a MeetYouLive</p>
          </div>
          {user && (
            <Link href="/coins" className="coins-pill">
              <span className="coins-pill-icon">
                <CoinIcon />
              </span>
              <span className="coins-pill-value">{user.coins ?? 0}</span>
              <span className="coins-pill-label">monedas</span>
            </Link>
          )}
        </div>
      </div>

      {/* Navigation cards grid */}
      <div className="cards-grid">
        {allCards.map((card) => {
          const Icon = card.icon;
          const c = COLOR_MAP[card.color];
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

        .hero-text { flex: 1; min-width: 180px; }

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
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--accent-orange);
          line-height: 1;
        }
        .coins-pill-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* ── Cards grid ──────── */
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
          .coins-pill { margin-left: 0; }
          .hero-card { padding: 1.5rem; }
        }
      `}</style>
    </div>
  );
}

