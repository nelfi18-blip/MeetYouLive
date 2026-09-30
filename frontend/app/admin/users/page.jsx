"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { getAdminUserEmailStatus } from "@/lib/adminUsers";
import { useLanguage } from "@/contexts/LanguageContext";
import mobileStyles from "../adminMobile.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const ROLE_COLORS = {
  admin: "#a78bfa",
  creator: "#34d399",
  user: "#64748b",
};

function AdminUsersInner() {
  const router = useRouter();
  const { t } = useLanguage();
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
  const [pendingVerifyUserId, setPendingVerifyUserId] = useState(null);
  const STATUS_OPTIONS = [
    { value: "", label: t("adminUsers.filters.allStatuses") },
    { value: "active", label: t("adminUsers.filters.active") },
    { value: "blocked", label: t("adminUsers.filters.blocked") },
    { value: "premium", label: t("adminUsers.filters.premium") },
    { value: "verified", label: t("adminUsers.filters.verified") },
  ];
  const ROLE_OPTIONS = [
    { value: "", label: t("adminUsers.filters.allRoles") },
    { value: "user", label: t("adminUsers.filters.user") },
    { value: "creator", label: t("adminUsers.filters.creator") },
    { value: "admin", label: t("adminUsers.filters.admin") },
  ];

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
      const res = await fetch(`${API_URL}/api/admin/users?${params}`, {
        headers: authHeader(),
        cache: "no-store",
      });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError(t("adminUsers.noAdminPermissions")); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      setError(t("adminUsers.loadError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, search, roleFilter, statusFilter, page, t]);

  useEffect(() => { loadUsers(page); }, [page, roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!res.ok) { showMsg("error", d.message || t("adminUsers.actionError")); return; }
      const labels = {
        block: t("adminUsers.messages.block"),
        unblock: t("adminUsers.messages.unblock"),
        suspend: t("adminUsers.messages.suspend"),
        unsuspend: t("adminUsers.messages.unsuspend"),
        "verify-email": t("adminUsers.messages.verifyEmail"),
      };
      showMsg("success", labels[action] || t("adminUsers.messages.actionCompleted"));
      await loadUsers(page);
    } catch {
      showMsg("error", t("adminUsers.connectionError"));
    } finally {
      setActionLoading(null);
    }
  };

  const pendingVerifyUser = users.find((u) => u._id === pendingVerifyUserId);

  const confirmEmailVerification = async () => {
    const userId = pendingVerifyUserId;
    setPendingVerifyUserId(null);
    if (userId) await doAction(userId, "verify-email");
  };

  const doHardDelete = async (userId, userInfo) => {
    // Sanitize userInfo for display (truncate and remove potentially harmful characters)
    const sanitizedInfo = String(userInfo || t("adminUsers.thisUser"))
      .replace(/[<>'"]/g, '') // Remove potentially harmful characters
      .substring(0, 50); // Limit length
    
    const confirmMsg = t("adminUsers.deleteConfirm").replace("{user}", sanitizedInfo);
    if (!confirm(confirmMsg)) return;

    setActionLoading(userId + "hard-delete");
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/hard-delete`, {
        method: "DELETE",
        headers: authHeader(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { 
        showMsg("error", d.message || t("adminUsers.deleteError")); 
        return; 
      }
      showMsg("success", t("adminUsers.deleteSuccess"));
      await loadUsers(page);
    } catch {
      showMsg("error", t("adminUsers.connectionError"));
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / 50);

  // Derived per-user display data shared by the desktop table and the
  // mobile card list; both read the same `users` array and action handlers.
  const enrichedUsers = users.map((u) => ({ u, emailStatus: getAdminUserEmailStatus(u) }));

  const renderUserActions = (u, emailStatus) => (
    <>
      {u.isBlocked ? (
        <button
          className="btn-action btn-green"
          onClick={() => doAction(u._id, "unblock")}
          disabled={!!actionLoading}
        >
          {actionLoading === u._id + "unblock" ? "…" : t("adminUsers.actions.unblock")}
        </button>
      ) : (
        <button
          className="btn-action btn-red"
          onClick={() => doAction(u._id, "block")}
          disabled={!!actionLoading}
        >
          {actionLoading === u._id + "block" ? "…" : t("adminUsers.actions.block")}
        </button>
      )}
      {u.isSuspended ? (
        <button
          className="btn-action btn-green"
          onClick={() => doAction(u._id, "unsuspend")}
          disabled={!!actionLoading}
        >
          {actionLoading === u._id + "unsuspend" ? "…" : t("adminUsers.actions.reactivate")}
        </button>
      ) : (
        <button
          className="btn-action btn-yellow"
          onClick={() => doAction(u._id, "suspend")}
          disabled={!!actionLoading}
        >
          {actionLoading === u._id + "suspend" ? "…" : t("adminUsers.actions.suspend")}
        </button>
      )}
      {emailStatus.canVerifyManually && (
        <button
          className="btn-action btn-blue"
          onClick={() => setPendingVerifyUserId(u._id)}
          disabled={!!actionLoading}
        >
          {actionLoading === u._id + "verify-email" ? "…" : t("adminUsers.actions.verifyEmail")}
        </button>
      )}
      <button
        className="btn-action btn-danger"
        onClick={() => doHardDelete(u._id, u.username || u.email)}
        disabled={!!actionLoading}
        title={t("adminUsers.deleteTitle")}
      >
        {actionLoading === u._id + "hard-delete" ? "…" : `🗑️ ${t("adminUsers.actions.deleteUser")}`}
      </button>
    </>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t("adminUsers.title")}</h1>
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
          placeholder={t("adminUsers.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select-filter" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select-filter" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" className="btn-search">{t("adminUsers.search")}</button>
        <button type="button" className="btn-refresh" onClick={() => loadUsers(page)} disabled={loading}>
          {loading ? "…" : "↺"}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {pendingVerifyUserId && (
       <div className="modal-backdrop" role="presentation">
         <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="verify-email-title">
           <h2 id="verify-email-title">{t("adminUsers.verifyEmailTitle")}</h2>
           <p>{t("adminUsers.verifyEmailConfirm")}</p>
           {pendingVerifyUser?.email && <p className="confirm-email">{pendingVerifyUser.email}</p>}
           <div className="confirm-actions">
             <button type="button" className="btn-modal btn-modal-secondary" onClick={() => setPendingVerifyUserId(null)}>
               {t("common.cancel")}
             </button>
             <button type="button" className="btn-modal btn-modal-primary" onClick={confirmEmailVerification}>
               {t("adminUsers.confirm")}
             </button>
           </div>
         </div>
       </div>
      )}

      {loading ? (
        <div className="loading-state">{t("adminUsers.loading")}</div>
      ) : (
        <>
          <div className={`table-wrap ${mobileStyles.desktopOnly}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("adminUsers.table.user")}</th>
                  <th>{t("adminUsers.table.email")}</th>
                  <th>{t("adminUsers.table.role")}</th>
                  <th>{t("adminUsers.table.status")}</th>
                  <th>Coins</th>
                  <th>{t("adminUsers.table.lastActive")}</th>
                  <th>{t("adminUsers.table.registered")}</th>
                  <th>{t("adminUsers.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {enrichedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-row">{t("adminUsers.empty")}</td>
                  </tr>
                ) : (
                  enrichedUsers.map(({ u, emailStatus }) => {
                    return (
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
                            <span className="status-badge status-blocked">{t("adminUsers.status.blocked")}</span>
                          ) : u.isSuspended ? (
                            <span className="status-badge status-suspended">{t("adminUsers.status.suspended")}</span>
                          ) : (
                            <span className="status-badge status-active">{t("adminUsers.status.active")}</span>
                          )}
                          {u.isPremium && <span className="status-badge status-premium">{t("adminUsers.status.premium")}</span>}
                          {u.isVerified && <span className="status-badge status-verified">{t("adminUsers.status.verified")}</span>}
                          <span className={`status-badge ${emailStatus.className}`}>{emailStatus.label}</span>
                        </div>
                      </td>
                      <td className="text-right">{(u.coins ?? 0).toLocaleString()}</td>
                      <td className="text-muted text-sm">
                        {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString(t("common.locale")) : "—"}
                      </td>
                      <td className="text-muted text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString(t("common.locale")) : "—"}
                      </td>
                      <td>
                        <div className="action-row">
                          {renderUserActions(u, emailStatus)}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards: same enrichedUsers data + doAction/doHardDelete, no duplicate fetches */}
          <div className={mobileStyles.mobileList}>
            {enrichedUsers.length === 0 ? (
              <div className="empty-row">{t("adminUsers.empty")}</div>
            ) : (
              enrichedUsers.map(({ u, emailStatus }) => (
                <div
                  className={`${mobileStyles.card}${u.isBlocked || u.isSuspended ? " row-blocked" : ""}`}
                  key={u._id}
                >
                  <div className={mobileStyles.cardHeader}>
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className={mobileStyles.cardAvatar} />
                    ) : (
                      <div className={`${mobileStyles.cardAvatar} ${mobileStyles.cardAvatarPh}`}>
                        {(u.name || u.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div className={mobileStyles.cardIdentity}>
                      <div className={mobileStyles.cardName}>{u.name || u.username}</div>
                      <div className={mobileStyles.cardSub}>@{u.username}</div>
                      <div className={mobileStyles.cardSub}>{u.email}</div>
                    </div>
                  </div>

                  <div className={mobileStyles.cardBadges}>
                    <span className="role-badge" style={{ color: ROLE_COLORS[u.role] || "#64748b" }}>
                      {u.role}
                    </span>
                    {u.creatorStatus && u.creatorStatus !== "none" && (
                      <span className="creator-status">{u.creatorStatus}</span>
                    )}
                    {u.isBlocked ? (
                      <span className="status-badge status-blocked">{t("adminUsers.status.blocked")}</span>
                    ) : u.isSuspended ? (
                      <span className="status-badge status-suspended">{t("adminUsers.status.suspended")}</span>
                    ) : (
                      <span className="status-badge status-active">{t("adminUsers.status.active")}</span>
                    )}
                    {u.isPremium && <span className="status-badge status-premium">{t("adminUsers.status.premium")}</span>}
                    {u.isVerified && <span className="status-badge status-verified">{t("adminUsers.status.verified")}</span>}
                    <span className={`status-badge ${emailStatus.className}`}>{emailStatus.label}</span>
                  </div>

                  <div className={mobileStyles.fieldGrid}>
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>Coins</span>
                      <span className={mobileStyles.fieldValue}>{(u.coins ?? 0).toLocaleString()}</span>
                    </div>
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>{t("adminUsers.table.lastActive")}</span>
                      <span className={mobileStyles.fieldValue}>{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString(t("common.locale")) : "—"}</span>
                    </div>
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>{t("adminUsers.table.registered")}</span>
                      <span className={mobileStyles.fieldValue}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString(t("common.locale")) : "—"}</span>
                    </div>
                  </div>

                  <div className={mobileStyles.actions}>
                    {renderUserActions(u, emailStatus)}
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
                ← {t("adminUsers.pagination.previous")}
              </button>
              <span className="page-info">{t("adminUsers.pagination.page").replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
              <button className="btn-page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>
                {t("adminUsers.pagination.next")} →
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

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(15, 23, 42, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .confirm-modal {
          width: min(100%, 420px);
          background: #111827;
          border: 1px solid #2d3748;
          border-radius: 14px;
          padding: 1.25rem;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
        }

        .confirm-modal h2 { margin: 0 0 0.55rem; color: #e2e8f0; font-size: 1rem; }
        .confirm-modal p { margin: 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.45; }
        .confirm-email { margin-top: 0.65rem !important; color: #94a3b8 !important; word-break: break-all; }

        .confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.6rem;
          margin-top: 1.2rem;
        }

        .btn-modal {
          border-radius: 8px;
          padding: 0.5rem 0.85rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid transparent;
        }

        .btn-modal-secondary { background: #1e2535; border-color: #2d3748; color: #cbd5e1; }
        .btn-modal-primary { background: #7c3aed; color: #fff; }
        .btn-modal-secondary:hover { background: #263044; }
        .btn-modal-primary:hover { background: #6d28d9; }

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
        .status-email-verified { background: rgba(52, 211, 153, 0.1); color: #34d399; }
        .status-email-unverified { background: rgba(251, 146, 60, 0.1); color: #fb923c; }
        .status-google { background: rgba(96, 165, 250, 0.1); color: #60a5fa; }
        .status-admin-account { background: rgba(167, 139, 250, 0.1); color: #a78bfa; }
        .status-email-unknown { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }

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
        .btn-blue { background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.25); color: #38bdf8; }
        .btn-blue:hover:not(:disabled) { background: rgba(56, 189, 248, 0.18); }

        .btn-danger { background: rgba(220, 38, 38, 0.1); border-color: rgba(220, 38, 38, 0.3); color: #ef4444; }
        .btn-danger:hover:not(:disabled) { background: rgba(220, 38, 38, 0.2); }

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
    <Suspense fallback={<div style={{ padding: "2rem", color: "#64748b" }}>...</div>}>
      <AdminUsersInner />
    </Suspense>
  );
}
