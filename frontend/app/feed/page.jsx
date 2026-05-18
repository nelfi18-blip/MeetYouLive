"use client";

/**
 * /feed — clean mobile-first feed.
 *
 * Header (logo / coins / notifications / avatar) is provided globally by
 * <NavbarWrapper /> in app/layout.jsx. Bottom nav is provided globally by
 * <BottomNavWrapper />. This page renders ONLY the main content sections:
 *   1. Match card (dark purple gradient)
 *   2. Action buttons row (Like / Pass / Boost / Message)
 *   3. "Directos ahora" (live now) horizontal rail
 *   4. "Top creators" horizontal rail
 *
 * No InteractionBar, no swipe deck, no floating initials, no orange/yellow,
 * no legacy widgets.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const FETCH_TIMEOUT_MS = 10000;

// Brand-safe gradients for avatar fallbacks (purples / pinks / cyans only —
// never orange/yellow). Keep this list local so we never pick up the shared
// helper that includes warm colors.
const BRAND_GRADIENTS = [
  "linear-gradient(135deg, #6d28d9 0%, #ec4899 100%)",
  "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #be185d 0%, #6d28d9 100%)",
  "linear-gradient(135deg, #1e1b4b 0%, #7c3aed 100%)",
];

function gradientFor(seed = "") {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return BRAND_GRADIENTS[hash % BRAND_GRADIENTS.length];
}

function initialOf(name = "") {
  const trimmed = String(name).trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function resolveImage(src) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return `${API_URL}${src}`;
  return `${API_URL}/${src}`;
}

// ---------- Inline SVG icons (no emoji) -----------------------------------

function IconHeart({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function IconPass({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function IconBoost({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconMessage({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconLive({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

// ---------- Page ----------------------------------------------------------

export default function FeedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [lives, setLives] = useState([]);
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/feed");
    }
  }, [status, router]);

  // Fetch feed data (lives + featured creators)
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!API_URL) {
      setError("Configuración faltante.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = { "Content-Type": "application/json" };
        if (session?.backendToken) {
          headers.Authorization = `Bearer ${session.backendToken}`;
        }
        const res = await fetch(`${API_URL}/api/feed`, {
          headers,
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const rawLives = Array.isArray(data?.activeLives) ? data.activeLives : [];
        const rawCreators = Array.isArray(data?.featuredCreators) ? data.featuredCreators : [];
        // Only keep entries with a usable id so navigation always targets a
        // real resource (no silent fallbacks to /explore or /ranking).
        setLives(rawLives.filter((l) => l && (l._id || l.id)));
        setCreators(rawCreators.filter((c) => c && (c._id || c.id)));
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "AbortError") {
          setError("La conexión está tardando demasiado. Intenta de nuevo.");
        } else {
          setError("No pudimos cargar tu feed. Intenta de nuevo.");
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [status, session?.backendToken]);

  return (
    <div className="clean-feed">
      {/* 1. Match card */}
      <section className="match-card" aria-label="Encuentra tu match">
        <div className="match-avatar" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h1 className="match-title">Encuentra tu match</h1>
        <p className="match-sub">Perfiles compatibles aparecerán aquí</p>
      </section>

      {/* 2. Action buttons row */}
      <nav className="action-row" aria-label="Acciones rápidas">
        <Link href="/matches" className="action-btn action-like">
          <span className="action-ic"><IconHeart /></span>
          <span className="action-lbl">Like</span>
        </Link>
        <Link href="/explore" className="action-btn action-pass">
          <span className="action-ic"><IconPass /></span>
          <span className="action-lbl">Pass</span>
        </Link>
        <Link href="/coins" className="action-btn action-boost">
          <span className="action-ic"><IconBoost /></span>
          <span className="action-lbl">Boost</span>
        </Link>
        <Link href="/chats" className="action-btn action-msg">
          <span className="action-ic"><IconMessage /></span>
          <span className="action-lbl">Message</span>
        </Link>
      </nav>

      {/* 3. Directos ahora */}
      <section className="rail-section" aria-label="Directos ahora">
        <div className="rail-header">
          <h2 className="rail-title">Directos ahora</h2>
          <Link href="/explore" className="rail-link">Ver todo</Link>
        </div>
        {loading ? (
          <div className="rail-skeleton">
            <div className="skel-card" />
            <div className="skel-card" />
            <div className="skel-card" />
          </div>
        ) : error ? (
          <p className="rail-empty">{error}</p>
        ) : lives.length === 0 ? (
          <p className="rail-empty">No hay directos en este momento.</p>
        ) : (
          <div className="rail">
            {lives.map((live, idx) => {
              const liveId = String(live._id || live.id);
              const u = live.user || {};
              const name = u.name || live.title || "Creador";
              const img = resolveImage(live.thumbnail || u.avatar || "");
              return (
                <Link
                  key={`${liveId}-${idx}`}
                  href={`/live/${liveId}`}
                  className="rail-card"
                >
                  <div className="rail-thumb" style={{ background: gradientFor(name) }}>
                    {img ? (
                      <img
                        src={img}
                        alt={name}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <span className="rail-initial">{initialOf(name)}</span>
                    )}
                    <span className="rail-live-pill">
                      <IconLive /> LIVE
                    </span>
                  </div>
                  <div className="rail-meta">
                    <span className="rail-name">{name}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Top creators */}
      <section className="rail-section" aria-label="Top creators">
        <div className="rail-header">
          <h2 className="rail-title">Top creators</h2>
          <Link href="/ranking" className="rail-link">Ver todo</Link>
        </div>
        {loading ? (
          <div className="rail-skeleton">
            <div className="skel-card" />
            <div className="skel-card" />
            <div className="skel-card" />
          </div>
        ) : creators.length === 0 ? (
          <p className="rail-empty">Aún no hay creadores destacados.</p>
        ) : (
          <div className="rail">
            {creators.map((c, idx) => {
              const id = String(c._id || c.id);
              const name = c.name || c.username || "Creador";
              const img = resolveImage(c.avatar || "");
              return (
                <Link
                  key={`${id}-${idx}`}
                  href={`/profile/${id}`}
                  className="rail-card"
                >
                  <div className="rail-thumb" style={{ background: gradientFor(name) }}>
                    {img ? (
                      <img
                        src={img}
                        alt={name}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <span className="rail-initial">{initialOf(name)}</span>
                    )}
                  </div>
                  <div className="rail-meta">
                    <span className="rail-name">{name}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <style jsx>{`
        .clean-feed {
          width: 100%;
          max-width: 720px;
          margin: 0 auto;
          padding: 16px 16px 120px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          color: #f5f3ff;
        }

        /* 1. Match card */
        .match-card {
          background: linear-gradient(160deg, #1e1b4b 0%, #4c1d95 55%, #6d28d9 100%);
          border-radius: 24px;
          padding: 28px 22px;
          text-align: center;
          box-shadow: 0 12px 40px rgba(76, 29, 149, 0.35);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .match-avatar {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.5);
        }
        .match-title {
          margin: 4px 0 0;
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.2px;
        }
        .match-sub {
          margin: 0;
          font-size: 14px;
          color: rgba(245, 243, 255, 0.78);
        }

        /* 2. Action row */
        .action-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 14px 6px;
          border-radius: 18px;
          background: rgba(30, 27, 75, 0.55);
          border: 1px solid rgba(124, 58, 237, 0.25);
          color: #f5f3ff;
          text-decoration: none;
          transition: transform 0.15s ease, background 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .action-btn:active { transform: scale(0.96); }
        .action-ic {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }
        .action-like .action-ic { background: linear-gradient(135deg, #ec4899, #be185d); }
        .action-pass .action-ic { background: linear-gradient(135deg, #475569, #1e293b); }
        .action-boost .action-ic { background: linear-gradient(135deg, #7c3aed, #4c1d95); }
        .action-msg .action-ic { background: linear-gradient(135deg, #06b6d4, #7c3aed); }
        .action-lbl {
          font-size: 12px;
          font-weight: 600;
          color: rgba(245, 243, 255, 0.9);
        }

        /* 3 + 4. Rails */
        .rail-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .rail-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 0 2px;
        }
        .rail-title {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          color: #fff;
        }
        .rail-link {
          font-size: 13px;
          font-weight: 600;
          color: #c4b5fd;
          text-decoration: none;
        }
        .rail {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding: 2px 2px 8px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .rail::-webkit-scrollbar { display: none; }
        .rail-card {
          flex: 0 0 140px;
          scroll-snap-align: start;
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .rail-thumb {
          position: relative;
          width: 140px;
          height: 180px;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
        }
        .rail-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .rail-initial {
          font-size: 2.5rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.92);
        }
        .rail-live-pill {
          position: absolute;
          top: 8px;
          left: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #fff;
          background: #dc2626;
          border-radius: 999px;
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
        }
        .rail-meta {
          padding: 0 4px;
        }
        .rail-name {
          font-size: 13px;
          font-weight: 600;
          color: #f5f3ff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }
        .rail-empty {
          margin: 4px 2px 0;
          font-size: 13px;
          color: rgba(245, 243, 255, 0.6);
        }
        .rail-skeleton {
          display: flex;
          gap: 12px;
          padding: 2px;
        }
        .skel-card {
          flex: 0 0 140px;
          height: 180px;
          border-radius: 16px;
          background: linear-gradient(
            90deg,
            rgba(76, 29, 149, 0.25) 0%,
            rgba(124, 58, 237, 0.35) 50%,
            rgba(76, 29, 149, 0.25) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.4s linear infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (min-width: 768px) {
          .clean-feed { padding: 24px 24px 80px; gap: 24px; }
          .match-card { padding: 36px 28px; }
          .match-title { font-size: 26px; }
        }
      `}</style>
    </div>
  );
}
