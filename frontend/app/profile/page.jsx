"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearToken } from "@/lib/token";
import { useLanguage, SUPPORTED_LANGS } from "@/contexts/LanguageContext";
import ReferralCard from "@/components/ReferralCard";
import StatusBadges from "@/components/StatusBadges";
import { computeStatusBadges, getBoostNudge } from "@/lib/statusBadges";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function StarIcon()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
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

function useBoostCountdown(boostUntil) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!boostUntil) { setLabel(""); return; }
    const update = () => {
      const ms = new Date(boostUntil) - Date.now();
      if (ms <= 0) { setLabel(""); return; }
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setLabel(`${min}:${String(sec).padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [boostUntil]);
  return label;
}

function BoostCard({ isBoosted, boostUntil, boostPrice, coins, loading, error, success, onBoost }) {
  const countdown = useBoostCountdown(isBoosted ? boostUntil : null);
  const canAfford = coins >= boostPrice;
  return (
    <div className={`boost-profile-card${isBoosted ? " boost-profile-card--active" : ""}`}>
      <div className="boost-profile-icon">🚀</div>
      <div className="boost-profile-body">
        <div className="boost-profile-title">
          {isBoosted ? "🚀 Boost activo" : "🚀 Aumenta tus matches"}
        </div>
        <div className="boost-profile-sub">
          {isBoosted && countdown
            ? `Tu perfil aparece primero en Crush — queda ${countdown}`
            : `Aparece primero en Crush durante 30 minutos · 🪙 ${boostPrice} monedas`}
        </div>
        {error && <div className="boost-profile-error">{error}</div>}
        {success && <div className="boost-profile-success">{success}</div>}
      </div>
      {!isBoosted && (
        <button
          className="boost-profile-btn"
          onClick={onBoost}
          disabled={loading || !canAfford}
          title={!canAfford ? `Necesitas ${boostPrice} monedas` : "Activar Boost"}
        >
          {loading ? "Activando…" : !canAfford ? "Sin monedas" : `Boost · 🪙${boostPrice}`}
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, lang, setLang, syncFromUser } = useLanguage();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: "", name: "", bio: "", avatar: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  const [langSaving, setLangSaving] = useState(false);
  const [langSuccess, setLangSuccess] = useState("");

  const [requestingCreator, setRequestingCreator] = useState(false);
  const [creatorReqError, setCreatorReqError] = useState("");
  const [creatorReqSuccess, setCreatorReqSuccess] = useState("");

  const [verifyError, setVerifyError] = useState("");
  const [verifySuccess, setVerifySuccess] = useState("");
  const [verifyUploading, setVerifyUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [isBoosted, setIsBoosted] = useState(false);
  const [boostUntil, setBoostUntil] = useState(null);
  const [boostPrice, setBoostPrice] = useState(100);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostError, setBoostError] = useState("");
  const [boostSuccess, setBoostSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
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
        setEditForm({ username: d.username || "", name: d.name || "", bio: d.bio || "", avatar: d.avatar || "" });
        // Sync the user's saved language preference (highest priority)
        if (d.preferredLanguage) syncFromUser(d.preferredLanguage);
      })
      .catch(() => setError("No se pudo cargar el perfil"))
      .finally(() => setLoading(false));

    // Load boost status in parallel
    fetch(`${API_URL}/api/matches/boost-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setIsBoosted(d.isBoosted ?? false);
        setBoostUntil(d.boostUntil ?? null);
        setBoostPrice(d.boostPrice ?? 100);
      })
      .catch(() => {});
  }, [router, syncFromUser]);

  const handleBoost = async () => {
    setBoostError(""); setBoostSuccess(""); setBoostLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/matches/boost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setIsBoosted(true);
        setBoostUntil(data.boostUntil);
        setUser((u) => u ? { ...u, coins: (u.coins ?? 0) - boostPrice } : u);
        setBoostSuccess("🚀 ¡Boost activado! Tu perfil aparece primero en Crush.");
        setTimeout(() => setBoostSuccess(""), 4000);
      } else {
        setBoostError(data.message || "No se pudo activar el Boost");
      }
    } catch {
      setBoostError("Error de red. Intenta de nuevo.");
    } finally {
      setBoostLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    signOut({ callbackUrl: "/login" });
  };

  const handleLanguageSave = async (newLang) => {
    setLang(newLang);
    setLangSuccess("");
    setLangSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await fetch(`${API_URL}/api/user/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferredLanguage: newLang }),
        });
      }
      setLangSuccess(t("profile.languageSaved"));
      setTimeout(() => setLangSuccess(""), 3000);
    } catch {
      // Language is already changed locally; backend save is best-effort
    } finally {
      setLangSaving(false);
    }
  };

  const handleEdit = () => {
    setSaveError(""); setSaveSuccess(""); setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm({ username: user.username || "", name: user.name || "", bio: user.bio || "", avatar: user.avatar || "" });
    setSaveError(""); setSaveSuccess("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError(""); setSaveSuccess(""); setSaving(true);

    // Validate avatar URL to prevent XSS via javascript: URIs
    if (editForm.avatar && !/^https?:\/\//i.test(editForm.avatar.trim())) {
      setSaveError("La URL de la foto debe comenzar con http:// o https://");
      setSaving(false);
      return;
    }

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
      setEditForm({ username: data.username || "", name: data.name || "", bio: data.bio || "", avatar: data.avatar || "" });
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

  const handleCreatorRequest = async () => {
    setCreatorReqError(""); setCreatorReqSuccess(""); setRequestingCreator(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/user/me/creator-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setCreatorReqError(data.message || "Error al enviar la solicitud"); return; }
      setCreatorReqSuccess(data.message || "Solicitud enviada correctamente");
      setUser((u) => ({ ...u, creatorStatus: "pending" }));
    } catch { setCreatorReqError("No se pudo conectar con el servidor"); }
    finally { setRequestingCreator(false); }
  };

  const handleAvatarFileUpload = async (file) => {
    if (!file) return;
    setAvatarUploading(true);
    setSaveError(""); setSaveSuccess("");
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch(`${API_URL}/api/user/me/avatar-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.message || "Error al subir la imagen"); return; }
      setUser((u) => ({ ...u, avatar: data.avatar }));
      setEditForm((f) => ({ ...f, avatar: data.avatar }));
      setSaveSuccess("Foto de perfil actualizada correctamente");
    } catch { setSaveError("No se pudo subir la imagen"); }
    finally { setAvatarUploading(false); }
  };

  const handleVerificationSubmit = async (file) => {
    if (!file) return;
    setVerifyError(""); setVerifySuccess(""); setVerifyUploading(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("verificationPhoto", file);
      const res = await fetch(`${API_URL}/api/user/me/verification-photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.message || "Error al enviar la verificación"); return; }
      setVerifySuccess(data.message || "Foto enviada. Un administrador la revisará pronto.");
      setUser((u) => ({ ...u, verificationStatus: "pending" }));
    } catch { setVerifyError("No se pudo conectar con el servidor"); }
    finally { setVerifyUploading(false); }
  };

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  const ACTIONS = [
    { href: "/coins",      label: t("profile.buyCoins"), Icon: ShopIcon },
    ...(user?.role === "creator" ? [{ href: "/live/start", label: t("profile.startLive"), Icon: BroadcastIcon }] : []),
    { href: "/explore",    label: t("profile.exploreLive"), Icon: ExploreIcon },
    { href: "/chats",      label: t("profile.myChats"), Icon: ChatIcon },
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
              <div className="profile-avatar-wrap">
                  {user.avatar ? (
                    <img src={user.avatar} alt={displayName} className="profile-avatar-img" onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <div className="profile-avatar">{initial}</div>
                  )}
                </div>
              <div className="profile-info">
                <h1 className="profile-name">{displayName}</h1>
                {user.username && <p className="profile-handle">@{user.username}</p>}
                <p className="profile-email">{user.email}</p>
                {user.bio && <p className="profile-bio">{user.bio}</p>}
                <div className="profile-badges">
                    <span className={`role-badge${user.role === "creator" ? " creator" : user.role === "admin" ? " admin" : user.creatorStatus === "pending" ? " pending" : ""}`}>
                      {user.role === "creator" ? "Creador" : user.role === "admin" ? "Admin" : user.creatorStatus === "pending" ? "Pendiente de aprobación" : "Usuario"}
                    </span>
                    {user.isVerified && (
                      <span className="role-badge verified" title="Identidad verificada">✓ Verificado</span>
                    )}
                  </div>
                  {(() => {
                    const badges = computeStatusBadges(user, { isBoosted });
                    const nudge = getBoostNudge(badges);
                    return (
                      <>
                        {badges.length > 0 && (
                          <StatusBadges badges={badges} style={{ marginTop: "0.45rem", justifyContent: "flex-start" }} />
                        )}
                        {nudge && (
                          <Link href={nudge.href} className="profile-boost-nudge">
                            🚀 {nudge.text}
                          </Link>
                        )}
                      </>
                    );
                  })()}
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
                <div className="form-group">
                  <label className="form-label">Foto de perfil</label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", borderRadius: "var(--radius-sm)", border: "1px dashed rgba(224,64,251,0.4)", background: "rgba(224,64,251,0.06)", color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 600, cursor: avatarUploading ? "not-allowed" : "pointer", marginBottom: "0.5rem" }}>
                    {avatarUploading ? "Subiendo…" : "📷 Subir foto desde dispositivo"}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} disabled={avatarUploading} onChange={(e) => handleAvatarFileUpload(e.target.files[0])} />
                  </label>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.4rem" }}>o pega una URL:</div>
                  <input className="input" type="url" value={editForm.avatar}
                    onChange={(e) => setEditForm((f) => ({ ...f, avatar: e.target.value }))}
                    placeholder="https://ejemplo.com/tu-foto.jpg" />
                  {editForm.avatar && (
                    <img src={editForm.avatar} alt="Preview" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", marginTop: "0.5rem", border: "2px solid rgba(224,64,251,0.3)" }} onError={(e) => { e.target.style.display = "none"; }} />
                  )}
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

          {/* Language preference */}
          <div className="form-card">
            <h2 className="form-card-title">🌐 {t("profile.languageSection")}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
              {t("profile.languageHint")}
            </p>
            {langSuccess && <div className="banner-success" style={{ marginBottom: "0.75rem" }}>{langSuccess}</div>}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {SUPPORTED_LANGS.map((code) => (
                <button
                  key={code}
                  className={`btn${lang === code ? " btn-primary" : " btn-secondary"}`}
                  onClick={() => handleLanguageSave(code)}
                  disabled={langSaving}
                  style={{ minWidth: "7rem" }}
                >
                  {t(`lang.${code}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Interests & Intent */}
          {(user.interests?.length > 0 || user.intent) && (
            <div className="form-card">
              <h2 className="form-card-title">✨ Intereses e intención</h2>
              {user.intent && (
                <div style={{ marginBottom: "0.85rem" }}>
                  <span className="profile-intent-badge">
                    {user.intent === "dating" && "💖 Conocer personas"}
                    {user.intent === "casual" && "😊 Amistades"}
                    {user.intent === "live" && "🎥 Ver directos"}
                    {user.intent === "creator" && "🌟 Creador"}
                    {!["dating","casual","live","creator"].includes(user.intent) && user.intent}
                  </span>
                </div>
              )}
              {user.interests?.length > 0 && (
                <div className="profile-interests-wrap">
                  {user.interests.map((interest) => (
                    <span key={interest} className="profile-interest-chip">{interest}</span>
                  ))}
                </div>
              )}
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

          {/* Boost card */}
          <BoostCard
            isBoosted={isBoosted}
            boostUntil={boostUntil}
            boostPrice={boostPrice}
            coins={user.coins ?? 0}
            loading={boostLoading}
            error={boostError}
            success={boostSuccess}
            onBoost={handleBoost}
          />

          {/* Become a Creator / Creator status */}
          {user.role === "user" && user.creatorStatus !== "pending" && (
            <div className="creator-cta-card">
              <div className="creator-cta-icon"><StarIcon /></div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">¿Quieres ser Creador?</div>
                <div className="creator-cta-sub">Solicita acceso para transmitir en vivo y ganar monedas con tu comunidad.</div>
              </div>
              {creatorReqError && <div className="banner-error">{creatorReqError}</div>}
              {creatorReqSuccess && <div className="banner-success">{creatorReqSuccess}</div>}
              {!creatorReqSuccess && (
                <button className="btn btn-primary creator-cta-btn" onClick={handleCreatorRequest} disabled={requestingCreator}>
                  {requestingCreator ? "Enviando…" : "Solicitar ser Creador"}
                </button>
              )}
            </div>
          )}

          {user.creatorStatus === "pending" && (
            <div className="creator-pending-card">
              <div className="creator-cta-icon" style={{ color: "#fbbf24" }}>⏳</div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">Solicitud en revisión</div>
                <div className="creator-cta-sub">Tu solicitud para ser creador está siendo revisada por un administrador. Te notificaremos pronto.</div>
              </div>
            </div>
          )}

          {user.role === "creator" && (
            <div className="creator-active-card">
              <div className="creator-cta-icon" style={{ color: "var(--accent)" }}>🎙</div>
              <div className="creator-cta-body">
                <div className="creator-cta-title">Eres Creador</div>
                <div className="creator-cta-sub">Accede a tu estudio, gestiona tus directos y consulta tus ganancias.</div>
              </div>
              <Link href="/creator" className="btn btn-primary creator-cta-btn">Ir al Estudio</Link>
            </div>
          )}

          {/* Identity verification */}
          {user.verificationStatus !== "approved" && (
            <div className="form-card">
              <h2 className="form-card-title">
                {user.verificationStatus === "pending" ? "⏳ Verificación en revisión" : "🪪 Verificar identidad"}
              </h2>
              {user.verificationStatus === "pending" ? (
                <p style={{ color: "#fbbf24", fontSize: "0.875rem", lineHeight: 1.5 }}>
                  Tu foto de verificación está siendo revisada por un administrador. Te avisaremos pronto.
                </p>
              ) : user.verificationStatus === "rejected" ? (
                <>
                  <p style={{ color: "var(--error)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
                    Tu verificación anterior fue rechazada. Puedes intentarlo de nuevo con una foto más clara.
                  </p>
                  {verifyError && <div className="banner-error" style={{ marginBottom: "0.75rem" }}>{verifyError}</div>}
                  {verifySuccess && <div className="banner-success" style={{ marginBottom: "0.75rem" }}>{verifySuccess}</div>}
                  {!verifySuccess && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-sm)", background: "var(--grad-primary)", color: "#fff", fontSize: "0.875rem", fontWeight: 700, cursor: verifyUploading ? "not-allowed" : "pointer", opacity: verifyUploading ? 0.7 : 1 }}>
                      {verifyUploading ? "Enviando…" : "📷 Subir nueva foto de verificación"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} disabled={verifyUploading} onChange={(e) => handleVerificationSubmit(e.target.files[0])} />
                    </label>
                  )}
                </>
              ) : (
                <>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "1rem" }}>
                    Sube una selfie sosteniendo un papel con tu nombre de usuario para demostrar que eres un usuario real. Un administrador revisará tu solicitud.
                  </p>
                  {verifyError && <div className="banner-error" style={{ marginBottom: "0.75rem" }}>{verifyError}</div>}
                  {verifySuccess && <div className="banner-success" style={{ marginBottom: "0.75rem" }}>{verifySuccess}</div>}
                  {!verifySuccess && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.25rem", borderRadius: "var(--radius-sm)", background: "var(--grad-primary)", color: "#fff", fontSize: "0.875rem", fontWeight: 700, cursor: verifyUploading ? "not-allowed" : "pointer", opacity: verifyUploading ? 0.7 : 1 }}>
                      {verifyUploading ? "Enviando…" : "📷 Subir foto de verificación"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} disabled={verifyUploading} onChange={(e) => handleVerificationSubmit(e.target.files[0])} />
                    </label>
                  )}
                </>
              )}
            </div>
          )}

          {/* Referral promo */}
          <ReferralCard />

          {/* Premium upsell */}
          <div className="premium-upsell-card">
            <div className="premium-upsell-header">
              <span className="premium-upsell-gem">💎</span>
              <div>
                <h2 className="premium-upsell-title">Desbloquea más con monedas</h2>
                <p className="premium-upsell-sub">Accede a funciones exclusivas y destaca entre todos</p>
              </div>
            </div>
            <div className="premium-upsell-actions">
              <Link href="/coins" className="premium-upsell-btn premium-upsell-btn-primary">
                🪙 Comprar monedas
              </Link>
              <Link href="/matches" className="premium-upsell-btn premium-upsell-btn-ghost">
                👀 Ver quién te dio like
              </Link>
              <Link href="/matches" className="premium-upsell-btn premium-upsell-btn-ghost">
                ⚡ Llamar ahora
              </Link>
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
                <span>{t("profile.logout")}</span>
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

        .profile-avatar-wrap { flex-shrink: 0; }

        .profile-avatar-img {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          object-fit: cover;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.25);
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

        .profile-boost-nudge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          margin-top: 0.5rem;
          font-size: 0.7rem;
          font-weight: 700;
          color: #fb923c;
          background: rgba(255,100,0,0.1);
          border: 1px solid rgba(255,100,0,0.28);
          border-radius: 999px;
          padding: 0.22rem 0.75rem;
          text-decoration: none;
          transition: all 0.18s;
        }
        .profile-boost-nudge:hover {
          background: rgba(255,100,0,0.18);
          box-shadow: 0 0 12px rgba(255,100,0,0.2);
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

        /* Premium upsell */
        .premium-upsell-card {
          background: linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(224,64,251,0.06) 100%);
          border: 1px solid rgba(251,191,36,0.28);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .premium-upsell-header {
          display: flex;
          align-items: center;
          gap: 0.9rem;
        }
        .premium-upsell-gem { font-size: 1.8rem; flex-shrink: 0; }
        .premium-upsell-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.15rem;
        }
        .premium-upsell-sub {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 0;
        }
        .premium-upsell-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .premium-upsell-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        .premium-upsell-btn-primary {
          background: linear-gradient(135deg, rgba(251,191,36,0.22), rgba(224,64,251,0.14));
          border-color: rgba(251,191,36,0.45);
          color: #fbbf24;
        }
        .premium-upsell-btn-primary:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.32), rgba(224,64,251,0.22));
          box-shadow: 0 0 14px rgba(251,191,36,0.22);
        }
        .premium-upsell-btn-ghost {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.12);
          color: var(--text-muted);
        }
        .premium-upsell-btn-ghost:hover {
          background: rgba(255,255,255,0.08);
          color: var(--text);
        }

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

        /* Creator CTA / Pending / Active */
        .creator-cta-card, .creator-pending-card, .creator-active-card {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(224,64,251,0.25);
          background: rgba(224,64,251,0.05);
        }

        .creator-pending-card {
          border-color: rgba(251,191,36,0.3);
          background: rgba(251,191,36,0.05);
        }

        .creator-active-card {
          border-color: rgba(224,64,251,0.3);
          background: rgba(224,64,251,0.07);
        }

        .creator-cta-icon {
          font-size: 1.6rem;
          line-height: 1;
          color: var(--accent-2);
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .creator-cta-body { flex: 1; min-width: 180px; }

        .creator-cta-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .creator-cta-sub {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        .creator-cta-btn { white-space: nowrap; flex-shrink: 0; }

        .role-badge.pending {
          background: rgba(251,191,36,0.1);
          color: #fbbf24;
          border-color: rgba(251,191,36,0.3);
        }

        .role-badge.verified {
          background: rgba(52,211,153,0.1);
          color: var(--success);
          border-color: rgba(52,211,153,0.3);
          margin-left: 0.35rem;
        }

        /* Interests & Intent */
        .profile-interests-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .profile-interest-chip {
          font-size: 0.73rem;
          font-weight: 700;
          padding: 0.28rem 0.75rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.09);
          border: 1px solid rgba(224,64,251,0.25);
          color: #e040fb;
          letter-spacing: 0.01em;
          transition: background 0.18s, border-color 0.18s;
        }
        .profile-interest-chip:hover {
          background: rgba(224,64,251,0.18);
          border-color: rgba(224,64,251,0.45);
        }
        .profile-intent-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.76rem;
          font-weight: 800;
          padding: 0.3rem 0.85rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(255,45,120,0.12), rgba(251,191,36,0.1));
          border: 1px solid rgba(255,45,120,0.35);
          color: #fbbf24;
          letter-spacing: 0.02em;
        }

        /* Boost card */
        .boost-profile-card {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(139,92,246,0.3);
          background: linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(224,64,251,0.06) 100%);
          transition: border-color 0.2s;
        }
        .boost-profile-card--active {
          border-color: rgba(139,92,246,0.6);
          background: linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(224,64,251,0.1) 100%);
        }
        .boost-profile-icon {
          font-size: 1.8rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .boost-profile-body {
          flex: 1;
          min-width: 160px;
        }
        .boost-profile-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }
        .boost-profile-sub {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.2rem;
          line-height: 1.5;
        }
        .boost-profile-error {
          font-size: 0.78rem;
          color: var(--error);
          margin-top: 0.35rem;
        }
        .boost-profile-success {
          font-size: 0.78rem;
          color: var(--success);
          margin-top: 0.35rem;
        }
        .boost-profile-btn {
          flex-shrink: 0;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 700;
          background: var(--grad-primary);
          color: #fff;
          border: none;
          cursor: pointer;
          transition: opacity 0.18s, transform 0.18s;
          white-space: nowrap;
        }
        .boost-profile-btn:hover:not(:disabled) {
          opacity: 0.88;
          transform: translateY(-1px);
        }
        .boost-profile-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
