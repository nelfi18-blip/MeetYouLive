"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_TABS = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "suspended", label: "Suspendidos" },
];

const STATUS_COLORS = {
  pending: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
  approved: { bg: "rgba(52,211,153,0.1)", color: "#34d399" },
  rejected: { bg: "rgba(239,68,68,0.1)", color: "#f87171" },
  suspended: { bg: "rgba(148,163,184,0.1)", color: "#94a3b8" },
  none: { bg: "rgba(100,116,139,0.1)", color: "#64748b" },
};
const MAX_REVIEW_NOTE_LENGTH = 300;

const getCreatorProfileQuality = (creator) => {
  const app = creator?.creatorApplication || {};
  const score =
    (app.bio?.trim() ? 1 : 0) +
    (app.category?.trim() ? 1 : 0) +
    (app.country?.trim() ? 1 : 0) +
    ((app.languages || []).length > 0 ? 1 : 0) +
    (Object.values(app.socialLinks || {}).filter(Boolean).length > 0 ? 1 : 0);
  return {
    score,
    label: score >= 4 ? "high" : score >= 2 ? "medium" : "low",
  };
};

function CreatorsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creators, setCreators] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [search, setSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [reviewNotes, setReviewNotes] = useState({});

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadCreators = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: p, limit: 50 });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${API_URL}/api/admin/creators?${params}`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setCreators(data.creators || []);
      setTotal(data.total || 0);
    } catch {
      setError("Error cargando creadores.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter]);

  useEffect(() => { setPage(1); loadCreators(1); }, [statusFilter]);
  useEffect(() => { if (page > 1) loadCreators(page); }, [page]);

  const showMsg = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const doAction = async (creatorId, action) => {
    setActionLoading(creatorId + action);
    try {
      const reason = (reviewNotes[creatorId] || "").trim();
      const res = await fetch(`${API_URL}/api/admin/creators/${creatorId}/${action}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg("error", d.message || "Error."); return; }
      const labels = { approve: "Creador aprobado.", reject: "Solicitud rechazada.", suspend: "Creador suspendido.", reactivate: "Creador reactivado." };
      showMsg("success", labels[action] || "Acción completada.");
      loadCreators(page);
    } catch {
      showMsg("error", "Error de conexión.");
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / 50);
  const filteredCreators = creators.filter((c) => {
    const q = search.trim().toLowerCase();
    const app = c.creatorApplication || {};
    const qualityLabel = getCreatorProfileQuality(c).label;
    const inQuality = qualityFilter === "all" ? true : qualityFilter === qualityLabel;
    const inSearch =
      !q ||
      [c.name, c.username, c.email, app.category, app.bio]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    return inQuality && inSearch;
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Creadores</h1>
        <span className="badge">{total.toLocaleString()} total</span>
      </div>

      {actionMsg.text && (
        <div className={`alert alert-${actionMsg.type}`}>{actionMsg.text}</div>
      )}

      {/* Status tabs */}
      <div className="tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`tab${statusFilter === tab.value ? " tab--active" : ""}`}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
        <button className="btn-refresh" onClick={() => loadCreators(page)} disabled={loading}>
          {loading ? "…" : "↺"}
        </button>
      </div>

      <div className="filters-row">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar creador, email o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="quality-select" value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}>
          <option value="all">Calidad: todas</option>
          <option value="high">Calidad alta</option>
          <option value="medium">Calidad media</option>
          <option value="low">Calidad baja</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando creadores…</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Creador</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>Categoría</th>
                  <th>Calidad perfil</th>
                  <th>Actividad</th>
                  <th>Ganancias</th>
                  <th>Registro</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCreators.length === 0 ? (
                  <tr>
                      <td colSpan={9} className="empty-row">No hay creadores{statusFilter ? ` con estado "${statusFilter}"` : ""}.</td>
                  </tr>
                ) : (
                  filteredCreators.map((c) => {
                    const statusStyle = STATUS_COLORS[c.creatorStatus] || STATUS_COLORS.none;
                    const quality = getCreatorProfileQuality(c);
                    const qualityLabel = quality.label === "high" ? "Alta" : quality.label === "medium" ? "Media" : "Baja";
                    const activityLabel = (c.loginCount || 0) >= 20 ? "Alta" : (c.loginCount || 0) >= 8 ? "Media" : "Baja";
                    return (
                      <tr key={c._id}>
                        <td>
                          <div className="user-cell">
                            {c.avatar ? (
                              <img src={c.avatar} alt="" className="user-avatar" />
                            ) : (
                              <div className="user-avatar user-avatar--ph">
                                {(c.name || c.username || "?")[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="user-name">{c.name || c.username}</div>
                              <div className="user-username">@{c.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-muted text-sm">{c.email}</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{ background: statusStyle.bg, color: statusStyle.color }}
                          >
                            {c.creatorStatus}
                          </span>
                        </td>
                        <td className="text-muted text-sm">{c.creatorApplication?.category || c.creatorProfile?.category || "—"}</td>
                        <td>
                          <span className={`quality-chip quality-${qualityLabel.toLowerCase()}`}>{qualityLabel}</span>
                        </td>
                        <td className="text-muted text-sm">
                          <div>{activityLabel} ({c.loginCount || 0} logins)</div>
                          <div>{c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString("es") : "Sin actividad reciente"}</div>
                        </td>
                        <td className="text-right">{(c.earningsCoins ?? 0).toLocaleString()} 🪙</td>
                        <td className="text-muted text-sm">
                          {c.creatorApplication?.submittedAt
                            ? new Date(c.creatorApplication.submittedAt).toLocaleDateString("es")
                            : c.createdAt ? new Date(c.createdAt).toLocaleDateString("es") : "—"}
                        </td>
                        <td>
                          <div className="action-row">
                            <textarea
                              className="review-note"
                              placeholder="Motivo (opcional)"
                              value={reviewNotes[c._id] || ""}
                              onChange={(e) => setReviewNotes((prev) => ({ ...prev, [c._id]: e.target.value.slice(0, MAX_REVIEW_NOTE_LENGTH) }))}
                            />
                            {c.creatorStatus === "pending" && (
                              <>
                                <button
                                  className="btn-action btn-green"
                                  onClick={() => doAction(c._id, "approve")}
                                  disabled={!!actionLoading}
                                >
                                  {actionLoading === c._id + "approve" ? "…" : "Aprobar"}
                                </button>
                                <button
                                  className="btn-action btn-red"
                                  onClick={() => doAction(c._id, "reject")}
                                  disabled={!!actionLoading}
                                >
                                  {actionLoading === c._id + "reject" ? "…" : "Rechazar"}
                                </button>
                              </>
                            )}
                            {c.creatorStatus === "approved" && (
                              <button
                                className="btn-action btn-yellow"
                                onClick={() => doAction(c._id, "suspend")}
                                disabled={!!actionLoading}
                              >
                                {actionLoading === c._id + "suspend" ? "…" : "Suspender"}
                              </button>
                            )}
                            {(c.creatorStatus === "suspended" || c.creatorStatus === "rejected") && (
                              <button
                                className="btn-action btn-green"
                                onClick={() => doAction(c._id, "reactivate")}
                                disabled={!!actionLoading}
                              >
                                {actionLoading === c._id + "reactivate" ? "…" : "Reactivar"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>← Anterior</button>
              <span className="page-info">Página {page} de {totalPages}</span>
              <button className="btn-page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .page { max-width: 1200px; }
        .page-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0; }
        .badge { background: rgba(167,139,250,0.15); color: #a78bfa; border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.8rem; font-weight: 600; }
        .tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center; }
        .filters-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .search-input, .quality-select {
          background: #141a25; border: 1px solid #2d3748; color: #cbd5e1;
          border-radius: 8px; padding: 0.5rem 0.7rem; font-size: 0.82rem; font-family: inherit;
        }
        .search-input { min-width: 240px; flex: 1; }
        .tab { background: transparent; border: 1px solid #2d3748; color: #94a3b8; border-radius: 8px; padding: 0.45rem 0.9rem; font-size: 0.82rem; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .tab:hover { background: #1e2535; color: #e2e8f0; }
        .tab--active { background: #7c3aed; border-color: #7c3aed; color: #fff; font-weight: 700; }
        .btn-refresh { background: #1e2535; border: 1px solid #2d3748; color: #94a3b8; border-radius: 8px; padding: 0.45rem 0.75rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; margin-left: auto; }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; margin-bottom: 1rem; }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .alert-success { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }
        .loading-state { text-align: center; padding: 3rem; color: #64748b; }
        .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #1e2535; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .data-table thead { background: #161b27; border-bottom: 1px solid #1e2535; }
        .data-table th { padding: 0.7rem 0.85rem; text-align: left; color: #64748b; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
        .data-table td { padding: 0.65rem 0.85rem; border-bottom: 1px solid #1a2030; color: #cbd5e1; vertical-align: middle; }
        .data-table tbody tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
        .text-muted { color: #64748b; }
        .text-sm { font-size: 0.78rem; }
        .text-right { text-align: right; }
        .empty-row { text-align: center; color: #64748b; padding: 2rem; }
        .user-cell { display: flex; align-items: center; gap: 0.55rem; }
        .user-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .user-avatar--ph { background: linear-gradient(135deg, #7c3aed, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; color: #fff; }
        .user-name { font-weight: 600; color: #e2e8f0; font-size: 0.85rem; }
        .user-username { font-size: 0.72rem; color: #64748b; }
        .status-badge { display: inline-block; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
        .quality-chip { display: inline-block; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.72rem; font-weight: 700; }
        .quality-alta { background: rgba(52,211,153,0.12); color: #34d399; }
        .quality-media { background: rgba(251,191,36,0.12); color: #fbbf24; }
        .quality-baja { background: rgba(248,113,113,0.12); color: #f87171; }
        .action-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }
        .review-note {
          width: 100%;
          min-height: 56px;
          resize: vertical;
          background: #121826;
          border: 1px solid #2d3748;
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 0.72rem;
          padding: 0.35rem 0.45rem;
          margin-bottom: 0.35rem;
        }
        .btn-action { border-radius: 6px; padding: 0.28rem 0.65rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; font-family: inherit; border: 1px solid transparent; transition: opacity 0.15s; white-space: nowrap; }
        .btn-action:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-green { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.25); color: #34d399; }
        .btn-green:hover:not(:disabled) { background: rgba(52,211,153,0.18); }
        .btn-red { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
        .btn-red:hover:not(:disabled) { background: rgba(239,68,68,0.18); }
        .btn-yellow { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.25); color: #fbbf24; }
        .btn-yellow:hover:not(:disabled) { background: rgba(251,191,36,0.18); }
        .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.25rem; }
        .btn-page { background: #1e2535; border: 1px solid #2d3748; color: #94a3b8; border-radius: 8px; padding: 0.45rem 0.9rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; }
        .btn-page:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-info { font-size: 0.85rem; color: #64748b; }
      `}</style>
    </div>
  );
}

export default function AdminCreatorsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", color: "#64748b" }}>Cargando…</div>}>
      <CreatorsInner />
    </Suspense>
  );
}
