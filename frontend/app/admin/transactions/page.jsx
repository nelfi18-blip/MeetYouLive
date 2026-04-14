"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TYPE_LABELS = {
  purchase: "Compra",
  gift_sent: "Regalo enviado",
  gift_received: "Regalo recibido",
  crush_sent: "Crush enviado",
  crush_received: "Crush recibido",
  private_call: "Llamada privada",
  call_started: "Llamada iniciada",
  call_earned: "Ganado (llamada)",
  room_entry: "Entrada a sala",
  content_unlock: "Contenido desbloqueado",
  content_earned: "Contenido ganado",
  refund: "Reembolso",
  admin_adjustment: "Ajuste admin",
  agency_earned: "Ganado (agencia)",
  agency_distributed: "Distribuido (agencia)",
  boost_crush: "Boost crush",
  boost_pack: "Pack boost",
  swipe_unlock: "Desbloqueo swipe",
  daily_reward: "Recompensa diaria",
  simulation_unlock: "Simulación",
  like_unlock: "Like desbloqueado",
  referral_reward: "Recompensa referido",
  mission_reward: "Recompensa misión",
};

const TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
];

const AMOUNT_COLOR = (amount) => {
  if (amount > 0) return "#34d399";
  if (amount < 0) return "#f87171";
  return "#64748b";
};

export default function AdminTransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadTransactions = useCallback(async (currentPage, type) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: currentPage, limit: 50 });
      if (type) params.set("type", type);
      const res = await fetch(`${API_URL}/api/admin/transactions?${params}`, {
        headers: authHeader(),
      });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos de administrador."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch {
      setError("Error cargando transacciones.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => {
    loadTransactions(page, typeFilter);
  }, [loadTransactions, page, typeFilter]);

  const handleTypeChange = (e) => {
    setTypeFilter(e.target.value);
    setPage(1);
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Transacciones de Monedas</h1>
        <span className="badge">{total.toLocaleString()} total</span>
      </div>

      <div className="toolbar">
        <select
          className="select-filter"
          value={typeFilter}
          onChange={handleTypeChange}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          className="btn-refresh"
          onClick={() => loadTransactions(page, typeFilter)}
          disabled={loading}
        >
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando transacciones…</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Razón</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-row">No hay transacciones{typeFilter ? " de este tipo" : ""}.</td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx._id}>
                      <td>
                        <div className="user-cell">
                          {tx.userId?.avatar ? (
                            <img src={tx.userId.avatar} alt="" className="user-avatar" />
                          ) : (
                            <div className="user-avatar user-avatar--placeholder">
                              {(tx.userId?.name || tx.userId?.username || "?")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="user-name">{tx.userId?.name || tx.userId?.username || "—"}</div>
                            {tx.userId?.username && <div className="user-username">@{tx.userId.username}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="type-badge">{TYPE_LABELS[tx.type] || tx.type}</span>
                      </td>
                      <td>
                        <span className="amount" style={{ color: AMOUNT_COLOR(tx.amount) }}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} 🪙
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${tx.status}`}>{tx.status}</span>
                      </td>
                      <td className="text-muted text-sm">{tx.reason || "—"}</td>
                      <td className="text-muted text-sm">
                        {tx.createdAt
                          ? new Date(tx.createdAt).toLocaleString("es", {
                              day: "2-digit", month: "2-digit", year: "2-digit",
                              hour: "2-digit", minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn-page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                ← Anterior
              </button>
              <span className="page-info">Página {page} de {totalPages}</span>
              <button
                className="btn-page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
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

        .toolbar {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .select-filter {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.55rem 0.85rem;
          font-size: 0.875rem;
          font-family: inherit;
          cursor: pointer;
          outline: none;
          min-width: 200px;
        }

        .select-filter:focus { border-color: #7c3aed; }

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

        .loading-state {
          text-align: center;
          padding: 3rem;
          color: #64748b;
          font-size: 0.95rem;
        }

        .table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #1e2535;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .data-table thead {
          background: #161b27;
          border-bottom: 1px solid #1e2535;
        }

        .data-table th {
          padding: 0.75rem 1rem;
          text-align: left;
          color: #64748b;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .data-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #1a2030;
          color: #cbd5e1;
          vertical-align: middle;
        }

        .data-table tbody tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: rgba(255, 255, 255, 0.02); }

        .text-muted { color: #64748b; }
        .text-sm { font-size: 0.8rem; }
        .empty-row { text-align: center; color: #64748b; padding: 2rem; }

        .user-cell {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .user-avatar {
          width: 28px;
          height: 28px;
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
          font-size: 0.75rem;
          color: #fff;
        }

        .user-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #e2e8f0;
        }

        .user-username {
          font-size: 0.72rem;
          color: #64748b;
        }

        .type-badge {
          font-size: 0.78rem;
          font-weight: 500;
          color: #94a3b8;
        }

        .amount {
          font-weight: 700;
          font-size: 0.9rem;
        }

        .status-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .status-completed { background: rgba(52, 211, 153, 0.12); color: #34d399; }
        .status-pending { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
        .status-failed { background: rgba(239, 68, 68, 0.12); color: #f87171; }
        .status-refunded { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.25rem;
        }

        .btn-page {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.45rem 0.9rem;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }

        .btn-page:hover:not(:disabled) { background: #2d3748; }
        .btn-page:disabled { opacity: 0.4; cursor: not-allowed; }

        .page-info {
          font-size: 0.85rem;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}
