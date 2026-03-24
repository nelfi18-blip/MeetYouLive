"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CATEGORIES = ["Todos", "Gaming", "Música", "Charla", "Arte", "Educación", "Otro"];

const CAT_ICONS = {
  Todos: "🌐", Gaming: "🎮", Música: "🎵", Charla: "💬",
  Arte: "🎨", Educación: "📚", Otro: "✨",
};

export default function ExplorePage() {
  const [lives, setLives] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setLives(Array.isArray(d) ? d : []); })
      .catch(() => setError("No se pudo cargar los directos"));
  }, []);

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

  return (
    <div className="explore">
      {/* Page header */}
      <div className="explore-header">
        <div className="explore-header-left">
          <h1 className="page-title">Explorar</h1>
          <p className="page-subtitle">Descubre streamers en vivo ahora mismo</p>
        </div>
        <div className="search-wrap">
          <span className="search-icon-inner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            className="input search-input"
            type="text"
            placeholder="Buscar por título o streamer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="category-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`cat-pill${category === cat ? " active" : ""}`}
            onClick={() => setCategory(cat)}
          >
            <span className="cat-icon">{CAT_ICONS[cat]}</span>
            <span>{cat}</span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && <div className="banner-error">{error}</div>}

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📡</div>
          <h3>Sin resultados</h3>
          <p>
            {search || category !== "Todos"
              ? "No hay directos que coincidan con tu búsqueda."
              : "No hay directos activos en este momento. ¡Vuelve más tarde!"}
          </p>
        </div>
      ) : (
        <div className="streams-grid">
          {filtered.map((live) => (
            <Link key={live._id} href={`/live/${live._id}`} className="stream-card">
              <div className="stream-thumb">
                <span className="badge badge-live">
                  <span className="live-dot" />
                  LIVE
                </span>
                {live.viewerCount != null && (
                  <span className="viewer-count">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {live.viewerCount}
                  </span>
                )}
                <div className="stream-thumb-icon">▶</div>
              </div>
              <div className="stream-body">
                <div className="stream-user-row">
                  <div className="stream-avatar">
                    {(live.user?.username || "?")[0].toUpperCase()}
                  </div>
                  <span className="stream-username">@{live.user?.username || "anónimo"}</span>
                </div>
                <div className="stream-title">{live.title}</div>
                {live.category && (
                  <span className="stream-category">{live.category}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        .explore { display: flex; flex-direction: column; gap: 1.75rem; }

        /* Header */
        .explore-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        .explore-header-left {}

        /* Search */
        .search-wrap {
          position: relative;
          width: 300px;
        }

        .search-icon-inner {
          position: absolute;
          left: 0.9rem;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: var(--text-dim);
          display: flex;
        }

        .search-input { padding-left: 2.5rem !important; }

        /* Category pills */
        .category-bar {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .cat-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 1rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border);
          background: rgba(15,8,32,0.7);
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          backdrop-filter: blur(8px);
        }

        .cat-icon { font-size: 0.85rem; }

        .cat-pill:hover {
          border-color: rgba(129,140,248,0.35);
          color: var(--accent-3);
          background: rgba(129,140,248,0.08);
        }

        .cat-pill.active {
          background: var(--grad-primary);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 2px 16px rgba(224,64,251,0.35);
        }

        /* Streams grid */
        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 1.25rem;
        }

        .stream-card {
          overflow: hidden;
          cursor: pointer;
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--grad-card-2);
          display: block;
        }

        .stream-card:hover {
          border-color: rgba(139,92,246,0.4);
          box-shadow: var(--shadow), 0 0 28px rgba(139,92,246,0.2);
          transform: translateY(-4px);
        }

        /* Thumbnail */
        .stream-thumb {
          background: linear-gradient(135deg, rgba(22,12,45,0.9) 0%, rgba(35,16,70,0.95) 50%, rgba(15,8,32,1) 100%);
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .stream-thumb::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.08), transparent 65%);
        }

        .stream-thumb .badge-live {
          position: absolute;
          top: 0.65rem;
          left: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.25rem 0.65rem;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.06em;
        }

        .live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #fff;
          animation: dot-blink 1.2s ease-in-out infinite;
        }

        @keyframes dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .viewer-count {
          position: absolute;
          bottom: 0.65rem;
          right: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(6,4,17,0.8);
          color: var(--text);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.22rem 0.6rem;
          border-radius: var(--radius-pill);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .stream-thumb-icon {
          font-size: 2.4rem;
          opacity: 0.15;
          position: relative;
          z-index: 1;
          color: var(--text);
        }

        /* Body */
        .stream-body { padding: 1rem 1.1rem; }

        .stream-user-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 0.6rem;
        }

        .stream-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.75rem;
          flex-shrink: 0;
        }

        .stream-username {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stream-title {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .stream-category {
          display: inline-block;
          margin-top: 0.55rem;
          background: rgba(129,140,248,0.1);
          color: var(--accent-3);
          font-size: 0.7rem;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-pill);
          font-weight: 700;
          border: 1px solid rgba(129,140,248,0.2);
        }

        /* Banner / empty */
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
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 4rem 2rem;
          text-align: center;
          border: 1px dashed rgba(139,92,246,0.2);
          border-radius: var(--radius);
          background: rgba(15,8,32,0.4);
        }

        .empty-icon { font-size: 3rem; }
        .empty-state h3 { color: var(--text); font-size: 1.1rem; margin: 0; }
        .empty-state p { color: var(--text-muted); font-size: 0.875rem; margin: 0; max-width: 340px; }

        @media (max-width: 640px) {
          .search-wrap { width: 100%; }
          .explore-header { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
