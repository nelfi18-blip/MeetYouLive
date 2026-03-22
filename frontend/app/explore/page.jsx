"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CATEGORIES = ["Todos", "Gaming", "Música", "Charla", "Arte", "Educación", "Otro"];

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
        <div>
          <h1 className="explore-title">Explorar</h1>
          <p className="explore-sub">Descubre streamers en vivo ahora mismo</p>
        </div>
        <div className="explore-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="input explore-search"
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
            {cat}
          </button>
        ))}
      </div>

      {/* Content */}
      {error && <div className="error-banner">{error}</div>}

      {filtered.length === 0 ? (
        <div className="empty-state card">
          <span style={{ fontSize: "3rem" }}>📡</span>
          <h3 style={{ color: "var(--text)" }}>Sin resultados</h3>
          <p>
            {search || category !== "Todos"
              ? "No hay directos que coincidan con tu búsqueda."
              : "No hay directos activos en este momento. ¡Vuelve más tarde!"}
          </p>
        </div>
      ) : (
        <div className="streams-grid">
          {filtered.map((live) => (
            <Link key={live._id} href={`/live/${live._id}`} className="stream-card card">
              <div className="stream-thumb">
                <span className="badge badge-live">LIVE</span>
                {live.viewers && (
                  <span className="viewer-count">👁 {live.viewers}</span>
                )}
                <span className="stream-thumb-icon">📺</span>
              </div>
              <div className="stream-body">
                <div className="stream-user-row">
                  <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: "0.85rem" }}>
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
        .explore { display: flex; flex-direction: column; gap: 1.5rem; }

        .explore-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .explore-title {
          font-size: 1.9rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .explore-sub { color: var(--text-muted); margin-top: 0.25rem; font-weight: 500; }

        .explore-search-wrap {
          position: relative;
          width: 290px;
        }

        .search-icon {
          position: absolute;
          left: 0.85rem;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          font-size: 0.95rem;
        }

        .explore-search { padding-left: 2.5rem !important; }

        /* Category pills */
        .category-bar {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .cat-pill {
          padding: 0.45rem 1.1rem;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: rgba(26,11,46,0.6);
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          backdrop-filter: blur(8px);
        }

        .cat-pill:hover { border-color: var(--accent-2); color: var(--accent-2); }
        .cat-pill.active {
          background: var(--grad-primary);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 2px 14px rgba(255,15,138,0.4);
        }

        /* Stream grid */
        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.25rem;
        }

        .stream-card {
          padding: 0;
          overflow: hidden;
          cursor: pointer;
          transition: all var(--transition);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--grad-card);
        }

        .stream-card:hover {
          border-color: rgba(255,15,138,0.35);
          box-shadow: 0 8px 32px rgba(0,0,0,0.6), var(--glow-pink);
          transform: translateY(-3px);
        }

        .stream-thumb {
          background: linear-gradient(135deg, #1A0B2E 0%, #2a1260 50%, #1A0B2E 100%);
          height: 150px;
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
          background: radial-gradient(circle at 50% 50%, rgba(255,15,138,0.1), transparent 70%);
        }

        .stream-thumb .badge { position: absolute; top: 0.6rem; left: 0.6rem; }

        .viewer-count {
          position: absolute;
          bottom: 0.6rem;
          right: 0.6rem;
          background: rgba(11,6,19,0.75);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.2rem 0.55rem;
          border-radius: 8px;
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .stream-thumb-icon { font-size: 2.8rem; opacity: 0.35; position: relative; z-index: 1; }

        .stream-body { padding: 1rem; }

        .stream-user-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .stream-username { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }

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
          background: rgba(255,15,138,0.12);
          color: var(--accent-2);
          font-size: 0.72rem;
          padding: 0.2rem 0.6rem;
          border-radius: 20px;
          font-weight: 700;
          border: 1px solid rgba(255,79,216,0.2);
        }

        /* Errors / empty */
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 3rem;
          text-align: center;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--grad-card);
        }

        @media (max-width: 640px) {
          .explore-search-wrap { width: 100%; }
          .explore-header { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
