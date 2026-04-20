"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import FeaturedCreators from "@/components/FeaturedCreators";
import ActivityBar from "@/components/ActivityBar";
import LiveActivityFeed from "@/components/LiveActivityFeed";
import { notify } from "@/lib/notify";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TRENDING_COUNT = 3;
const ONLINE_FLOOR = 12;
const POLL_INTERVAL_MS = 20000;

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [newLiveIds, setNewLiveIds] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(ONLINE_FLOOR);
  const knownIdsRef = useRef(null);

  const fetchLives = async (isInitial = false) => {
    try {
      const res = await fetch(`${API_URL}/api/lives`);
      if (!res.ok) throw new Error("Error al cargar directos");
      const data = await res.json();
      const fresh = (Array.isArray(data) ? data : [])
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

    fetch(`${API_URL}/api/stats/activity`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.onlineCount) setOnlineCount(Math.max(data.onlineCount, ONLINE_FLOOR));
      })
      .catch((err) => console.error("[LivePage] activity stats fetch failed:", err));

    const pollTimer = setInterval(() => fetchLives(false), POLL_INTERVAL_MS);
    return () => clearInterval(pollTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trendingLives = lives.slice(0, TRENDING_COUNT);
  const restLives = lives.slice(TRENDING_COUNT);
  const totalViewers = lives.reduce((sum, l) => sum + (l.viewerCount || 0), 0);

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
                ? `${lives.length} stream${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""} ahora mismo`
                : "No hay directos activos — vuelve pronto"}
          </p>
        </div>
        <div className="live-hero-actions">
          <Link href="/live/start" className="live-hero-start">
            🚀 Iniciar Live
          </Link>
          <Link href="/explore" className="live-hero-cta">
            🔥 Ver todos los lives →
          </Link>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {/* ── 📊 ACTIVITY SIGNALS — social proof ── */}
      <ActivityBar variant="strip" />

      {/* ── 🔴 LIVE ACTIVITY FEED — real-time events ── */}
      <LiveActivityFeed lives={lives} newLiveIds={newLiveIds} />

      {/* ── En vivo ahora — top 3 highlighted ── */}
      {(loading || trendingLives.length > 0) && (
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">🔴 En vivo ahora</h2>
            <span className="section-count">{loading ? "" : `${trendingLives.length} stream${trendingLives.length !== 1 ? "s" : ""}`}</span>
          </div>

          {!loading && lives.length > 0 && (
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

      {/* ── Nuevos creadores / rest ── */}
      {!loading && restLives.length > 0 && (
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">🚀 Nuevos creadores</h2>
          </div>
          <div className="streams-grid">
            {restLives.map((live) => (
              <LiveCard key={live._id} live={live} />
            ))}
          </div>
        </section>
      )}

      {!loading && lives.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-glow" />

          <div className="empty-icon-wrap">
            <span className="empty-icon-emoji">🎥</span>
          </div>

          <h3 className="empty-title">No hay directos ahora mismo</h3>
          <p className="empty-sub">💫 Sé el primero en comenzar uno y destacar</p>

          {/* FOMO indicators */}
          <div className="empty-fomo-row">
            <span className="fomo-pill fomo-fire" aria-label={`${onlineCount} personas conectadas ahora`}>🔥 {onlineCount} personas conectadas ahora</span>
            <span className="fomo-pill fomo-cam" role="status" aria-label="Nuevos lives pronto">🎥 Nuevos lives pronto</span>
          </div>

          <div className="empty-actions">
            <Link href="/live/start" className="btn-start-live">
              🚀 Iniciar Live
            </Link>
            <Link href="/explore" className="btn-explore-alt">
              Explorar creadores
            </Link>
          </div>

          <p className="empty-hint">También puedes ver vídeos recientes o seguir a tus creadores favoritos</p>
        </div>
      )}

      {/* ── Creator rankings / featured ── */}
      <section className="section-block">
        <div className="section-header">
          <h2 className="section-title">⭐ Creadores destacados</h2>
        </div>
        <FeaturedCreators />
      </section>

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

        .empty-fomo-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          justify-content: center;
          position: relative;
          z-index: 1;
        }

        .fomo-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.28rem 0.75rem;
          border-radius: 999px;
        }

        .fomo-fire {
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
        }

        .fomo-cam {
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.28);
          color: #c4b5fd;
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

        .btn-explore-alt {
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

        .btn-explore-alt:hover {
          background: rgba(139,92,246,0.18);
          border-color: rgba(139,92,246,0.55);
        }

        .empty-hint {
          color: var(--text-dim);
          font-size: 0.78rem;
          margin: 0;
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
