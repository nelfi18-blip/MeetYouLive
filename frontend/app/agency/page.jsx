"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { calcSplit } from "@/lib/commission";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

// ─── Primitive UI helpers ────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0a0a0f 0%,#0d0b1a 60%,#0a0a0f 100%)",
    color: "#e2e8f0",
    padding: "24px 16px",
    fontFamily: "system-ui,-apple-system,sans-serif",
  },
  wrap: { maxWidth: 960, margin: "0 auto" },
  glassCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(168,85,247,0.15)",
    backdropFilter: "blur(12px)",
    borderRadius: 16,
    padding: 20,
  },
  glassCardSm: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(99,102,241,0.15)",
    backdropFilter: "blur(8px)",
    borderRadius: 12,
    padding: 14,
  },
};

const statusColor = (s) => {
  if (s === "active") return "#22c55e";
  if (s === "pending") return "#f59e0b";
  if (s === "suspended") return "#f97316";
  return "#6b7280";
};

const statusLabel = (s) => {
  if (s === "active") return "Activo";
  if (s === "pending") return "Pendiente";
  if (s === "suspended") return "Suspendido";
  if (s === "removed") return "Eliminado";
  return s;
};

function Badge({ status }) {
  const c = statusColor(status);
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20,
      background: c + "22", border: `1px solid ${c}66`,
      color: c, fontSize: 12, fontWeight: 600,
    }}>
      {statusLabel(status)}
    </span>
  );
}

function StatCard({ icon, value, label, color = "#a855f7" }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}22`,
      borderRadius: 14,
      padding: "18px 16px",
      display: "flex", flexDirection: "column", gap: 4,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20,
        fontSize: 64, opacity: 0.05, lineHeight: 1,
      }}>{icon}</div>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function NeonButton({ onClick, disabled, children, variant = "primary", size = "md" }) {
  const bg = variant === "primary"
    ? "linear-gradient(135deg,#a855f7,#6366f1)"
    : variant === "success"
    ? "rgba(34,197,94,0.12)"
    : variant === "danger"
    ? "rgba(239,68,68,0.12)"
    : variant === "warning"
    ? "rgba(249,115,22,0.12)"
    : "rgba(99,102,241,0.12)";
  const border = variant === "primary" ? "none"
    : variant === "success" ? "1px solid rgba(34,197,94,0.4)"
    : variant === "danger" ? "1px solid rgba(239,68,68,0.4)"
    : variant === "warning" ? "1px solid rgba(249,115,22,0.4)"
    : "1px solid rgba(99,102,241,0.4)";
  const textColor = variant === "primary" ? "#fff"
    : variant === "success" ? "#86efac"
    : variant === "danger" ? "#f87171"
    : variant === "warning" ? "#fb923c"
    : "#818cf8";
  const pad = size === "sm" ? "5px 12px" : "9px 18px";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#1a1a2e" : bg,
        border, color: disabled ? "#4b5563" : textColor,
        borderRadius: 8, padding: pad,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: size === "sm" ? 12 : 13, fontWeight: 600,
        transition: "opacity 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ─── Invite link block ───────────────────────────────────────────────────────

function InviteLinkSection({ agencyCode }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const inviteUrl = typeof window !== "undefined"
    ? `${window.location.origin}/register?creatorInvite=${agencyCode}`
    : `/register?creatorInvite=${agencyCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true); setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    });
  };

  return (
    <div style={{
      background: "rgba(168,85,247,0.06)",
      border: "1px solid rgba(168,85,247,0.25)",
      borderRadius: 12, padding: 16, marginTop: 16,
    }}>
      <div style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        🔗 Enlace de invitación de creador
      </div>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>
        Comparte este enlace para invitar a otros creadores a tu red.
        El vínculo se activa automáticamente cuando el creador es aprobado.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 0,
          background: "#0a0a0f",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 8, padding: "8px 12px",
          fontSize: 12, color: "#818cf8", wordBreak: "break-all",
          fontFamily: "monospace",
        }}>
          {inviteUrl}
        </div>
        <NeonButton onClick={handleCopy} variant={copied ? "success" : copyError ? "danger" : "secondary"}>
          {copied ? "✅ Copiado" : copyError ? "❌ Error" : "📋 Copiar"}
        </NeonButton>
      </div>
    </div>
  );
}

// ─── Split preview ───────────────────────────────────────────────────────────

