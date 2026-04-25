"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_LABELS = {
  pending: "Pendiente",
  processing: "En proceso",
  completed: "Pagado",
  rejected: "Rechazado",
};

const STATUS_COLORS = {
  pending: "badge--yellow",
  processing: "badge--blue",
  completed: "badge--green",
  rejected: "badge--red",
};

function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_COLORS[status] || "badge--gray"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function AdminPayoutsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("admin_token");
    if (!token) { router.replace("/admin/login"); return; }
    try {
      const url = statusFilter
        ? `${API_URL}/api/admin/payouts?status=${statusFilter}`
        : `${API_URL}/api/admin/payouts`;
      const res = await fetch(url, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (!res.ok) { setError("Error cargando retiros."); return; }
      const data = await res.json();
      setPayouts(data.payouts || []);
    } catch {
      setError("Error cargando retiros.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter]);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const counts = payouts.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const filterOptions = [
    { value: "", label: "Todos" },
    { value: "pending", label: `Pendientes${counts.pending ? ` (${counts.pending})` : ""}` },
    { value: "processing", label: `En proceso${counts.processing ? ` (${counts.processing})` : ""}` },
    { value: "completed", label: `Pagados${counts.completed ? ` (${counts.completed})` : ""}` },
    { value: "rejected", label: `Rechazados${counts.rejected ? ` (${counts.rejected})` : ""}` },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/admin" className="back-link">← Dashboard</Link>
          <h1 className="page-title">💸 Pagos y Retiros</h1>
          <p className="page-sub">Gestión de solicitudes de retiro de creadores</p>
        </div>
        <button className="btn-refresh" onClick={loadPayouts} disabled={loading}>
          ↺ Actualizar
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="filter-tabs">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            className={`filter-tab${statusFilter === opt.value ? " filter-tab--active" : ""}`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="loading-state">
          <div className="loading-spinner">⊞</div>
          <p>Cargando retiros…</p>
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {!loading && !error && payouts.length === 0 && (
        <div className="empty-state">
          <p>No hay retiros{statusFilter ? ` con estado "${STATUS_LABELS[statusFilter] || statusFilter}"` : ""}.</p>
        </div>
      )}

      {!loading && !error && payouts.length > 0 && (
        <div className="table-wrap">
          <table className="payouts-table">
            <thead>
              <tr>
                <th>Creador</th>
                <th>Coins</th>
                <th>Estado</th>
                <th>Solicitado</th>
                <th>Procesado</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div className="creator-cell">
                      {p.creator?.avatar ? (
                        <img src={p.creator.avatar} alt="" className="creator-avatar" />
                      ) : (
                        <div className="creator-avatar creator-avatar--ph">
                          {(p.creator?.name || p.creator?.username || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="creator-name">{p.creator?.name || p.creator?.username || "—"}</div>
                        <div className="creator-email">{p.creator?.email || ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="coins-cell">{(p.amountCoins ?? 0).toLocaleString()} 🪙</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="date-cell">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-ES") : "—"}</td>
                  <td className="date-cell">{p.processedAt ? new Date(p.processedAt).toLocaleDateString("es-ES") : "—"}</td>
                  <td className="notes-cell">{p.notes || <span className="no-notes">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .page { max-width: 1280px; }

        .back-link {
          display: inline-block;
          font-size: 0.78rem;
          color: #64748b;
          text-decoration: none;
          margin-bottom: 0.35rem;
          transition: color 0.15s;
        }
        .back-link:hover { color: #94a3b8; }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }

        .page-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: #e2e8f0;
          margin: 0 0 0.25rem;
        }

        .page-sub {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0;
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
          white-space: nowrap;
          flex-shrink: 0;
        }
        .btn-refresh:hover:not(:disabled) { background: #2d3748; }

        .filter-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-bottom: 1.5rem;
        }

        .filter-tab {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 999px;
          padding: 0.4rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .filter-tab:hover { background: #2d3748; color: #e2e8f0; }
        .filter-tab--active {
          background: rgba(124, 58, 237, 0.15);
          border-color: rgba(124, 58, 237, 0.4);
          color: #a78bfa;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4rem;
          color: #64748b;
          gap: 0.75rem;
        }
        .loading-spinner {
          font-size: 2.5rem;
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .error-state {
          padding: 2rem;
          text-align: center;
          color: #f87171;
          font-size: 0.95rem;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #64748b;
          font-size: 0.9rem;
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 12px;
        }

        .table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #1e2535;
        }

        .payouts-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }

        .payouts-table th {
          text-align: left;
          color: #64748b;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #1e2535;
          background: #161b27;
          white-space: nowrap;
        }

        .payouts-table td {
          padding: 0.75rem 1rem;
          color: #cbd5e1;
          border-bottom: 1px solid #131825;
          vertical-align: middle;
        }

        .payouts-table tbody tr:last-child td { border-bottom: none; }

        .payouts-table tbody tr:hover td {
          background: rgba(30, 37, 53, 0.5);
        }

        .creator-cell {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .creator-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }
        .creator-avatar--ph {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.7rem;
          color: #fff;
        }
        .creator-name {
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
        }
        .creator-email {
          font-size: 0.72rem;
          color: #64748b;
          white-space: nowrap;
        }

        .coins-cell {
          font-weight: 700;
          color: #fbbf24;
          white-space: nowrap;
        }

        .date-cell {
          white-space: nowrap;
          font-size: 0.8rem;
          color: #94a3b8;
        }

        .notes-cell {
          max-width: 220px;
          font-size: 0.8rem;
          color: #94a3b8;
          word-break: break-word;
        }
        .no-notes { color: #2d3748; }

        /* Status badges */
        .badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .badge--yellow {
          background: rgba(251, 191, 36, 0.12);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }
        .badge--blue {
          background: rgba(59, 130, 246, 0.12);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .badge--green {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .badge--red {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .badge--gray {
          background: rgba(100, 116, 139, 0.1);
          color: #94a3b8;
          border: 1px solid rgba(100, 116, 139, 0.2);
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .btn-refresh {
            width: 100%;
            text-align: center;
          }
          .payouts-table th,
          .payouts-table td {
            padding: 0.6rem 0.65rem;
          }
        }
      `}</style>
    </div>
  );
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4rem", color: "#64748b", gap: "0.75rem" }}>
        <div style={{ fontSize: "2.5rem" }}>⊞</div>
        <p>Cargando retiros…</p>
      </div>
    }>
      <AdminPayoutsContent />
    </Suspense>
  );
}
