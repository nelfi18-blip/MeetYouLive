"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const LIVE_PROVIDER_KEY = process.env.NEXT_PUBLIC_LIVE_PROVIDER_KEY;

export default function LiveViewerPage() {
  const { id } = useParams();
  const [live, setLive] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el directo");
        return res.json();
      })
      .then((data) => {
        const found = data.find((l) => l._id === id);
        if (!found) {
          setError("Directo no encontrado o ya finalizado");
        } else {
          setLive(found);
        }
      })
      .catch(() => setError("No se pudo cargar el directo"));
  }, [id]);

  if (error) {
    return (
      <div className="viewer-error">
        <span style={{ fontSize: "3rem" }}>📡</span>
        <h2>Este directo ya terminó</h2>
        <p>{error}</p>
        <Link href="/live" className="btn btn-primary">← Volver a directos</Link>
        <style jsx>{`
          .viewer-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
          }
          .viewer-error h2 { color: var(--text); font-size: 1.4rem; }
          .viewer-error p { color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="viewer-loading">
        <div className="spinner" />
        <p>Cargando directo…</p>
        <style jsx>{`
          .viewer-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 1rem;
            color: var(--text-muted);
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const playerUrl = `https://wl.cinectar.com/player/${LIVE_PROVIDER_KEY}/${live.streamKey}`;

  return (
    <div className="viewer-page">
      {/* Player */}
      <div className="player-wrap">
        <iframe
          src={playerUrl}
          allow="autoplay; fullscreen"
          allowFullScreen
          title={live.title}
          className="player-frame"
        />
      </div>

      {/* Info bar */}
      <div className="viewer-info card">
        <div className="viewer-info-left">
          <div className="viewer-user-row">
            <div className="avatar-placeholder" style={{ width: 44, height: 44, fontSize: "1.1rem" }}>
              {(live.user?.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <div className="viewer-streamer">@{live.user?.username || "anónimo"}</div>
              <span className="badge badge-live">EN VIVO</span>
            </div>
          </div>
          <div>
            <h1 className="viewer-title">{live.title}</h1>
            {live.description && <p className="viewer-desc">{live.description}</p>}
          </div>
        </div>
        <div className="viewer-actions">
          {live.viewers && (
            <div className="viewer-count-badge">
              <span>👁</span>
              <span>{live.viewers} viendo</span>
            </div>
          )}
          <Link href="/coins" className="btn btn-primary">
            🎁 Enviar regalo
          </Link>
          <Link href="/live" className="btn btn-secondary">
            ← Directos
          </Link>
        </div>
      </div>

      <style jsx>{`
        .viewer-page { display: flex; flex-direction: column; gap: 1rem; }

        .player-wrap {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: #000;
          border-radius: var(--radius);
          overflow: hidden;
        }

        .player-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .viewer-info {
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          flex-wrap: wrap;
          justify-content: space-between;
        }

        .viewer-info-left {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
        }

        .viewer-user-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .viewer-streamer {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
        }

        .viewer-title {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--text);
        }

        .viewer-desc { color: var(--text-muted); font-size: 0.9rem; }

        .viewer-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .viewer-count-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 0.4rem 0.9rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
