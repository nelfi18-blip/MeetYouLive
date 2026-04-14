"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const ROLE_COLORS = {
  admin: "#a78bfa",
  creator: "#34d399",
  user: "#64748b",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos de administrador."); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setError("Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const doAction = async (userId, action) => {
    setActionLoading(userId + action);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/${action}`, {
        method: "PATCH",
        headers: authHeader(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionError(d.message || "Error al ejecutar acción.");
        return;
      }
      setActionSuccess(action === "block" ? "Usuario bloqueado." : "Usuario desbloqueado.");
      await loadUsers();
    } catch {
      setActionError("Error de conexión.");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Usuarios</h1>
        <span className="badge">{users.length} total</span>
      </div>

      {actionError && <div className="alert alert-error">{actionError}</div>}
      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por nombre, usuario o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-refresh" onClick={loadUsers} disabled={loading}>
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando usuarios…</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Monedas</th>
                <th>Registro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-row">No hay usuarios{search ? " que coincidan con la búsqueda" : ""}.</td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u._id} className={u.isBlocked ? "row-blocked" : ""}>
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
                    </td>
                    <td>
                      {u.isBlocked ? (
                        <span className="status-badge status-blocked">Bloqueado</span>
                      ) : (
                        <span className="status-badge status-active">Activo</span>
                      )}
                    </td>
                    <td className="text-right">{(u.coins ?? 0).toLocaleString()}</td>
                    <td className="text-muted text-sm">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("es") : "—"}
                    </td>
                    <td>
                      <div className="action-row">
                        {u.isBlocked ? (
                          <button
                            className="btn-action btn-unblock"
                            onClick={() => doAction(u._id, "unblock")}
                            disabled={actionLoading === u._id + "unblock"}
                          >
                            {actionLoading === u._id + "unblock" ? "…" : "Desbloquear"}
                          </button>
                        ) : (
                          <button
                            className="btn-action btn-block"
                            onClick={() => doAction(u._id, "block")}
                            disabled={actionLoading === u._id + "block"}
                          >
                            {actionLoading === u._id + "block" ? "…" : "Bloquear"}
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

        .search-input {
          flex: 1;
          min-width: 200px;
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.55rem 0.85rem;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
        }

        .search-input:focus { border-color: #7c3aed; }

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
        .row-blocked td { opacity: 0.6; }

        .text-muted { color: #64748b; }
        .text-sm { font-size: 0.8rem; }
        .text-right { text-align: right; }

        .empty-row { text-align: center; color: #64748b; padding: 2rem; }

        .user-cell {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
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
          font-size: 0.8rem;
          color: #fff;
        }

        .user-name {
          font-weight: 600;
          color: #e2e8f0;
          font-size: 0.875rem;
        }

        .user-username {
          font-size: 0.75rem;
          color: #64748b;
        }

        .role-badge {
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: capitalize;
        }

        .status-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-active { background: rgba(52, 211, 153, 0.12); color: #34d399; }
        .status-blocked { background: rgba(239, 68, 68, 0.12); color: #f87171; }

        .action-row { display: flex; gap: 0.4rem; }

        .btn-action {
          border-radius: 6px;
          padding: 0.3rem 0.7rem;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid transparent;
          transition: opacity 0.15s;
        }

        .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-block {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.25);
          color: #f87171;
        }

        .btn-block:hover:not(:disabled) { background: rgba(239, 68, 68, 0.18); }

        .btn-unblock {
          background: rgba(52, 211, 153, 0.1);
          border-color: rgba(52, 211, 153, 0.25);
          color: #34d399;
        }

        .btn-unblock:hover:not(:disabled) { background: rgba(52, 211, 153, 0.18); }
      `}</style>
    </div>
  );
}
