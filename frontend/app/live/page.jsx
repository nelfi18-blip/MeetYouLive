"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import LiveActivityFeed from "@/components/LiveActivityFeed";
import GiftPanel from "@/components/GiftPanel";
import { notify } from "@/lib/notify";
import { filterActiveLives } from "@/lib/liveFilters";
import { getDisplayName, getInitial, getUserImage } from "@/lib/imageHelpers";
import { RECENT_LIVE_WINDOW_MINUTES, RECENT_LIVE_WINDOW_MS } from "@/lib/liveUi";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL_MS = 20000;

const FILTERS = [
  { id: "popular", label: "Populares", icon: "🔥" },
  { id: "new", label: "Nuevos", icon: "✨" },
  { id: "near", label: "Cerca de mí", icon: "📍" },
  { id: "music", label: "Música", icon: "🎵", terms: ["musica", "música", "music"] },
  { id: "gaming", label: "Gaming", icon: "🎮", terms: ["gaming", "juegos", "games"] },
  { id: "lifestyle", label: "Lifestyle", icon: "🌙", terms: ["lifestyle", "vida", "chat"] },
  { id: "dating", label: "Dating", icon: "💕", terms: ["dating", "citas", "date"] },
  { id: "travel", label: "Viajes", icon: "✈️", terms: ["viajes", "travel", "trip"] },
  { id: "fitness", label: "Fitness", icon: "💪", terms: ["fitness", "gym", "fit"] },
  { id: "ai", label: "IA", icon: "🤖", terms: ["ia", "ai", "inteligencia"] },
  { id: "all", label: "Todos", icon: "🌐" },
];

function normalizeLive(live) {
  return {
    ...live,
    title:
      typeof live.title === "string" && live.title.trim()
        ? live.title.trim()
        : "Directo en vivo",
    viewerCount: Number.isFinite(Number(live.viewerCount)) ? Math.max(0, Number(live.viewerCount)) : 0,
    giftsTotal: Number.isFinite(Number(live.giftsTotal)) ? Math.max(0, Number(live.giftsTotal)) : 0,
  };
}

function isRecentLive(live) {
  const startedAt = live?.startedAt || live?.createdAt;
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() < RECENT_LIVE_WINDOW_MS;
}

