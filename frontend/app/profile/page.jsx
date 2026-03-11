"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (status === "loading") return;

    if (session?.backendToken) {
      localStorage.setItem("token", session.backendToken);
    }

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUser(data);
          setUsername(data.username || "");
          setName(data.name || "");
        }
      })
      .catch(() => setError("No se pudo cargar el perfil"));
  }, [session, status]);

  const handleEditStart = () => {
    setEditing(true);
    setSuccess("");
    setError("");
  };

  const handleEditCancel = () => {
    setEditing(false);
    setUsername(user.username || "");
    setName(user.name || "");
    setError("");
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al guardar");
      } else {
        setUser(data);
        setSuccess("Perfil actualizado correctamente");
        setEditing(false);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Cargando perfil…</p>
        <style jsx>{`
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
        `}</style>
      </div>
    );
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = (displayName[0] || "?").toUpperCase();

  return (
    <div className="profile-page">
      <h1 className="page-title">👤 Mi perfil</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Avatar + name */}
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
        <div className="profile-meta">
          <div className="profile-display-name">{displayName}</div>
          <div className="profile-email">{user.email}</div>
          <div className="profile-role badge">{user.role}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card card">
          <div className="stat-value">{user.coins ?? 0}</div>
          <div className="stat-label">💰 Monedas</div>
        </div>
        <div className="stat-card card">
          <div className="stat-value">{user.earningsCoins ?? 0}</div>
          <div className="stat-label">🎁 Ganancias</div>
        </div>
      </div>

      {/* Edit form */}
      <div className="edit-card card">
        <div className="edit-header">
          <h2 className="edit-title">Información personal</h2>
          {!editing && (
            <button className="btn btn-secondary" onClick={handleEditStart}>
              ✏️ Editar
            </button>
          )}
        </div>

        {editing ? (
          <div className="edit-form">
            <label className="field-label">
              Nombre de usuario
              <input
                className="field-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
              />
            </label>
            <label className="field-label">
              Nombre completo
              <input
                className="field-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre completo"
              />
            </label>
            <div className="edit-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button className="btn btn-secondary" onClick={handleEditCancel}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="info-list">
            <div className="info-row">
              <span className="info-key">Usuario</span>
              <span className="info-val">{user.username || <em className="text-muted">No establecido</em>}</span>
            </div>
            <div className="info-row">
              <span className="info-key">Nombre</span>
              <span className="info-val">{user.name || <em className="text-muted">No establecido</em>}</span>
            </div>
            <div className="info-row">
              <span className="info-key">Email</span>
              <span className="info-val">{user.email}</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="quick-links">
        <Link href="/coins" className="btn btn-primary">💰 Recargar monedas</Link>
        <Link href="/dashboard" className="btn btn-secondary">🏠 Inicio</Link>
      </div>

      <style jsx>{`
        .profile-page { display: flex; flex-direction: column; gap: 1.5rem; }

        .page-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }

        .alert {
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }
        .alert-error {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
        }
        .alert-success {
          background: rgba(76,175,80,0.1);
          border: 1px solid #4caf50;
          color: #4caf50;
        }

        .profile-card {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .profile-meta { display: flex; flex-direction: column; gap: 0.35rem; }
        .profile-display-name { font-size: 1.3rem; font-weight: 700; color: var(--text); }
        .profile-email { color: var(--text-muted); font-size: 0.9rem; }
        .profile-role { text-transform: uppercase; font-size: 0.7rem; width: fit-content; }

        .stats-row { display: flex; gap: 1rem; flex-wrap: wrap; }
        .stat-card {
          flex: 1;
          min-width: 120px;
          text-align: center;
          padding: 1.25rem;
        }
        .stat-value { font-size: 1.8rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem; }

        .edit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }
        .edit-title { font-size: 1.05rem; font-weight: 700; color: var(--text); }

        .edit-form { display: flex; flex-direction: column; gap: 1rem; }

        .field-label {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .field-input {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.65rem 0.875rem;
          color: var(--text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color var(--transition);
        }
        .field-input:focus { border-color: var(--accent); }

        .edit-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

        .info-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .info-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.6rem 0;
          border-bottom: 1px solid var(--border);
        }
        .info-row:last-child { border-bottom: none; }
        .info-key {
          width: 120px;
          flex-shrink: 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        .info-val { color: var(--text); font-size: 0.95rem; }
        .text-muted { color: var(--text-muted); font-style: italic; }

        .quick-links { display: flex; gap: 0.75rem; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

