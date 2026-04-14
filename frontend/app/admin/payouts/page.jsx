"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_TABS = [
  { value: "pending",    label: "⏳ Pendientes" },
  { value: "processing", label: "🔄 En proceso" },
  { value: "completed",  label: "✅ Completados" },
  { value: "rejected",   label: "❌ Rechazados" },
  { value: "",           label: "Todos" },
];

const STATUS_STYLES = {
  pending:    { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  processing: { bg: "rgba(56,189,248,0.12)",  color: "#38bdf8" },
  completed:  { bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  rejected:   { bg: "rgba(239,68,68,0.12)",   color: "#f87171" },
};

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [payouts, setPayouts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [notesModal, setNotesModal] = useState(null); // { payoutId, status }
  const [notes, setNotes] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${API_URL}/api/admin/payouts?${params}`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos."); return; }
      if (!res.ok) throw new Error("server");
      const d = await res.json();
      setPayouts(d.payouts || []);
    } catch {
      setError("Error cargando solicitudes de pago.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const openNotesModal = (payoutId, status) => {
    setNotesModal({ payoutId, status });
    setNotes("");
  };

  const confirmAction = async () => {
    if (!notesModal) return;
    const { payoutId, status } = notesModal;
    setActionLoading(payoutId + status);
    setNotesModal(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/payouts/${payoutId}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg("error", d.message || "Error."); return; }
      const labels = { processing: "Marcado en proceso.", completed: "Pago completado.", rejected: "Solicitud rechazada." };
      showMsg("success", labels[status] || "Acción completada.");
      load();
    } catch {
      showMsg("error", "Error de conexión.");
    } finally {
      setActionLoading(null);
      setNotes("");
    }
  };

  const fmtdt = (d) => d ? new Date(d).toLocaleString("es", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";

  const pendingTotal = payouts.filter(p => p.status === "pending").reduce((a, p) => a + (p.amountCoins || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Solicitudes de Pago</h1>
          <p className="page-sub">Gestiona los retiros de los creadores</p>
        </div>
        <button className="btn-refresh" onClick={load} disabled={loading}>
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {statusFilter === "pending" && payouts.length > 0 && (
        <div className="summary-banner">
          <span className="summary-icon">💸</span>
          <span><strong>{payouts.length}</strong> solicitudes pendientes · Total: <strong>{pendingTotal.toLocaleString()} 🪙</strong></span>
        </div>
      )}

      {actionMsg.text && (
        <div className={`alert alert-${actionMsg.type}`}>{actionMsg.text}</div>
      )}

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
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando solicitudes…</div>
      ) : payouts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💸</div>
          <p>No hay solicitudes{statusFilter ? ` con estado "${statusFilter}"` : ""}.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Creador</th>
                <th>Método</th>
                <th>Cantidad</th>
                <th>Dirección / Info</th>
                <th>Estado</th>
                <th>Notas</th>
                <th>Solicitado</th>
                <th>Procesado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => {
                const ss = STATUS_STYLES[p.status] || {};
                return (
                  <tr key={p._id}>
                    <td>
                      <div className="user-cell">
                        {p.creator?.avatar ? (
                          <img src={p.creator.avatar} alt="" className="avatar" />
                        ) : (
                          <div className="avatar avatar-ph">
                            {(p.creator?.name || p.creator?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="user-name">{p.creator?.name || p.creator?.username || "—"}</div>
                          <div className="user-email">{p.creator?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm">{p.method || "—"}</td>
                    <td className="coin-val">{(p.amountCoins ?? 0).toLocaleString()} 🪙</td>
                    <td className="address-cell text-sm text-muted">{p.address || "—"}</td>
                    <td>
                      <span className="status-badge" style={{ background: ss.bg, color: ss.color }}>
                        {p.status}
                      </span>
                    </td>
                    <td className="text-muted text-sm">{p.notes || "—"}</td>
                    <td className="text-muted text-sm">{fmtdt(p.createdAt)}</td>
                    <td className="text-muted text-sm">{fmtdt(p.processedAt)}</td>
                    <td>
                      <div className="action-row">
                        {p.status === "pending" && (
                          <>
                            <button
                              className="btn-action btn-blue"
                              onClick={() => openNotesModal(p._id, "processing")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === p._id + "processing" ? "…" : "En proceso"}
                            </button>
                            <button
                              className="btn-action btn-green"
                              onClick={() => openNotesModal(p._id, "completed")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === p._id + "completed" ? "…" : "Completar"}
                            </button>
                            <button
                              className="btn-action btn-red"
                              onClick={() => openNotesModal(p._id, "rejected")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === p._id + "rejected" ? "…" : "Rechazar"}
                            </button>
                          </>
                        )}
                        {p.status === "processing" && (
                          <>
                            <button
                              className="btn-action btn-green"
                              onClick={() => openNotesModal(p._id, "completed")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === p._id + "completed" ? "…" : "Completar"}
                            </button>
                            <button
                              className="btn-action btn-red"
                              onClick={() => openNotesModal(p._id, "rejected")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === p._id + "rejected" ? "…" : "Rechazar"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes modal */}
      {notesModal && (
        <div className="modal-overlay" onClick={() => setNotesModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {notesModal.status === "completed" ? "✅ Completar pago" :
               notesModal.status === "processing" ? "🔄 Marcar en proceso" :
               "❌ Rechazar solicitud"}
            </h3>
            <p className="modal-desc">Añade notas opcionales para esta acción.</p>
            <textarea
              className="notes-input"
              placeholder="Notas (opcional)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            <div className="modal-actions">
              <button className="btn-modal-confirm" onClick={confirmAction}>
                Confirmar
              </button>
              <button className="btn-modal-cancel" onClick={() => setNotesModal(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page { max-width: 1300px; }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1.25rem;
          gap: 1rem;
        }

        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0 0 0.2rem; }
        .page-sub { font-size: 0.85rem; color: #64748b; margin: 0; }

        .btn-refresh {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .summary-banner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.2);
          color: #fbbf24;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .summary-icon { font-size: 1.1rem; }

        .alert {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1rem;
        }
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .alert-success { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }

        .tabs {
          display: flex;
          gap: 0.4rem;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }

        .tab {
          background: transparent;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.45rem 0.9rem;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .tab:hover { background: #1e2535; color: #e2e8f0; }
        .tab--active { background: #7c3aed; border-color: #7c3aed; color: #fff; font-weight: 700; }

        .loading-state { text-align: center; padding: 3rem; color: #64748b; }

        .empty-state { text-align: center; padding: 4rem 2rem; color: #64748b; }
        .empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }
        .empty-state p { font-size: 0.95rem; margin: 0; }

        .table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #1e2535;
        }

        .data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .data-table thead { background: #161b27; border-bottom: 1px solid #1e2535; }
        .data-table th {
          padding: 0.7rem 0.85rem;
          text-align: left;
          color: #64748b;
          font-weight: 600;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .data-table td {
          padding: 0.65rem 0.85rem;
          border-bottom: 1px solid #1a2030;
          color: #cbd5e1;
          vertical-align: middle;
        }
        .data-table tbody tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

        .text-sm { font-size: 0.78rem; }
        .text-muted { color: #64748b; }
        .coin-val { color: #fbbf24; font-weight: 700; white-space: nowrap; }

        .user-cell { display: flex; align-items: center; gap: 0.5rem; }

        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .avatar-ph {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          font-weight: 700;
          font-size: 0.75rem;
          color: #fff;
        }

        .user-name { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
        .user-email { font-size: 0.7rem; color: #64748b; }

        .address-cell { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .status-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 0.12rem 0.55rem;
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .action-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }

        .btn-action {
          border-radius: 6px;
          padding: 0.28rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid transparent;
          white-space: nowrap;
        }
        .btn-action:disabled { opacity: 0.45; cursor: not-allowed; }

        .btn-blue { background: rgba(56,189,248,0.1); border-color: rgba(56,189,248,0.25); color: #38bdf8; }
        .btn-blue:hover:not(:disabled) { background: rgba(56,189,248,0.18); }
        .btn-green { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.25); color: #34d399; }
        .btn-green:hover:not(:disabled) { background: rgba(52,211,153,0.18); }
        .btn-red { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
        .btn-red:hover:not(:disabled) { background: rgba(239,68,68,0.18); }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 1rem;
        }

        .modal {
          background: #161b27;
          border: 1px solid #2d3748;
          border-radius: 16px;
          padding: 1.75rem;
          width: 100%;
          max-width: 420px;
        }

        .modal-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #e2e8f0;
          margin: 0 0 0.4rem;
        }

        .modal-desc {
          font-size: 0.85rem;
          color: #64748b;
          margin: 0 0 1rem;
        }

        .notes-input {
          width: 100%;
          background: #0f1117;
          border: 1px solid #2d3748;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          font-family: inherit;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
          margin-bottom: 1rem;
        }
        .notes-input:focus { border-color: #7c3aed; }

        .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

        .btn-modal-confirm {
          background: #7c3aed;
          border: none;
          color: #fff;
          border-radius: 8px;
          padding: 0.55rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-modal-confirm:hover { background: #6d28d9; }

        .btn-modal-cancel {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-size: 0.875rem;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-modal-cancel:hover { background: #2d3748; }
      `}</style>
    </div>
  );
}