function liveText(live) {
  return [
    live?.category,
    live?.title,
    live?.description,
    live?.language,
    live?.user?.username,
    live?.user?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasLocationHint(live) {
  return Boolean(
    live?.city ||
      live?.country ||
      live?.location ||
      live?.user?.city ||
      live?.user?.country ||
      live?.user?.location,
  );
}

function getDuration(live) {
  const startedAt = live?.startedAt || live?.createdAt;
  const started = startedAt ? new Date(startedAt).getTime() : NaN;
  if (!Number.isFinite(started)) return "Ahora";
  const minutes = Math.max(1, Math.floor((Date.now() - started) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [newLiveIds, setNewLiveIds] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("popular");
  const [search, setSearch] = useState("");
  const [token, setToken] = useState("");
  const [giftLive, setGiftLive] = useState(null);
  const knownIdsRef = useRef(null);

  const fetchLives = async (isInitial = false) => {
    try {
      const res = await fetch(`${API_URL}/api/lives`);
      if (!res.ok) throw new Error("Error al cargar directos");
      const data = await res.json();
      const fresh = filterActiveLives(data)
        .filter((live) => live && live._id)
        .map(normalizeLive);
      const freshIds = fresh.map((live) => String(live._id));

      if (knownIdsRef.current === null) {
        knownIdsRef.current = freshIds;
        setLives(fresh);
      } else {
        const added = freshIds.filter((id) => !knownIdsRef.current.includes(id));
        const changed = added.length > 0 || fresh.length !== knownIdsRef.current.length;
        knownIdsRef.current = freshIds;
        if (changed) setLives(fresh);
        if (added.length > 0) {
          setNewLiveIds(added);
          added.slice(0, 2).forEach((id) => {
            const live = fresh.find((item) => String(item._id) === id);
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
      setError("");
    } catch {
      if (isInitial) setError("No se pudo cargar la lista de directos");
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    setToken(localStorage.getItem("token") || sessionStorage.getItem("token") || "");
    fetchLives(true);
    const pollTimer = setInterval(() => fetchLives(false), POLL_INTERVAL_MS);
    return () => clearInterval(pollTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedLives = useMemo(() => {
    return [...lives].sort((a, b) => {
      const scoreA = (a.viewerCount || 0) * 3 + (a.giftsTotal || 0) + (a.isTrending ? 100 : 0);
      const scoreB = (b.viewerCount || 0) * 3 + (b.giftsTotal || 0) + (b.isTrending ? 100 : 0);
      return scoreB - scoreA;
    });
  }, [lives]);

  const featuredLive = sortedLives[0] || null;

  const filteredLives = useMemo(() => {
    const selected = FILTERS.find((filter) => filter.id === activeFilter) || FILTERS[0];
    let result = [...lives];

    if (selected.id === "popular") {
      result = sortedLives;
    } else if (selected.id === "new") {
      result = result.filter(isRecentLive);
    } else if (selected.id === "near") {
      result = result.filter(hasLocationHint);
    } else if (selected.id !== "all") {
      result = result.filter((live) => selected.terms?.some((term) => liveText(live).includes(term)));
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((live) => liveText(live).includes(query));
    }

    return result;
  }, [activeFilter, lives, search, sortedLives]);

  const liveCreators = useMemo(() => sortedLives.slice(0, 12), [sortedLives]);
  const totalViewers = lives.reduce((sum, live) => sum + (live.viewerCount || 0), 0);
  const activeFilterLabel = FILTERS.find((filter) => filter.id === activeFilter)?.label || "Populares";

  const handleShare = async (live) => {
    if (!live?._id) return;
    const url = `${window.location.origin}/live/${live._id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: live.title || "MeetYouLive",
          text: `Mira este live de @${getDisplayName(live.user)} en MeetYouLive`,
          url,
        });
      } else {
        await navigator.clipboard?.writeText(url);
        notify({ icon: "🔗", message: "Link del live copiado", duration: 2500 });
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        notify({ icon: "⚠️", message: "No se pudo compartir el live", duration: 2500 });
      }
    }
  };

  const openGiftPanel = (live) => {
    if (!live?.user?._id) return;
    setGiftLive(live);
  };

  return (
    <div className="live-page">
      <section className="premium-hero">
        <div className="hero-orb orb-a" />
        <div className="hero-orb orb-b" />
        <div className="hero-copy">
          <span className="hero-kicker"><span /> Live Rooms Premium</span>
          <h1>Descubre lives que se sienten vivos desde el primer segundo.</h1>
          <p>
            Salas en directo, creadores destacados y momentos con regalos, chat y actividad en tiempo real.
          </p>
          <div className="hero-stats">
            <span><strong>{lives.length}</strong> salas activas</span>
            <span><strong>{totalViewers}</strong> espectadores</span>
            <span><strong>{liveCreators.length}</strong> creadores live</span>
          </div>
        </div>
        <div className="hero-actions">
          <Link href="/live/start" className="hero-start">🚀 Iniciar Live</Link>
          <a href="#active-lives" className="hero-discover">Explorar salas</a>
        </div>
      </section>

      {error && <div className="banner-error">{error}</div>}

      <section className="featured-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Destacado</span>
            <h2>Lives más populares ahora</h2>
          </div>
          {featuredLive && <span className="live-now-chip">🔴 {featuredLive.viewerCount} viendo</span>}
        </div>

        {loading ? (
          <div className="skeleton featured-skeleton" />
        ) : featuredLive ? (
          <div className="featured-banner">
            <div className="featured-copy">
              <span className="featured-badge">🔥 Tendencia ahora</span>
              <h3>{featuredLive.title}</h3>
              <p>
                @{getDisplayName(featuredLive.user)} · {featuredLive.category || "Live"} · {getDuration(featuredLive)}
              </p>
              <div className="featured-metrics">
                <span>👁 {featuredLive.viewerCount} espectadores</span>
                <span>🎁 {featuredLive.giftsTotal || 0} coins</span>
                <span>🔴 EN VIVO</span>
              </div>
              <div className="featured-actions">
                <Link href={`/live/${featuredLive._id}`} className="featured-enter">Entrar al Live</Link>
                <button type="button" onClick={() => openGiftPanel(featuredLive)}>Enviar regalo</button>
                <button type="button" onClick={() => handleShare(featuredLive)}>Compartir</button>
              </div>
            </div>
            <LiveCard live={featuredLive} token={token} variant="featured" onShare={handleShare} onGift={openGiftPanel} />
          </div>
        ) : (
          <div className="empty-premium">
            <span>🎥</span>
            <h3>No hay lives activos ahora</h3>
            <p>Sé el primer creador en encender una sala premium.</p>
            <Link href="/live/start">Iniciar Live</Link>
          </div>
        )}
      </section>

      {(loading || liveCreators.length > 0) && (
        <section className="creators-section">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Creadores en vivo</span>
              <h2>Carrusel live</h2>
            </div>
          </div>
          <div className="creator-carousel" aria-label="Creadores transmitiendo en vivo">
            {loading
              ? [...Array(6)].map((_, index) => <div className="creator-pill skeleton" key={index} />)
              : liveCreators.map((live) => {
                  const name = getDisplayName(live.user);
                  const avatar = getUserImage(live.user);
                  return (
                    <Link href={`/live/${live._id}`} className="creator-pill" key={live._id}>
                      <span className="creator-avatar">
                        {avatar ? <img src={avatar} alt={name} /> : getInitial(name)}
                        <span className="creator-live-dot" />
                      </span>
                      <span className="creator-name">@{name}</span>
                      <span className="creator-viewers">{live.viewerCount} viendo</span>
                    </Link>
                  );
                })}
          </div>
        </section>
      )}

      <section className="discover-panel" aria-label="Filtros de descubrimiento">
        <div className="search-wrap">
          <span>⌕</span>
          <input
            type="text"
            aria-label="Buscar lives"
            placeholder="Buscar por creador, título o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-chips">
          {FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={`filter-chip${activeFilter === filter.id ? " active" : ""}`}
              onClick={() => setActiveFilter(filter.id)}
              title={filter.id === "near" ? "Muestra lives con datos de ubicación disponibles" : undefined}
            >
              <span>{filter.icon}</span>
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <LiveActivityFeed lives={lives} newLiveIds={newLiveIds} />

      <section id="active-lives" className="active-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Descubrimiento</span>
            <h2>Salas activas · {activeFilterLabel}</h2>
          </div>
          {!loading && <span className="section-count">{filteredLives.length} sala{filteredLives.length !== 1 ? "s" : ""}</span>}
        </div>

        <div className="streams-grid">
          {loading
            ? [...Array(6)].map((_, index) => <div key={index} className="skeleton card-skeleton" />)
            : filteredLives.map((live, index) => (
                <LiveCard
                  key={live._id}
                  live={live}
                  index={index}
                  token={token}
                  onShare={handleShare}
                  onGift={openGiftPanel}
                />
              ))}
        </div>

        {!loading && filteredLives.length === 0 && !error && (
          <div className="empty-premium">
            <span>🔎</span>
            <h3>Sin resultados</h3>
            <p>
              {activeFilter === "near"
                ? "No hay lives con datos de ubicación disponibles ahora."
                : activeFilter === "new"
                  ? `No hay lives nuevos en los últimos ${RECENT_LIVE_WINDOW_MINUTES} minutos.`
                : "Prueba otro chip o busca un creador diferente."}
            </p>
          </div>
        )}
      </section>

      {giftLive?.user?._id && (
        <GiftPanel
          receiverId={giftLive.user._id}
          liveId={giftLive._id}
          context="live"
          onClose={() => setGiftLive(null)}
          onGiftSent={() => {
            notify({ icon: "🎁", message: "Regalo enviado al live", duration: 2500 });
            setGiftLive(null);
          }}
        />
      )}

      <style jsx>{`
        .live-page {
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
        }

        .premium-hero,
        .featured-banner,
        .discover-panel,
        .empty-premium {
          position: relative;
          overflow: hidden;
          border-radius: var(--radius);
          border: 1px solid rgba(224,64,251,0.2);
          background:
            radial-gradient(circle at 8% 0%, rgba(224,64,251,0.18), transparent 35%),
            radial-gradient(circle at 92% 12%, rgba(34,211,238,0.13), transparent 30%),
            linear-gradient(145deg, rgba(18,7,42,0.94), rgba(7,3,18,0.98));
          box-shadow: 0 24px 70px rgba(0,0,0,0.24), 0 0 34px rgba(139,92,246,0.08);
          backdrop-filter: blur(18px);
        }

        .premium-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.4rem;
          padding: clamp(1.4rem, 4vw, 2.4rem);
        }

        .hero-orb {
          position: absolute;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(2px);
        }

        .orb-a { left: -90px; top: -110px; background: radial-gradient(circle, rgba(224,64,251,0.28), transparent 65%); }
        .orb-b { right: -80px; bottom: -120px; background: radial-gradient(circle, rgba(34,211,238,0.22), transparent 65%); }

        .hero-copy,
        .hero-actions {
          position: relative;
          z-index: 1;
        }

        .hero-copy {
          max-width: 720px;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }

        .hero-kicker,
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          width: fit-content;
          color: #67e8f9;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .hero-kicker span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 16px rgba(239,68,68,0.75);
          animation: livePulse 1.4s ease-in-out infinite;
        }

        @keyframes livePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.75); opacity: 0.55; }
        }

        h1,
        h2,
        h3,
        p {
          margin: 0;
        }

        .hero-copy h1 {
          max-width: 820px;
          font-size: clamp(2rem, 6vw, 4.25rem);
          line-height: 0.95;
          letter-spacing: -0.06em;
          font-weight: 950;
          background: linear-gradient(135deg, #fff, #f0abfc 48%, #67e8f9);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-copy p {
          max-width: 620px;
          color: var(--text-muted);
          font-size: 1rem;
          line-height: 1.6;
        }

        .hero-stats,
        .featured-metrics {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .hero-stats span,
        .featured-metrics span,
        .live-now-chip,
        .section-count {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 750;
          padding: 0.32rem 0.72rem;
        }

        .hero-stats strong { color: #fff; }

        .hero-actions,
        .featured-actions {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          flex-wrap: wrap;
        }

        .hero-start,
        .hero-discover,
        .featured-enter,
        .featured-actions button,
        .empty-premium a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          text-decoration: none;
          min-height: 42px;
          padding: 0.65rem 1.2rem;
          font-size: 0.86rem;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .hero-start,
        .featured-enter,
        .empty-premium a {
          color: #fff;
          border: none;
          background: linear-gradient(135deg, #e040fb, #8b5cf6, #22d3ee);
          box-shadow: 0 0 26px rgba(224,64,251,0.32);
        }

        .hero-discover,
        .featured-actions button {
          color: #e9d5ff;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
        }

        .hero-start:hover,
        .hero-discover:hover,
        .featured-enter:hover,
        .featured-actions button:hover,
        .empty-premium a:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(34,211,238,0.22);
        }

        .section-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.9rem;
        }

        .section-heading.compact { margin-bottom: 0.65rem; }

        .section-heading h2 {
          color: var(--text);
          font-size: 1.35rem;
          letter-spacing: -0.03em;
          font-weight: 950;
        }

        .featured-banner {
          display: grid;
          grid-template-columns: minmax(0, 0.88fr) minmax(320px, 0.72fr);
          gap: 1.1rem;
          padding: 1rem;
          align-items: stretch;
        }

        .featured-copy {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.85rem;
          min-height: 320px;
          padding: clamp(1rem, 3vw, 1.6rem);
        }

        .featured-badge {
          width: fit-content;
          border-radius: 999px;
          color: #fecaca;
          border: 1px solid rgba(248,113,113,0.32);
          background: rgba(239,68,68,0.13);
          font-size: 0.76rem;
          font-weight: 900;
          padding: 0.32rem 0.75rem;
        }

        .featured-copy h3 {
          color: #fff;
          font-size: clamp(1.65rem, 4vw, 3rem);
          line-height: 1;
          letter-spacing: -0.05em;
          font-weight: 950;
        }

        .featured-copy p { color: var(--text-muted); }

        .creator-carousel,
        .filter-chips {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding: 0.15rem 0.15rem 0.45rem;
          scrollbar-width: none;
          scroll-snap-type: x proximity;
        }

        .creator-carousel::-webkit-scrollbar,
        .filter-chips::-webkit-scrollbar {
          display: none;
        }

        .creator-pill {
          flex: 0 0 auto;
          scroll-snap-align: start;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-width: 190px;
          padding: 0.6rem 0.75rem;
          border-radius: 999px;
          border: 1px solid rgba(224,64,251,0.18);
          background: rgba(255,255,255,0.045);
          color: var(--text);
          text-decoration: none;
          backdrop-filter: blur(14px);
          transition: transform 0.18s ease, border-color 0.18s ease;
        }

        .creator-pill:hover {
          transform: translateY(-2px);
          border-color: rgba(34,211,238,0.35);
        }

        .creator-avatar {
          position: relative;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: var(--grad-primary);
          color: #fff;
          font-weight: 900;
          flex-shrink: 0;
          border: 2px solid rgba(224,64,251,0.48);
          box-shadow: 0 0 18px rgba(224,64,251,0.2);
        }

        .creator-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .creator-live-dot {
          position: absolute;
          right: 1px;
          bottom: 1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid #10051e;
        }

        .creator-name {
          font-size: 0.86rem;
          font-weight: 850;
          max-width: 86px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .creator-viewers {
          color: var(--text-dim);
          font-size: 0.7rem;
          font-weight: 700;
        }

        .discover-panel {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 0.9rem;
        }

        .search-wrap {
          position: relative;
          max-width: 560px;
        }

        .search-wrap span {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #67e8f9;
          font-weight: 900;
        }

        .search-wrap input {
          width: 100%;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: var(--text);
          outline: none;
          padding: 0.78rem 1rem 0.78rem 2.7rem;
          font-weight: 700;
        }

        .search-wrap input:focus {
          border-color: rgba(34,211,238,0.42);
          box-shadow: 0 0 0 3px rgba(34,211,238,0.08);
        }

        .filter-chip {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.11);
          background: rgba(255,255,255,0.045);
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 850;
          padding: 0.55rem 0.9rem;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .filter-chip:hover {
          transform: translateY(-1px);
          color: var(--text);
        }

        .filter-chip.active {
          color: #fff;
          border-color: rgba(224,64,251,0.52);
          background: linear-gradient(135deg, rgba(224,64,251,0.22), rgba(34,211,238,0.14));
          box-shadow: 0 0 22px rgba(224,64,251,0.16);
        }

        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 700;
        }

        .empty-premium {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 3rem 1.4rem;
          text-align: center;
        }

        .empty-premium span { font-size: 2.4rem; }
        .empty-premium h3 { color: var(--text); font-size: 1.35rem; font-weight: 950; }
        .empty-premium p { color: var(--text-muted); }

        .featured-skeleton { min-height: 360px; border-radius: var(--radius); }
        .card-skeleton { min-height: 360px; border-radius: var(--radius); }

        @media (max-width: 900px) {
          .premium-hero,
          .featured-banner {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: stretch;
          }

          .hero-actions { justify-content: flex-start; }
          .featured-copy { min-height: auto; }
        }
      `}</style>
    </div>
  );
}
