"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function AdminLivesPage() {
  const router = useRouter();
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadLives = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/lives`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos de administrador."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setLives(data.lives || []);
    } catch {
      setError("Error cargando streams activos.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadLives(); }, [loadLives]);

  const endLive = async (liveId) => {
    if (!confirm("¿Forzar fin de este stream?")) return;
    setActionLoading(liveId);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/admin/lives/${liveId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionError(d.message || "Error al terminar stream.");
        return;
      }
      setActionSuccess("Stream terminado correctamente.");
      await loadLives();
    } catch {
      setActionError("Error de conexión.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Streams Activos</h1>
        <span className="badge live-badge">● {lives.length} en directo</span>
      </div>

      {actionError && <div className="alert alert-error">{actionError}</div>}
      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}

      <div className="toolbar">
        <button className="btn-refresh" onClick={loadLives} disabled={loading}>
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando streams…</div>
      ) : lives.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📡</div>
          <p>No hay streams activos en este momento.</p>
        </div>
      ) : (
        <div className="lives-grid">
          {lives.map((live) => (
            <div key={live._id} className="live-card">
              <div className="live-header">
                <span className="live-indicator">● EN VIVO</span>
                <span className="viewer-count">👁 {live.viewerCount ?? 0}</span>
              </div>

              <div className="live-title">{live.title}</div>

              {live.category && (
                <div className="live-meta">{live.category}</div>
              )}

              <div className="live-user">
                {live.user?.avatar ? (
                  <img src={live.user.avatar} alt="" className="user-avatar" />
                ) : (
                  <div className="user-avatar user-avatar--placeholder">
                    {(live.user?.name || live.user?.username || "?")[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="user-name">{live.user?.name || live.user?.username}</div>
                  <div className="user-role">{live.user?.role}</div>
                </div>
              </div>

              <div className="live-info">
                {live.isPrivate && <span className="tag tag-private">Privado · {live.entryCost} coins</span>}
                <span className="live-started">
                  Iniciado {live.createdAt ? new Date(live.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </div>

              <button
                className="btn-end"
                onClick={() => endLive(live._id)}
                disabled={actionLoading === live._id}
              >
                {actionLoading === live._id ? "Terminando…" : "⏹ Forzar fin"}
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .page { max-width: 1200px; }

        .page-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .page-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: #e2e8f0;
          margin: 0;
        }

        .badge {
          background: rgba(167, 139, 250, 0.15);
          color: #a78bfa;
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .live-badge {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          animation: pulse-badge 2s ease-in-out infinite;
        }

        @keyframes pulse-badge {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .toolbar {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .btn-refresh {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }

        .btn-refresh:hover:not(:disabled) { background: #2d3748; }

        .alert {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .alert-error { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
        .alert-success { background: rgba(52, 211, 153, 0.1); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.2); }

        .loading-state {
          text-align: center;
          padding: 3rem;
          color: #64748b;
          font-size: 0.95rem;
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: #64748b;
        }

        .empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }

        .empty-state p { font-size: 0.95rem; margin: 0; }

        .lives-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .live-card {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .live-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .live-indicator {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #f87171;
          animation: pulse-badge 2s ease-in-out infinite;
        }

        .viewer-count {
          font-size: 0.85rem;
          color: #94a3b8;
        }

        .live-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #e2e8f0;
          line-height: 1.3;
        }

        .live-meta {
          font-size: 0.78rem;
          color: #64748b;
        }

        .live-user {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
        }

        .user-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .user-avatar--placeholder {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.78rem;
          color: #fff;
        }

        .user-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #e2e8f0;
        }

        .user-role {
          font-size: 0.72rem;
          color: #64748b;
          text-transform: capitalize;
        }

        .live-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .tag {
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: 0.72rem;
          font-weight: 600;
        }

        .tag-private {
          background: rgba(251, 191, 36, 0.12);
          color: #fbbf24;
        }

        .live-started {
          font-size: 0.75rem;
          color: #64748b;
          margin-left: auto;
        }

        .btn-end {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          border-radius: 8px;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          width: 100%;
          margin-top: auto;
        }

        .btn-end:hover:not(:disabled) { background: rgba(239, 68, 68, 0.18); }
        .btn-end:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
