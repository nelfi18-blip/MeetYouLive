"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ExclusiveDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/exclusive/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Contenido no encontrado");
        return res.json();
      })
      .then((data) => setItem(data))
      .catch(() => setError("Contenido no encontrado o no disponible"));
  }, [id, token]);

  const handleUnlock = async () => {
    if (!token) {
      setUnlockError("Debes iniciar sesión para desbloquear este contenido.");
      return;
    }
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch(`${API_URL}/api/exclusive/${id}/unlock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al desbloquear el contenido");

      // Re-fetch to get the mediaUrl now that access is granted
      const updated = await fetch(`${API_URL}/api/exclusive/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (updated.ok) {
        const updatedData = await updated.json();
        setItem(updatedData);
      }
    } catch (err) {
      setUnlockError(err.message);
    } finally {
      setUnlocking(false);
    }
  };

  if (error) {
    return (
      <div className="exclusive-error">
        <span style={{ fontSize: "3rem" }}>💎</span>
        <h2>Contenido no disponible</h2>
        <p>{error}</p>
        <Link href="/exclusive" className="btn btn-primary">← Volver al contenido exclusivo</Link>
        <style jsx>{`
          .exclusive-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
          }
          .exclusive-error h2 { color: var(--text); font-size: 1.4rem; }
          .exclusive-error p { color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="exclusive-loading">
        <div className="spinner" />
        <p>Cargando contenido…</p>
        <style jsx>{`
          .exclusive-loading {
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
            border: 3px solid rgba(162,28,175,0.15);
            border-top-color: #e040fb;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Paywall – user has no access yet
  if (!item.hasAccess) {
    return (
      <div className="exclusive-detail">
        <div className="paywall card">
          <div className="paywall-thumb">
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt={item.title} className="thumb-img" />
            ) : (
              <div className="thumb-placeholder">💎</div>
            )}
          </div>
          <div className="paywall-icon">🔒</div>
          <h2 className="paywall-title">{item.title}</h2>
          <p className="paywall-creator">
            por @{item.creator?.username || item.creator?.name || "creador"}
          </p>
          {item.description && (
            <p className="paywall-desc">{item.description}</p>
          )}
          <div className="paywall-price">
            <span>💎</span>
            <span className="price-num">{item.coinPrice} 🪙</span>
          </div>
          <p className="paywall-hint-text">
            El creador recibirá el <strong>60%</strong> de tu pago
          </p>
          {unlockError && <div className="error-banner">{unlockError}</div>}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleUnlock}
            disabled={unlocking}
          >
            {unlocking ? "Desbloqueando…" : `🔓 Desbloquear — ${item.coinPrice} 🪙`}
          </button>
          {!token && (
            <p className="login-hint">
              <Link href="/login" className="link-accent">Inicia sesión</Link> para desbloquear este contenido.
            </p>
          )}
          <Link href="/exclusive" className="btn btn-secondary">← Volver al contenido exclusivo</Link>
        </div>

        <style jsx>{`
          .exclusive-detail { display: flex; flex-direction: column; gap: 1rem; }
          .paywall {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 2rem;
            max-width: 480px;
            margin: 2rem auto;
            text-align: center;
          }
          .paywall-thumb {
            width: 100%;
            border-radius: var(--radius-sm);
            overflow: hidden;
            aspect-ratio: 16/9;
            background: rgba(22,12,45,0.9);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .thumb-img { width: 100%; height: 100%; object-fit: cover; filter: blur(6px) brightness(0.6); }
          .thumb-placeholder { font-size: 3rem; }
          .paywall-icon { font-size: 2.5rem; margin-top: -0.5rem; }
          .paywall-title { font-size: 1.4rem; font-weight: 800; color: var(--text); margin: 0; }
          .paywall-creator { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
          .paywall-desc { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
          .paywall-price {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(162,28,175,0.1);
            border: 1px solid rgba(162,28,175,0.35);
            border-radius: var(--radius-pill);
            padding: 0.5rem 1.5rem;
            font-size: 1.1rem;
          }
          .price-num { font-size: 1.5rem; font-weight: 900; color: #e040fb; }
          .paywall-hint-text { font-size: 0.8rem; color: var(--text-dim); margin: -0.25rem 0; }
          .paywall-hint-text strong { color: #e040fb; }
          .error-banner {
            width: 100%;
            background: rgba(244,67,54,0.1);
            border: 1px solid var(--error);
            color: var(--error);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-size: 0.85rem;
          }
          .login-hint { font-size: 0.8rem; color: var(--text-muted); }
          .link-accent { color: #e040fb; text-decoration: underline; }
        `}</style>
      </div>
    );
  }

  // Access granted – show the content
  return (
    <div className="exclusive-detail">
      <div className="player-wrap">
        {item.type === "photo" ? (
          <img
            src={item.mediaUrl}
            alt={item.title}
            className="content-player content-photo"
          />
        ) : (
          <video
            src={item.mediaUrl}
            controls
            className="content-player"
            autoPlay={false}
          >
            Tu navegador no soporta la reproducción de vídeo.
          </video>
        )}
      </div>

      <div className="content-info card">
        <div className="content-info-top">
          <div>
            <h1 className="content-main-title">{item.title}</h1>
            {item.description && (
              <p className="content-main-desc">{item.description}</p>
            )}
          </div>
          <div className="content-info-right">
            <div className="creator-row">
              <div className="creator-avatar">
                {(item.creator?.username || item.creator?.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div className="creator-name">
                  @{item.creator?.username || item.creator?.name || "creador"}
                </div>
                <div className="content-date">
                  {new Date(item.createdAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="access-badge">✅ Contenido desbloqueado</div>
      </div>

      <Link href="/exclusive" className="back-link">← Volver al contenido exclusivo</Link>

      <style jsx>{`
        .exclusive-detail { display: flex; flex-direction: column; gap: 1rem; }

        .player-wrap {
          width: 100%;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid rgba(162,28,175,0.3);
          box-shadow: 0 0 40px rgba(162,28,175,0.15);
          background: #000;
        }

        .content-player {
          width: 100%;
          display: block;
          max-height: 70vh;
          outline: none;
        }

        .content-info {
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          padding: 1.25rem;
          backdrop-filter: blur(16px);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .content-info-top {
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          flex-wrap: wrap;
          justify-content: space-between;
        }

        .content-main-title {
          font-size: 1.35rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #e040fb);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .content-main-desc {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-top: 0.35rem;
          line-height: 1.5;
        }

        .content-info-right { flex-shrink: 0; }

        .creator-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .creator-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a21caf, #e040fb);
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

        .content-date {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }

        .access-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.25);
          border-radius: var(--radius-pill);
          padding: 0.3rem 0.85rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: #4ade80;
          align-self: flex-start;
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
