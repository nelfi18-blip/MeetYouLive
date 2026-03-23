"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const loadAdminData = async () => {
    const token = localStorage.getItem("token");
    try {
      const [overviewRes, usersRes, reportsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/reports`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if ([overviewRes, usersRes, reportsRes].some((r) => r.status === 401)) {
        clearToken();
        router.replace("/login");
        return;
      }
      if ([overviewRes, usersRes, reportsRes].some((r) => r.status === 403)) {
        throw new Error("auth");
      }
      if (!overviewRes.ok || !usersRes.ok || !reportsRes.ok) throw new Error("server");

      const [overviewData, usersData, reportsData] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
        reportsRes.json(),
      ]);

      setStats(overviewData.stats || null);
      setUsers(usersData.users || []);
      setReports(reportsData.reports || []);
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    loadAdminData();
  }, [router]);

  const doAction = async (url, method, userId) => {
    const token = localStorage.getItem("token");
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
    const token = localStorage.getItem("token");
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
        </div>
      )}

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
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: "0.75rem",
        padding: "1.25rem 1.5rem",
        minWidth: "140px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "2rem", fontWeight: "700" }}>{value}</div>
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

