"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const loadAdminData = async () => {
      try {
        const [overviewRes, usersRes, reportsRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/overview`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiUrl}/api/admin/users`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiUrl}/api/admin/reports`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (overviewRes.status === 401 || overviewRes.status === 403 ||
            usersRes.status === 401 || usersRes.status === 403 ||
            reportsRes.status === 401 || reportsRes.status === 403) {
          throw new Error("auth");
        }

        if (!overviewRes.ok || !usersRes.ok || !reportsRes.ok) {
          throw new Error("server");
        }

        const overviewData = await overviewRes.json();
        const usersData = await usersRes.json();
        const reportsData = await reportsRes.json();

        setStats(overviewData.stats || null);
        setUsers(usersData.users || []);
        setReports(reportsData.reports || []);
      } catch (err) {
        console.error(err);
        if (err.message === "auth") {
          setError("No tienes permisos para acceder al panel de administrador.");
        } else {
          setError("Hubo un error cargando los datos del panel de administrador.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadAdminData();
  }, []);

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
          <Card title="Usuarios" value={stats.users} />
          <Card title="Lives" value={stats.lives} />
          <Card title="Reportes" value={stats.reports} />
          <Card title="Suscripciones" value={stats.subscriptions} />
          <Card title="Admins" value={stats.admins} />
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
                <Th>Registrado</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} style={{ borderBottom: "1px solid #334155" }}>
                  <Td>{u.name || u.username || "—"}</Td>
                  <Td>{u.email}</Td>
                  <Td>{u.role}</Td>
                  <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>
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

function Card({ title, value }) {
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
