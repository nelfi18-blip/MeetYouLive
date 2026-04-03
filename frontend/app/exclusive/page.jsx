"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton thumb-skeleton" />
      <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div className="skeleton" style={{ height: 14, borderRadius: 6, width: "75%" }} />
        <div className="skeleton" style={{ height: 12, borderRadius: 6, width: "50%" }} />
      </div>
    </div>
  );
}

export default function ExclusivePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreator, setIsCreator] = useState(false);

  // Creator-specific state
  const [myItems, setMyItems] = useState([]);
  const [myItemsLoading, setMyItemsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("browse"); // "browse" | "mine"

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    fetch(`${API_URL}/api/exclusive`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el contenido exclusivo");
        return res.json();
      })
      .then((data) => setItems(data))
      .catch(() => setError("No se pudo cargar el contenido exclusivo"))
      .finally(() => setLoading(false));

    if (token) {
      fetch(`${API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.role === "creator" && d?.creatorStatus === "approved") {
            setIsCreator(true);
            // Fetch creator's own content
            setMyItemsLoading(true);
            return fetch(`${API_URL}/api/exclusive/mine`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => (r.ok ? r.json() : []))
              .then((data) => setMyItems(data))
              .catch((err) => console.error("[exclusive] Failed to fetch creator content:", err))
              .finally(() => setMyItemsLoading(false));
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="exclusive-page">
      <div className="exclusive-header">
        <div>
          <h1 className="exclusive-title">💎 Contenido exclusivo</h1>
          <p className="exclusive-sub">Desbloquea contenido premium de tus creadores favoritos con monedas</p>
        </div>
        {isCreator && (
          <Link href="/exclusive/upload" className="btn btn-primary upload-btn">
            <UploadIcon />
            <span>Publicar contenido</span>
          </Link>
        )}
      </div>

      {/* Tabs for approved creators */}
      {isCreator && (
        <div className="tabs-row">
          <button
            className={`tab-btn${activeTab === "browse" ? " tab-active" : ""}`}
            onClick={() => setActiveTab("browse")}
          >
            Explorar contenido
          </button>
          <button
            className={`tab-btn${activeTab === "mine" ? " tab-active" : ""}`}
            onClick={() => setActiveTab("mine")}
          >
            Mi contenido
            {myItems.length > 0 && <span className="tab-badge">{myItems.length}</span>}
          </button>
        </div>
      )}

      {/* ── My Content tab ── */}
      {activeTab === "mine" && isCreator && (
        <div className="my-content-section">
          {myItemsLoading ? (
            <div className="exclusive-grid">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : myItems.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💎</span>
              <h2>Sin contenido publicado</h2>
              <p>Aún no has publicado ningún contenido exclusivo.</p>
              <Link href="/exclusive/upload" className="btn btn-primary">+ Publicar contenido</Link>
            </div>
          ) : (
            <div className="exclusive-grid">
              {myItems.map((item) => (
                <Link key={item._id} href={`/exclusive/${item._id}`} className="exclusive-card my-card">
                  <div className="exclusive-thumb">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.title} className="thumb-img" />
                    ) : (
                      <div className="thumb-placeholder">💎</div>
                    )}
                    <div className="price-badge">
                      <LockIcon />
                      <span>{item.coinPrice} 🪙</span>
                    </div>
                  </div>
                  <div className="exclusive-info">
                    <h3 className="exclusive-item-title">{item.title}</h3>
                    <div className="exclusive-meta">
                      <span className="my-unlocks">🔓 {item.totalUnlocks || 0} desbloqueos</span>
                      <span className="my-earnings">🪙 {item.totalEarnings || 0} ganados</span>
                    </div>
                    {item.description && (
                      <p className="exclusive-desc">{item.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Browse tab (default) ── */}
      {activeTab === "browse" && (
        <>
          {error && <div className="alert-error">{error}</div>}

          {loading ? (
            <div className="exclusive-grid">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💎</span>
              <h2>Sin contenido exclusivo todavía</h2>
              <p>Los creadores aún no han publicado contenido exclusivo. ¡Vuelve más tarde!</p>
              <Link href="/live" className="btn btn-primary">Ver directos en vivo</Link>
            </div>
          ) : (
            <div className="exclusive-grid">
              {items.map((item) => (
                <Link key={item._id} href={`/exclusive/${item._id}`} className="exclusive-card">
                  <div className="exclusive-thumb">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.title} className="thumb-img" />
                    ) : (
                      <div className="thumb-placeholder">💎</div>
                    )}
                    <div className="price-badge">
                      <LockIcon />
                      <span>{item.coinPrice} 🪙</span>
                    </div>
                  </div>
                  <div className="exclusive-info">
                    <h3 className="exclusive-item-title">{item.title}</h3>
                    <div className="exclusive-meta">
                      <span className="exclusive-creator">
                        @{item.creator?.username || item.creator?.name || "creador"}
                      </span>
                      <span className="exclusive-date">
                        {new Date(item.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {item.description && (
                      <p className="exclusive-desc">{item.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .exclusive-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .exclusive-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .exclusive-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .exclusive-sub {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 0.2rem;
        }

        .upload-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .upload-btn :global(svg) {
          width: 16px;
          height: 16px;
        }

        .tabs-row {
          display: flex;
          gap: 0.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0;
          margin-bottom: -0.5rem;
        }

        .tab-btn {
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 0.6rem 1.1rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: color var(--transition), border-color var(--transition);
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: -1px;
        }

        .tab-btn:hover {
          color: var(--text);
        }

        .tab-active {
          color: #e040fb;
          border-bottom-color: #e040fb;
        }

        .tab-badge {
          background: rgba(224,64,251,0.18);
          color: #e040fb;
          font-size: 0.7rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
          line-height: 1.4;
        }

        .alert-error {
          padding: 0.75rem 1rem;
          background: rgba(244, 67, 54, 0.08);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
        }

        .exclusive-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.25rem;
        }

        .exclusive-card {
          background: rgba(15, 8, 32, 0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          transition: border-color var(--transition), transform var(--transition-slow),
            box-shadow var(--transition-slow);
          text-decoration: none;
        }

        .exclusive-card:hover {
          border-color: rgba(162, 28, 175, 0.5);
          transform: translateY(-3px);
          box-shadow: 0 8px 32px rgba(162, 28, 175, 0.2);
        }

        .my-card {
          border-color: rgba(224, 64, 251, 0.2);
        }

        .exclusive-thumb {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: linear-gradient(135deg, rgba(22, 12, 45, 0.9), rgba(8, 4, 20, 0.9));
          border-bottom: 1px solid var(--border);
          overflow: hidden;
        }

        .thumb-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .thumb-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
        }

        .price-badge {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(162, 28, 175, 0.5);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 700;
          color: #e040fb;
        }

        .price-badge :global(svg) {
          width: 11px;
          height: 11px;
        }

        .exclusive-info {
          padding: 0.875rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .exclusive-item-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.3;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .exclusive-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .exclusive-creator {
          font-size: 0.78rem;
          font-weight: 600;
          color: #e040fb;
        }

        .exclusive-date {
          font-size: 0.75rem;
          color: var(--text-dim);
        }

        .my-unlocks {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .my-earnings {
          font-size: 0.75rem;
          font-weight: 600;
          color: #34d399;
        }

        .exclusive-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          margin-top: 0.15rem;
          line-height: 1.5;
        }

        .skeleton-card {
          background: rgba(15, 8, 32, 0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }

        .thumb-skeleton {
          width: 100%;
          padding-top: 56.25%;
          height: 0;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 4rem 2rem;
          text-align: center;
        }

        .empty-icon {
          font-size: 3rem;
        }

        .empty-state h2 {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text);
        }

        .empty-state p {
          color: var(--text-muted);
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
