"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function EditIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function KeyIcon()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>; }
function LogoutIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function CoinIcon()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/></svg>; }
function TrophyIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 21 12 17 16 21"/><path d="M19 3H5v10a7 7 0 0014 0V3z"/><line x1="9" y1="3" x2="9" y2="13"/><line x1="15" y1="3" x2="15" y2="13"/></svg>; }
function CalIcon()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function ArrowRightIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function BroadcastIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49"/></svg>; }
function ExploreIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ChatIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>; }
function ShopIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/></svg>; }

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
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        if (!r.ok) throw new Error("Error al cargar perfil");
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setUser(d);
        setEditForm({ username: d.username || "", name: d.name || "", bio: d.bio || "" });
      })
      .catch(() => setError("No se pudo cargar el perfil"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    clearToken();
    signOut({ callbackUrl: "/login" });
  };

  const handleEdit = () => {
    setSaveError(""); setSaveSuccess(""); setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm({ username: user.username || "", name: user.name || "", bio: user.bio || "" });
    setSaveError(""); setSaveSuccess("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError(""); setSaveSuccess(""); setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.message || "Error al guardar los cambios"); return; }
      setUser(data);
      setEditForm({ username: data.username || "", name: data.name || "", bio: data.bio || "" });
      setSaveSuccess("Perfil actualizado correctamente");
      setEditing(false);
    } catch { setSaveError("No se pudo conectar con el servidor"); }
    finally { setSaving(false); }
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    setPwdError(""); setPwdSuccess("");
    if (pwdForm.newPassword !== pwdForm.confirmPassword) { setPwdError("Las contraseñas nuevas no coinciden"); return; }
    if (pwdForm.newPassword.length < 6) { setPwdError("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    setPwdSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.message || "Error al cambiar la contraseña"); return; }
      setPwdSuccess(data.message || "Contraseña actualizada correctamente");
      setChangingPwd(false);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch { setPwdError("No se pudo conectar con el servidor"); }
    finally { setPwdSaving(false); }
  };

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  const ACTIONS = [
    { href: "/coins",      label: "Comprar monedas", Icon: ShopIcon },
    ...(user?.role === "creator" ? [{ href: "/live/start", label: "Iniciar directo", Icon: BroadcastIcon }] : []),
    { href: "/explore",    label: "Explorar directos", Icon: ExploreIcon },
    { href: "/chats",      label: "Mis chats", Icon: ChatIcon },
  ];

  return (
    <div className="profile-page">
      {loading && (
        <div className="skeleton-wrap">
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: "50%" }} />
          <div className="skeleton" style={{ width: 160, height: 20 }} />
          <div className="skeleton" style={{ width: 120, height: 16 }} />
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}

      {!loading && user && (
        <>
          {saveSuccess && <div className="banner-success">{saveSuccess}</div>}
          {pwdSuccess && <div className="banner-success">{pwdSuccess}</div>}

          {/* Profile card */}
          <div className="profile-card">
            <div className="profile-card-bg" />
            <div className="profile-card-content">
              <div className="profile-avatar">{initial}</div>
              <div className="profile-info">
                <h1 className="profile-name">{displayName}</h1>
                {user.username && <p className="profile-handle">@{user.username}</p>}
                <p className="profile-email">{user.email}</p>
                {user.bio && <p className="profile-bio">{user.bio}</p>}
                <div className="profile-badges">
                  <span className={`role-badge${user.role === "creator" ? " creator" : user.role === "admin" ? " admin" : ""}`}>
                    {user.role === "creator" ? "Creador" : user.role === "admin" ? "Admin" : "Usuario"}
                  </span>
                </div>
              </div>
              <div className="profile-actions-top">
                <button className="btn btn-secondary btn-sm" onClick={handleEdit}>
                  <EditIcon /> Editar
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setChangingPwd(true); setSaveSuccess(""); setPwdSuccess(""); setPwdError(""); }}
                >
                  <KeyIcon /> Contraseña
                </button>
              </div>
            </div>
          </div>

          {/* Edit form */}
          {editing && (
            <div className="form-card">
              <h2 className="form-card-title">Editar perfil</h2>
              {saveError && <div className="banner-error">{saveError}</div>}
              <form onSubmit={handleSave} className="form-fields">
                <div className="form-group">
                  <label className="form-label">Nombre de usuario</label>
                  <input className="input" type="text" value={editForm.username}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="tunombredeusuario" maxLength={30} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input className="input" type="text" value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Tu nombre" maxLength={60} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea className="input bio-textarea" value={editForm.bio}
                    onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="Cuéntanos algo sobre ti…" maxLength={200} rows={3} />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Password change form */}
          {changingPwd && (
            <div className="form-card">
              <h2 className="form-card-title">Cambiar contraseña</h2>
              {pwdError && <div className="banner-error">{pwdError}</div>}
              <form onSubmit={handleChangePwd} className="form-fields">
                <div className="form-group">
                  <label className="form-label">Contraseña actual</label>
                  <input className="input" type="password" value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    placeholder="Tu contraseña actual" autoComplete="current-password" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nueva contraseña</label>
                  <input className="input" type="password" value={pwdForm.newPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Mínimo 6 caracteres" autoComplete="new-password" minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar nueva contraseña</label>
                  <input className="input" type="password" value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Repite la nueva contraseña" autoComplete="new-password" />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
                    {pwdSaving ? "Guardando…" : "Cambiar contraseña"}
                  </button>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => { setChangingPwd(false); setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPwdError(""); }}
                    disabled={pwdSaving}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon-wrap" style={{ color: "var(--accent-orange)" }}>
                <CoinIcon />
              </div>
              <div className="stat-value">{user.coins ?? 0}</div>
              <div className="stat-label">Monedas</div>
            </div>
            {user.role === "creator" && (
              <div className="stat-card">
                <div className="stat-icon-wrap" style={{ color: "#fbbf24" }}>
                  <TrophyIcon />
                </div>
                <div className="stat-value">{user.earningsCoins ?? 0}</div>
                <div className="stat-label">Ganancias</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-icon-wrap" style={{ color: "var(--accent-cyan)" }}>
                <CalIcon />
              </div>
              <div className="stat-value">
                {new Date(user.createdAt).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
              </div>
              <div className="stat-label">Miembro desde</div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="actions-card">
            <h2 className="actions-title">Acciones rápidas</h2>
            <div className="actions-list">
              {ACTIONS.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className="action-item">
                  <span className="action-icon"><Icon /></span>
                  <span>{label}</span>
                  <span className="action-arrow"><ArrowRightIcon /></span>
                </Link>
              ))}
              <button className="action-item action-logout" onClick={handleLogout}>
                <span className="action-icon"><LogoutIcon /></span>
                <span>Cerrar sesión</span>
                <span className="action-arrow"><ArrowRightIcon /></span>
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .profile-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 580px;
          margin: 0 auto;
        }

        /* Skeleton */
        .skeleton-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 3rem;
        }

        /* Banners */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .banner-success {
          background: var(--success-bg);
          border: 1px solid rgba(52,211,153,0.35);
          color: var(--success);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        /* Profile card */
        .profile-card {
          position: relative;
          overflow: hidden;
          border-radius: var(--radius);
          border: 1px solid rgba(139,92,246,0.2);
          background: rgba(15,8,32,0.9);
          box-shadow: var(--shadow);
        }

        .profile-card-bg {
          position: absolute;
          top: 0; right: 0;
          width: 260px; height: 160px;
          background: radial-gradient(circle at 100% 0%, rgba(224,64,251,0.12), transparent 70%);
          pointer-events: none;
        }

        .profile-card-content {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          padding: 2rem;
          flex-wrap: wrap;
        }

        .profile-avatar {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.9rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.25);
        }

        .profile-info { flex: 1; min-width: 180px; }

        .profile-name {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
        }

        .profile-handle {
          color: var(--text-muted);
          font-size: 0.875rem;
          font-weight: 600;
          margin-top: 0.1rem;
        }

        .profile-email {
          color: var(--text-dim);
          font-size: 0.82rem;
          margin-top: 0.1rem;
        }

        .profile-bio {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.55;
          max-width: 340px;
          margin-top: 0.5rem;
        }

        .profile-badges { margin-top: 0.65rem; }

        .role-badge {
          display: inline-block;
          padding: 0.22rem 0.75rem;
          border-radius: var(--radius-pill);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .role-badge.creator {
          background: var(--accent-dim);
          color: var(--accent);
          border-color: rgba(224,64,251,0.3);
        }

        .role-badge.admin {
          background: var(--accent-dim-2);
          color: var(--accent-3);
          border-color: rgba(129,140,248,0.3);
        }

        .profile-actions-top {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        /* Form card */
        .form-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.75rem;
        }

        .form-card-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1.25rem;
          letter-spacing: -0.02em;
        }

        .form-fields { display: flex; flex-direction: column; gap: 1rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.45rem; }

        .form-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .bio-textarea { resize: vertical; min-height: 76px; }

        .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem; }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 1rem;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem 1rem;
          text-align: center;
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          transition: border-color var(--transition), transform var(--transition-slow);
        }

        .stat-card:hover {
          border-color: rgba(139,92,246,0.3);
          transform: translateY(-2px);
        }

        .stat-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-value { font-size: 1.2rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; }

        /* Actions */
        .actions-card {
          background: rgba(15,8,32,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }

        .actions-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0.75rem;
          letter-spacing: -0.02em;
        }

        .actions-list { display: flex; flex-direction: column; gap: 0.25rem; }

        .action-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.875rem;
          font-weight: 600;
          transition: all var(--transition);
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
          text-decoration: none;
        }

        .action-icon { display: flex; color: var(--text-dim); }

        .action-arrow {
          margin-left: auto;
          color: var(--text-dim);
          opacity: 0;
          transition: opacity var(--transition), transform var(--transition);
          display: flex;
        }

        .action-item:hover {
          background: rgba(139,92,246,0.08);
          color: var(--text);
        }

        .action-item:hover .action-icon { color: var(--accent-3); }
        .action-item:hover .action-arrow { opacity: 1; transform: translateX(2px); }

        .action-logout { color: var(--error) !important; }
        .action-logout:hover { background: rgba(248,113,113,0.08) !important; }
        .action-logout:hover .action-icon { color: var(--error) !important; }
      `}</style>
    </div>
  );
}
