"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: "", name: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar perfil");
        return r.json();
      })
      .then((d) => {
        setUser(d);
        setEditForm({ username: d.username || "", name: d.name || "", bio: d.bio || "" });
      })
      .catch(() => setError("No se pudo cargar el perfil"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    signOut({ callbackUrl: "/login" });
  };

  const handleEdit = () => {
    setSaveError("");
    setSaveSuccess("");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm({ username: user.username || "", name: user.name || "", bio: user.bio || "" });
    setSaveError("");
    setSaveSuccess("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.message || "Error al guardar los cambios");
        return;
      }
      setUser(data);
      setEditForm({ username: data.username || "", name: data.name || "", bio: data.bio || "" });
      setSaveSuccess("Perfil actualizado correctamente");
      setEditing(false);
    } catch {
      setSaveError("No se pudo conectar con el servidor");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdError("Las contraseñas nuevas no coinciden");
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    setPwdSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwdError(data.message || "Error al cambiar la contraseña");
        return;
      }
      setPwdSuccess(data.message || "Contraseña actualizada correctamente");
      setChangingPwd(false);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setPwdError("No se pudo conectar con el servidor");
    } finally {
      setPwdSaving(false);
    }
  };

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  return (
    <div className="profile-page">
      {loading && (
        <div className="skeleton-wrap">
          <div className="skeleton-avatar" />
          <div className="skeleton-line" style={{ width: "160px" }} />
          <div className="skeleton-line" style={{ width: "120px" }} />
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!loading && user && (
        <>
          {saveSuccess && <div className="success-banner">{saveSuccess}</div>}
          {pwdSuccess && <div className="success-banner">{pwdSuccess}</div>}

          <div className="profile-card card">
            <div className="profile-avatar avatar-placeholder">{initial}</div>
            <div className="profile-info">
              <h1 className="profile-name">{displayName}</h1>
              {user.username && <p className="profile-handle">@{user.username}</p>}
              <p className="profile-email">{user.email}</p>
              {user.bio && <p className="profile-bio">{user.bio}</p>}
              <span className={`profile-role badge ${user.role === "creator" ? "badge-accent" : "badge-muted"}`}>
                {user.role === "creator" ? "🎥 Creador" : user.role === "admin" ? "🛡 Admin" : "👤 Usuario"}
              </span>
            </div>
            <div className="profile-card-actions">
              <button className="btn btn-secondary edit-btn" onClick={handleEdit}>
                ✏️ Editar perfil
              </button>
              <button
                className="btn btn-secondary change-pwd-btn"
                onClick={() => {
                  setChangingPwd(true);
                  setSaveSuccess("");
                  setPwdSuccess("");
                  setPwdError("");
                }}
              >
                🔑 Contraseña
              </button>
            </div>
          </div>

          {editing && (
            <form className="edit-form card" onSubmit={handleSave}>
              <h2 className="edit-title">Editar perfil</h2>

              {saveError && <div className="error-banner">{saveError}</div>}

              <div className="form-group">
                <label className="form-label">Nombre de usuario</label>
                <input
                  className="input"
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="tunombredeusuario"
                  maxLength={30}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input
                  className="input"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Tu nombre"
                  maxLength={60}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Bio</label>
                <textarea
                  className="input bio-textarea"
                  value={editForm.bio}
                  onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Cuéntanos algo sobre ti…"
                  maxLength={200}
                  rows={3}
                />
              </div>

              <div className="edit-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {changingPwd && (
            <form className="edit-form card" onSubmit={handleChangePwd}>
              <h2 className="edit-title">🔑 Cambiar contraseña</h2>

              {pwdError && <div className="error-banner">{pwdError}</div>}

              <div className="form-group">
                <label className="form-label">Contraseña actual</label>
                <input
                  className="input"
                  type="password"
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  placeholder="Tu contraseña actual"
                  autoComplete="current-password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nueva contraseña</label>
                <input
                  className="input"
                  type="password"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar nueva contraseña</label>
                <input
                  className="input"
                  type="password"
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Repite la nueva contraseña"
                  autoComplete="new-password"
                />
              </div>

              <div className="edit-actions">
                <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
                  {pwdSaving ? "Guardando…" : "Cambiar contraseña"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setChangingPwd(false);
                    setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                    setPwdError("");
                  }}
                  disabled={pwdSaving}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="stats-row">
            <div className="stat-card card">
              <span className="stat-icon">💰</span>
              <div className="stat-value">{user.coins ?? 0}</div>
              <div className="stat-label">Monedas</div>
            </div>
            {user.role === "creator" && (
              <div className="stat-card card">
                <span className="stat-icon">🏆</span>
                <div className="stat-value">{user.earningsCoins ?? 0}</div>
                <div className="stat-label">Ganancias</div>
              </div>
            )}
            <div className="stat-card card">
              <span className="stat-icon">📅</span>
              <div className="stat-value">
                {new Date(user.createdAt).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
              </div>
              <div className="stat-label">Miembro desde</div>
            </div>
          </div>

          <div className="actions card">
            <h2 className="actions-title">Acciones rápidas</h2>
            <div className="actions-list">
              <Link href="/coins" className="action-item">
                <span>💰</span>
                <span>Comprar monedas</span>
              </Link>
              {user.role === "creator" && (
                <Link href="/live/start" className="action-item">
                  <span>🔴</span>
                  <span>Iniciar directo</span>
                </Link>
              )}
              <Link href="/explore" className="action-item">
                <span>🔍</span>
                <span>Explorar directos</span>
              </Link>
              <Link href="/chats" className="action-item">
                <span>💬</span>
                <span>Mis chats</span>
              </Link>
              <button className="action-item action-logout" onClick={handleLogout}>
                <span>🚪</span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .profile-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 560px; margin: 0 auto; }

        /* Card */
        .profile-card {
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          padding: 2rem;
          flex-wrap: wrap;
          position: relative;
        }

        .edit-btn {
          position: absolute;
          top: 1.25rem;
          right: 1.25rem;
          font-size: 0.8rem;
          padding: 0.4rem 0.875rem;
        }

        .profile-avatar {
          width: 72px;
          height: 72px;
          font-size: 1.75rem;
          flex-shrink: 0;
        }

        .profile-info { display: flex; flex-direction: column; gap: 0.3rem; }

        .profile-name { font-size: 1.4rem; font-weight: 800; color: var(--text); }
        .profile-handle { color: var(--text-muted); font-size: 0.9rem; }
        .profile-email { color: var(--text-muted); font-size: 0.85rem; }
        .profile-bio { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; max-width: 340px; }

        .badge {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          width: fit-content;
        }
        .badge-accent { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); }
        .badge-muted { background: var(--card-hover); color: var(--text-muted); border: 1px solid var(--border); }

        /* Edit form */
        .edit-form { padding: 1.75rem; display: flex; flex-direction: column; gap: 1.1rem; }
        .edit-title { font-size: 1rem; font-weight: 700; color: var(--text); }

        .form-group { display: flex; flex-direction: column; gap: 0.4rem; }

        .form-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .bio-textarea { resize: vertical; min-height: 72px; }

        .edit-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

        /* Stats */
        .stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 1rem; }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 1.25rem;
          text-align: center;
        }

        .stat-icon { font-size: 1.5rem; }
        .stat-value { font-size: 1.25rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }

        /* Actions */
        .actions { padding: 1.5rem; }
        .actions-title { font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 1rem; }
        .actions-list { display: flex; flex-direction: column; gap: 0.25rem; }

        .action-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          transition: all var(--transition);
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .action-item:hover { background: var(--card-hover); color: var(--text); }
        .action-logout { color: var(--error) !important; }
        .action-logout:hover { background: rgba(244,67,54,0.1) !important; color: var(--error) !important; }

        /* Skeleton */
        .skeleton-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; }
        .skeleton-avatar {
          width: 72px; height: 72px; border-radius: 50%;
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .skeleton-line {
          height: 16px; border-radius: 8px;
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Error / success */
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        .success-banner {
          background: rgba(76,175,80,0.1);
          border: 1px solid var(--success);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

