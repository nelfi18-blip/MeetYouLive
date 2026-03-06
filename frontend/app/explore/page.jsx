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
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text);
        }

        .explore-sub { color: var(--text-muted); margin-top: 0.25rem; }

        .explore-search-wrap {
          position: relative;
          width: 280px;
        }

        .search-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          font-size: 0.95rem;
        }

        .explore-search { padding-left: 2.4rem !important; }

        /* Categories */
        .category-bar {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .cat-pill {
          padding: 0.4rem 1rem;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition);
        }

        .cat-pill:hover { border-color: var(--accent); color: var(--accent); }
        .cat-pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }

        /* Stream grid */
        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 1rem;
        }

        .stream-card { padding: 0; overflow: hidden; cursor: pointer; }

        .stream-thumb {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .stream-thumb .badge { position: absolute; top: 0.5rem; left: 0.5rem; }

        .viewer-count {
          position: absolute;
          bottom: 0.5rem;
          right: 0.5rem;
          background: rgba(0,0,0,0.6);
          color: #fff;
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }

        .stream-thumb-icon { font-size: 2.5rem; opacity: 0.4; }

        .stream-body { padding: 0.875rem; }

        .stream-user-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .stream-username { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; }

        .stream-title {
          font-weight: 600;
          color: var(--text);
          font-size: 0.9rem;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .stream-category {
          display: inline-block;
          margin-top: 0.5rem;
          background: var(--accent-dim);
          color: var(--accent);
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-weight: 500;
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
        }

        @media (max-width: 640px) {
          .explore-search-wrap { width: 100%; }
          .explore-header { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
