"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function AdminLivesPage() {
  const router = useRouter();
  const [tab, setTab] = useState("active");
  const [lives, setLives] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/lives`, { headers: authHeader() }),
        fetch(`${API_URL}/api/admin/lives/history`, { headers: authHeader() }),
      ]);
      if (activeRes.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (activeRes.status === 403) { setError("Sin permisos."); return; }
      if (activeRes.ok) {
        const d = await activeRes.json();
        setLives(d.lives || []);
      }
      if (historyRes.ok) {
        const d = await historyRes.json();
        setHistory(d.lives || []);
      }
    } catch {
      setError("Error cargando streams.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadData(); }, [loadData]);

  const showMsg = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const endLive = async (liveId) => {
    if (!confirm("¿Forzar fin de este stream?")) return;
    setActionLoading(liveId);
    try {
      const res = await fetch(`${API_URL}/api/admin/lives/${liveId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg("error", d.message || "Error al terminar stream."); return; }
      showMsg("success", "Stream terminado correctamente.");
      loadData();
    } catch {
      showMsg("error", "Error de conexión.");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDuration = (start, end) => {
    if (!start || !end) return "—";
    const ms = new Date(end) - new Date(start);
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Streams</h1>
        <span className="badge live-badge">● {lives.length} en vivo</span>
      </div>

      {actionMsg.text && (
        <div className={`alert alert-${actionMsg.type}`}>{actionMsg.text}</div>
      )}

      <div className="tabs">
        <button className={`tab${tab === "active" ? " tab--active" : ""}`} onClick={() => setTab("active")}>
          📡 En Vivo ({lives.length})
        </button>
        <button className={`tab${tab === "history" ? " tab--active" : ""}`} onClick={() => setTab("history")}>
          📼 Historial ({history.length})
        </button>
        <button className="btn-refresh" onClick={loadData} disabled={loading}>
          {loading ? "…" : "↺"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando streams…</div>
      ) : tab === "active" ? (
        lives.length === 0 ? (
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
                {live.category && <div className="live-meta">{live.category}</div>}

                <div className="live-user">
                  {live.user?.avatar ? (
                    <img src={live.user.avatar} alt="" className="user-avatar" />
                  ) : (
                    <div className="user-avatar user-avatar--ph">
                      {(live.user?.name || live.user?.username || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="user-name">{live.user?.name || live.user?.username}</div>
                    <div className="user-role">{live.user?.role}</div>
                  </div>
                </div>

                <div className="live-info">
                  {live.isPrivate && <span className="tag tag-private">🔒 Privado · {live.entryCost} coins</span>}
                  <span className="live-started">
                    {live.createdAt ? new Date(live.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—"}
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
        )
      ) : (
        /* History tab */
        history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📼</div>
            <p>No hay historial de streams disponible.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Host</th>
                  <th>Viewers</th>
                  <th>Tipo</th>
                  <th>Duración</th>
                  <th>Terminado</th>
                </tr>
              </thead>
              <tbody>
                {history.map((live) => (
                  <tr key={live._id}>
                    <td className="title-cell">{live.title}</td>
                    <td>
                      <div className="user-cell">
                        {live.user?.avatar ? (
                          <img src={live.user.avatar} alt="" className="mini-avatar" />
                        ) : (
                          <div className="mini-avatar mini-avatar--ph">
                            {(live.user?.name || live.user?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span>{live.user?.name || live.user?.username || "—"}</span>
                      </div>
                    </td>
                    <td className="text-center">{live.viewerCount ?? 0}</td>
                    <td>
                      {live.isPrivate ? (
                        <span className="tag tag-private">Privado</span>
                      ) : (
                        <span className="tag tag-public">Público</span>
                      )}
                    </td>
                    <td className="text-muted">{formatDuration(live.createdAt, live.endedAt)}</td>
                    <td className="text-muted text-sm">
                      {live.endedAt ? new Date(live.endedAt).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <style jsx>{`
        .page { max-width: 1200px; width: 100%; }
        .page-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0; }
        .badge { background: rgba(167,139,250,0.15); color: #a78bfa; border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.8rem; font-weight: 600; }
        .live-badge { background: rgba(239,68,68,0.12); color: #f87171; animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.7; } }
        .tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center; }
        .tab { background: transparent; border: 1px solid #2d3748; color: #94a3b8; border-radius: 8px; padding: 0.5rem 0.9rem; font-size: 0.82rem; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; min-height: 38px; }
        .tab:hover { background: #1e2535; color: #e2e8f0; }
        .tab--active { background: #7c3aed; border-color: #7c3aed; color: #fff; font-weight: 700; }
        .btn-refresh { background: #1e2535; border: 1px solid #2d3748; color: #94a3b8; border-radius: 8px; padding: 0.45rem 0.75rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; margin-left: auto; min-height: 38px; }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; margin-bottom: 1rem; }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .alert-success { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }
        .loading-state { text-align: center; padding: 3rem; color: #64748b; }
        .empty-state { text-align: center; padding: 4rem 2rem; color: #64748b; }
        .empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }
        .empty-state p { font-size: 0.95rem; margin: 0; }
        .lives-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
        @media (max-width: 480px) {
          .lives-grid { grid-template-columns: 1fr; }
        }
        .live-card { background: #161b27; border: 1px solid #1e2535; border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .live-header { display: flex; align-items: center; justify-content: space-between; }
        .live-indicator { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; color: #f87171; animation: pulse 2s ease-in-out infinite; }
        .viewer-count { font-size: 0.85rem; color: #94a3b8; }
        .live-title { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; line-height: 1.3; }
        .live-meta { font-size: 0.78rem; color: #64748b; }
        .live-user { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem; background: rgba(255,255,255,0.03); border-radius: 8px; }
        .user-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .user-avatar--ph { background: linear-gradient(135deg, #7c3aed, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.78rem; color: #fff; }
        .user-name { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
        .user-role { font-size: 0.72rem; color: #64748b; text-transform: capitalize; }
        .live-info { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .tag { border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.72rem; font-weight: 600; }
        .tag-private { background: rgba(251,191,36,0.12); color: #fbbf24; }
        .tag-public { background: rgba(52,211,153,0.1); color: #34d399; }
        .live-started { font-size: 0.75rem; color: #64748b; margin-left: auto; }
        .btn-end { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; border-radius: 8px; padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; width: 100%; margin-top: auto; }
        .btn-end:hover:not(:disabled) { background: rgba(239,68,68,0.18); }
        .btn-end:disabled { opacity: 0.5; cursor: not-allowed; }
        .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #1e2535; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .data-table thead { background: #161b27; border-bottom: 1px solid #1e2535; }
        .data-table th { padding: 0.7rem 0.85rem; text-align: left; color: #64748b; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
        .data-table td { padding: 0.65rem 0.85rem; border-bottom: 1px solid #1a2030; color: #cbd5e1; vertical-align: middle; }
        .data-table tbody tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
        .title-cell { font-weight: 600; color: #e2e8f0; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-cell { display: flex; align-items: center; gap: 0.45rem; }
        .mini-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .mini-avatar--ph { background: linear-gradient(135deg, #7c3aed, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.68rem; color: #fff; }
        .text-center { text-align: center; }
        .text-muted { color: #64748b; }
        .text-sm { font-size: 0.78rem; }
      `}</style>
    </div>
  );
}
