"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { calcSplit } from "@/lib/commission";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_COLORS = {
  pending:   { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  active:    { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
  suspended: { bg: "rgba(249,115,22,0.12)",  color: "#f97316" },
  removed:   { bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
};

const STATUS_TABS = [
  { value: "",          label: "Todos" },
  { value: "pending",   label: "Pendientes" },
  { value: "active",    label: "Activos" },
  { value: "suspended", label: "Suspendidos" },
  { value: "removed",   label: "Eliminados" },
];

export default function AdminAgenciesPage() {
  const router = useRouter();
  const [links, setLinks] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [tab, setTab] = useState("links");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [actionLoading, setActionLoading] = useState(null);

  // Override percentage
  const [overrideId, setOverrideId] = useState(null);
  const [overridePct, setOverridePct] = useState(10);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState("");

  // Expanded history
  const [expandedHistory, setExpandedHistory] = useState(null);

  // Inline remove confirmation
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) { router.replace("/admin/login"); return {}; }
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const [linksRes, agenciesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/agency-links${params}`, { headers: authHeader() }),
        fetch(`${API_URL}/api/admin/agencies`, { headers: authHeader() }),
      ]);

      if (linksRes.status === 401) { clearAdminToken(); router.replace("/admin/login"); return; }

      if (linksRes.ok) {
        const d = await linksRes.json();
        setLinks(d.links || []);
      } else {
        setError("Error al cargar relaciones de agencia");
      }
      if (agenciesRes.ok) {
        const d = await agenciesRes.json();
        setAgencies(d.agencies || []);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (url, method = "PATCH", body = null) => {
    setActionMsg({ type: "", text: "" });
    const headers = authHeader();
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (res.ok) {
      setActionMsg({ type: "success", text: data.message || "Acción completada" });
      loadData();
    } else {
      setActionMsg({ type: "error", text: data.message || "Error al ejecutar acción" });
    }
    return res.ok;
  };

  const handleApprove = (id) => {
    setActionLoading(id + "_approve");
    doAction(`${API_URL}/api/admin/agency-links/${id}/approve`).finally(() => setActionLoading(null));
  };

  const handleSuspend = (id) => {
    setActionLoading(id + "_suspend");
    doAction(`${API_URL}/api/admin/agency-links/${id}/suspend`).finally(() => setActionLoading(null));
  };

  const handleRemove = (id) => {
    if (confirmRemoveId === id) {
      setConfirmRemoveId(null);
      setActionLoading(id + "_remove");
      doAction(`${API_URL}/api/admin/agency-links/${id}/remove`).finally(() => setActionLoading(null));
    } else {
      setConfirmRemoveId(id);
    }
  };

  const handleOverride = async (relId) => {
    const pct = Number(overridePct);
    if (!Number.isInteger(pct) || pct < 5 || pct > 30) {
      setOverrideError("El porcentaje debe ser un entero entre 5 y 30");
      return;
    }
    setOverrideLoading(true);
    setOverrideError("");
    const headers = authHeader();
    const res = await fetch(`${API_URL}/api/agency/sub-creators/${relId}/percentage`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ percentage: pct }),
    });
    const data = await res.json();
    if (res.ok) {
      setOverrideId(null);
      setActionMsg({ type: "success", text: "Porcentaje actualizado por admin" });
      loadData();
    } else {
      setOverrideError(data.message || "Error al actualizar");
    }
    setOverrideLoading(false);
  };

  const StatusBadge = ({ status }) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.removed;
    return (
      <span style={{ padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.color, fontSize: 12, fontWeight: 600, border: `1px solid ${c.color}44` }}>
        {status}
      </span>
    );
  };

  const pendingCount = links.filter((l) => l.status === "pending").length;
  const activeCount = links.filter((l) => l.status === "active").length;

  return (
    <div style={{ color: "#e2e8f0", fontFamily: "inherit" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa", margin: "0 0 4px" }}>🏢 Gestión de Agencias</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Jerarquía de creadores, comisiones y relaciones de agencia</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Agencias activas", value: agencies.length, color: "#a78bfa" },
          { label: "Relaciones activas", value: activeCount, color: "#22c55e" },
          { label: "Pendientes de aprobación", value: pendingCount, color: "#f59e0b" },
          { label: "Total relaciones", value: links.length, color: "#64748b" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#161b27", border: "1px solid #1e2535", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Action feedback */}
      {actionMsg.text && (
        <div style={{
          background: actionMsg.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${actionMsg.type === "success" ? "#22c55e" : "#ef4444"}44`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13,
          color: actionMsg.type === "success" ? "#86efac" : "#fca5a5",
        }}>
          {actionMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "links", label: "📋 Relaciones" },
          { key: "agencies", label: "🏢 Agencias" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: tab === t.key ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#1e2535",
            color: tab === t.key ? "#fff" : "#94a3b8",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LINKS TAB ─────────────────────────────────────────── */}
      {tab === "links" && (
        <>
          {/* Status filter */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {STATUS_TABS.map((s) => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)} style={{
                padding: "5px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 12,
                background: statusFilter === s.value ? "#1e2535" : "transparent",
                borderColor: statusFilter === s.value ? "#a78bfa" : "#2d3748",
                color: statusFilter === s.value ? "#a78bfa" : "#64748b",
              }}>
                {s.label}
                {s.value === "pending" && pendingCount > 0 && (
                  <span style={{ marginLeft: 6, background: "#f59e0b", color: "#000", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: "#64748b", textAlign: "center", padding: 32 }}>Cargando...</div>
          ) : error ? (
            <div style={{ color: "#f87171", padding: 16 }}>{error}</div>
          ) : links.length === 0 ? (
            <div style={{ color: "#64748b", textAlign: "center", padding: 40 }}>No hay relaciones de agencia{statusFilter ? ` con estado "${statusFilter}"` : ""}.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {links.map((rel) => (
                <div key={rel._id} style={{ background: "#161b27", border: "1px solid #1e2535", borderRadius: 12, padding: 16 }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {/* Parent creator */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 180 }}>
                      {rel.parentCreator?.avatar && (
                        <img src={rel.parentCreator.avatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #7c3aed" }} />
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{rel.parentCreator?.name || rel.parentCreator?.username || "—"}</div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>Agencia / Creador padre</div>
                      </div>
                    </div>

                    <div style={{ color: "#4b5563", fontSize: 18 }}>→</div>

                    {/* Sub-creator */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 180 }}>
                      {rel.subCreator?.avatar && (
                        <img src={rel.subCreator.avatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #6366f1" }} />
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{rel.subCreator?.name || rel.subCreator?.username || "—"}</div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>Sub-creador</div>
                        {rel.subCreatorAgreed && <div style={{ color: "#22c55e", fontSize: 11 }}>✅ Aceptó el acuerdo</div>}
                      </div>
                    </div>

                    {/* Commission */}
                    <div style={{ textAlign: "center", minWidth: 80 }}>
                      {overrideId === rel._id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                          <input
                            type="number" value={overridePct}
                            onChange={(e) => setOverridePct(e.target.value)}
                            min={5} max={30}
                            style={{ width: 60, background: "#0f1117", border: "1px solid #a78bfa", borderRadius: 6, color: "#fff", padding: "4px 8px", textAlign: "center", fontSize: 14 }}
                          />
                          {overrideError && <div style={{ color: "#f87171", fontSize: 11 }}>{overrideError}</div>}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleOverride(rel._id)} disabled={overrideLoading}
                              style={{ background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✓</button>
                            <button onClick={() => { setOverrideId(null); setOverrideError(""); }}
                              style={{ background: "#374151", border: "none", borderRadius: 6, color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa" }}>{rel.percentage}%</div>
                          <div style={{ color: "#64748b", fontSize: 11 }}>comisión</div>
                        </>
                      )}
                    </div>

                    <StatusBadge status={rel.status} />

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {rel.status === "pending" && (
                        <button
                          onClick={() => handleApprove(rel._id)}
                          disabled={actionLoading === rel._id + "_approve"}
                          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid #22c55e44", color: "#22c55e", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >
                          ✓ Aprobar
                        </button>
                      )}
                      {["pending", "active"].includes(rel.status) && (
                        <button
                          onClick={() => handleSuspend(rel._id)}
                          disabled={actionLoading === rel._id + "_suspend"}
                          style={{ background: "rgba(249,115,22,0.1)", border: "1px solid #f9731644", color: "#f97316", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >
                          ⏸ Suspender
                        </button>
                      )}
                      {rel.status !== "removed" && (
                        confirmRemoveId === rel._id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>¿Confirmar eliminación?</span>
                            <button
                              onClick={() => handleRemove(rel._id)}
                              disabled={actionLoading === rel._id + "_remove"}
                              style={{ background: "rgba(239,68,68,0.2)", border: "1px solid #ef444466", color: "#f87171", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                            >
                              {actionLoading === rel._id + "_remove" ? "…" : "Sí, eliminar"}
                            </button>
                            <button
                              onClick={() => setConfirmRemoveId(null)}
                              style={{ background: "rgba(100,116,139,0.1)", border: "1px solid #64748b44", color: "#94a3b8", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRemove(rel._id)}
                            disabled={actionLoading === rel._id + "_remove"}
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #ef444444", color: "#f87171", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                          >
                            🗑 Eliminar
                          </button>
                        )
                      )}
                      {rel.status === "active" && (
                        <button
                          onClick={() => { setOverrideId(overrideId === rel._id ? null : rel._id); setOverridePct(rel.percentage); setOverrideError(""); }}
                          style={{ background: "rgba(167,139,250,0.1)", border: "1px solid #a78bfa44", color: "#a78bfa", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >
                          ✏️ Override%
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Split preview + history */}
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {(() => {
                      const s = calcSplit(100, rel.percentage);
                      return (
                        <div style={{ background: "#0f1117", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#94a3b8" }}>
                          100🪙 → Plataforma <strong style={{ color: "#f59e0b" }}>{s.platform}🪙</strong>
                          {" · "}Agencia <strong style={{ color: "#a78bfa" }}>{s.agency}🪙</strong>
                          {" · "}Creador <strong style={{ color: "#22c55e" }}>{s.creator}🪙</strong>
                        </div>
                      );
                    })()}
                    <div style={{ color: "#4b5563", fontSize: 12 }}>
                      Creado: {new Date(rel.createdAt).toLocaleDateString("es-ES")}
                      {rel.approvedAt && ` · Aprobado: ${new Date(rel.approvedAt).toLocaleDateString("es-ES")}`}
                    </div>
                    {(rel.percentageHistory || []).length > 0 && (
                      <button
                        onClick={() => setExpandedHistory(expandedHistory === rel._id ? null : rel._id)}
                        style={{ background: "#1e2535", border: "1px solid #2d3748", color: "#818cf8", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
                      >
                        🕐 Historial ({rel.percentageHistory.length})
                      </button>
                    )}
                  </div>

                  {expandedHistory === rel._id && (rel.percentageHistory || []).length > 0 && (
                    <div style={{ marginTop: 10, background: "#0f1117", borderRadius: 8, padding: 12 }}>
                      <div style={{ color: "#818cf8", fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Historial de cambios de comisión</div>
                      {rel.percentageHistory.map((h, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", padding: "4px 0", borderBottom: i < rel.percentageHistory.length - 1 ? "1px solid #1e2535" : "none" }}>
                          <span>Porcentaje anterior: <strong style={{ color: "#a78bfa" }}>{h.percentage}%</strong></span>
                          <span>{h.changedAt ? new Date(h.changedAt).toLocaleDateString("es-ES") : "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── AGENCIES TAB ──────────────────────────────────────── */}
      {tab === "agencies" && (
        <>
          {loading ? (
            <div style={{ color: "#64748b", textAlign: "center", padding: 32 }}>Cargando...</div>
          ) : agencies.length === 0 ? (
            <div style={{ color: "#64748b", textAlign: "center", padding: 40 }}>No hay agencias habilitadas aún.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {agencies.map((agency) => (
                <div key={agency._id} style={{ background: "#161b27", border: "1px solid #1e2535", borderRadius: 12, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    {agency.avatar && (
                      <img src={agency.avatar} alt="" style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #7c3aed" }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{agency.name || agency.username}</div>
                      <div style={{ color: "#64748b", fontSize: 12 }}>@{agency.username}</div>
                      {agency.agencyProfile?.agencyName && (
                        <div style={{ color: "#a78bfa", fontSize: 13, marginTop: 2 }}>🏢 {agency.agencyProfile.agencyName}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#6366f1" }}>{agency.agencyProfile?.subCreatorsCount || 0}</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>sub-creadores</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>{agency.agencyProfile?.subCreatorPercentageDefault || 10}%</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>% default</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>{agency.agencyEarningsCoins || 0} 🪙</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>ganado agencia</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>{agency.totalAgencyGeneratedCoins || 0} 🪙</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>total generado</div>
                      </div>
                    </div>
                    {agency.agencyProfile?.agencyCode && (
                      <div style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#818cf8" }}>
                        Código: {agency.agencyProfile.agencyCode}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
