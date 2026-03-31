"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar directos");
        return res.json();
      })
      .then((data) => setLives(Array.isArray(data) ? data : []))
      .catch(() => setError("No se pudo cargar la lista de directos"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="live-page">
      <div className="live-header">
        <div>
          <h1 className="page-title">Directos en vivo</h1>
          <p className="page-subtitle">
            {loading
              ? "Cargando transmisiones…"
              : `${lives.length} stream${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/explore" className="btn btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Explorar todo
        </Link>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="streams-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 230, borderRadius: "var(--radius)" }} />
          ))}
        </div>
      )}

      {!loading && lives.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
          <h3>Sin directos ahora mismo</h3>
          <p>Vuelve más tarde o explora el contenido disponible.</p>
          <Link href="/explore" className="btn btn-primary">Explorar</Link>
        </div>
      )}

      {!loading && lives.length > 0 && (
        <div className="streams-grid">
          {lives.map((live) => (
            <LiveCard key={live._id} live={live} />
          ))}
        </div>
      )}

      <style jsx>{`
        .live-page { display: flex; flex-direction: column; gap: 1.75rem; }

        .live-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 1.25rem;
        }

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
          gap: 1rem;
          padding: 4rem 2rem;
          text-align: center;
          border: 1px dashed rgba(139,92,246,0.2);
          border-radius: var(--radius);
          background: rgba(15,8,32,0.4);
        }

        .empty-icon-wrap {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state h3 { color: var(--text); font-size: 1.15rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }
      `}</style>
    </div>
  );
}
