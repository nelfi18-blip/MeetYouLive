"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

  const loadAdminData = async () => {
    const token = localStorage.getItem("admin_token");
    try {
      const [overviewRes, usersRes, reportsRes, creatorReqRes, verifRes, giftCatalogRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/reports`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/creator-requests`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/verifications`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/gifts/catalog`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if ([overviewRes, usersRes, reportsRes, creatorReqRes, verifRes].some((r) => r.status === 401)) {
        localStorage.removeItem("admin_token");
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

  const handleCreatorAction = async (userId, action) => {
    const token = localStorage.getItem("admin_token");
    setActionLoading(userId + action);
    setActionError("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/creator-requests/${userId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error");
      // Refresh creator requests and user list to reflect updated roles
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
      setActionError(action === "approve" ? "Error al aprobar la solicitud" : "Error al rechazar la solicitud");
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

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto", color: "#fff" }}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: "1.5rem" }}>Panel de Administrador</h1>

      {stats && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          <StatCard title="Usuarios" value={stats.users} />
          <StatCard title="Lives" value={stats.lives} />
          <StatCard title="Reportes" value={stats.reports} />
          <StatCard title="Suscripciones" value={stats.subscriptions} />
          <StatCard title="Admins" value={stats.admins} />
          <StatCard title="Solicitudes creador" value={creatorRequests.length} highlight={creatorRequests.length > 0} />
          <StatCard title="Verificaciones" value={verificationRequests.length} highlight={verificationRequests.length > 0} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid #334155", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
        {[
          { key: "users", label: "Usuarios" },
          { key: "creators", label: `Solicitudes Creador${creatorRequests.length > 0 ? ` (${creatorRequests.length})` : ""}` },
          { key: "verifications", label: `Verificaciones${verificationRequests.length > 0 ? ` (${verificationRequests.length})` : ""}` },
          { key: "reports", label: "Reportes" },
          { key: "gifts", label: "Catálogo Regalos" },
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
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Solicitudes para ser Creador</h2>
          {actionError && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", color: "#f87171", borderRadius: "6px", padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {actionError}
            </div>
          )}
          {creatorRequests.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", background: "#1e293b", borderRadius: "0.75rem" }}>
              No hay solicitudes pendientes
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {creatorRequests.map((u) => {
                const app = u.creatorApplication || {};
                const langs = app.languages?.length ? app.languages.join(", ") : null;
                const socialEntries = app.socialLinks
                  ? Object.entries(app.socialLinks).filter(([, v]) => v)
                  : [];
                return (
                  <div key={u._id} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem" }}>
                          {u.name || "—"}
                          {u.username && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "0.5rem", fontSize: "0.85rem" }}>@{u.username}</span>}
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: "0.2rem" }}>{u.email}</div>
                        <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                          Registrado: {new Date(u.createdAt).toLocaleDateString()}
                          {app.submittedAt && (
                            <span style={{ marginLeft: "0.75rem" }}>
                              Solicitud enviada: {new Date(app.submittedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                        <ActionBtn
                          label="✓ Aprobar"
                          color="#4ade80"
                          disabled={!!actionLoading}
                          onClick={() => handleCreatorAction(u._id, "approve")}
                        />
                        <ActionBtn
                          label="✗ Rechazar"
                          color="#f87171"
                          disabled={!!actionLoading}
                          onClick={() => handleCreatorAction(u._id, "reject")}
                        />
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
    </div>
  );
}

function StatCard({ title, value, highlight }) {
  return (
    <div
      style={{
        background: highlight ? "rgba(251,191,36,0.1)" : "#1e293b",
        borderRadius: "0.75rem",
        padding: "1.25rem 1.5rem",
        minWidth: "140px",
        textAlign: "center",
        border: highlight ? "1px solid rgba(251,191,36,0.4)" : "1px solid transparent",
      }}
    >
      <div style={{ fontSize: "2rem", fontWeight: "700", color: highlight ? "#fbbf24" : undefined }}>{value}</div>
      <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.25rem" }}>{title}</div>
    </div>
  );
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

