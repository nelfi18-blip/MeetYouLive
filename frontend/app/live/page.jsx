"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import LiveActivityFeed from "@/components/LiveActivityFeed";
import { notify } from "@/lib/notify";
import { filterActiveLives } from "@/lib/liveFilters";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TRENDING_COUNT = 3;
const POLL_INTERVAL_MS = 20000;
const CATEGORIES = ["Todos", "Música", "Gaming", "Chat", "Dating"];
const CAT_ICONS = {
  Todos: "🌐",
  Música: "🎵",
  Gaming: "🎮",
  Chat: "💬",
  Dating: "💕",
};

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [newLiveIds, setNewLiveIds] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const knownIdsRef = useRef(null);

  const fetchLives = async (isInitial = false) => {
    try {
      const res = await fetch(`${API_URL}/api/lives`);
      if (!res.ok) throw new Error("Error al cargar directos");
      const data = await res.json();
      
      // Apply frontend safety filter
      const safeLives = filterActiveLives(data);
      
      const fresh = safeLives
        .filter((live) => live && live._id)
        .map((live) => ({
          ...live,
          title:
            typeof live.title === "string" && live.title.trim()
              ? live.title.trim()
              : "Directo en vivo",
          viewerCount: Number.isFinite(live.viewerCount) ? Math.max(0, live.viewerCount) : 0,
          giftsTotal: Number.isFinite(live.giftsTotal) ? Math.max(0, live.giftsTotal) : 0,
        }));
      const freshIds = fresh.map((l) => String(l._id));

      if (knownIdsRef.current === null) {
        // First load — just store IDs, don't fire notifications
        knownIdsRef.current = freshIds;
        setLives(fresh);
      } else {
        // Subsequent polls — detect genuinely new lives
        const added = freshIds.filter((id) => !knownIdsRef.current.includes(id));
        const changed = added.length > 0 || fresh.length !== knownIdsRef.current.length;
        knownIdsRef.current = freshIds;
        if (changed) {
          setLives(fresh);
        }
        if (added.length > 0) {
          setNewLiveIds(added);
          // Trigger in-app notification for each new live (up to 2)
          added.slice(0, 2).forEach((id) => {
            const live = fresh.find((l) => String(l._id) === id);
            if (!live) return;
            const username = live.user?.username || live.user?.name || "Un creador";
            notify({
              icon: "🔥",
              message: `${username} acaba de iniciar un live`,
              href: `/live/${id}`,
              actionLabel: "Entrar al live",
              duration: 7000,
              dedupKey: `live_poll_${id}`,
            });
          });
        }
      }
    } catch {
      if (isInitial) setError("No se pudo cargar la lista de directos");
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLives(true);

    const pollTimer = setInterval(() => fetchLives(false), POLL_INTERVAL_MS);
    return () => clearInterval(pollTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredLives = useMemo(() => {
    let result = lives;

    if (category !== "Todos") {
      result = result.filter(
        (live) => (live.category || "").toLowerCase() === category.toLowerCase(),
      );
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((live) => {
        const title = live.title || "";
        const username = live.user?.username || live.user?.name || "";
        return title.toLowerCase().includes(query) || username.toLowerCase().includes(query);
      });
    }

    return result;
  }, [lives, category, search]);

  const trendingLives = filteredLives.slice(0, TRENDING_COUNT);
  const restLives = filteredLives.slice(TRENDING_COUNT);
  const totalViewers = filteredLives.reduce((sum, l) => sum + (l.viewerCount || 0), 0);
  const hasFilters = search.trim() || category !== "Todos";

  return (
    <div className="live-page">
      {/* ── Hero banner ── */}
      <div className="live-hero">
        <div className="live-hero-glow" />
        <div className="live-hero-content">
          <div className="live-hero-badge">
            <span className="live-hero-dot" />
            EN DIRECTO AHORA
          </div>
          <h1 className="live-hero-title">
            🔴 Directos en vivo
          </h1>
          <p className="live-hero-sub">
            {loading
              ? "Cargando transmisiones…"
              : lives.length > 0
                ? `${lives.length} directo${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""} ahora mismo`
                : "No hay directos en vivo ahora"}
          </p>
        </div>
        <div className="live-hero-actions">
          <Link href="/live/start" className="live-hero-start">
            🚀 Iniciar Live
          </Link>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      <section className="live-controls" aria-label="Filtros de directos en vivo">
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
            aria-label="Buscar streams en vivo"
            placeholder="Buscar streams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="category-bar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-pill${category === cat ? " active" : ""}`}
              onClick={() => setCategory(cat)}
            >
              <span className="cat-icon">{CAT_ICONS[cat]}</span>
              <span>{cat}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 🔴 LIVE ACTIVITY FEED — real-time events ── */}
      <LiveActivityFeed lives={lives} newLiveIds={newLiveIds} />

      {/* ── En vivo ahora — top 3 highlighted ── */}
      {(loading || trendingLives.length > 0) && (
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">🔴 En vivo ahora</h2>
            <span className="section-count">{loading ? "" : `${trendingLives.length} directo${trendingLives.length !== 1 ? "s" : ""}`}</span>
          </div>

          {!loading && filteredLives.length > 0 && (
            <div className="urgency-strip">
              <span className="urgency-pill urgency-clock">⏳ Live activo ahora</span>
              <span className="urgency-pill urgency-fire">🔥 Únete antes que termine</span>
              {totalViewers > 0 && (
                <span className="urgency-pill urgency-chat">💬 {totalViewers} personas dentro</span>
              )}
            </div>
          )}

          <div className="trending-grid">
            {loading
              ? [...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 240, borderRadius: "var(--radius)" }} />
                ))
              : trendingLives.map((live) => (
                  <LiveCard key={live._id} live={live} />
                ))}
          </div>
        </section>
      )}

      {/* ── Otros directos en vivo ── */}
      {!loading && restLives.length > 0 && (
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">🚀 Otros directos en vivo</h2>
          </div>
          <div className="streams-grid">
            {restLives.map((live) => (
              <LiveCard key={live._id} live={live} />
            ))}
          </div>
        </section>
      )}

      {!loading && filteredLives.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-glow" />

          <div className="empty-icon-wrap">
            <span className="empty-icon-emoji">🎥</span>
          </div>

          <h3 className="empty-title">Sin resultados</h3>
          <p className="empty-sub">
            {hasFilters && lives.length > 0
              ? "No hay streams que coincidan con tu búsqueda."
              : "No hay streams en vivo ahora"}
          </p>

          <div className="empty-actions">
            <Link href="/live/start" className="btn-start-live">
              🚀 Iniciar Live
            </Link>
            <Link href="/feed" className="btn-feed-alt">
              Ir al Feed
            </Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .live-page { display: flex; flex-direction: column; gap: 2rem; }

        /* Hero */
        .live-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.75rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(224,64,251,0.22);
          background: linear-gradient(135deg, rgba(30,8,55,0.95) 0%, rgba(14,4,32,0.98) 100%);
          overflow: hidden;
          flex-wrap: wrap;
        }

        .live-hero-glow {
          position: absolute;
          top: -60px;
          left: -40px;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(224,64,251,0.18) 0%, transparent 65%);
          pointer-events: none;
        }

        .live-hero-content {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          position: relative;
          z-index: 1;
        }

        .live-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.65rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: #ef4444;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          width: fit-content;
        }

        .live-hero-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ef4444;
          animation: heroDotPulse 1.4s infinite;
          flex-shrink: 0;
        }

        @keyframes heroDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.75); }
        }

        .live-hero-title {
          font-size: 1.6rem;
          font-weight: 900;
          background: linear-gradient(135deg, #fff 30%, #c084fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.2;
        }

        .live-hero-sub {
          font-size: 0.875rem;
          color: var(--text-muted);
          margin: 0;
        }

        .live-hero-actions {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }

        .live-hero-start {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
          text-decoration: none;
          letter-spacing: 0.02em;
          box-shadow: 0 0 18px rgba(224,64,251,0.35);
          transition: box-shadow 0.2s, transform 0.15s;
        }

        .live-hero-start:hover {
          box-shadow: 0 0 30px rgba(224,64,251,0.55);
          transform: translateY(-2px);
        }

        .live-hero-start:active {
          transform: scale(0.97);
        }

        .live-hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          border: 1px solid rgba(139,92,246,0.4);
          background: rgba(139,92,246,0.1);
          color: #c4b5fd;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
        }

        .live-hero-cta:hover {
          background: rgba(139,92,246,0.22);
          border-color: rgba(139,92,246,0.65);
          box-shadow: 0 0 16px rgba(139,92,246,0.25);
        }

        /* Controls */
        .live-controls {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .search-wrap {
          position: relative;
          width: min(100%, 420px);
        }

        .search-icon-inner {
          position: absolute;
          left: 0.9rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim);
          display: flex;
          pointer-events: none;
        }

        .search-input {
          padding-left: 2.4rem !important;
        }

        .category-bar {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .cat-pill {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.42rem 1rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
        }

        .cat-pill:hover {
          color: var(--text);
        }

        .cat-pill.active {
          background: rgba(224,64,251,0.12);
          border-color: rgba(224,64,251,0.3);
          color: var(--accent-2);
          box-shadow: 0 0 10px rgba(224,64,251,0.15);
        }

        .cat-icon {
          font-size: 0.9rem;
        }

        /* Urgency strip */
        .urgency-strip {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .urgency-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 0.24rem 0.7rem;
          border-radius: 999px;
          white-space: nowrap;
        }

        .urgency-clock {
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          color: #fde68a;
        }

        .urgency-fire {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.28);
          color: #fca5a5;
        }

        .urgency-chat {
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.28);
          color: #c4b5fd;
        }

        /* Section blocks */
        .section-block {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
        }

        .section-count {
          font-size: 0.75rem;
          color: var(--text-dim);
          font-weight: 500;
        }

        /* Trending grid (3 cols desktop) */
        .trending-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }

        @media (min-width: 640px) {
          .trending-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 900px) {
          .trending-grid { grid-template-columns: repeat(3, 1fr); }
        }

        /* All streams grid */
        .streams-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }

        @media (min-width: 640px) {
          .streams-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .streams-grid { grid-template-columns: repeat(3, 1fr); }
        }

        /* Error / empty */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .empty-state {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 4rem 2rem 3rem;
          text-align: center;
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: var(--radius);
          background: linear-gradient(135deg, rgba(30,8,55,0.6) 0%, rgba(14,4,32,0.7) 100%);
          overflow: hidden;
        }

        .empty-glow {
          position: absolute;
          top: -80px;
          left: 50%;
          transform: translateX(-50%);
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(224,64,251,0.12) 0%, transparent 65%);
          pointer-events: none;
        }

        .empty-icon-wrap {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }

        .empty-icon-emoji {
          font-size: 2rem;
          line-height: 1;
          animation: emptyIconPulse 3s ease-in-out infinite;
        }

        @keyframes emptyIconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }

        .empty-title {
          color: var(--text);
          font-size: 1.25rem;
          font-weight: 900;
          margin: 0;
          position: relative;
          z-index: 1;
        }

        .empty-sub {
          color: var(--text-muted);
          font-size: 0.925rem;
          margin: 0;
          position: relative;
          z-index: 1;
        }

        .empty-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          position: relative;
          z-index: 1;
        }

        .btn-start-live {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.65rem 1.5rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #e040fb, #8b5cf6);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 800;
          text-decoration: none;
          letter-spacing: 0.02em;
          box-shadow: 0 0 22px rgba(224,64,251,0.35);
          transition: box-shadow 0.2s, transform 0.15s;
        }

        .btn-start-live:hover {
          box-shadow: 0 0 36px rgba(224,64,251,0.55);
          transform: translateY(-2px);
        }

        .btn-start-live:active {
          transform: scale(0.97);
        }

        .btn-feed-alt {
          display: inline-flex;
          align-items: center;
          padding: 0.65rem 1.25rem;
          border-radius: 999px;
          border: 1px solid rgba(139,92,246,0.35);
          background: rgba(139,92,246,0.08);
          color: #c4b5fd;
          font-size: 0.85rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.18s;
        }

        .btn-feed-alt:hover {
          background: rgba(139,92,246,0.18);
          border-color: rgba(139,92,246,0.55);
        }
      `}</style>
    </div>
  );
}
