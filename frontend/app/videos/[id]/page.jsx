"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function VideoDetailPage() {
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!id) return;

    // Fetch video details (public videos only via GET /api/videos/:id)
    fetch(`${API_URL}/api/videos/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Vídeo no encontrado");
        return res.json();
      })
      .then((data) => {
        setVideo(data);
        // If it's public, grant access immediately
        if (!data.isPrivate) setHasAccess(true);
      })
      .catch(() => setError("Vídeo no encontrado o no disponible"));

    // Check purchase access for private videos
    if (token) {
      fetch(`${API_URL}/api/videos/${id}/access`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.access) setHasAccess(true); })
        .catch(() => {});
    }
  }, [id, token]);

  const handleBuy = async () => {
    if (!token) { setPurchaseError("Debes iniciar sesión para comprar este vídeo."); return; }
    setPurchasing(true);
    setPurchaseError("");
    try {
      const res = await fetch(`${API_URL}/api/payments/checkout/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al crear el pago");
      window.location.href = data.url;
    } catch (err) {
      setPurchaseError(err.message);
    } finally {
      setPurchasing(false);
    }
  };

  if (error) {
    return (
      <div className="video-error">
        <span style={{ fontSize: "3rem" }}>🎬</span>
        <h2>Vídeo no disponible</h2>
        <p>{error}</p>
        <Link href="/videos" className="btn btn-primary">← Volver a vídeos</Link>
        <style jsx>{`
          .video-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
          }
          .video-error h2 { color: var(--text); font-size: 1.4rem; }
          .video-error p { color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="video-loading">
        <div className="spinner" />
        <p>Cargando vídeo…</p>
        <style jsx>{`
          .video-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 1rem;
            color: var(--text-muted);
          }
          .spinner {
            width: 44px; height: 44px;
            border: 3px solid rgba(255,15,138,0.15);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Private paywall (only if price > 0; price=0 private videos are treated as free)
  if (video.isPrivate && !hasAccess && video.price > 0) {
    return (
      <div className="video-detail">
        <div className="paywall card">
          <div className="paywall-icon">🔒</div>
          <h2 className="paywall-title">{video.title}</h2>
          <p className="paywall-creator">por @{video.user?.username || video.user?.name || "creador"}</p>
          {video.description && <p className="paywall-desc">{video.description}</p>}
          <div className="paywall-price">
            <span>💎</span>
            <span className="price-num">{video.price} 🪙</span>
          </div>
          {purchaseError && <div className="error-banner">{purchaseError}</div>}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleBuy}
            disabled={purchasing}
          >
            {purchasing ? "Redirigiendo…" : `💳 Comprar acceso — ${video.price} 🪙`}
          </button>
          {!token && (
            <p className="paywall-hint">
              <Link href="/login" className="link-accent">Inicia sesión</Link> para comprar este vídeo.
            </p>
          )}
          <Link href="/videos" className="btn btn-secondary">← Volver a vídeos</Link>
        </div>

        <style jsx>{`
          .video-detail { display: flex; flex-direction: column; gap: 1rem; }
          .paywall {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 3rem 2rem;
            max-width: 480px;
            margin: 2rem auto;
            text-align: center;
          }
          .paywall-icon { font-size: 3rem; }
          .paywall-title { font-size: 1.4rem; font-weight: 800; color: var(--text); margin: 0; }
          .paywall-creator { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
          .paywall-desc { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
          .paywall-price {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(139,92,246,0.1);
            border: 1px solid rgba(139,92,246,0.3);
            border-radius: var(--radius-pill);
            padding: 0.5rem 1.5rem;
            font-size: 1.1rem;
          }
          .price-num { font-size: 1.5rem; font-weight: 900; color: #a78bfa; }
          .error-banner {
            width: 100%;
            background: rgba(244,67,54,0.1);
            border: 1px solid var(--error);
            color: var(--error);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-size: 0.85rem;
          }
          .paywall-hint { font-size: 0.8rem; color: var(--text-muted); }
          .link-accent { color: var(--accent); text-decoration: underline; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="video-detail">
      {/* Player */}
      <div className="player-wrap">
        <video
          src={video.url}
          controls
          className="video-player"
          autoPlay={false}
        >
          Tu navegador no soporta la reproducción de vídeo.
        </video>
      </div>

      {/* Info */}
      <div className="video-info card">
        <div className="video-info-top">
          <div>
            <h1 className="video-main-title">{video.title}</h1>
            {video.description && <p className="video-main-desc">{video.description}</p>}
          </div>
          <div className="video-info-right">
            <div className="creator-row">
              <div className="creator-avatar">
                {(video.user?.username || video.user?.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div className="creator-name">@{video.user?.username || video.user?.name || "creador"}</div>
                <div className="video-date">
                  {new Date(video.createdAt).toLocaleDateString("es-ES", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Link href="/videos" className="back-link">← Volver a vídeos</Link>

      <style jsx>{`
        .video-detail { display: flex; flex-direction: column; gap: 1rem; }

        .player-wrap {
          width: 100%;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid rgba(255,15,138,0.2);
          box-shadow: 0 0 40px rgba(255,15,138,0.1);
          background: #000;
        }

        .video-player {
          width: 100%;
          display: block;
          max-height: 70vh;
          outline: none;
        }

        .video-info {
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          padding: 1.25rem;
          backdrop-filter: blur(16px);
        }

        .video-info-top {
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          flex-wrap: wrap;
          justify-content: space-between;
        }

        .video-main-title {
          font-size: 1.35rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .video-main-desc {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-top: 0.35rem;
          line-height: 1.5;
        }

        .video-info-right { flex-shrink: 0; }

        .creator-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .creator-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.9rem;
          flex-shrink: 0;
        }

        .creator-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
        }

        .video-date {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }

        .back-link {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
          align-self: flex-start;
        }

        .back-link:hover { color: var(--text); }
      `}</style>
    </div>
  );
}
