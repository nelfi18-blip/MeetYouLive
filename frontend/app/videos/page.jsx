"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
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

export default function VideosPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    // Fetch public videos
    fetch(`${API_URL}/api/videos`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar los vídeos");
        return res.json();
      })
      .then((data) => setVideos(data))
      .catch(() => setError("No se pudieron cargar los vídeos"))
      .finally(() => setLoading(false));

    // Check if user is a creator to show upload button
    if (token) {
      fetch(`${API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.role === "creator" || d?.role === "admin") setIsCreator(true); })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="videos-page">
      {/* Header */}
      <div className="videos-header">
        <div>
          <h1 className="videos-title">🎬 Vídeos</h1>
          <p className="videos-sub">Explora el contenido de nuestros creadores</p>
        </div>
        {isCreator && (
          <Link href="/videos/upload" className="btn btn-primary upload-btn">
            <UploadIcon />
            <span>Subir vídeo</span>
          </Link>
        )}
      </div>

      {error && (
        <div className="alert-error">{error}</div>
      )}

      {loading ? (
        <div className="videos-grid">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🎬</span>
          <h2>Sin vídeos todavía</h2>
          <p>Los creadores aún no han publicado vídeos. ¡Vuelve más tarde!</p>
          <Link href="/live" className="btn btn-primary">Ver directos en vivo</Link>
        </div>
      ) : (
        <div className="videos-grid">
          {videos.map((video) => (
            <Link key={video._id} href={`/videos/${video._id}`} className="video-card">
              {/* Thumbnail placeholder */}
              <div className="video-thumb">
                <div className="thumb-overlay">
                  <div className="play-btn"><PlayIcon /></div>
                </div>
                {video.isPrivate && (
                  <div className="private-badge">
                    <LockIcon />
                    <span>{video.price} 🪙</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="video-info">
                <h3 className="video-title">{video.title}</h3>
                <div className="video-meta">
                  <span className="video-creator">
                    @{video.user?.username || video.user?.name || "creador"}
                  </span>
                  <span className="video-date">
                    {new Date(video.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                {video.description && (
                  <p className="video-desc">{video.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        .videos-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .videos-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .videos-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .videos-sub {
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

        .upload-btn :global(svg) { width: 16px; height: 16px; }

        .alert-error {
          padding: 0.75rem 1rem;
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
        }

        .videos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.25rem;
        }

        .video-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          transition: border-color var(--transition), transform var(--transition-slow), box-shadow var(--transition-slow);
          text-decoration: none;
        }

        .video-card:hover {
          border-color: rgba(139,92,246,0.4);
          transform: translateY(-3px);
          box-shadow: 0 8px 32px rgba(139,92,246,0.15);
        }

        .video-thumb {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: linear-gradient(135deg, rgba(22,12,45,0.9), rgba(8,4,20,0.9));
          border-bottom: 1px solid var(--border);
        }

        .thumb-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.2);
          transition: background var(--transition);
        }

        .video-card:hover .thumb-overlay { background: rgba(0,0,0,0.1); }

        .play-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          transition: all var(--transition);
        }

        .play-btn :global(svg) { width: 20px; height: 20px; margin-left: 3px; }

        .video-card:hover .play-btn {
          background: var(--accent);
          box-shadow: 0 0 20px rgba(255,15,138,0.5);
        }

        .private-badge {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 700;
          color: #a78bfa;
        }

        .private-badge :global(svg) { width: 11px; height: 11px; }

        .video-info {
          padding: 0.875rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .video-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.3;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .video-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .video-creator {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--accent-3);
        }

        .video-date {
          font-size: 0.75rem;
          color: var(--text-dim);
        }

        .video-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          margin-top: 0.15rem;
          line-height: 1.5;
        }

        /* Skeleton */
        .skeleton-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }

        .thumb-skeleton {
          width: 100%;
          padding-top: 56.25%;
          height: 0;
        }

        /* Empty state */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 4rem 2rem;
          text-align: center;
        }

        .empty-icon { font-size: 3rem; }

        .empty-state h2 {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text);
        }

        .empty-state p { color: var(--text-muted); font-size: 0.9rem; }
      `}</style>
    </div>
  );
}
