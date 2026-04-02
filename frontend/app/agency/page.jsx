"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

export default function AgencyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agencyData, setAgencyData] = useState(null);
  const [subCreators, setSubCreators] = useState([]);
  const [myRelationship, setMyRelationship] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Invite form
  const [inviteForm, setInviteForm] = useState({ subCreatorId: "", percentage: 10 });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  // Percentage edit
  const [editingPct, setEditingPct] = useState(null);
  const [pctValue, setPctValue] = useState(10);
  const [pctLoading, setPctLoading] = useState(false);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const [agencyRes, subRes, relRes] = await Promise.all([
        fetch(`${apiUrl}/api/agency/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/sub-creators`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/agency/my-relationship`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (agencyRes.status === 401) { router.replace("/login"); return; }

      if (agencyRes.ok) {
        setAgencyData(await agencyRes.json());
      } else {
        const err = await agencyRes.json();
        setError(err.message || "Error al cargar datos de agencia");
      }
      if (subRes.ok) {
        const d = await subRes.json();
        setSubCreators(d.relationships || []);
      }
      if (relRes.ok) {
        const d = await relRes.json();
        setMyRelationship(d.relationship);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError("");
    setInviteSuccess("");
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subCreatorId: inviteForm.subCreatorId.trim(), percentage: Number(inviteForm.percentage) }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteSuccess(data.message);
        setInviteForm({ subCreatorId: "", percentage: 10 });
        loadData();
      } else {
        setInviteError(data.message || "Error al invitar");
      }
    } catch {
      setInviteError("Error de conexión");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdatePct = async (relId) => {
    setPctLoading(true);
    const token = getToken();
    try {
      const res = await fetch(`${apiUrl}/api/agency/sub-creators/${relId}/percentage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ percentage: Number(pctValue) }),
      });
      const data = await res.json();
      if (res.ok) { setEditingPct(null); loadData(); }
      else alert(data.message || "Error al actualizar");
    } catch {
      alert("Error de conexión");
    } finally {
      setPctLoading(false);
    }
  };

  const handleRemoveSub = async (relId) => {
    if (!confirm("¿Eliminar este sub-creador de la agencia?")) return;
    const token = getToken();
    const res = await fetch(`${apiUrl}/api/agency/sub-creators/${relId}/remove`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) loadData();
    else { const d = await res.json(); alert(d.message || "Error"); }
  };

  const statusColor = (s) => {
    if (s === "active") return "#22c55e";
    if (s === "pending") return "#f59e0b";
    if (s === "suspended") return "#f97316";
    return "#6b7280";
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#a855f7", fontSize: 18 }}>Cargando agencia...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "1px solid #333", color: "#aaa", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>← Volver</button>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, background: "linear-gradient(135deg,#a855f7,#6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
              🏢 Panel de Agencia
            </h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Gestiona tus sub-creadores y comisiones</p>
          </div>
        </div>

        {/* My relationship (if this creator is a sub-creator) */}
        {myRelationship && (
          <div style={{ background: "linear-gradient(135deg,#1e1b4b,#14142b)", border: "1px solid #4338ca", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h3 style={{ color: "#818cf8", fontSize: 14, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Tu Agencia Principal</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {myRelationship.parentCreator?.avatar && (
                <img src={myRelationship.parentCreator.avatar} alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid #4338ca" }} />
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{myRelationship.parentCreator?.name || myRelationship.parentCreator?.username}</div>
                <div style={{ color: "#818cf8", fontSize: 13 }}>Agencia: {myRelationship.parentCreator?.agencyProfile?.agencyName || "—"}</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#a855f7" }}>{myRelationship.percentage}%</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>tu comisión</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 20, background: statusColor(myRelationship.status) + "22", border: `1px solid ${statusColor(myRelationship.status)}`, color: statusColor(myRelationship.status), fontSize: 12 }}>
                {myRelationship.status}
              </div>
            </div>
          </div>
        )}

        {error && !agencyData && (
          <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: 20, color: "#fca5a5", marginBottom: 24 }}>
            {error}
          </div>
        )}

        {agencyData && (
          <>
            {/* Stats cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 28 }}>
              {[
                { label: "Sub-creadores", value: agencyData.agencyProfile?.subCreatorsCount || 0, icon: "👥", color: "#6366f1" },
                { label: "Ganancias Agencia", value: `${agencyData.agencyEarningsCoins || 0} 🪙`, icon: "💰", color: "#a855f7" },
                { label: "Total Generado", value: `${agencyData.totalAgencyGeneratedCoins || 0} 🪙`, icon: "📊", color: "#22c55e" },
                { label: "Comisión Default", value: `${agencyData.agencyProfile?.subCreatorPercentageDefault || 10}%`, icon: "⚙️", color: "#f59e0b" },
              ].map((stat) => (
                <div key={stat.label} style={{ background: "#111118", border: `1px solid ${stat.color}33`, borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 22 }}>{stat.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, marginTop: 8 }}>{stat.value}</div>
                  <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Agency info */}
            <div style={{ background: "#111118", border: "1px solid #333", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Nombre de agencia</div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{agencyData.agencyProfile?.agencyName || "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Código de agencia</div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: "#a855f7" }}>{agencyData.agencyProfile?.agencyCode || "—"}</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {["sub-creators", "invite"].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                  background: activeTab === tab ? "linear-gradient(135deg,#a855f7,#6366f1)" : "#1a1a2e",
                  color: activeTab === tab ? "#fff" : "#aaa",
                }}>
                  {tab === "sub-creators" ? "👥 Sub-creadores" : "✉️ Invitar"}
                </button>
              ))}
            </div>

            {/* Sub-creators tab */}
            {activeTab === "sub-creators" && (
              <div>
                {subCreators.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                    <div>No tienes sub-creadores vinculados aún.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {subCreators.map((rel) => (
                      <div key={rel._id} style={{ background: "#111118", border: "1px solid #222", borderRadius: 12, padding: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        {rel.subCreator?.avatar && (
                          <img src={rel.subCreator.avatar} alt="" style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #333" }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{rel.subCreator?.name || rel.subCreator?.username}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>@{rel.subCreator?.username} • Ganancias: {rel.subCreator?.earningsCoins || 0} 🪙</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          {editingPct === rel._id ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <input type="number" value={pctValue} onChange={(e) => setPctValue(e.target.value)} min={5} max={30}
                                style={{ width: 60, background: "#1a1a2e", border: "1px solid #a855f7", borderRadius: 6, color: "#fff", padding: "4px 8px", textAlign: "center" }} />
                              <button onClick={() => handleUpdatePct(rel._id)} disabled={pctLoading} style={{ background: "#a855f7", border: "none", borderRadius: 6, color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✓</button>
                              <button onClick={() => setEditingPct(null)} style={{ background: "#333", border: "none", borderRadius: 6, color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✕</button>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: "#a855f7" }}>{rel.percentage}%</div>
                              <div style={{ color: "#6b7280", fontSize: 11 }}>comisión</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ padding: "3px 10px", borderRadius: 20, background: statusColor(rel.status) + "22", border: `1px solid ${statusColor(rel.status)}`, color: statusColor(rel.status), fontSize: 12 }}>
                            {rel.status}
                          </div>
                          {rel.status === "active" && (
                            <>
                              <button onClick={() => { setEditingPct(rel._id); setPctValue(rel.percentage); }} style={{ background: "#1e1b4b", border: "1px solid #4338ca", color: "#818cf8", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✏️</button>
                              <button onClick={() => handleRemoveSub(rel._id)} style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>🗑</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invite tab */}
            {activeTab === "invite" && (
              <div style={{ background: "#111118", border: "1px solid #333", borderRadius: 12, padding: 24, maxWidth: 480 }}>
                <h3 style={{ color: "#a855f7", marginTop: 0, marginBottom: 20 }}>✉️ Vincular Sub-creador</h3>
                <p style={{ color: "#6b7280", fontSize: 13, marginTop: 0 }}>
                  El sub-creador debe ser un creador aprobado. La relación requiere aprobación del administrador antes de activarse.
                </p>
                {inviteError && <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: 12, color: "#fca5a5", marginBottom: 16, fontSize: 13 }}>{inviteError}</div>}
                {inviteSuccess && <div style={{ background: "#0a1a0a", border: "1px solid #166534", borderRadius: 8, padding: 12, color: "#86efac", marginBottom: 16, fontSize: 13 }}>{inviteSuccess}</div>}
                <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", color: "#aaa", fontSize: 13, marginBottom: 6 }}>ID del Sub-creador</label>
                    <input
                      value={inviteForm.subCreatorId}
                      onChange={(e) => setInviteForm({ ...inviteForm, subCreatorId: e.target.value })}
                      placeholder="ObjectId del creador..."
                      required
                      style={{ width: "100%", background: "#0a0a0f", border: "1px solid #333", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "#aaa", fontSize: 13, marginBottom: 6 }}>Porcentaje de comisión (5–30%)</label>
                    <input
                      type="number"
                      value={inviteForm.percentage}
                      onChange={(e) => setInviteForm({ ...inviteForm, percentage: e.target.value })}
                      min={5} max={30} required
                      style={{ width: "100%", background: "#0a0a0f", border: "1px solid #333", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, boxSizing: "border-box" }}
                    />
                    <div style={{ color: "#6b7280", fontSize: 11, marginTop: 4 }}>
                      Con {inviteForm.percentage}%: en 100 🪙 → Plataforma 40, Agencia {Math.floor(60 * inviteForm.percentage / 100)}, Creador {60 - Math.floor(60 * inviteForm.percentage / 100)}
                    </div>
                  </div>
                  <button type="submit" disabled={inviteLoading} style={{
                    background: inviteLoading ? "#333" : "linear-gradient(135deg,#a855f7,#6366f1)",
                    border: "none", borderRadius: 8, color: "#fff", padding: "12px", fontSize: 15, fontWeight: 600, cursor: inviteLoading ? "not-allowed" : "pointer",
                  }}>
                    {inviteLoading ? "Enviando..." : "Enviar Solicitud"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