function SplitPreview({ percentage, coins = 100 }) {
  const s = calcSplit(coins, percentage);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {[
        { label: "Plataforma", value: s.platform, color: "#f59e0b" },
        { label: `Agencia (${percentage}%)`, value: s.agency, color: "#a855f7" },
        { label: "Creador neto", value: s.creator, color: "#22c55e" },
      ].map((item) => (
        <div key={item.label} style={{
          background: "#0a0a0f",
          borderRadius: 8, padding: "6px 10px",
          fontSize: 12, minWidth: 90,
        }}>
          <div style={{ color: "#64748b", fontSize: 10, marginBottom: 2 }}>{item.label}</div>
          <div style={{ color: item.color, fontWeight: 700 }}>{item.value} 🪙</div>
        </div>
      ))}
    </div>
  );
}

// ─── Commission history row ──────────────────────────────────────────────────

function CommissionRow({ tx }) {
  const sc = tx.subCreator;
  const date = new Date(tx.createdAt);
  const dateStr = date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      {sc?.avatar
        ? <img src={sc.avatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(168,85,247,0.4)" }} />
        : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(168,85,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎁</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {sc ? (sc.name || sc.username || "Creador") : "Sub-creador"}
        </div>
        <div style={{ color: "#64748b", fontSize: 11 }}>{dateStr} · {timeStr}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#a855f7", fontWeight: 700, fontSize: 15 }}>+{tx.amount} 🪙</div>
        <div style={{ color: "#64748b", fontSize: 10 }}>comisión</div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AgencyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agencyData, setAgencyData] = useState(null);
  const [subCreators, setSubCreators] = useState([]);
  const [myRelationship, setMyRelationship] = useState(null);
  const [commissions, setCommissions] = useState({ transactions: [], total: 0, page: 1, pages: 1 });
  const [topSubCreators, setTopSubCreators] = useState([]);
  const [activeTab, setActiveTab] = useState("red");
  const [commPage, setCommPage] = useState(1);
  const [commLoading, setCommLoading] = useState(false);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ subCreatorId: "", percentage: 10 });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  // Percentage edit
  const [editingPct, setEditingPct] = useState(null);
  const [pctValue, setPctValue] = useState(10);
  const [pctLoading, setPctLoading] = useState(false);
  const [pctError, setPctError] = useState("");

  // Remove sub-creator
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [removeError, setRemoveError] = useState("");

  // Sub-creator accept/decline
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementMsg, setAgreementMsg] = useState({ type: "", text: "" });

  // Expanded commission history per sub-creator
  const [expandedHistory, setExpandedHistory] = useState(null);

  const authHeaders = useCallback(() => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadCommissions = useCallback(async (page = 1) => {
    setCommLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/agency/commission-history?page=${page}&limit=20`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const d = await res.json();
        setCommissions(d);
        setCommPage(page);
      }
    } catch { /* non-fatal */ }
    setCommLoading(false);
  }, [authHeaders]);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const [agencyRes, subRes, relRes, topRes] = await Promise.all([
        fetch(`${apiUrl}/api/agency/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/sub-creators`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/my-relationship`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/top-sub-creators`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (agencyRes.status === 401) { router.replace("/login"); return; }

      if (agencyRes.ok) setAgencyData(await agencyRes.json());
      else { const e = await agencyRes.json(); setError(e.message || "Error al cargar datos de agencia"); }
      if (subRes.ok) { const d = await subRes.json(); setSubCreators(d.relationships || []); }
      if (relRes.ok) { const d = await relRes.json(); setMyRelationship(d.relationship); }
      if (topRes.ok) { const d = await topRes.json(); setTopSubCreators(d.top || []); }
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (activeTab === "comisiones") loadCommissions(1);
  }, [activeTab, loadCommissions]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true); setInviteError(""); setInviteSuccess("");
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subCreatorId: inviteForm.subCreatorId.trim(), percentage: Number(inviteForm.percentage) }),
      });
      const data = await res.json();
      if (res.ok) { setInviteSuccess(data.message); setInviteForm({ subCreatorId: "", percentage: 10 }); loadData(); }
      else setInviteError(data.message || "Error al invitar");
    } catch { setInviteError("Error de conexión"); }
    finally { setInviteLoading(false); }
  };

  const handleUpdatePct = async (relId) => {
    setPctLoading(true); setPctError("");
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/sub-creators/${relId}/percentage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ percentage: Number(pctValue) }),
      });
      const data = await res.json();
      if (res.ok) { setEditingPct(null); loadData(); }
      else setPctError(data.message || "Error al actualizar");
    } catch { setPctError("Error de conexión"); }
    finally { setPctLoading(false); }
  };

  const handleRemoveSub = async (relId) => {
    setRemoveError("");
    const token = getToken();
    const res = await fetch(`${apiUrl}/api/agency/sub-creators/${relId}/remove`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { setConfirmRemoveId(null); loadData(); }
    else { const d = await res.json(); setRemoveError(d.message || "Error al eliminar"); setConfirmRemoveId(null); }
  };

  const handleAcceptAgreement = async () => {
    setAgreementLoading(true); setAgreementMsg({ type: "", text: "" });
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/my-relationship/accept`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAgreementMsg({ type: res.ok ? "success" : "error", text: data.message || (res.ok ? "Acuerdo aceptado" : "Error") });
      if (res.ok) loadData();
    } catch { setAgreementMsg({ type: "error", text: "Error de conexión" }); }
    finally { setAgreementLoading(false); }
  };

  const handleDeclineAgreement = async () => {
    setAgreementLoading(true); setAgreementMsg({ type: "", text: "" });
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/my-relationship/decline`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAgreementMsg({ type: res.ok ? "success" : "error", text: data.message || (res.ok ? "Invitación rechazada" : "Error") });
      if (res.ok) loadData();
    } catch { setAgreementMsg({ type: "error", text: "Error de conexión" }); }
    finally { setAgreementLoading(false); }
  };

  if (loading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏢</div>
        <div style={{ color: "#a855f7", fontSize: 16, fontWeight: 600 }}>Cargando agencia...</div>
      </div>
    </div>
  );

  // Compute counts from all relationships (need all statuses)
  const totalInvitados = agencyData?.counts?.total || 0;
  const totalPendientes = agencyData?.counts?.pending || 0;
  const totalActivos = agencyData?.counts?.active || 0;
  const totalAprobados = subCreators.filter((r) => r.status === "active").length;

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontSize: 13 }}
          >
            ← Volver
          </button>
          <div>
            <h1 style={{
              fontSize: 28, fontWeight: 800, margin: 0,
              background: "linear-gradient(135deg,#a855f7 0%,#6366f1 60%,#3b82f6 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              🏢 Mi Red de Creadores
            </h1>
            <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
              Gestiona tu agencia, comisiones y sub-creadores
            </p>
          </div>
        </div>

        {/* ── My agency relationship (sub-creator view) ── */}
        {myRelationship && (
          <div style={{
            ...S.glassCard,
            border: "1px solid rgba(67,56,202,0.4)",
            background: "linear-gradient(135deg,rgba(30,27,75,0.4),rgba(20,20,43,0.4))",
            marginBottom: 24,
          }}>
            <div style={{ color: "#818cf8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
              🔗 Tu Agencia Principal
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {myRelationship.parentCreator?.avatar && (
                <img src={myRelationship.parentCreator.avatar} alt="" style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid #4338ca" }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{myRelationship.parentCreator?.name || myRelationship.parentCreator?.username}</div>
                <div style={{ color: "#818cf8", fontSize: 13 }}>Agencia: {myRelationship.parentCreator?.agencyProfile?.agencyName || "—"}</div>
                {myRelationship.subCreatorAgreed && <div style={{ color: "#22c55e", fontSize: 12, marginTop: 4 }}>✅ Acuerdo aceptado</div>}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#a855f7" }}>{myRelationship.percentage}%</div>
                <div style={{ color: "#64748b", fontSize: 11 }}>comisión agencia</div>
              </div>
              <Badge status={myRelationship.status} />
            </div>

            {/* Earnings breakdown example */}
            <div style={{ marginTop: 16 }}>
              <div style={{ color: "#818cf8", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>📊 Distribución (ejemplo: 100 🪙)</div>
              <SplitPreview percentage={myRelationship.percentage} coins={100} />
            </div>

            {/* Accept / Decline */}
            {myRelationship.status === "pending" && !myRelationship.subCreatorAgreed && (
              <div style={{ marginTop: 16, padding: "14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10 }}>
                <div style={{ color: "#fbbf24", fontSize: 13, marginBottom: 12 }}>
                  ⏳ Tienes una invitación de agencia pendiente. Revisa los términos y confirma tu acuerdo.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <NeonButton onClick={handleAcceptAgreement} disabled={agreementLoading} variant="primary">
                    ✅ Aceptar acuerdo
                  </NeonButton>
                  <NeonButton onClick={handleDeclineAgreement} disabled={agreementLoading} variant="danger">
                    ✕ Rechazar
                  </NeonButton>
                </div>
              </div>
            )}
            {agreementMsg.text && (
              <div style={{ marginTop: 10, color: agreementMsg.type === "error" ? "#f87171" : "#86efac", fontSize: 13 }}>
                {agreementMsg.text}
              </div>
            )}
          </div>
        )}

        {error && !agencyData && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 20, color: "#f87171", marginBottom: 24 }}>
            {error}
          </div>
        )}

        {agencyData && (
          <>
            {/* ── Stats grid ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 28 }}>
              <StatCard icon="👥" value={totalInvitados} label="Total invitados" color="#6366f1" />
              <StatCard icon="✅" value={totalActivos} label="Activos" color="#22c55e" />
              <StatCard icon="⏳" value={totalPendientes} label="Pendientes" color="#f59e0b" />
              <StatCard icon="💰" value={`${agencyData.agencyEarningsCoins || 0} 🪙`} label="Comisión ganada" color="#a855f7" />
              <StatCard icon="📈" value={`${agencyData.totalAgencyGeneratedCoins || 0} 🪙`} label="Total generado" color="#3b82f6" />
            </div>

            {/* ── Agency profile card ── */}
            <div style={{ ...S.glassCard, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Nombre de agencia</div>
                  <div style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>{agencyData.agencyProfile?.agencyName || "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Código de agencia</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: "#a855f7", fontFamily: "monospace", marginTop: 4 }}>
                    {agencyData.agencyProfile?.agencyCode || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>% Default</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: "#f59e0b", marginTop: 4 }}>
                    {agencyData.agencyProfile?.subCreatorPercentageDefault || 10}%
                  </div>
                </div>
              </div>
              {agencyData.agencyProfile?.agencyCode && (
                <InviteLinkSection agencyCode={agencyData.agencyProfile.agencyCode} />
              )}
            </div>

            {/* ── Payout readiness info ── */}
            <div style={{
              ...S.glassCardSm,
              border: "1px solid rgba(99,102,241,0.2)",
              background: "rgba(99,102,241,0.04)",
              marginBottom: 24,
              display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
            }}>
              <div style={{ color: "#6366f1", fontSize: 13, fontWeight: 700 }}>💼 Estado de ganancias de agencia</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>Comisión acumulada</div>
                  <div style={{ color: "#a855f7", fontWeight: 700, fontSize: 15 }}>{agencyData.agencyEarningsCoins || 0} 🪙</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>Total generado por sub-creadores</div>
                  <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 15 }}>{agencyData.totalAgencyGeneratedCoins || 0} 🪙</div>
                </div>
                <div style={{ color: "#64748b", fontSize: 11, fontStyle: "italic", alignSelf: "center" }}>
                  Los pagos se gestionan manualmente por el administrador
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { key: "red", label: "👥 Mi red" },
                { key: "top", label: "🏆 Top sub-creadores" },
                { key: "comisiones", label: "💸 Historial comisiones" },
                { key: "invitar", label: "✉️ Vincular creador" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: activeTab === t.key
                      ? "linear-gradient(135deg,#a855f7,#6366f1)"
                      : "rgba(255,255,255,0.04)",
                    color: activeTab === t.key ? "#fff" : "#64748b",
                    transition: "all 0.2s",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Mi red ── */}
            {activeTab === "red" && (
              <div>
                {removeError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 12, color: "#f87171", fontSize: 13, marginBottom: 12 }}>
                    {removeError}
                  </div>
                )}
                {pctError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 12, color: "#f87171", fontSize: 13, marginBottom: 12 }}>
                    {pctError}
                  </div>
                )}
                {subCreators.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0" }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>👥</div>
                    <div style={{ color: "#64748b", fontSize: 15 }}>No tienes sub-creadores vinculados aún.</div>
                    <div style={{ color: "#4b5563", fontSize: 13, marginTop: 8 }}>
                      Comparte tu enlace de invitación o vincula un creador aprobado manualmente.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {subCreators.map((rel) => (
                      <div key={rel._id} style={S.glassCard}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                          {rel.subCreator?.avatar
                            ? <img src={rel.subCreator.avatar} alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.4)" }} />
                            : <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👤</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{rel.subCreator?.name || rel.subCreator?.username || "—"}</div>
                            <div style={{ color: "#64748b", fontSize: 12 }}>@{rel.subCreator?.username} · Ganancias: {rel.subCreator?.earningsCoins || 0} 🪙</div>
                            {rel.subCreatorAgreed
                              ? <div style={{ color: "#22c55e", fontSize: 11, marginTop: 2 }}>✅ Acuerdo aceptado</div>
                              : rel.status === "active"
                                ? <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 2 }}>⏳ Acuerdo pendiente — comisión suspendida hasta aceptación</div>
                                : null
                            }
                          </div>
                          <div style={{ textAlign: "center", minWidth: 70 }}>
                            {editingPct === rel._id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                                <input
                                  type="number" value={pctValue}
                                  onChange={(e) => setPctValue(e.target.value)}
                                  min={5} max={30}
                                  style={{ width: 60, background: "#0a0a0f", border: "1px solid #a855f7", borderRadius: 6, color: "#fff", padding: "4px 8px", textAlign: "center", fontSize: 14 }}
                                />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <NeonButton onClick={() => handleUpdatePct(rel._id)} disabled={pctLoading} size="sm">✓</NeonButton>
                                  <NeonButton onClick={() => { setEditingPct(null); setPctError(""); }} variant="secondary" size="sm">✕</NeonButton>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#a855f7" }}>{rel.percentage}%</div>
                                <div style={{ color: "#64748b", fontSize: 11 }}>comisión</div>
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <Badge status={rel.status} />
                            {rel.status === "active" && (
                              <>
                                <NeonButton
                                  onClick={() => { setEditingPct(rel._id); setPctValue(rel.percentage); setPctError(""); }}
                                  variant="secondary" size="sm"
                                >✏️ %</NeonButton>
                                {confirmRemoveId === rel._id ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ color: "#f87171", fontSize: 12 }}>¿Eliminar?</span>
                                    <NeonButton onClick={() => handleRemoveSub(rel._id)} variant="danger" size="sm">Sí</NeonButton>
                                    <NeonButton onClick={() => setConfirmRemoveId(null)} variant="secondary" size="sm">No</NeonButton>
                                  </div>
                                ) : (
                                  <NeonButton onClick={() => { setConfirmRemoveId(rel._id); setRemoveError(""); }} variant="danger" size="sm">🗑</NeonButton>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {rel.status === "active" && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>Por 100 🪙 enviados:</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <SplitPreview percentage={rel.percentage} coins={100} />
                              {(rel.percentageHistory || []).length > 0 && (
                                <button
                                  onClick={() => setExpandedHistory(expandedHistory === rel._id ? null : rel._id)}
                                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                                >
                                  🕐 Historial ({rel.percentageHistory.length})
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {expandedHistory === rel._id && (rel.percentageHistory || []).length > 0 && (
                          <div style={{ marginTop: 12, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12 }}>
                            <div style={{ color: "#818cf8", fontSize: 12, marginBottom: 8, fontWeight: 700 }}>Historial de cambios de comisión</div>
                            {rel.percentageHistory.map((h, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", padding: "4px 0", borderBottom: i < rel.percentageHistory.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                <span>Porcentaje anterior: <strong style={{ color: "#a855f7" }}>{h.percentage}%</strong></span>
                                <span>{h.changedAt ? new Date(h.changedAt).toLocaleDateString("es-ES") : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Top sub-creadores ── */}
            {activeTab === "top" && (
              <div>
                {topSubCreators.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0" }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
                    <div style={{ color: "#64748b", fontSize: 15 }}>Sin datos de comisiones aún.</div>
                    <div style={{ color: "#4b5563", fontSize: 13, marginTop: 8 }}>El ranking se actualiza a medida que tus sub-creadores reciben regalos.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {topSubCreators.map((item, idx) => {
                      const sc = item.subCreator;
                      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                      return (
                        <div key={item.subCreatorId || idx} style={S.glassCard}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ fontSize: 28, width: 40, textAlign: "center" }}>{medals[idx] || `${idx + 1}`}</div>
                            {sc?.avatar
                              ? <img src={sc.avatar} alt="" style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(168,85,247,0.4)" }} />
                              : <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(168,85,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
                            }
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>{sc ? (sc.name || sc.username) : "Sub-creador"}</div>
                              {sc && <div style={{ color: "#64748b", fontSize: 12 }}>@{sc.username}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: "#a855f7", fontWeight: 800, fontSize: 18 }}>{item.totalCommission} 🪙</div>
                              <div style={{ color: "#64748b", fontSize: 11 }}>comisión generada</div>
                              <div style={{ color: "#4b5563", fontSize: 11 }}>{item.transactionCount} transacciones</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Historial de comisiones ── */}
            {activeTab === "comisiones" && (
              <div style={S.glassCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>💸 Historial de comisiones</div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>Total: {commissions.total} transacciones</div>
                </div>

                {commLoading ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>Cargando...</div>
                ) : commissions.transactions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
                    <div style={{ color: "#64748b", fontSize: 14 }}>Aún no tienes comisiones registradas.</div>
                    <div style={{ color: "#4b5563", fontSize: 12, marginTop: 6 }}>Las comisiones se registran cuando tus sub-creadores reciben regalos.</div>
                  </div>
                ) : (
                  <>
                    <div>
                      {commissions.transactions.map((tx) => (
                        <CommissionRow key={tx._id} tx={tx} />
                      ))}
                    </div>
                    {commissions.pages > 1 && (
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                        <NeonButton
                          onClick={() => loadCommissions(commPage - 1)}
                          disabled={commPage <= 1}
                          variant="secondary" size="sm"
                        >← Anterior</NeonButton>
                        <span style={{ color: "#64748b", fontSize: 13, alignSelf: "center" }}>
                          {commPage} / {commissions.pages}
                        </span>
                        <NeonButton
                          onClick={() => loadCommissions(commPage + 1)}
                          disabled={commPage >= commissions.pages}
                          variant="secondary" size="sm"
                        >Siguiente →</NeonButton>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab: Vincular creador ── */}
            {activeTab === "invitar" && (
              <div style={{ ...S.glassCard, maxWidth: 520 }}>
                <h3 style={{ color: "#a855f7", margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>✉️ Vincular Sub-creador</h3>
                <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
                  El sub-creador debe ser un creador aprobado. La relación requiere aprobación del administrador y aceptación del acuerdo por el sub-creador antes de activar comisiones.
                </p>
                {inviteError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 12, color: "#f87171", marginBottom: 16, fontSize: 13 }}>
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: 12, color: "#86efac", marginBottom: 16, fontSize: 13 }}>
                    {inviteSuccess}
                  </div>
                )}
                <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6, fontWeight: 600 }}>ID del Sub-creador</label>
                    <input
                      value={inviteForm.subCreatorId}
                      onChange={(e) => setInviteForm({ ...inviteForm, subCreatorId: e.target.value })}
                      placeholder="ObjectId del creador aprobado..."
                      required
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, color: "#e2e8f0", padding: "10px 14px", fontSize: 14, boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6, fontWeight: 600 }}>Porcentaje de comisión (5–30%)</label>
                    <input
                      type="number"
                      value={inviteForm.percentage}
                      onChange={(e) => setInviteForm({ ...inviteForm, percentage: e.target.value })}
                      min={5} max={30} required
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, color: "#e2e8f0", padding: "10px 14px", fontSize: 14, boxSizing: "border-box", outline: "none" }}
                    />
                    <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
                      Con {inviteForm.percentage}%: en 100 🪙 → Plataforma 40, Agencia {Math.floor(60 * inviteForm.percentage / 100)}, Creador {60 - Math.floor(60 * inviteForm.percentage / 100)}
                    </div>
                  </div>
                  <NeonButton disabled={inviteLoading}>
                    {inviteLoading ? "Enviando..." : "✉️ Enviar Solicitud de Vínculo"}
                  </NeonButton>
                </form>

                {/* Rules reminder */}
                <div style={{ marginTop: 24, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 10, padding: 14 }}>
                  <div style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📋 Reglas de comisión</div>
                  {[
                    "La plataforma conserva siempre el 40% fijo",
                    "La comisión de agencia sale del 60% del creador",
                    "Rango permitido: 5% – 30%",
                    "Las comisiones solo aplican cuando el sub-creador acepta el acuerdo",
                    "Relación requiere aprobación del administrador",
                  ].map((rule, i) => (
                    <div key={i} style={{ color: "#64748b", fontSize: 12, padding: "3px 0" }}>✓ {rule}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

