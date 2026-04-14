"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_STYLES = {
  pending:  { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  approved: { bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  rejected: { bg: "rgba(239,68,68,0.12)",   color: "#f87171" },
  suspended:{ bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
};

const PAYOUT_STATUS_STYLES = {
  pending:    { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  processing: { bg: "rgba(56,189,248,0.12)",  color: "#38bdf8" },
  completed:  { bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  rejected:   { bg: "rgba(239,68,68,0.12)",   color: "#f87171" },
};

export default function CreatorDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/creators/${id}`, { headers: authHeader() });
      if (res.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }
      if (res.status === 403) { setError("Sin permisos."); return; }
      if (res.status === 404) { setError("Creador no encontrado."); return; }
      if (!res.ok) throw new Error("server");
      const d = await res.json();
      setData(d);
    } catch {
      setError("Error cargando detalles del creador.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, id]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const doAction = async (action) => {
    setActionLoading(action);
    try {
      const res = await fetch(`${API_URL}/api/admin/creators/${id}/${action}`, {
        method: "PATCH",
        headers: authHeader(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg("error", d.message || "Error."); return; }
      const labels = { approve: "Creador aprobado.", reject: "Solicitud rechazada.", suspend: "Creador suspendido.", reactivate: "Creador reactivado." };
      showMsg("success", labels[action] || "Acción completada.");
      load();
    } catch {
      showMsg("error", "Error de conexión.");
    } finally {
      setActionLoading(null);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const fmtdt = (d) => d ? new Date(d).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const dur = (s, e) => {
    if (!s || !e) return "—";
    const m = Math.floor((new Date(e) - new Date(s)) / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  if (loading) {
    return <div className="loading-state">Cargando creador…</div>;
  }
  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <Link href="/admin/creators" className="back-link">← Volver a creadores</Link>
      </div>
    );
  }

  const { creator, lives = [], gifts = [], payouts = [] } = data || {};
  if (!creator) return null;

  const statusStyle = STATUS_STYLES[creator.creatorStatus] || {};
  const totalGiftCoins = useMemo(() => gifts.reduce((acc, g) => acc + (g.coinCost || 0), 0), [gifts]);

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <Link href="/admin/creators" className="back-link">← Creadores</Link>
        <button className="btn-refresh" onClick={load} disabled={loading}>↺</button>
      </div>

      {actionMsg.text && (
        <div className={`alert alert-${actionMsg.type}`}>{actionMsg.text}</div>
      )}

      {/* Profile card */}
      <div className="profile-card">
        <div className="profile-top">
          <div className="avatar-wrap">
            {creator.avatar ? (
              <img src={creator.avatar} alt="" className="avatar" />
            ) : (
              <div className="avatar avatar-ph">
                {(creator.name || creator.username || "?")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="profile-info">
            <h1 className="creator-name">{creator.name || creator.username}</h1>
            <div className="creator-username">@{creator.username}</div>
            <div className="creator-email">{creator.email}</div>
            <div className="badges-row">
              <span className="status-badge" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                {creator.creatorStatus}
              </span>
              {creator.isVerifiedCreator && (
                <span className="verified-badge">🛡️ Verificado</span>
              )}
              {creator.isPremium && (
                <span className="premium-badge">💎 Premium</span>
              )}
            </div>
          </div>
          <div className="action-panel">
            {creator.creatorStatus === "pending" && (
              <>
                <button className="btn-action btn-green" onClick={() => doAction("approve")} disabled={!!actionLoading}>
                  {actionLoading === "approve" ? "…" : "✓ Aprobar"}
                </button>
                <button className="btn-action btn-red" onClick={() => doAction("reject")} disabled={!!actionLoading}>
                  {actionLoading === "reject" ? "…" : "✗ Rechazar"}
                </button>
              </>
            )}
            {creator.creatorStatus === "approved" && (
              <button className="btn-action btn-yellow" onClick={() => doAction("suspend")} disabled={!!actionLoading}>
                {actionLoading === "suspend" ? "…" : "⏸ Suspender"}
              </button>
            )}
            {(creator.creatorStatus === "suspended" || creator.creatorStatus === "rejected") && (
              <button className="btn-action btn-green" onClick={() => doAction("reactivate")} disabled={!!actionLoading}>
                {actionLoading === "reactivate" ? "…" : "▶ Reactivar"}
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="stats-row">
          <div className="stat-item">
            <div className="stat-val">{(creator.earningsCoins ?? 0).toLocaleString()}</div>
            <div className="stat-lbl">🪙 Ganancias</div>
          </div>
          <div className="stat-item">
            <div className="stat-val">{(creator.coins ?? 0).toLocaleString()}</div>
            <div className="stat-lbl">🪙 Coins balance</div>
          </div>
          <div className="stat-item">
            <div className="stat-val">{lives.length}</div>
            <div className="stat-lbl">📡 Streams recientes</div>
          </div>
          <div className="stat-item">
            <div className="stat-val">{gifts.length}</div>
            <div className="stat-lbl">🎁 Regalos recibidos</div>
          </div>
          <div className="stat-item">
            <div className="stat-val">{totalGiftCoins.toLocaleString()}</div>
            <div className="stat-lbl">🪙 Total regalos (coins)</div>
          </div>
          <div className="stat-item">
            <div className="stat-val">{(creator.followersCount ?? 0).toLocaleString()}</div>
            <div className="stat-lbl">👥 Seguidores</div>
          </div>
        </div>

        {/* Creator profile info */}
        {(creator.creatorProfile?.bio || creator.creatorApplication?.bio) && (
          <div className="bio-section">
            <div className="section-label">Biografía</div>
            <p className="bio-text">{creator.creatorProfile?.bio || creator.creatorApplication?.bio}</p>
          </div>
        )}

        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-key">Categoría</span>
            <span className="meta-val">{creator.creatorProfile?.category || creator.creatorApplication?.category || "—"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-key">Registrado</span>
            <span className="meta-val">{fmt(creator.createdAt)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-key">Último activo</span>
            <span className="meta-val">{fmt(creator.lastActiveAt)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-key">Aprobado</span>
            <span className="meta-val">{fmt(creator.creatorApprovedAt)}</span>
          </div>
          {creator.creatorApplication?.submittedAt && (
            <div className="meta-item">
              <span className="meta-key">Solicitud enviada</span>
              <span className="meta-val">{fmt(creator.creatorApplication.submittedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Live history */}
      <div className="section-card">
        <h2 className="section-title">📡 Historial de streams (últimos {lives.length})</h2>
        {lives.length === 0 ? (
          <p className="empty-text">Sin streams registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Viewers</th>
                  <th>Duración</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {lives.map((live) => (
                  <tr key={live._id}>
                    <td className="title-cell">{live.title || "—"}</td>
                    <td>
                      {live.isPrivate ? (
                        <span className="tag tag-private">🔒 Privado</span>
                      ) : (
                        <span className="tag tag-public">Público</span>
                      )}
                    </td>
                    <td className="text-center">{live.viewerCount ?? 0}</td>
                    <td className="text-muted">{dur(live.createdAt, live.endedAt)}</td>
                    <td className="text-muted text-sm">{fmtdt(live.createdAt)}</td>
                    <td>
                      {live.isLive ? (
                        <span className="status-dot live-dot">● EN VIVO</span>
                      ) : (
                        <span className="status-dot ended-dot">Terminado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gifts received */}
      <div className="section-card">
        <h2 className="section-title">🎁 Regalos recibidos (últimos {gifts.length})</h2>
        {gifts.length === 0 ? (
          <p className="empty-text">Sin regalos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Regalo</th>
                  <th>Costo (coins)</th>
                  <th>Ganancia creador</th>
                  <th>Contexto</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {gifts.map((g) => (
                  <tr key={g._id}>
                    <td className="gift-cell">
                      {g.emoji && <span className="gift-emoji">{g.emoji}</span>}
                      <span>{g.name || g.giftId || "—"}</span>
                    </td>
                    <td className="coin-val">{(g.coinCost ?? 0).toLocaleString()} 🪙</td>
                    <td className="coin-val">{(g.creatorShare ?? 0).toLocaleString()} 🪙</td>
                    <td className="text-muted text-sm">{g.context || "—"}</td>
                    <td className="text-muted text-sm">{fmtdt(g.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payouts */}
      <div className="section-card">
        <h2 className="section-title">💸 Solicitudes de pago</h2>
        {payouts.length === 0 ? (
          <p className="empty-text">Sin solicitudes de pago registradas.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Cantidad (coins)</th>
                  <th>Estado</th>
                  <th>Notas</th>
                  <th>Solicitado</th>
                  <th>Procesado</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const ps = PAYOUT_STATUS_STYLES[p.status] || {};
                  return (
                    <tr key={p._id}>
                      <td className="text-sm">{p.method || "—"}</td>
                      <td className="coin-val">{(p.amountCoins ?? 0).toLocaleString()} 🪙</td>
                      <td>
                        <span className="status-badge" style={{ background: ps.bg, color: ps.color }}>
                          {p.status}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{p.notes || "—"}</td>
                      <td className="text-muted text-sm">{fmtdt(p.createdAt)}</td>
                      <td className="text-muted text-sm">{fmtdt(p.processedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .page { max-width: 1100px; }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }

        .back-link {
          font-size: 0.875rem;
          color: #a78bfa;
          text-decoration: none;
          font-weight: 600;
        }
        .back-link:hover { color: #c4b5fd; }

        .btn-refresh {
          background: #1e2535;
          border: 1px solid #2d3748;
          color: #94a3b8;
          border-radius: 8px;
          padding: 0.45rem 0.75rem;
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
        .alert-error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
        .alert-success { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }

        .loading-state { text-align: center; padding: 4rem; color: #64748b; }
        .error-state { text-align: center; padding: 4rem; color: #f87171; }

        /* Profile card */
        .profile-card {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 14px;
          padding: 1.5rem;
          margin-bottom: 1.25rem;
        }

        .profile-top {
          display: flex;
          gap: 1.25rem;
          align-items: flex-start;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }

        .avatar-wrap { flex-shrink: 0; }

        .avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          object-fit: cover;
        }

        .avatar-ph {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          font-weight: 700;
          font-size: 1.6rem;
          color: #fff;
        }

        .profile-info { flex: 1; min-width: 200px; }

        .creator-name { font-size: 1.3rem; font-weight: 800; color: #e2e8f0; margin: 0 0 0.2rem; }
        .creator-username { font-size: 0.85rem; color: #64748b; margin-bottom: 0.15rem; }
        .creator-email { font-size: 0.82rem; color: #64748b; margin-bottom: 0.6rem; }

        .badges-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }

        .status-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 0.15rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .verified-badge {
          background: rgba(56,189,248,0.12);
          color: #38bdf8;
          border-radius: 999px;
          padding: 0.15rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .premium-badge {
          background: rgba(167,139,250,0.12);
          color: #a78bfa;
          border-radius: 999px;
          padding: 0.15rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .action-panel {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          flex-shrink: 0;
        }

        .btn-action {
          border-radius: 8px;
          padding: 0.45rem 1rem;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid transparent;
          white-space: nowrap;
        }
        .btn-action:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-green { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.3); color: #34d399; }
        .btn-green:hover:not(:disabled) { background: rgba(52,211,153,0.18); }
        .btn-red { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }
        .btn-red:hover:not(:disabled) { background: rgba(239,68,68,0.18); }
        .btn-yellow { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.3); color: #fbbf24; }
        .btn-yellow:hover:not(:disabled) { background: rgba(251,191,36,0.18); }

        /* Stats row */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.75rem;
          padding: 1rem 0;
          border-top: 1px solid #1e2535;
          border-bottom: 1px solid #1e2535;
          margin-bottom: 1rem;
        }

        .stat-item { text-align: center; }
        .stat-val { font-size: 1.3rem; font-weight: 800; color: #e2e8f0; }
        .stat-lbl { font-size: 0.72rem; color: #64748b; margin-top: 0.15rem; }

        /* Bio */
        .bio-section { margin-bottom: 1rem; }
        .section-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 0.35rem; }
        .bio-text { font-size: 0.875rem; color: #94a3b8; line-height: 1.5; margin: 0; }

        /* Meta grid */
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 0.5rem;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .meta-key { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
        .meta-val { font-size: 0.85rem; color: #cbd5e1; font-weight: 500; }

        /* Section cards */
        .section-card {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 14px;
          padding: 1.25rem;
          margin-bottom: 1.25rem;
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #e2e8f0;
          margin: 0 0 1rem;
        }

        .empty-text { font-size: 0.875rem; color: #64748b; margin: 0; text-align: center; padding: 1rem; }

        .table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid #1e2535; }

        .data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .data-table thead { background: #0f1117; border-bottom: 1px solid #1e2535; }
        .data-table th {
          padding: 0.6rem 0.75rem;
          text-align: left;
          color: #64748b;
          font-weight: 600;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .data-table td {
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid #1a2030;
          color: #cbd5e1;
          vertical-align: middle;
        }
        .data-table tbody tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

        .title-cell { font-weight: 600; color: #e2e8f0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .text-center { text-align: center; }
        .text-muted { color: #64748b; }
        .text-sm { font-size: 0.78rem; }

        .tag { border-radius: 999px; padding: 0.12rem 0.5rem; font-size: 0.7rem; font-weight: 600; }
        .tag-private { background: rgba(251,191,36,0.12); color: #fbbf24; }
        .tag-public { background: rgba(52,211,153,0.1); color: #34d399; }

        .status-dot { font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
        .live-dot { color: #f87171; }
        .ended-dot { color: #64748b; }

        .gift-cell { display: flex; align-items: center; gap: 0.4rem; }
        .gift-emoji { font-size: 1.1rem; }
        .coin-val { color: #fbbf24; font-weight: 600; }
      `}</style>
    </div>
  );
}
