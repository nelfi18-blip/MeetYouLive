"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [creatorRequests, setCreatorRequests] = useState([]);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState("");
  const [activeTab, setActiveTab] = useState("users");

  // Gift catalog state
  const [giftCatalog, setGiftCatalog] = useState([]);
  const [giftForm, setGiftForm] = useState({ name: "", slug: "", icon: "", coinCost: "", rarity: "common", active: true });
  const [editingGift, setEditingGift] = useState(null);
  const [giftActionLoading, setGiftActionLoading] = useState(false);
  const [giftActionError, setGiftActionError] = useState("");
  const [giftActionSuccess, setGiftActionSuccess] = useState("");

  // Agency state
  const [agencies, setAgencies] = useState([]);
  const [agencyLinks, setAgencyLinks] = useState([]);
  const [agencyActionLoading, setAgencyActionLoading] = useState(null);
  const [agencyError, setAgencyError] = useState("");
  const [enableAgencyForm, setEnableAgencyForm] = useState({ creatorId: "", agencyName: "", percentage: 10 });

  // Payout state
  const [payouts, setPayouts] = useState([]);
  const [payoutActionLoading, setPayoutActionLoading] = useState(null);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");

  const loadAdminData = async () => {
    const token = localStorage.getItem("admin_token");
    try {
      const [overviewRes, usersRes, reportsRes, creatorReqRes, verifRes, giftCatalogRes, agencyRes, agencyLinksRes, payoutsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/reports`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/creator-requests`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/verifications`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/gifts/catalog`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/agencies`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/agency-links`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/payouts`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if ([overviewRes, usersRes, reportsRes, creatorReqRes, verifRes].some((r) => r.status === 401)) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      if ([overviewRes, usersRes, reportsRes].some((r) => r.status === 403)) {
        throw new Error("auth");
      }
      if (!overviewRes.ok || !usersRes.ok || !reportsRes.ok) throw new Error("server");

      const [overviewData, usersData, reportsData, creatorReqData, verifData] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
        reportsRes.json(),
        creatorReqRes.ok ? creatorReqRes.json() : { requests: [] },
        verifRes.ok ? verifRes.json() : { requests: [] },
      ]);

      setStats(overviewData.stats || null);
      setUsers(usersData.users || []);
      setReports(reportsData.reports || []);
      setCreatorRequests(creatorReqData.requests || []);
      setVerificationRequests(verifData.requests || []);
      if (giftCatalogRes.ok) {
        setGiftCatalog(await giftCatalogRes.json());
      }
      if (agencyRes.ok) {
        const d = await agencyRes.json();
        setAgencies(d.agencies || []);
      }
      if (agencyLinksRes.ok) {
        const d = await agencyLinksRes.json();
        setAgencyLinks(d.links || []);
      }
      if (payoutsRes.ok) {
        const d = await payoutsRes.json();
        setPayouts(d.payouts || []);
      }
    } catch (err) {
      if (err.message === "auth") {
        setError("No tienes permisos para acceder al panel de administrador.");
      } else {
        setError("Hubo un error cargando los datos del panel de administrador.");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadGiftCatalog = async () => {
    const token = localStorage.getItem("admin_token");
    const res = await fetch(`${apiUrl}/api/gifts/catalog`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setGiftCatalog(await res.json());
  };

  const handleGiftSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    setGiftActionLoading(true);
    setGiftActionError("");
    setGiftActionSuccess("");
    try {
      const isEdit = !!editingGift;
      const url = isEdit
        ? `${apiUrl}/api/gifts/catalog/${editingGift._id}`
        : `${apiUrl}/api/gifts/catalog`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: giftForm.name,
          slug: giftForm.slug,
          icon: giftForm.icon,
          coinCost: Number(giftForm.coinCost),
          rarity: giftForm.rarity,
          active: giftForm.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error");
      setGiftActionSuccess(isEdit ? "Regalo actualizado" : "Regalo creado");
      setGiftForm({ name: "", slug: "", icon: "", coinCost: "", rarity: "common", active: true });
      setEditingGift(null);
      await loadGiftCatalog();
    } catch (err) {
      setGiftActionError(err.message);
    } finally {
      setGiftActionLoading(false);
    }
  };

  const handleGiftDelete = async (id) => {
    if (!confirm("¿Eliminar este regalo del catálogo?")) return;
    const token = localStorage.getItem("admin_token");
    setGiftActionLoading(true);
    setGiftActionError("");
    try {
      const res = await fetch(`${apiUrl}/api/gifts/catalog/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al eliminar");
      await loadGiftCatalog();
    } catch (err) {
      setGiftActionError(err.message);
    } finally {
      setGiftActionLoading(false);
    }
  };

  const startEditGift = (item) => {
    setEditingGift(item);
    setGiftForm({ name: item.name, slug: item.slug || "", icon: item.icon, coinCost: String(item.coinCost), rarity: item.rarity || "common", active: item.active });
    setGiftActionError("");
    setGiftActionSuccess("");
  };

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    loadAdminData();
  }, [router]);

  const doAction = async (url, method, userId) => {
    const token = localStorage.getItem("admin_token");
    setActionLoading(userId + url);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Error");
      // Refresh user list
      const usersRes = await fetch(`${apiUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
    } catch {
      // silently fail, page will still show last state
    } finally {
      setActionLoading(null);
    }
  };

  const changeRole = async (userId, role) => {
    const token = localStorage.getItem("admin_token");
    setActionLoading(userId + "role");
    try {
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Error");
      const usersRes = await fetch(`${apiUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  };


  const handleVerificationAction = async (userId, action) => {
    const token = localStorage.getItem("admin_token");
    setActionLoading(userId + "verify" + action);
    setActionError("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Error");
      const verifRes = await fetch(`${apiUrl}/api/admin/verifications`, { headers: { Authorization: `Bearer ${token}` } });
      if (verifRes.ok) {
        const data = await verifRes.json();
        setVerificationRequests(data.requests || []);
      }
    } catch {
      setActionError(action === "approve" ? "Error al aprobar la verificación" : "Error al rechazar la verificación");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePayoutAction = async (payoutId, status, notes = "") => {
    const token = localStorage.getItem("admin_token");
    setPayoutActionLoading(payoutId);
    setPayoutError("");
    setPayoutSuccess("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/payouts/${payoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al actualizar");
      setPayoutSuccess(`Solicitud marcada como: ${status}`);
      // Refresh payouts
      const payoutsRes = await fetch(`${apiUrl}/api/admin/payouts`, { headers: { Authorization: `Bearer ${token}` } });
      if (payoutsRes.ok) {
        const d = await payoutsRes.json();
        setPayouts(d.payouts || []);
      }
      setTimeout(() => setPayoutSuccess(""), 4000);
    } catch (err) {
      setPayoutError(err.message);
    } finally {
      setPayoutActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        Cargando panel de administrador...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#f87171" }}>
        {error}
      </div>
    );
  }

  const pendingPayoutsCount = payouts.filter((p) => p.status === "pending").length;
  const activePayoutsCount = payouts.filter((p) => p.status === "pending" || p.status === "processing").length;
  const pendingCreatorCount = creatorRequests.filter((r) => r.creatorStatus === "pending").length;

  return (
    <div style={{ padding: "0", maxWidth: "1100px", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.25rem", color: "#e2e8f0" }}>Panel de Administrador</h1>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "0.85rem", marginBottom: "1.75rem" }}>
          <StatCard title="Usuarios totales" value={stats.users} link="/admin/users" />
          <StatCard title="Streams activos" value={stats.activeLives ?? 0} highlight={(stats.activeLives ?? 0) > 0} link="/admin/lives" />
          <StatCard title="Lives totales" value={stats.lives} />
          <StatCard title="Coins comprados" value={(stats.totalCoinsPurchased ?? 0).toLocaleString()} link="/admin/transactions" />
          <StatCard title="Reportes" value={stats.reports} highlight={stats.reports > 0} />
          <StatCard title="Suscripciones" value={stats.subscriptions} />
          <StatCard title="Admins" value={stats.admins} />
          <StatCard title="Solicitudes creador" value={pendingCreatorCount} highlight={pendingCreatorCount > 0} />
          <StatCard title="Verificaciones" value={verificationRequests.length} highlight={verificationRequests.length > 0} />
          <StatCard title="Pagos pendientes" value={activePayoutsCount} highlight={pendingPayoutsCount > 0} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid #1e2535", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
        {[
          { key: "users", label: "Usuarios" },
          { key: "creators", label: `Creadores${pendingCreatorCount > 0 ? ` (${pendingCreatorCount})` : ""}` },
          { key: "verifications", label: `Verificaciones${verificationRequests.length > 0 ? ` (${verificationRequests.length})` : ""}` },
          { key: "reports", label: "Reportes" },
          { key: "gifts", label: "Catálogo Regalos" },
          { key: "agency", label: "Agencias" },
          { key: "payouts", label: `Pagos${pendingPayoutsCount > 0 ? ` (${pendingPayoutsCount})` : ""}` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: activeTab === tab.key ? "#7c3aed" : "transparent",
              color: activeTab === tab.key ? "#fff" : "#94a3b8",
              border: "1px solid",
              borderColor: activeTab === tab.key ? "#7c3aed" : "#334155",
              borderRadius: "6px",
              padding: "0.4rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? "700" : "500",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Usuarios recientes</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  <Th>Nombre</Th>
                  <Th>Email</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th>Registrado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} style={{ borderBottom: "1px solid #334155" }}>
                    <Td>{u.name || u.username || "—"}</Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <select
                        value={u.role}
                        disabled={actionLoading === u._id + "role"}
                        onChange={(e) => changeRole(u._id, e.target.value)}
                        style={{
                          background: "#0f172a",
                          color: "#e2e8f0",
                          border: "1px solid #334155",
                          borderRadius: "4px",
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        <option value="user">user</option>
                        <option value="creator">creator</option>
                        <option value="admin">admin</option>
                      </select>
                    </Td>
                    <Td>
                      <span style={{ color: u.isBlocked ? "#f87171" : "#4ade80", fontSize: "0.8rem" }}>
                        {u.isBlocked ? "Bloqueado" : "Activo"}
                      </span>
                    </Td>
                    <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {u.isBlocked ? (
                          <ActionBtn
                            label="Desbloquear"
                            color="#4ade80"
                            disabled={!!actionLoading}
                            onClick={() =>
                              doAction(`${apiUrl}/api/admin/users/${u._id}/unblock`, "PATCH", u._id)
                            }
                          />
                        ) : (
                          <ActionBtn
                            label="Bloquear"
                            color="#f87171"
                            disabled={!!actionLoading}
                            onClick={() =>
                              doAction(`${apiUrl}/api/admin/users/${u._id}/block`, "PATCH", u._id)
                            }
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>
                      No hay usuarios
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "creators" && (
        <CreatorsTab
          creatorRequests={creatorRequests}
          setCreatorRequests={setCreatorRequests}
          setUsers={setUsers}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
          actionError={actionError}
          setActionError={setActionError}
          apiUrl={apiUrl}
        />
      )}

      {activeTab === "verifications" && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Solicitudes de verificación</h2>
          {actionError && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", color: "#f87171", borderRadius: "6px", padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {actionError}
            </div>
          )}
          {verificationRequests.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", background: "#1e293b", borderRadius: "0.75rem" }}>
              No hay solicitudes de verificación pendientes
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {verificationRequests.map((u) => (
                <div key={u._id} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", display: "flex", alignItems: "flex-start", gap: "1.25rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, color: "#e2e8f0" }}>{u.name || "—"}</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{u.email}</div>
                    {u.username && <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>@{u.username}</div>}
                    <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                      Registrado: {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {u.verificationPhoto && (
                    <a href={`${apiUrl}${u.verificationPhoto}`} target="_blank" rel="noopener noreferrer">
                      <img
                        src={`${apiUrl}${u.verificationPhoto}`}
                        alt="Foto verificación"
                        style={{ width: 120, height: 90, objectFit: "cover", borderRadius: "0.5rem", border: "1px solid #334155", cursor: "pointer" }}
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    </a>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <ActionBtn
                      label="✓ Verificar"
                      color="#4ade80"
                      disabled={!!actionLoading}
                      onClick={() => handleVerificationAction(u._id, "approve")}
                    />
                    <ActionBtn
                      label="✗ Rechazar"
                      color="#f87171"
                      disabled={!!actionLoading}
                      onClick={() => handleVerificationAction(u._id, "reject")}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "reports" && (
        <section>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Reportes recientes</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  <Th>Tipo</Th>
                  <Th>Razón</Th>
                  <Th>Estado</Th>
                  <Th>Fecha</Th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r._id} style={{ borderBottom: "1px solid #334155" }}>
                    <Td>{r.targetType}</Td>
                    <Td>{r.reason}</Td>
                    <Td>{r.status}</Td>
                    <Td>{new Date(r.createdAt).toLocaleDateString()}</Td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>
                      No hay reportes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "gifts" && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Catálogo de Regalos</h2>

          {/* Form */}
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#e2e8f0" }}>
              {editingGift ? "Editar regalo" : "Nuevo regalo"}
            </h3>
            <form onSubmit={handleGiftSubmit} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Nombre</label>
                <input
                  value={giftForm.name}
                  onChange={(e) => setGiftForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="Ej: Neon Heart"
                  style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Slug</label>
                <input
                  value={giftForm.slug}
                  onChange={(e) => setGiftForm((f) => ({ ...f, slug: e.target.value }))}
                  required
                  placeholder="neon-heart"
                  style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Icono (emoji)</label>
                <input
                  value={giftForm.icon}
                  onChange={(e) => setGiftForm((f) => ({ ...f, icon: e.target.value }))}
                  required
                  placeholder="💗"
                  style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "1.2rem", width: "70px", textAlign: "center" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Costo (monedas)</label>
                <input
                  type="number"
                  min="1"
                  value={giftForm.coinCost}
                  onChange={(e) => setGiftForm((f) => ({ ...f, coinCost: e.target.value }))}
                  required
                  placeholder="20"
                  style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem", width: "90px" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Rareza</label>
                <select
                  value={giftForm.rarity}
                  onChange={(e) => setGiftForm((f) => ({ ...f, rarity: e.target.value }))}
                  style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem" }}
                >
                  <option value="common">Común</option>
                  <option value="uncommon">Poco común</option>
                  <option value="rare">Raro</option>
                  <option value="epic">Épico</option>
                  <option value="legendary">Legendario</option>
                  <option value="mythic">Mítico</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Activo</label>
                <select
                  value={giftForm.active ? "true" : "false"}
                  onChange={(e) => setGiftForm((f) => ({ ...f, active: e.target.value === "true" }))}
                  style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem" }}
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={giftActionLoading}
                style={{ padding: "0.45rem 1.25rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.875rem", cursor: giftActionLoading ? "not-allowed" : "pointer", opacity: giftActionLoading ? 0.6 : 1 }}
              >
                {editingGift ? "Guardar" : "Crear"}
              </button>
              {editingGift && (
                <button
                  type="button"
                  onClick={() => { setEditingGift(null); setGiftForm({ name: "", slug: "", icon: "", coinCost: "", rarity: "common", active: true }); }}
                  style={{ padding: "0.45rem 1rem", background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: "4px", fontSize: "0.875rem", cursor: "pointer" }}
                >
                  Cancelar
                </button>
              )}
            </form>
            {giftActionError && <p style={{ marginTop: "0.5rem", color: "#f87171", fontSize: "0.85rem" }}>{giftActionError}</p>}
            {giftActionSuccess && <p style={{ marginTop: "0.5rem", color: "#34d399", fontSize: "0.85rem" }}>{giftActionSuccess}</p>}
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  <Th>Icono</Th>
                  <Th>Nombre</Th>
                  <Th>Slug</Th>
                  <Th>Costo</Th>
                  <Th>Rareza</Th>
                  <Th>Activo</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {giftCatalog.map((item) => (
                  <tr key={item._id} style={{ borderBottom: "1px solid #334155" }}>
                    <Td><span style={{ fontSize: "1.4rem" }}>{item.icon}</span></Td>
                    <Td>{item.name}</Td>
                    <Td><code style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{item.slug || "—"}</code></Td>
                    <Td>🪙 {item.coinCost}</Td>
                    <Td><span style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize" }}>{item.rarity || "common"}</span></Td>
                    <Td>
                      <span style={{ color: item.active ? "#34d399" : "#f87171", fontWeight: 600 }}>
                        {item.active ? "Activo" : "Inactivo"}
                      </span>
                    </Td>
                    <Td>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <ActionBtn label="Editar" color="#818cf8" onClick={() => startEditGift(item)} disabled={giftActionLoading} />
                        <ActionBtn label="Eliminar" color="#f87171" onClick={() => handleGiftDelete(item._id)} disabled={giftActionLoading} />
                      </div>
                    </Td>
                  </tr>
                ))}
                {giftCatalog.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>
                      No hay regalos en el catálogo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "agency" && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Gestión de Agencias</h2>

          {agencyError && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", color: "#f87171", borderRadius: "6px", padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {agencyError}
            </div>
          )}

          {/* Enable agency form */}
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
            <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginTop: 0, marginBottom: "1rem" }}>Habilitar Agencia para Creador</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const token = localStorage.getItem("admin_token");
                setAgencyActionLoading("enable");
                setAgencyError("");
                try {
                  const res = await fetch(`${apiUrl}/api/admin/agencies/${enableAgencyForm.creatorId}/enable`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ agencyName: enableAgencyForm.agencyName, subCreatorPercentageDefault: Number(enableAgencyForm.percentage) }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.message || "Error");
                  setEnableAgencyForm({ creatorId: "", agencyName: "", percentage: 10 });
                  const agR = await fetch(`${apiUrl}/api/admin/agencies`, { headers: { Authorization: `Bearer ${token}` } });
                  if (agR.ok) { const d = await agR.json(); setAgencies(d.agencies || []); }
                } catch (err) {
                  setAgencyError(err.message);
                } finally {
                  setAgencyActionLoading(null);
                }
              }}
              style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>ID del Creador</label>
                <input value={enableAgencyForm.creatorId} onChange={(e) => setEnableAgencyForm((f) => ({ ...f, creatorId: e.target.value }))} required placeholder="ObjectId..." style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem", width: 220 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Nombre de Agencia</label>
                <input value={enableAgencyForm.agencyName} onChange={(e) => setEnableAgencyForm((f) => ({ ...f, agencyName: e.target.value }))} placeholder="Nombre..." style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>% Default (5-30)</label>
                <input type="number" min={5} max={30} value={enableAgencyForm.percentage} onChange={(e) => setEnableAgencyForm((f) => ({ ...f, percentage: e.target.value }))} style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.875rem", width: 80 }} />
              </div>
              <button type="submit" disabled={agencyActionLoading === "enable"} style={{ padding: "0.45rem 1.25rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.875rem", cursor: "pointer" }}>
                Habilitar
              </button>
            </form>
          </div>

          {/* Agencies list */}
          <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.75rem" }}>Agencias Habilitadas ({agencies.length})</h3>
          <div style={{ overflowX: "auto", marginBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead><tr style={{ background: "#1e293b" }}><Th>Creador</Th><Th>Agencia</Th><Th>Código</Th><Th>Sub-Creadores</Th><Th>Ganancias Agencia 🪙</Th><Th>Total Generado 🪙</Th><Th>Acciones</Th></tr></thead>
              <tbody>
                {agencies.map((a) => (
                  <tr key={a._id} style={{ borderBottom: "1px solid #334155" }}>
                    <Td>{a.name || a.username}</Td>
                    <Td>{a.agencyProfile?.agencyName || "—"}</Td>
                    <Td><code style={{ color: "#818cf8", fontSize: "0.75rem" }}>{a.agencyProfile?.agencyCode || "—"}</code></Td>
                    <Td>{a.agencyProfile?.subCreatorsCount || 0}</Td>
                    <Td>{a.agencyEarningsCoins || 0}</Td>
                    <Td>{a.totalAgencyGeneratedCoins || 0}</Td>
                    <Td>
                      <ActionBtn label="Deshabilitar" color="#f87171" disabled={!!agencyActionLoading} onClick={async () => {
                        const token = localStorage.getItem("admin_token");
                        setAgencyActionLoading(a._id);
                        const res = await fetch(`${apiUrl}/api/admin/agencies/${a._id}/disable`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
                        if (res.ok) { const agR = await fetch(`${apiUrl}/api/admin/agencies`, { headers: { Authorization: `Bearer ${token}` } }); if (agR.ok) { const d = await agR.json(); setAgencies(d.agencies || []); } }
                        setAgencyActionLoading(null);
                      }} />
                    </Td>
                  </tr>
                ))}
                {agencies.length === 0 && <tr><td colSpan={7} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>No hay agencias habilitadas</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Agency links list */}
          <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.75rem" }}>Relaciones de Agencia ({agencyLinks.length})</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead><tr style={{ background: "#1e293b" }}><Th>Agencia</Th><Th>Sub-Creador</Th><Th>%</Th><Th>Estado</Th><Th>Creado</Th><Th>Acciones</Th></tr></thead>
              <tbody>
                {agencyLinks.map((link) => (
                  <tr key={link._id} style={{ borderBottom: "1px solid #334155" }}>
                    <Td>{link.parentCreator?.name || link.parentCreator?.username || "—"}</Td>
                    <Td>{link.subCreator?.name || link.subCreator?.username || "—"}</Td>
                    <Td>{link.percentage}%</Td>
                    <Td><span style={{ color: link.status === "active" ? "#4ade80" : link.status === "pending" ? "#fbbf24" : link.status === "suspended" ? "#fb923c" : "#94a3b8", fontWeight: 600 }}>{link.status}</span></Td>
                    <Td>{new Date(link.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        {link.status === "pending" && (
                          <ActionBtn label="Aprobar" color="#4ade80" disabled={!!agencyActionLoading} onClick={async () => {
                            const token = localStorage.getItem("admin_token");
                            setAgencyActionLoading(link._id + "approve");
                            const res = await fetch(`${apiUrl}/api/admin/agency-links/${link._id}/approve`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) { const r = await fetch(`${apiUrl}/api/admin/agency-links`, { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setAgencyLinks(d.links || []); } }
                            setAgencyActionLoading(null);
                          }} />
                        )}
                        {["pending", "active"].includes(link.status) && (
                          <ActionBtn label="Suspender" color="#fb923c" disabled={!!agencyActionLoading} onClick={async () => {
                            const token = localStorage.getItem("admin_token");
                            setAgencyActionLoading(link._id + "suspend");
                            const res = await fetch(`${apiUrl}/api/admin/agency-links/${link._id}/suspend`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) { const r = await fetch(`${apiUrl}/api/admin/agency-links`, { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setAgencyLinks(d.links || []); } }
                            setAgencyActionLoading(null);
                          }} />
                        )}
                        {link.status !== "removed" && (
                          <ActionBtn label="Eliminar" color="#f87171" disabled={!!agencyActionLoading} onClick={async () => {
                            if (!confirm("¿Eliminar esta relación de agencia?")) return;
                            const token = localStorage.getItem("admin_token");
                            setAgencyActionLoading(link._id + "remove");
                            const res = await fetch(`${apiUrl}/api/admin/agency-links/${link._id}/remove`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) { const r = await fetch(`${apiUrl}/api/admin/agency-links`, { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { const d = await r.json(); setAgencyLinks(d.links || []); } }
                            setAgencyActionLoading(null);
                          }} />
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {agencyLinks.length === 0 && <tr><td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>No hay relaciones de agencia</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "payouts" && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Solicitudes de Pago</h2>
          {payoutError && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", color: "#f87171", borderRadius: "6px", padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {payoutError}
            </div>
          )}
          {payoutSuccess && (
            <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid #4ade80", color: "#4ade80", borderRadius: "6px", padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {payoutSuccess}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  <Th>Creador</Th>
                  <Th>Email</Th>
                  <Th>Monedas</Th>
                  <Th>Estado</Th>
                  <Th>Solicitado</Th>
                  <Th>Notas</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p._id} style={{ borderBottom: "1px solid #334155" }}>
                    <Td>{p.creator?.name || p.creator?.username || "—"}</Td>
                    <Td>{p.creator?.email || "—"}</Td>
                    <Td><strong style={{ color: "#fbbf24" }}>🪙 {p.amountCoins}</strong></Td>
                    <Td>
                      <span style={{
                        padding: "0.2rem 0.6rem",
                        borderRadius: "4px",
                        fontSize: "0.78rem",
                        fontWeight: "600",
                        background: p.status === "completed" ? "rgba(74,222,128,0.15)" : p.status === "rejected" ? "rgba(248,113,113,0.15)" : p.status === "processing" ? "rgba(96,165,250,0.15)" : "rgba(251,191,36,0.15)",
                        color: p.status === "completed" ? "#4ade80" : p.status === "rejected" ? "#f87171" : p.status === "processing" ? "#60a5fa" : "#fbbf24",
                      }}>
                        {p.status === "pending" ? "Pendiente" : p.status === "processing" ? "En proceso" : p.status === "completed" ? "Completado" : "Rechazado"}
                      </span>
                    </Td>
                    <Td>{new Date(p.createdAt).toLocaleDateString()}</Td>
                    <Td style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.notes || "—"}</Td>
                    <Td>
                      {(p.status === "pending" || p.status === "processing") ? (
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {p.status === "pending" && (
                            <ActionBtn
                              label="En proceso"
                              color="#60a5fa"
                              disabled={payoutActionLoading === p._id}
                              onClick={() => handlePayoutAction(p._id, "processing")}
                            />
                          )}
                          <ActionBtn
                            label="Completar"
                            color="#4ade80"
                            disabled={payoutActionLoading === p._id}
                            onClick={() => handlePayoutAction(p._id, "completed")}
                          />
                          <ActionBtn
                            label="Rechazar"
                            color="#f87171"
                            disabled={payoutActionLoading === p._id}
                            onClick={() => handlePayoutAction(p._id, "rejected")}
                          />
                        </div>
                      ) : (
                        <span style={{ color: "#475569", fontSize: "0.8rem" }}>
                          {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : "—"}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>
                      No hay solicitudes de pago
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ title, value, highlight, link }) {
  const inner = (
    <div
      style={{
        background: highlight ? "rgba(251,191,36,0.1)" : "#161b27",
        borderRadius: "0.75rem",
        padding: "1.1rem 1.25rem",
        textAlign: "center",
        border: highlight ? "1px solid rgba(251,191,36,0.4)" : "1px solid #1e2535",
        cursor: link ? "pointer" : "default",
        transition: link ? "border-color 0.15s" : undefined,
      }}
    >
      <div style={{ fontSize: "1.75rem", fontWeight: "700", color: highlight ? "#fbbf24" : "#e2e8f0" }}>{value}</div>
      <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.25rem" }}>{title}</div>
    </div>
  );
  if (link) {
    return <a href={link} style={{ textDecoration: "none" }}>{inner}</a>;
  }
  return inner;
}

function Th({ children }) {
  return (
    <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#94a3b8", fontWeight: "600" }}>
      {children}
    </th>
  );
}

function Td({ children }) {
  return (
    <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>
      {children}
    </td>
  );
}

function ActionBtn({ label, color, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: `1px solid ${color}`,
        color,
        borderRadius: "4px",
        padding: "0.25rem 0.6rem",
        fontSize: "0.8rem",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
      }}
    >
      {label}
    </button>
  );
}

const CREATOR_STATUS_LABELS = {
  pending: { label: "Pendiente", color: "#fbbf24" },
  approved: { label: "Aprobado", color: "#4ade80" },
  rejected: { label: "Rechazado", color: "#f87171" },
  suspended: { label: "Suspendido", color: "#fb923c" },
};

function CreatorsTab({ creatorRequests, setCreatorRequests, setUsers, actionLoading, setActionLoading, actionError, setActionError, apiUrl }) {
  const [statusFilter, setStatusFilter] = useState("pending");

  const filtered = creatorRequests.filter((u) =>
    statusFilter === "all" ? true : u.creatorStatus === statusFilter
  );

  const handleAction = async (userId, action) => {
    const token = localStorage.getItem("admin_token");
    setActionLoading(userId + action);
    setActionError("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/creator-requests/${userId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error");
      const [reqRes, usersRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/creator-requests`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (reqRes.ok) {
        const data = await reqRes.json();
        setCreatorRequests(data.requests || []);
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
    } catch {
      setActionError(
        action === "approve"
          ? "Error al aprobar la solicitud"
          : action === "reject"
          ? "Error al rechazar la solicitud"
          : action === "suspend"
          ? "Error al suspender el creador"
          : "Error al reactivar el creador"
      );
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Creadores</h2>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {[
            { key: "pending", label: "Pendientes" },
            { key: "approved", label: "Aprobados" },
            { key: "suspended", label: "Suspendidos" },
            { key: "all", label: "Todos" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                background: statusFilter === f.key ? "#7c3aed" : "transparent",
                color: statusFilter === f.key ? "#fff" : "#94a3b8",
                border: "1px solid",
                borderColor: statusFilter === f.key ? "#7c3aed" : "#334155",
                borderRadius: "6px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: statusFilter === f.key ? "700" : "500",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", color: "#f87171", borderRadius: "6px", padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", background: "#1e293b", borderRadius: "0.75rem" }}>
          No hay creadores con este estado
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {filtered.map((u) => {
            const app = u.creatorApplication || {};
            const langs = app.languages?.length ? app.languages.join(", ") : null;
            const socialEntries = app.socialLinks
              ? Object.entries(app.socialLinks).filter(([, v]) => v)
              : [];
            const statusInfo = CREATOR_STATUS_LABELS[u.creatorStatus] || {};
            return (
              <div key={u._id} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem" }}>
                        {u.name || "—"}
                      </span>
                      {u.username && (
                        <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "0.85rem" }}>@{u.username}</span>
                      )}
                      {statusInfo.label && (
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: statusInfo.color, border: `1px solid ${statusInfo.color}`, borderRadius: "999px", padding: "0.1rem 0.55rem" }}>
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: "0.2rem" }}>{u.email}</div>
                    <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                      Registrado: {new Date(u.createdAt).toLocaleDateString()}
                      {app.submittedAt && (
                        <span style={{ marginLeft: "0.75rem" }}>
                          Solicitud enviada: {new Date(app.submittedAt).toLocaleDateString()}
                        </span>
                      )}
                      {u.creatorApprovedAt && (
                        <span style={{ marginLeft: "0.75rem" }}>
                          Aprobado: {new Date(u.creatorApprovedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap" }}>
                    {u.creatorStatus !== "approved" && (
                      <ActionBtn
                        label="✓ Aprobar"
                        color="#4ade80"
                        disabled={!!actionLoading}
                        onClick={() => handleAction(u._id, "approve")}
                      />
                    )}
                    {["pending", "approved"].includes(u.creatorStatus) && (
                      <ActionBtn
                        label="✗ Rechazar"
                        color="#f87171"
                        disabled={!!actionLoading}
                        onClick={() => handleAction(u._id, "reject")}
                      />
                    )}
                    {u.creatorStatus !== "suspended" && (
                      <ActionBtn
                        label="⏸ Suspender"
                        color="#fb923c"
                        disabled={!!actionLoading}
                        onClick={() => handleAction(u._id, "suspend")}
                      />
                    )}
                    {u.creatorStatus === "suspended" && (
                      <ActionBtn
                        label="↩ Reactivar"
                        color="#4ade80"
                        disabled={!!actionLoading}
                        onClick={() => handleAction(u._id, "approve")}
                      />
                    )}
                  </div>
                </div>

                {(app.displayName || app.category || app.country || langs) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: app.bio ? "0.75rem" : 0 }}>
                    {app.displayName && (
                      <span style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "999px", padding: "0.2rem 0.7rem", fontSize: "0.78rem", color: "#c4b5fd" }}>
                        🎭 {app.displayName}
                      </span>
                    )}
                    {app.category && (
                      <span style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)", borderRadius: "999px", padding: "0.2rem 0.7rem", fontSize: "0.78rem", color: "#67e8f9" }}>
                        🏷 {app.category}
                      </span>
                    )}
                    {app.country && (
                      <span style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: "999px", padding: "0.2rem 0.7rem", fontSize: "0.78rem", color: "#6ee7b7" }}>
                        🌍 {app.country}
                      </span>
                    )}
                    {langs && (
                      <span style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)", borderRadius: "999px", padding: "0.2rem 0.7rem", fontSize: "0.78rem", color: "#fed7aa" }}>
                        🗣 {langs}
                      </span>
                    )}
                  </div>
                )}

                {app.bio && (
                  <div style={{ color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.55, marginBottom: socialEntries.length ? "0.75rem" : 0, background: "rgba(255,255,255,0.03)", borderRadius: "0.5rem", padding: "0.6rem 0.875rem" }}>
                    {app.bio}
                  </div>
                )}

                {socialEntries.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {socialEntries.map(([net, val]) => (
                      <span key={net} style={{ fontSize: "0.78rem", color: "#94a3b8", background: "#0f172a", borderRadius: "0.375rem", padding: "0.2rem 0.6rem", border: "1px solid #1e293b" }}>
                        {net}: {val}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

