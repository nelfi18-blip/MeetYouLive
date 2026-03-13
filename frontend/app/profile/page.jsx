"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
  const { data: session } = useSession();
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/user/coins`, { headers }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([userData, coinsData]) => {
        if (userData) {
          setUser(userData);
          setForm({ username: userData.username || "", name: userData.name || "" });
        }
        if (coinsData) setCoins(coinsData);
      })
      .catch(() => setError("No se pudo cargar el perfil"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/user/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar");
      setUser(data);
      setMessage("Perfil actualizado correctamente ✓");
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Cargando perfil…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="loading-state">
        <p>⚠️ {error || "No se pudo cargar el perfil"}</p>
        <Link href="/login" className="btn btn-primary">Volver al inicio</Link>
      </div>
    );
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  const roleLabel = { user: "Usuario", creator: "Creador", admin: "Administrador" }[user.role] || user.role;

  return (
    <div className="profile-page">
      {/* Header card */}
      <div className="profile-card card">
        <div className="profile-avatar">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={displayName}
              width={80}
              height={80}
              style={{ borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div className="avatar-placeholder" style={{ width: 80, height: 80, fontSize: "2rem" }}>
              {initial}
            </div>
          )}
        </div>
        <div className="profile-info">
          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-email">{user.email}</p>
          <span className={`role-badge role-${user.role}`}>{roleLabel}</span>
        </div>
        <button className="btn btn-secondary" onClick={() => { setEditing(!editing); setMessage(""); setError(""); }}>
          {editing ? "Cancelar" : "✏️ Editar perfil"}
        </button>
      </div>

      {/* Feedback messages */}
      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      {/* Edit form */}
      {editing && (
        <div className="edit-card card">
          <h2 className="section-title">Editar perfil</h2>
          <div className="form-group">
            <label className="form-label">Nombre de usuario</label>
            <input
              className="form-input"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="@usuario"
              maxLength={30}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre visible</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Tu nombre"
              maxLength={60}
            />
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card card">
          <span className="stat-icon">💰</span>
          <div className="stat-value">{coins?.coins ?? "—"}</div>
          <div className="stat-label">Monedas</div>
        </div>
        <div className="stat-card card">
          <span className="stat-icon">🎁</span>
          <div className="stat-value">{coins?.earningsCoins ?? "—"}</div>
          <div className="stat-label">Ganancias</div>
        </div>
        <Link href="/coins" className="stat-card card stat-action">
          <span className="stat-icon">➕</span>
          <div className="stat-value">Recargar</div>
          <div className="stat-label">Comprar monedas</div>
        </Link>
      </div>

      {/* Quick links */}
      <div className="links-card card">
        <h2 className="section-title">Accesos rápidos</h2>
        <div className="links-grid">
          <Link href="/live" className="link-item">🎥 Ver directos</Link>
          <Link href="/explore" className="link-item">🔍 Explorar</Link>
          <Link href="/chats" className="link-item">💬 Mis chats</Link>
          <Link href="/dashboard" className="link-item">🏠 Dashboard</Link>
        </div>
      </div>

      <style jsx>{`
        .profile-page { display: flex; flex-direction: column; gap: 1.5rem; }

        .profile-card {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .profile-avatar { flex-shrink: 0; }

        .profile-info { flex: 1; }

        .profile-name {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0.25rem;
        }

        .profile-email { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem; }

        .role-badge {
          display: inline-block;
          padding: 0.2rem 0.65rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .role-user { background: rgba(99,102,241,0.15); color: #818cf8; }
        .role-creator { background: rgba(233,30,140,0.15); color: var(--accent); }
        .role-admin { background: rgba(245,158,11,0.15); color: #f59e0b; }

        /* Edit form */
        .edit-card { display: flex; flex-direction: column; gap: 1rem; }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); }

        .form-input {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.65rem 0.9rem;
          color: var(--text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color var(--transition);
        }

        .form-input:focus { border-color: var(--accent); }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem 1rem;
          text-align: center;
        }

        .stat-action { cursor: pointer; transition: background var(--transition); }
        .stat-action:hover { background: var(--card-hover); }

        .stat-icon { font-size: 1.75rem; }

        .stat-value {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        /* Quick links */
        .links-card { display: flex; flex-direction: column; gap: 1rem; }

        .links-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .link-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.875rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text) !important;
          transition: all var(--transition);
        }

        .link-item:hover { background: var(--card-hover); border-color: var(--accent); }

        /* Feedback */
        .success-banner {
          background: rgba(34,197,94,0.1);
          border: 1px solid #22c55e;
          color: #22c55e;
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        /* Loading */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 1rem;
          color: var(--text-muted);
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .section-title { font-size: 1rem; font-weight: 700; color: var(--text); }

        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .links-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
