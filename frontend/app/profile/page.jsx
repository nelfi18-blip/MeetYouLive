"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editUsername, setEditUsername] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    const token = localStorage.getItem("token");
    if (!token) { window.location.href = "/login"; return; }
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setUser(d); setEditUsername(d.username || d.name || ""); })
      .catch(() => setError("No se pudo cargar el perfil"));

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setCoins(d); })
      .catch(() => {});
  }, [status]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: editUsername }),
      });
      if (res.ok) {
        const updated = await res.json();
        setUser(updated);
        setSaveMsg("✅ Cambios guardados");
      } else {
        setSaveMsg("❌ No se pudo guardar");
      }
    } catch {
      setSaveMsg("❌ Error de conexión");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  if (error) {
    return (
      <div className="center-state">
        <p style={{ color: "var(--error)" }}>⚠️ {error}</p>
        <Link href="/dashboard" className="btn btn-secondary">← Volver</Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p style={{ color: "var(--text-muted)" }}>Cargando perfil…</p>
      </div>
    );
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  return (
    <div className="profile-page">
      {/* Profile hero */}
      <div className="profile-hero card">
        <div className="profile-avatar-wrap">
          {session?.user?.image ? (
            <img
              src={session.user.image}
              alt={displayName}
              width={96}
              height={96}
              className="profile-avatar-img"
            />
          ) : (
            <div className="avatar-placeholder" style={{ width: 96, height: 96, fontSize: "2.25rem" }}>
              {initial}
            </div>
          )}
        </div>
        <div className="profile-meta">
          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-email">{user.email}</p>
          <div className="profile-tags">
            {user.role && (
              <span className="tag tag-role">{user.role}</span>
            )}
          </div>
        </div>
        <div className="profile-stats">
          <div className="profile-stat">
            <span className="stat-num">{coins?.coins ?? "—"}</span>
            <span className="stat-lbl">💰 Monedas</span>
          </div>
          <div className="profile-stat">
            <span className="stat-num">{coins?.earningsCoins ?? "—"}</span>
            <span className="stat-lbl">🎁 Ganancias</span>
          </div>
        </div>
      </div>

      <div className="profile-columns">
        {/* Edit section */}
        <div className="profile-section card">
          <h2 className="section-heading">✏️ Editar perfil</h2>
          <div className="form-group">
            <label className="form-label">Nombre de usuario</label>
            <input
              className="input"
              type="text"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              placeholder="Tu nombre de usuario"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="input"
              type="email"
              value={user.email}
              disabled
              style={{ opacity: 0.6, cursor: "not-allowed" }}
            />
          </div>
          {saveMsg && (
            <p style={{ fontSize: "0.875rem", color: saveMsg.startsWith("✅") ? "var(--success)" : "var(--error)" }}>
              {saveMsg}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

        {/* Account info */}
        <div className="profile-section card">
          <h2 className="section-heading">ℹ️ Información</h2>
          <div className="info-row">
            <span className="info-key">Registro</span>
            <span className="info-val">
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })
                : "—"}
            </span>
          </div>
          <div className="info-row">
            <span className="info-key">Proveedor</span>
            <span className="info-val">{user.provider || "Email"}</span>
          </div>
          <hr className="divider" />
          <Link href="/coins" className="btn btn-primary btn-block">
            💰 Comprar monedas
          </Link>
          <Link href="/dashboard" className="btn btn-secondary btn-block" style={{ marginTop: "0.5rem" }}>
            🏠 Ir al dashboard
          </Link>
        </div>
      </div>

      <style jsx>{`
        .profile-page { display: flex; flex-direction: column; gap: 1.5rem; }

        .profile-hero {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
          background: linear-gradient(135deg, var(--surface) 0%, rgba(233,30,140,0.06) 100%);
        }

        .profile-avatar-img {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid var(--accent);
        }

        .profile-meta { flex: 1; }

        .profile-name {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text);
        }

        .profile-email { color: var(--text-muted); margin-top: 0.2rem; font-size: 0.9rem; }

        .profile-tags { margin-top: 0.5rem; }

        .tag {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .tag-role {
          background: var(--accent-dim);
          color: var(--accent);
          text-transform: capitalize;
        }

        .profile-stats {
          display: flex;
          gap: 1rem;
          margin-left: auto;
        }

        .profile-stat {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.75rem 1.25rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .stat-num { font-size: 1.5rem; font-weight: 800; color: var(--text); }
        .stat-lbl { font-size: 0.75rem; color: var(--text-muted); }

        /* Columns */
        .profile-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .profile-section { display: flex; flex-direction: column; gap: 1rem; }

        .section-heading {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.25rem;
        }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Info rows */
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 0;
          border-bottom: 1px solid var(--border);
        }

        .info-row:last-of-type { border-bottom: none; }

        .info-key { font-size: 0.85rem; color: var(--text-muted); }
        .info-val { font-size: 0.85rem; color: var(--text); font-weight: 500; }

        /* Center states */
        .center-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 1rem;
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

        @media (max-width: 768px) {
          .profile-columns { grid-template-columns: 1fr; }
          .profile-stats { margin-left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
