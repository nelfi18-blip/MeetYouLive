"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import mobileStyles from "../adminMobile.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
  const { t } = useLanguage();
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
  const STATUS_TABS = [
    { value: "", label: t("adminCreators.tabs.all") },
    { value: "pending", label: t("adminCreators.tabs.pending") },
    { value: "approved", label: t("adminCreators.tabs.approved") },
    { value: "rejected", label: t("adminCreators.tabs.rejected") },
    { value: "suspended", label: t("adminCreators.tabs.suspended") },
  ];

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
      if (res.status === 403) { setError(t("adminCreators.noPermissions")); return; }
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      setCreators(data.creators || []);
      setTotal(data.total || 0);
    } catch {
      setError(t("adminCreators.loadError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter, t]);

  useEffect(() => {
    setStatusFilter(searchParams.get("status") || "");
  }, [searchParams]);

  useEffect(() => { setPage(1); loadCreators(1); }, [loadCreators]);
  useEffect(() => { if (page > 1) loadCreators(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!res.ok) { showMsg("error", d.message || t("adminCreators.genericError")); return; }
      const labels = {
        approve: t("adminCreators.messages.approve"),
        reject: t("adminCreators.messages.reject"),
        suspend: t("adminCreators.messages.suspend"),
        reactivate: t("adminCreators.messages.reactivate"),
      };
      showMsg("success", labels[action] || t("adminCreators.messages.actionCompleted"));
      loadCreators(page);
    } catch {
      showMsg("error", t("adminCreators.connectionError"));
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

  // Derived per-creator display data shared by the desktop table and the
  // mobile card list, so both views read from the same source with no
  // duplicated business logic or extra API calls.
  const enrichedCreators = filteredCreators.map((c) => {
    const quality = getCreatorProfileQuality(c);
    const qualityLabel =
      quality.label === "high"
        ? t("adminCreators.labels.high")
        : quality.label === "medium"
        ? t("adminCreators.labels.medium")
        : t("adminCreators.labels.low");
    const activityLabel =
      (c.loginCount || 0) >= 20
        ? t("adminCreators.labels.high")
        : (c.loginCount || 0) >= 8
        ? t("adminCreators.labels.medium")
        : t("adminCreators.labels.low");
    const agencyRelStatus = c.agencyRelationship?.status;
    const hasActiveAgency = agencyRelStatus === "active" || agencyRelStatus === "pending";
    const agencyRelPct = c.agencyRelationship?.parentCreatorPercentage;
    const statusStyle = STATUS_COLORS[c.creatorStatus] || STATUS_COLORS.none;
    const country = c.creatorApplication?.country || c.creatorProfile?.country || "";
    const registeredAt = c.creatorApplication?.submittedAt || c.createdAt || null;
    return {
      c,
      quality,
      qualityLabel,
      activityLabel,
      agencyRelStatus,
      hasActiveAgency,
      agencyRelPct,
      statusStyle,
      country,
      registeredAt,
    };
  });

  const renderActionButtons = (creatorId, status) => (
    <>
      {status === "pending" && (
        <>
          <button
            className="btn-action btn-green"
            onClick={() => doAction(creatorId, "approve")}
            disabled={!!actionLoading}
          >
            {actionLoading === creatorId + "approve" ? "…" : t("adminCreators.actions.approve")}
          </button>
          <button
            className="btn-action btn-red"
            onClick={() => doAction(creatorId, "reject")}
            disabled={!!actionLoading}
          >
            {actionLoading === creatorId + "reject" ? "…" : t("adminCreators.actions.reject")}
          </button>
        </>
      )}
      {status === "approved" && (
        <button
          className="btn-action btn-yellow"
          onClick={() => doAction(creatorId, "suspend")}
          disabled={!!actionLoading}
        >
          {actionLoading === creatorId + "suspend" ? "…" : t("adminCreators.actions.suspend")}
        </button>
      )}
      {(status === "suspended" || status === "rejected") && (
        <button
          className="btn-action btn-green"
          onClick={() => doAction(creatorId, "reactivate")}
          disabled={!!actionLoading}
        >
          {actionLoading === creatorId + "reactivate" ? "…" : t("adminCreators.actions.reactivate")}
        </button>
      )}
    </>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t("adminCreators.title")}</h1>
        <span className="badge">{total.toLocaleString()} total</span>
      </div>

      {actionMsg.text && (
        <div className={`alert alert-${actionMsg.type}`}>{actionMsg.text}</div>
      )}

      {statusFilter === "pending" && !loading && filteredCreators.length > 0 && (
        <div className="pending-review-banner">
          <span className="pending-review-icon">⏳</span>
          <span className="pending-review-text">
            <strong>{filteredCreators.length === 1 ? t("adminCreators.pendingOne") : t("adminCreators.pendingMany").replace("{count}", String(filteredCreators.length))}</strong> — {t("adminCreators.pendingBanner")}
          </span>
        </div>
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
          placeholder={t("adminCreators.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="quality-select" value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}>
          <option value="all">{t("adminCreators.quality.all")}</option>
          <option value="high">{t("adminCreators.quality.high")}</option>
          <option value="medium">{t("adminCreators.quality.medium")}</option>
          <option value="low">{t("adminCreators.quality.low")}</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">{t("adminCreators.loading")}</div>
      ) : (
        <>
          <div className={`table-wrap ${mobileStyles.desktopOnly}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("adminCreators.table.creator")}</th>
                  <th>{t("adminCreators.table.email")}</th>
                  <th>{t("adminCreators.table.status")}</th>
                  <th>{t("adminCreators.table.category")}</th>
                  <th>{t("adminCreators.table.eligibility")}</th>
                  <th>{t("adminCreators.table.profileQuality")}</th>
                  <th>{t("adminCreators.table.agency")}</th>
                  <th>{t("adminCreators.table.activity")}</th>
                  <th>{t("adminCreators.table.earnings")}</th>
                  <th>{t("adminCreators.table.registered")}</th>
                  <th>{t("adminCreators.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {enrichedCreators.length === 0 ? (
                  <tr>
                      <td colSpan={11} className="empty-row">{t("adminCreators.empty").replace("{suffix}", statusFilter ? ` ${t("adminCreators.emptyWithStatus").replace("{status}", t(`adminCreators.statusValues.${statusFilter}`))}` : "")}</td>
                  </tr>
                ) : (
                  enrichedCreators.map(({ c, quality, qualityLabel, activityLabel, agencyRelStatus, hasActiveAgency, agencyRelPct, statusStyle }) => {
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
                        <td className="text-sm">
                          {c.creatorApplication?.eligibilityAcceptedAt ? (
                            <div>
                              <span className="quality-chip quality-high">{t("adminCreators.eligibilityConfirmed")}</span>
                              <div className="text-muted" style={{ fontSize: "0.68rem", marginTop: "0.1rem" }}>
                                {new Date(c.creatorApplication.eligibilityAcceptedAt).toLocaleDateString(t("common.locale"))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`quality-chip quality-${quality.label}`}>{qualityLabel}</span>
                        </td>
                        <td className="text-sm">
                          {c.pendingAgencyCode ? (
                            <div>
                              <span className="agency-invite-code">{c.pendingAgencyCode}</span>
                              <div className="text-muted" style={{ fontSize: "0.68rem", marginTop: "0.1rem" }}>{t("adminCreators.pendingInvite")}</div>
                            </div>
                          ) : hasActiveAgency ? (
                            <div>
                              <span
                                className="agency-rel-badge"
                                style={{
                                  color: agencyRelStatus === "active" ? "#34d399" : "#fbbf24",
                                  borderColor: agencyRelStatus === "active" ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)",
                                }}
                              >
                                {agencyRelStatus === "active" ? t("adminCreators.status.active") : t("adminCreators.status.pending")}
                              </span>
                              {agencyRelPct ? (
                                <div className="text-muted" style={{ fontSize: "0.68rem", marginTop: "0.1rem" }}>{t("adminCreators.commission").replace("{percent}", String(agencyRelPct))}</div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-muted text-sm">
                          <div>{t("adminCreators.loginCount").replace("{count}", String(c.loginCount || 0)).replace("{level}", activityLabel)}</div>
                          <div>{c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString(t("common.locale")) : t("adminCreators.noRecentActivity")}</div>
                        </td>
                        <td className="text-right">{(c.earningsCoins ?? 0).toLocaleString()} 🪙</td>
                        <td className="text-muted text-sm">
                          {c.creatorApplication?.submittedAt
                            ? new Date(c.creatorApplication.submittedAt).toLocaleDateString(t("common.locale"))
                            : c.createdAt ? new Date(c.createdAt).toLocaleDateString(t("common.locale")) : "—"}
                        </td>
                        <td>
                          <div className="action-row">
                            <textarea
                              className="review-note"
                              placeholder={t("adminCreators.reviewNotePlaceholder")}
                              value={reviewNotes[c._id] || ""}
                              onChange={(e) => setReviewNotes((prev) => ({ ...prev, [c._id]: e.target.value.slice(0, MAX_REVIEW_NOTE_LENGTH) }))}
                            />
                            {renderActionButtons(c._id, c.creatorStatus)}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards: same enrichedCreators data + doAction/reviewNotes, no duplicate fetches */}
          <div className={mobileStyles.mobileList}>
            {enrichedCreators.length === 0 ? (
              <div className="empty-row">{t("adminCreators.empty").replace("{suffix}", statusFilter ? ` ${t("adminCreators.emptyWithStatus").replace("{status}", t(`adminCreators.statusValues.${statusFilter}`))}` : "")}</div>
            ) : (
              enrichedCreators.map(({ c, quality, qualityLabel, activityLabel, agencyRelStatus, hasActiveAgency, agencyRelPct, statusStyle, country, registeredAt }) => (
                <div className={mobileStyles.card} key={c._id}>
                  <div className={mobileStyles.cardHeader}>
                    {c.avatar ? (
                      <img src={c.avatar} alt="" className={mobileStyles.cardAvatar} />
                    ) : (
                      <div className={`${mobileStyles.cardAvatar} ${mobileStyles.cardAvatarPh}`}>
                        {(c.name || c.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div className={mobileStyles.cardIdentity}>
                      <div className={mobileStyles.cardName}>{c.name || c.username}</div>
                      <div className={mobileStyles.cardSub}>@{c.username}</div>
                      <div className={mobileStyles.cardSub}>{c.email}</div>
                    </div>
                  </div>

                  <div className={mobileStyles.cardBadges}>
                    <span className="status-badge" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                      {c.creatorStatus}
                    </span>
                    <span className={`quality-chip quality-${quality.label}`}>{qualityLabel}</span>
                    {c.creatorApplication?.eligibilityAcceptedAt && (
                      <span className="quality-chip quality-high">{t("adminCreators.eligibilityConfirmed")}</span>
                    )}
                  </div>

                  <div className={mobileStyles.fieldGrid}>
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>{t("adminCreators.table.category")}</span>
                      <span className={mobileStyles.fieldValue}>{c.creatorApplication?.category || c.creatorProfile?.category || "—"}</span>
                    </div>
                    {country && (
                      <div className={mobileStyles.field}>
                        <span className={mobileStyles.fieldLabel}>{t("adminCreators.table.country")}</span>
                        <span className={mobileStyles.fieldValue}>{country}</span>
                      </div>
                    )}
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>{t("adminCreators.table.registered")}</span>
                      <span className={mobileStyles.fieldValue}>{registeredAt ? new Date(registeredAt).toLocaleDateString(t("common.locale")) : "—"}</span>
                    </div>
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>{t("adminCreators.table.activity")}</span>
                      <span className={mobileStyles.fieldValue}>
                        {t("adminCreators.loginCount").replace("{count}", String(c.loginCount || 0)).replace("{level}", activityLabel)}
                        {" · "}
                        {c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString(t("common.locale")) : t("adminCreators.noRecentActivity")}
                      </span>
                    </div>
                    <div className={mobileStyles.field}>
                      <span className={mobileStyles.fieldLabel}>{t("adminCreators.table.earnings")}</span>
                      <span className={mobileStyles.fieldValue}>{(c.earningsCoins ?? 0).toLocaleString()} 🪙</span>
                    </div>
                    {(c.pendingAgencyCode || hasActiveAgency) && (
                      <div className={mobileStyles.field}>
                        <span className={mobileStyles.fieldLabel}>{t("adminCreators.table.agency")}</span>
                        <span className={mobileStyles.fieldValue}>
                          {c.pendingAgencyCode
                            ? `${c.pendingAgencyCode} (${t("adminCreators.pendingInvite")})`
                            : `${agencyRelStatus === "active" ? t("adminCreators.status.active") : t("adminCreators.status.pending")}${agencyRelPct ? ` · ${t("adminCreators.commission").replace("{percent}", String(agencyRelPct))}` : ""}`}
                        </span>
                      </div>
                    )}
                  </div>

                  <textarea
                    className={mobileStyles.note}
                    placeholder={t("adminCreators.reviewNotePlaceholder")}
                    value={reviewNotes[c._id] || ""}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [c._id]: e.target.value.slice(0, MAX_REVIEW_NOTE_LENGTH) }))}
                  />

                  <div className={mobileStyles.actions}>
                    {renderActionButtons(c._id, c.creatorStatus)}
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>← {t("adminCreators.pagination.previous")}</button>
              <span className="page-info">{t("adminCreators.pagination.page").replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
              <button className="btn-page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>{t("adminCreators.pagination.next")} →</button>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .pending-review-banner {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          background: rgba(251, 191, 36, 0.07);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
          color: rgba(251, 191, 36, 0.85);
          margin-bottom: 1rem;
        }
        .pending-review-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 0.05rem; }
        .pending-review-text { line-height: 1.5; }
        .text-approve { color: #34d399; }
        .text-reject { color: #f87171; }
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
        .agency-invite-code { display: inline-block; background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3); color: #c4b5fd; border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.72rem; font-weight: 700; font-family: monospace; }
        .agency-rel-badge { display: inline-block; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.72rem; font-weight: 600; border: 1px solid; }
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
    <Suspense fallback={<div style={{ padding: "2rem", color: "#64748b" }}>...</div>}>
      <CreatorsInner />
    </Suspense>
  );
}
