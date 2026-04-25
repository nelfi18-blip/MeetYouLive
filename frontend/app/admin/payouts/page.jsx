"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobado",
  paid: "Pagado",
  rejected: "Rechazado",
  processing: "En proceso",
  completed: "Completado",
};

const STATUS_COLORS = {
  pending: "#f59e0b",
  approved: "#3b82f6",
  paid: "#22c55e",
  rejected: "#ef4444",
  processing: "#6366f1",
  completed: "#22c55e",
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#64748b";
  const label = STATUS_LABELS[status] || status;
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      background: color + "22",
      border: `1px solid ${color}66`,
      color,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function RejectModal({ payout, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onConfirm(payout._id, reason);
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
    }}>
      <div style={{
        background: "#161b27",
        border: "1px solid #2d3748",
        borderRadius: 12,
        padding: "1.5rem",
        width: "100%",
        maxWidth: 420,
      }}>
        <h3 style={{ color: "#e2e8f0", margin: "0 0 0.5rem", fontSize: "1rem" }}>
          Rechazar solicitud de retiro
        </h3>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 1rem" }}>
          Los fondos (<strong style={{ color: "#fbbf24" }}>{(payout.amountCoins || 0).toLocaleString()} 🪙</strong>) serán
          devueltos al balance del creador automáticamente.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.4rem" }}>
            Motivo del rechazo (opcional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ej: Información bancaria incorrecta"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#0f1117", border: "1px solid #2d3748",
              color: "#e2e8f0", borderRadius: 8,
              padding: "0.6rem 0.75rem", fontSize: "0.85rem",
              resize: "vertical", fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} disabled={loading}
              style={{ background: "#1e2535", border: "1px solid #2d3748", color: "#94a3b8", borderRadius: 8, padding: "0.5rem 1rem", cursor: "pointer", fontSize: "0.85rem", fontFamily: "inherit" }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 8, padding: "0.5rem 1rem", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 600, fontFamily: "inherit" }}>
              {loading ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>Cargando…</div>}>
      <AdminPayoutsContent />
    </Suspense>
  );
}

function AdminPayoutsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [payouts, setPayouts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  const statusFilter = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("admin_token");
    if (!token) { router.replace("/admin/login"); return; }

    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (statusFilter) params.set("status", statusFilter);

    try {
      const res = await fetch(`${API_URL}/api/admin/payouts?${params}`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (!res.ok) throw new Error("Error al cargar pagos");
      const data = await res.json();
      setPayouts(data.payouts || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, authHeader, router]);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const performAction = async (payoutId, status, extra = {}) => {
    setActionError("");
    setActionSuccess("");
    setActionLoading((prev) => ({ ...prev, [payoutId]: status }));
    try {
      const res = await fetch(`${API_URL}/api/admin/payouts/${payoutId}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al actualizar");
      setActionSuccess(`Solicitud actualizada: ${STATUS_LABELS[status] || status}`);
      await loadPayouts();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading((prev) => { const n = { ...prev }; delete n[payoutId]; return n; });
    }
  };

  const handleApprove = (payoutId) => performAction(payoutId, "approved");
  const handleMarkPaid = (payoutId) => performAction(payoutId, "paid");
  const handleRejectConfirm = async (payoutId, reason) => {
    await performAction(payoutId, "rejected", { rejectionReason: reason });
    setRejectTarget(null);
  };

  const setFilter = (s) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    params.set("page", "1");
    router.push(`/admin/payouts?${params}`);
  };

  const setPage = (p) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(p));
    router.push(`/admin/payouts?${params}`);
  };

  const filterOptions = [
    { value: "", label: "Todos" },
    { value: "pending", label: "Pendientes" },
    { value: "approved", label: "Aprobados" },
    { value: "paid", label: "Pagados" },
    { value: "rejected", label: "Rechazados" },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">💸 Solicitudes de Retiro</h1>
          <p className="page-sub">Gestiona las solicitudes de pago de creadores</p>
        </div>
        <button className="btn-refresh" onClick={loadPayouts} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      <div className="info-banner">
        ⚠️ Los retiros son <strong>manuales</strong>. Aprueba la solicitud, transfiere los fondos externamente y luego marca como pagado.
      </div>

      {actionError && <div className="alert alert-error">{actionError}</div>}
      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}

      {/* Filters */}
      <div className="filters">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            className={`filter-btn${statusFilter === opt.value ? " filter-btn--active" : ""}`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <span className="total-count">{total.toLocaleString()} solicitudes</span>
      </div>

      {loading ? (
        <div className="loading-state">Cargando…</div>
      ) : error ? (
        <div className="error-state">{error}</div>
      ) : payouts.length === 0 ? (
        <div className="empty-state">No hay solicitudes de retiro{statusFilter ? ` con estado "${STATUS_LABELS[statusFilter]}"` : ""}.</div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="payout-table">
              <thead>
                <tr>
                  <th>Creador</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Notas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const isTerminal = ["paid", "completed", "rejected"].includes(p.status);
                  const isPending = p.status === "pending";
                  const isApproved = p.status === "approved";
                  const busy = actionLoading[p._id];

                  return (
                    <tr key={p._id} className={`row row--${p.status}`}>
                      <td className="creator-cell">
                        {p.creator?.avatar ? (
                          <img src={p.creator.avatar} alt="" className="creator-avatar" />
                        ) : (
                          <div className="creator-avatar creator-avatar--ph">
                            {(p.creator?.name || p.creator?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <div className="creator-info">
                          <div className="creator-name">{p.creator?.name || p.creator?.username || "—"}</div>
                          <div className="creator-email">{p.creator?.email || ""}</div>
                          {p.creator?.isSuspended && <span className="suspended-badge">Suspendido</span>}
                        </div>
                      </td>
                      <td className="amount-cell">
                        <span className="amount-value">{(p.amountCoins || 0).toLocaleString()}</span>
                        <span className="amount-unit"> 🪙</span>
                      </td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="date-cell">{formatDate(p.createdAt)}</td>
                      <td className="notes-cell">
                        {p.rejectionReason ? (
                          <span title={p.rejectionReason} className="rejection-reason">
                            ❌ {p.rejectionReason.slice(0, 40)}{p.rejectionReason.length > 40 ? "…" : ""}
                          </span>
                        ) : p.notes ? (
                          <span className="notes-text" title={p.notes}>{p.notes.slice(0, 40)}{p.notes.length > 40 ? "…" : ""}</span>
                        ) : "—"}
                      </td>
                      <td className="actions-cell">
                        {isTerminal ? (
                          <span className="processed-label">
                            {p.status === "rejected" ? "Rechazado" : "Procesado"}
                            {p.processedAt ? ` · ${formatDate(p.processedAt)}` : ""}
                          </span>
                        ) : (
                          <div className="action-buttons">
                            {isPending && (
                              <button
                                className="action-btn action-btn--approve"
                                onClick={() => handleApprove(p._id)}
                                disabled={!!busy}
                                title="Aprobar solicitud"
                              >
                                {busy === "approved" ? "…" : "✅ Aprobar"}
                              </button>
                            )}
                            {isApproved && (
                              <button
                                className="action-btn action-btn--paid"
                                onClick={() => handleMarkPaid(p._id)}
                                disabled={!!busy}
                                title="Marcar como pagado (tras transferir fondos manualmente)"
                              >
                                {busy === "paid" ? "…" : "💰 Marcar pagado"}
                              </button>
                            )}
                            {(isPending || isApproved) && (
                              <button
                                className="action-btn action-btn--reject"
                                onClick={() => setRejectTarget(p)}
                                disabled={!!busy}
                                title="Rechazar y devolver fondos al creador"
                              >
                                {busy === "rejected" ? "…" : "❌ Rechazar"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="page-btn">← Anterior</button>
              <span className="page-info">Página {page} de {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="page-btn">Siguiente →</button>
            </div>
          )}
        </>
      )}

      {rejectTarget && (
        <RejectModal
          payout={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      <style jsx>{`
        .page { max-width: 1280px; }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1.25rem;
          gap: 1rem;
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: #e2e8f0;
          margin: 0 0 0.2rem;
        }

        .page-sub { font-size: 0.875rem; color: #64748b; margin: 0; }

        .btn-refresh {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
          flex-shrink: 0;
        }
        .btn-refresh:hover:not(:disabled) { background: #2d3748; }

        .info-banner {
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
          color: #fde68a;
          margin-bottom: 1.25rem;
        }

        .alert {
          padding: 0.7rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }
        .alert-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }
        .alert-success { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.25); color: #86efac; }

        .filters {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .filter-btn {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 999px;
          padding: 0.4rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, color 0.15s;
        }
        .filter-btn:hover { background: #2d3748; color: #e2e8f0; }
        .filter-btn--active { background: rgba(124,58,237,0.15); border-color: rgba(124,58,237,0.4); color: #a78bfa; }

        .total-count {
          margin-left: auto;
          font-size: 0.78rem;
          color: #475569;
        }

        .table-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #1e2535;
        }

        .payout-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }

        .payout-table th {
          text-align: left;
          color: #64748b;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.7rem 1rem;
          border-bottom: 1px solid #1e2535;
          background: #161b27;
          white-space: nowrap;
        }

        .payout-table td {
          padding: 0.75rem 1rem;
          color: #cbd5e1;
          border-bottom: 1px solid #131825;
          vertical-align: middle;
        }

        .payout-table tbody tr:last-child td { border-bottom: none; }
        .payout-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

        .creator-cell { min-width: 180px; }
        .creator-cell > div,
        .creator-cell > img { display: inline-block; vertical-align: middle; }

        .creator-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          object-fit: cover;
          vertical-align: middle;
          margin-right: 0.6rem;
          flex-shrink: 0;
        }
        .creator-avatar--ph {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.75rem;
          color: #fff;
          margin-right: 0.6rem;
        }

        .creator-cell {
          display: flex;
          align-items: center;
          gap: 0;
        }
        .creator-info { display: inline-block; vertical-align: middle; }
        .creator-name { font-weight: 600; color: #e2e8f0; font-size: 0.85rem; }
        .creator-email { font-size: 0.72rem; color: #475569; }

        .suspended-badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.25);
          color: #f87171;
          font-size: 10px;
          font-weight: 700;
          margin-top: 2px;
        }

        .amount-cell { white-space: nowrap; }
        .amount-value { font-weight: 700; color: #fbbf24; font-size: 0.95rem; }
        .amount-unit { color: #64748b; font-size: 0.8rem; }

        .date-cell { font-size: 0.78rem; color: #64748b; white-space: nowrap; }

        .notes-cell { max-width: 180px; }
        .rejection-reason { color: #f87171; font-size: 0.78rem; }
        .notes-text { color: #64748b; font-size: 0.78rem; }

        .actions-cell { min-width: 220px; }
        .action-buttons { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .action-btn {
          border-radius: 7px;
          padding: 0.35rem 0.65rem;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid transparent;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .action-btn--approve { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); color: #86efac; }
        .action-btn--paid { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #93c5fd; }
        .action-btn--reject { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }

        .processed-label { font-size: 0.75rem; color: #475569; }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.25rem;
        }
        .page-btn {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.45rem 0.85rem;
          font-size: 0.82rem;
          cursor: pointer;
          font-family: inherit;
        }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-info { font-size: 0.82rem; color: #64748b; }

        .loading-state, .empty-state, .error-state {
          padding: 3rem;
          text-align: center;
          color: #64748b;
          font-size: 0.9rem;
        }
        .error-state { color: #f87171; }

        @media (max-width: 767px) {
          .page-header { flex-direction: column; }
          .btn-refresh { width: 100%; text-align: center; }
          .table-wrapper { border-radius: 8px; }
          .payout-table th, .payout-table td { padding: 0.6rem 0.75rem; }
          .actions-cell { min-width: 160px; }
        }
      `}</style>
    </div>
  );
}
