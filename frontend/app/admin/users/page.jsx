"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { Suspense } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const ROLE_COLORS = {
  admin: "#a78bfa",
  creator: "#34d399",
  user: "#64748b",
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "blocked", label: "Bloqueados" },
  { value: "premium", label: "Premium" },
  { value: "verified", label: "Verificados" },
];

const ROLE_OPTIONS = [
  { value: "", label: "Todos los roles" },
  { value: "user", label: "Usuario" },
  { value: "creator", label: "Creador" },
  { value: "admin", label: "Admin" },
];

function AdminUsersInner() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadUsers = useCallback(async (p = page) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: p, limit: 50 });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${API_URL}/api/admin/users?${params}`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos de administrador."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      setError("Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, search, roleFilter, statusFilter, page]);

  useEffect(() => { loadUsers(page); }, [page, roleFilter, statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadUsers(1);
  };

  const showMsg = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const doAction = async (userId, action) => {
    setActionLoading(userId + action);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/${action}`, {
        method: "PATCH",
        headers: authHeader(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg("error", d.message || "Error al ejecutar acción."); return; }
      const labels = {
        block: "Usuario bloqueado.",
        unblock: "Usuario desbloqueado.",
        suspend: "Usuario suspendido.",
        unsuspend: "Usuario reactivado.",
      };
      showMsg("success", labels[action] || "Acción completada.");
      await loadUsers(page);
    } catch {
      showMsg("error", "Error de conexión.");
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Usuarios</h1>
        <span className="badge">{total.toLocaleString()} total</span>
      </div>

      {actionMsg.text && (
        <div className={`alert alert-${actionMsg.type}`}>{actionMsg.text}</div>
      )}

      {/* Filters */}
      <form className="toolbar" onSubmit={handleSearch}>
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por nombre, usuario o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select-filter" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select-filter" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" className="btn-search">Buscar</button>
        <button type="button" className="btn-refresh" onClick={() => loadUsers(page)} disabled={loading}>
          {loading ? "…" : "↺"}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando usuarios…</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Coins</th>
                  <th>Último activo</th>
                  <th>Registro</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-row">No hay usuarios que coincidan con los filtros.</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u._id} className={u.isBlocked ? "row-blocked" : u.isSuspended ? "row-suspended" : ""}>
                      <td>
                        <div className="user-cell">
                          {u.avatar ? (
                            <img src={u.avatar} alt="" className="user-avatar" />
                          ) : (
                            <div className="user-avatar user-avatar--placeholder">
                              {(u.name || u.username || "?")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="user-name">{u.name || u.username}</div>
                            <div className="user-username">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted text-sm">{u.email}</td>
                      <td>
                        <span className="role-badge" style={{ color: ROLE_COLORS[u.role] || "#64748b" }}>
                          {u.role}
                        </span>
                        {u.creatorStatus && u.creatorStatus !== "none" && (
                          <span className="creator-status">{u.creatorStatus}</span>
                        )}
                      </td>
                      <td>
                        <div className="status-stack">
                          {u.isBlocked ? (
                            <span className="status-badge status-blocked">Bloqueado</span>
                          ) : u.isSuspended ? (
                            <span className="status-badge status-suspended">Suspendido</span>
                          ) : (
                            <span className="status-badge status-active">Activo</span>
                          )}
                          {u.isPremium && <span className="status-badge status-premium">Premium</span>}
                          {u.isVerified && <span className="status-badge status-verified">Verificado</span>}
                        </div>
                      </td>
                      <td className="text-right">{(u.coins ?? 0).toLocaleString()}</td>
                      <td className="text-muted text-sm">
                        {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString("es") : "—"}
                      </td>
                      <td className="text-muted text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("es") : "—"}
                      </td>
                      <td>
                        <div className="action-row">
                          {u.isBlocked ? (
                            <button
                              className="btn-action btn-green"
                              onClick={() => doAction(u._id, "unblock")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === u._id + "unblock" ? "…" : "Desbloquear"}
                            </button>
                          ) : (
                            <button
                              className="btn-action btn-red"
                              onClick={() => doAction(u._id, "block")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === u._id + "block" ? "…" : "Bloquear"}
                            </button>
                          )}
                          {u.isSuspended ? (
                            <button
                              className="btn-action btn-green"
                              onClick={() => doAction(u._id, "unsuspend")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === u._id + "unsuspend" ? "…" : "Reactivar"}
                            </button>
                          ) : (
                            <button
                              className="btn-action btn-yellow"
                              onClick={() => doAction(u._id, "suspend")}
                              disabled={!!actionLoading}
                            >
                              {actionLoading === u._id + "suspend" ? "…" : "Suspender"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
                ← Anterior
              </button>
              <span className="page-info">Página {page} de {totalPages}</span>
              <button className="btn-page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .page { max-width: 1300px; }

        .page-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .page-title { font-size: 1.4rem; font-weight: 700; color: #e2e8f0; margin: 0; }

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
          gap: 0.5rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .search-input {
          flex: 1;
          min-width: 180px;
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.5rem 0.85rem;
          font-size: 0.875rem;
          font-family: inherit;
          outline: none;
        }

        .search-input:focus { border-color: #7c3aed; }

        .select-filter {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          cursor: pointer;
          outline: none;
        }

        .btn-search {
          background: #7c3aed;
          border: none;
          color: #fff;
          border-radius: 8px;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }

        .btn-search:hover { background: #6d28d9; }

        .btn-refresh {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          cursor: pointer;
          font-family: inherit;
        }

        .alert {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .alert-error { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
        .alert-success { background: rgba(52, 211, 153, 0.1); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.2); }

        .loading-state { text-align: center; padding: 3rem; color: #64748b; }

        .table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #1e2535;
        }

        .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }

        .data-table thead { background: #161b27; border-bottom: 1px solid #1e2535; }

        .data-table th {
          padding: 0.7rem 0.85rem;
          text-align: left;
          color: #64748b;
          font-weight: 600;
          font-size: 0.72rem;
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
        .row-blocked td { opacity: 0.55; }
        .row-suspended td { opacity: 0.65; }

        .text-muted { color: #64748b; }
        .text-sm { font-size: 0.78rem; }
        .text-right { text-align: right; }
        .empty-row { text-align: center; color: #64748b; padding: 2rem; }

        .user-cell { display: flex; align-items: center; gap: 0.55rem; }

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
          font-size: 0.75rem;
          color: #fff;
        }

        .user-name { font-weight: 600; color: #e2e8f0; font-size: 0.85rem; }
        .user-username { font-size: 0.72rem; color: #64748b; }

        .role-badge { font-weight: 600; font-size: 0.78rem; text-transform: capitalize; }

        .creator-status {
          display: block;
          font-size: 0.68rem;
          color: #64748b;
          text-transform: capitalize;
          margin-top: 0.1rem;
        }

        .status-stack { display: flex; flex-direction: column; gap: 0.2rem; }

        .status-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 0.12rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .status-active { background: rgba(52, 211, 153, 0.1); color: #34d399; }
        .status-blocked { background: rgba(239, 68, 68, 0.1); color: #f87171; }
        .status-suspended { background: rgba(251, 191, 36, 0.1); color: #fbbf24; }
        .status-premium { background: rgba(167, 139, 250, 0.1); color: #a78bfa; }
        .status-verified { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }

        .action-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }

        .btn-action {
          border-radius: 6px;
          padding: 0.28rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid transparent;
          transition: opacity 0.15s;
          white-space: nowrap;
        }

        .btn-action:disabled { opacity: 0.45; cursor: not-allowed; }

        .btn-red { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25); color: #f87171; }
        .btn-red:hover:not(:disabled) { background: rgba(239, 68, 68, 0.18); }

        .btn-green { background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.25); color: #34d399; }
        .btn-green:hover:not(:disabled) { background: rgba(52, 211, 153, 0.18); }

        .btn-yellow { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.25); color: #fbbf24; }
        .btn-yellow:hover:not(:disabled) { background: rgba(251, 191, 36, 0.18); }

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
        }

        .btn-page:disabled { opacity: 0.4; cursor: not-allowed; }

        .page-info { font-size: 0.85rem; color: #64748b; }
      `}</style>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", color: "#64748b" }}>Cargando…</div>}>
      <AdminUsersInner />
    </Suspense>
  );
}
