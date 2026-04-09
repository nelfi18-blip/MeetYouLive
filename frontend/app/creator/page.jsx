"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MIN_PAYOUT_COINS = 100;

/* ─── Icons ─────────────────────────────────────────────── */
function BroadcastIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/>
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 21 12 17 16 21"/>
      <path d="M19 3H5v10a7 7 0 0014 0V3z"/>
      <line x1="9" y1="3" x2="9" y2="13"/><line x1="15" y1="3" x2="15" y2="13"/>
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function AgencyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/>
    </svg>
  );
}

/* ─── Toggle component ──────────────────────────────────── */
function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`toggle-btn${value ? " toggle-on" : ""}${disabled ? " toggle-disabled" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      aria-pressed={value}
      disabled={disabled}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

/* ─── Non-approved creator state ────────────────────────── */
function PendingCreatorState({ user }) {
  const displayName = user?.username || user?.name || "Creador";
  const status = user?.creatorStatus;
  const statusMap = {
    pending: { icon: "⏳", label: "Pendiente de revisión", color: "#fbbf24", desc: "Tu solicitud está siendo revisada por nuestro equipo. Te notificaremos pronto." },
    rejected: { icon: "❌", label: "Solicitud rechazada", color: "#f87171", desc: "Tu solicitud no fue aprobada. Puedes intentarlo de nuevo." },
    suspended: { icon: "🚫", label: "Cuenta suspendida", color: "#f97316", desc: "Tu cuenta de creador está temporalmente suspendida. Contacta con soporte." },
    none: { icon: "🌟", label: "Sin solicitud", color: "#818cf8", desc: "Aún no has solicitado ser creador en MeetYouLive." },
  };
  const s = statusMap[status] || statusMap.none;

  return (
    <div className="pending-wrap">
      <div className="pending-card">
        <div className="pending-glow" />
        <div className="pending-avatar">{displayName[0]?.toUpperCase()}</div>
        <h2 className="pending-name">{displayName}</h2>
        <div className="pending-status" style={{ color: s.color, borderColor: s.color + "44", background: s.color + "15" }}>
          {s.icon} {s.label}
        </div>
        <p className="pending-desc">{s.desc}</p>
        {(status === "none" || status === "rejected") && (
          <Link href="/creator-request" className="btn btn-primary pending-cta">
            {status === "rejected" ? "Volver a solicitar" : "Solicitar acceso creator"}
          </Link>
        )}
      </div>
      <style jsx>{`
        .pending-wrap { display: flex; justify-content: center; align-items: flex-start; padding: 2rem 1rem; min-height: 60vh; }
        .pending-card {
          position: relative; overflow: hidden;
          background: linear-gradient(135deg, rgba(22,12,45,0.97) 0%, rgba(15,8,32,0.99) 100%);
          border: 1px solid rgba(224,64,251,0.22); border-radius: var(--radius);
          padding: 3rem 2rem; max-width: 440px; width: 100%; text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 1.25rem;
          box-shadow: var(--shadow);
        }
        .pending-glow {
          position: absolute; top: -80px; right: -60px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(224,64,251,0.12), transparent 70%);
          pointer-events: none; border-radius: 50%; filter: blur(50px);
        }
        .pending-avatar {
          width: 72px; height: 72px; border-radius: 50%;
          background: var(--grad-primary);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 800; font-size: 1.8rem;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 24px rgba(224,64,251,0.3);
        }
        .pending-name { font-size: 1.3rem; font-weight: 800; color: var(--text); margin: 0; }
        .pending-status {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.8rem; font-weight: 700; letter-spacing: 0.04em;
          border: 1px solid; border-radius: var(--radius-pill);
          padding: 0.3rem 1rem;
        }
        .pending-desc { font-size: 0.875rem; color: var(--text-muted); line-height: 1.6; margin: 0; max-width: 320px; }
        .pending-cta { width: 100%; justify-content: center; }
      `}</style>
    </div>
  );
}

/* ─── Main page component ───────────────────────────────── */
export default function CreatorPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [earnings, setEarnings] = useState(null);
  const [stats, setStats] = useState(null);
  const [agencyData, setAgencyData] = useState(null);
  const [subCreators, setSubCreators] = useState([]);
  const [exclusiveItems, setExclusiveItems] = useState([]);

  // Live control state
  const [liveEndLoading, setLiveEndLoading] = useState(false);
  const [liveSettingsLoading, setLiveSettingsLoading] = useState(false);

  // Payout state
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");

  // Private call settings state
  const [callEnabled, setCallEnabled] = useState(false);
  const [pricePerMinute, setPricePerMinute] = useState(0);
  const [callSettingsSaving, setCallSettingsSaving] = useState(false);
  const [callSettingsError, setCallSettingsError] = useState("");
  const [callSettingsSuccess, setCallSettingsSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers }),
      fetch(`${API_URL}/api/lives/mine`, { headers }),
      fetch(`${API_URL}/api/creator/earnings`, { headers }),
      fetch(`${API_URL}/api/creator/stats`, { headers }),
      fetch(`${API_URL}/api/agency/me`, { headers }),
      fetch(`${API_URL}/api/agency/sub-creators`, { headers }),
      fetch(`${API_URL}/api/exclusive/mine`, { headers }),
    ])
      .then(async ([userRes, livesRes, earningsRes, statsRes, agencyRes, subRes, exclusiveRes]) => {
        if (userRes.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        if (!userRes.ok) throw new Error("Error al cargar datos");

        const userData = await userRes.json();

        if (userData.role !== "creator") {
          router.replace("/profile");
          return;
        }

        setUser(userData);
        setCallEnabled(userData.creatorProfile?.privateCallEnabled ?? false);
        setPricePerMinute(userData.creatorProfile?.pricePerMinute ?? 0);

        if (livesRes.ok) {
          const livesData = await livesRes.json();
          setLives(livesData.lives || livesData || []);
        }

        if (earningsRes.ok) setEarnings(await earningsRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (agencyRes.ok) setAgencyData(await agencyRes.json());
        if (subRes.ok) {
          const d = await subRes.json();
          setSubCreators(d.relationships || []);
        }
        if (exclusiveRes.ok) {
          const d = await exclusiveRes.json();
          setExclusiveItems(Array.isArray(d) ? d : d.content || d.items || []);
        }
      })
      .catch(() => setError("No se pudo cargar el estudio"))
      .finally(() => setLoading(false));
  }, [router]);

  /* ── Live control handlers ─────────────────────────── */
  const activeLive = useMemo(() => lives.find((l) => l.isLive) || null, [lives]);

  const handleEndLive = async () => {
    if (!activeLive) return;
    const token = localStorage.getItem("token");
    setLiveEndLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${activeLive._id}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setLives((prev) => prev.map((l) => l._id === activeLive._id ? { ...l, isLive: false } : l));
      }
    } catch {}
    setLiveEndLoading(false);
  };

  const handleLiveSetting = async (key, value) => {
    if (!activeLive) return;
    const token = localStorage.getItem("token");
    setLiveSettingsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${activeLive._id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLives((prev) => prev.map((l) => l._id === activeLive._id ? { ...l, ...updated } : l));
      }
    } catch {}
    setLiveSettingsLoading(false);
  };

  /* ── Call settings handler ─────────────────────────── */
  const handleSaveCallSettings = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const price = parseInt(pricePerMinute, 10);
    if (isNaN(price) || price < 1) {
      setCallSettingsError("El precio por minuto debe ser al menos 1 moneda.");
      return;
    }
    setCallSettingsSaving(true);
    setCallSettingsError("");
    setCallSettingsSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/user/me/creator-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ privateCallEnabled: callEnabled, pricePerMinute: price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar");
      setUser(data);
      setCallEnabled(data.creatorProfile?.privateCallEnabled ?? false);
      setPricePerMinute(data.creatorProfile?.pricePerMinute ?? 0);
      setCallSettingsSuccess("Configuración guardada correctamente.");
      setTimeout(() => setCallSettingsSuccess(""), 3000);
    } catch (err) {
      setCallSettingsError(err.message);
    } finally {
      setCallSettingsSaving(false);
    }
  };

  /* ── Payout handler ────────────────────────────────── */
  const handleRequestPayout = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/creator/payout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al solicitar el pago");
      setPayoutSuccess(data.message || "Solicitud enviada correctamente.");
      setStats((prev) => ({ ...(prev || {}), earningsCoins: 0, pendingPayout: data.payout }));
      setUser((prev) => ({ ...(prev || {}), earningsCoins: 0 }));
      setTimeout(() => setPayoutSuccess(""), 5000);
    } catch (err) {
      setPayoutError(err.message);
    } finally {
      setPayoutLoading(false);
    }
  };

  /* ── Loading / error states ────────────────────────── */
  if (loading) {
    return (
      <div className="creator-page">
        <div className="skeleton" style={{ height: 160, borderRadius: "var(--radius)" }} />
        <div className="skeleton-grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius)" }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
        <style jsx>{`
          .creator-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 860px; margin: 0 auto; }
          .skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--error)" }}>{error}</div>
    );
  }

  const isApproved = user?.role === "creator" && user?.creatorStatus === "approved";

  /* ── Non-approved fallback ─────────────────────────── */
  if (!isApproved) {
    return <PendingCreatorState user={user} />;
  }

  /* ── Derived values ────────────────────────────────── */
  const displayName = user?.username || user?.name || "Creador";
  const initial = displayName[0].toUpperCase();
  const availableEarnings = stats?.earningsCoins ?? user?.earningsCoins ?? 0;
  const recentLives = lives.slice(0, 5);

  const todayEarnings = useMemo(() => {
    if (!earnings?.recentTransactions?.length) return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return earnings.recentTransactions
      .filter((tx) => new Date(tx.createdAt) >= todayStart)
      .reduce((sum, tx) => sum + (tx.creatorShare || 0), 0);
  }, [earnings]);

  const { activeSubCount, pendingSubCount } = useMemo(() => {
    return subCreators.reduce(
      (acc, r) => {
        if (r.status === "active") acc.activeSubCount += 1;
        else if (r.status === "pending") acc.pendingSubCount += 1;
        return acc;
      },
      { activeSubCount: 0, pendingSubCount: 0 }
    );
  }, [subCreators]);
  const agencyEnabled = agencyData?.agencyProfile?.enabled ?? false;

  /* ─────────────────────────────────────────────────────
     RENDER — Premium Creator Dashboard
     ───────────────────────────────────────────────────── */
  return (
    <div className="creator-page">

      {/* ── 1. HERO CREATOR HEADER ─────────────────────── */}
      <div className="hero">
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />
        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-avatar">{initial}</div>
            <div className="hero-info">
              <div className="hero-badges">
                <span className="badge-creator">🎙 Creator</span>
                {user?.isVerifiedCreator && <span className="badge-verified">✓ Verificado</span>}
                <span className="badge-approved">● Aprobado</span>
              </div>
              <h1 className="hero-title">{displayName}</h1>
              {user?.creatorProfile?.displayName && user.creatorProfile.displayName !== displayName && (
                <p className="hero-display">{user.creatorProfile.displayName}</p>
              )}
              <div className="hero-quick-stats">
                <span className="hero-stat"><CoinIcon /> {user?.coins ?? 0} monedas</span>
                <span className="hero-stat hero-stat-earn"><TrophyIcon /> {user?.earningsCoins ?? 0} ganancias</span>
                {(user?.agencyEarningsCoins ?? 0) > 0 && (
                  <span className="hero-stat hero-stat-agency"><AgencyIcon /> {user.agencyEarningsCoins} agencia</span>
                )}
              </div>
            </div>
          </div>
          <div className="hero-cta">
            {activeLive ? (
              <Link href={`/live/${activeLive._id}`} className="btn btn-live-active">
                🔴 Live activo
              </Link>
            ) : (
              <Link href="/live/start" className="btn btn-start-live">
                🎥 Iniciar live
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. LIVE CONTROL PANEL ──────────────────────── */}
      <div className="panel panel-live">
        <div className="panel-header">
          <h2 className="section-title" style={{ margin: 0 }}>🎬 Control de Live</h2>
          {activeLive ? (
            <span className="live-dot-badge">🔴 EN VIVO</span>
          ) : (
            <span className="offline-badge">⚫ Offline</span>
          )}
        </div>

        {activeLive ? (
          <div className="live-active-wrap">
            <div className="live-active-info">
              <div className="live-title-row">
                <span className="live-current-title">{activeLive.title}</span>
                {activeLive.isPrivate && <span className="live-private-tag">🔒 Privado</span>}
              </div>
              <div className="live-meta-row">
                <span className="live-meta-item"><EyeIcon /> {activeLive.viewerCount ?? 0} espectadores</span>
                {activeLive.category && <span className="live-meta-item">📂 {activeLive.category}</span>}
              </div>
            </div>

            <div className="live-toggles">
              <div className="live-toggle-row">
                <span className="live-toggle-label">💬 Chat</span>
                <Toggle
                  value={activeLive.chatEnabled ?? true}
                  onChange={(v) => handleLiveSetting("chatEnabled", v)}
                  disabled={liveSettingsLoading}
                />
              </div>
              <div className="live-toggle-row">
                <span className="live-toggle-label">🎁 Regalos</span>
                <Toggle
                  value={activeLive.giftsEnabled ?? true}
                  onChange={(v) => handleLiveSetting("giftsEnabled", v)}
                  disabled={liveSettingsLoading}
                />
              </div>
              <div className="live-toggle-row">
                <span className="live-toggle-label">🔒 Privado</span>
                <Toggle
                  value={activeLive.isPrivate ?? false}
                  onChange={(v) => handleLiveSetting("isPrivate", v)}
                  disabled={liveSettingsLoading}
                />
              </div>
            </div>

            <div className="live-actions">
              <Link href={`/live/${activeLive._id}`} className="btn btn-secondary">
                Entrar al live
              </Link>
              <button
                className="btn btn-end-live"
                onClick={handleEndLive}
                disabled={liveEndLoading}
              >
                <StopIcon /> {liveEndLoading ? "Finalizando…" : "Finalizar live"}
              </button>
            </div>
          </div>
        ) : (
          <div className="live-offline-wrap">
            <div className="live-offline-icon">📡</div>
            <p className="live-offline-msg">No tienes ningún live activo ahora mismo.</p>
            <Link href="/live/start" className="btn btn-start-live">
              🎥 Iniciar live
            </Link>
          </div>
        )}
      </div>

      {/* ── 3. EARNINGS PANEL ──────────────────────────── */}
      <div className="panel panel-earnings">
        <div className="panel-header">
          <h2 className="section-title" style={{ margin: 0 }}>💰 Ganancias</h2>
          <span className="badge-split">60 / 40</span>
        </div>

        <div className="earnings-grid">
          <div className="ecard ecard-today">
            <div className="ecard-icon">☀️</div>
            <div className="ecard-value">{todayEarnings}</div>
            <div className="ecard-label">Hoy</div>
          </div>
          <div className="ecard ecard-total">
            <div className="ecard-icon">💚</div>
            <div className="ecard-value">+{earnings?.totalCreatorShare ?? 0}</div>
            <div className="ecard-label">Total tuyo</div>
          </div>
          <div className="ecard ecard-agency">
            <div className="ecard-icon">🏢</div>
            <div className="ecard-value">{user?.agencyEarningsCoins ?? 0}</div>
            <div className="ecard-label">Agencia</div>
          </div>
          <div className="ecard ecard-gifts">
            <div className="ecard-icon">🎁</div>
            <div className="ecard-value">{earnings?.totalGiftCount ?? 0}</div>
            <div className="ecard-label">Regalos</div>
          </div>
        </div>

        {earnings && earnings.totalCoinsReceived > 0 && (() => {
          const pct = Math.round((earnings.totalCreatorShare / earnings.totalCoinsReceived) * 100);
          return (
            <div className="earnings-bar-wrap">
              <div className="earnings-bar">
                <div className="earnings-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="earnings-bar-legend">
                <span className="ebl-creator">● Tu parte ({pct}%)</span>
                <span className="ebl-platform">● Plataforma</span>
              </div>
            </div>
          );
        })()}

        {/* Payout status inline */}
        <div className="payout-inline">
          <div className="payout-inline-balance">
            <span className="payout-inline-label">Saldo disponible para retiro</span>
            <span className="payout-inline-value">🪙 {availableEarnings}</span>
          </div>
          {stats?.pendingPayout ? (
            <div className="payout-pending-notice">
              ⏳ Solicitud pendiente de <strong>{stats.pendingPayout.amountCoins} monedas</strong> — en proceso.
            </div>
          ) : (
            <div className="payout-actions">
              {payoutError && <div className="settings-alert settings-error">{payoutError}</div>}
              {payoutSuccess && <div className="settings-alert settings-success">{payoutSuccess}</div>}
              <button
                className="btn btn-payout"
                onClick={handleRequestPayout}
                disabled={payoutLoading || availableEarnings < MIN_PAYOUT_COINS}
              >
                {payoutLoading ? "Enviando…" : "💸 Solicitar pago"}
              </button>
              {availableEarnings < MIN_PAYOUT_COINS && (
                <p className="payout-hint">Mínimo {MIN_PAYOUT_COINS} monedas requeridas.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. AGENCY PANEL ────────────────────────────── */}
      {(agencyEnabled || subCreators.length > 0 || agencyData) && (
        <div className="panel panel-agency">
          <div className="panel-header">
            <h2 className="section-title" style={{ margin: 0 }}>🏢 Agencia</h2>
            <span className={`agency-status-badge ${agencyEnabled ? "agency-on" : "agency-off"}`}>
              {agencyEnabled ? "● Activa" : "○ Inactiva"}
            </span>
          </div>

          <div className="agency-stats">
            <div className="agency-stat">
              <div className="agency-stat-value">{subCreators.length}</div>
              <div className="agency-stat-label">Total sub-creadores</div>
            </div>
            <div className="agency-stat">
              <div className="agency-stat-value" style={{ color: "#22c55e" }}>{activeSubCount}</div>
              <div className="agency-stat-label">Activos</div>
            </div>
            <div className="agency-stat">
              <div className="agency-stat-value" style={{ color: "#fbbf24" }}>{pendingSubCount}</div>
              <div className="agency-stat-label">Pendientes</div>
            </div>
            <div className="agency-stat">
              <div className="agency-stat-value" style={{ color: "#a855f7" }}>🪙 {agencyData?.agencyEarningsCoins ?? user?.agencyEarningsCoins ?? 0}</div>
              <div className="agency-stat-label">Ganancias agencia</div>
            </div>
          </div>

          {agencyData?.agencyProfile?.agencyName && (
            <div className="agency-name-row">
              <span className="agency-name-label">Agencia:</span>
              <span className="agency-name-value">{agencyData.agencyProfile.agencyName}</span>
              {agencyData.agencyProfile.agencyCode && (
                <span className="agency-code">#{agencyData.agencyProfile.agencyCode}</span>
              )}
            </div>
          )}

          <Link href="/agency" className="btn btn-secondary agency-btn">
            <AgencyIcon /> Gestionar agency
          </Link>
        </div>
      )}

      {/* ── 5. EXCLUSIVE CONTENT PANEL ─────────────────── */}
      <div className="panel panel-exclusive">
        <div className="panel-header">
          <h2 className="section-title" style={{ margin: 0 }}>�� Contenido exclusivo</h2>
          {exclusiveItems.length > 0 && (
            <span className="exclusive-count-badge">{exclusiveItems.length} items</span>
          )}
        </div>

        {exclusiveItems.length > 0 ? (
          <div className="exclusive-preview">
            {exclusiveItems.slice(0, 3).map((item) => (
              <div key={item._id} className="exclusive-item">
                <span className="exclusive-item-type">{item.type === "video" ? "🎬" : "📷"}</span>
                <span className="exclusive-item-title">{item.title}</span>
                <span className="exclusive-item-price">🪙 {item.coinPrice}</span>
              </div>
            ))}
            {exclusiveItems.length > 3 && (
              <p className="exclusive-more">+{exclusiveItems.length - 3} más</p>
            )}
          </div>
        ) : (
          <p className="exclusive-empty">Aún no tienes contenido exclusivo publicado.</p>
        )}

        <Link href="/creator/content" className="btn btn-secondary exclusive-btn">
          💎 Gestionar contenido exclusivo
        </Link>
      </div>

      {/* ── 6. QUICK ACTIONS ───────────────────────────── */}
      <div className="panel panel-actions">
        <h2 className="section-title">⚡ Acciones rápidas</h2>
        <div className="actions-grid">
          <Link href="/live/start" className="action-card action-live">
            <div className="action-icon"><BroadcastIcon /></div>
            <div className="action-label">Iniciar live</div>
          </Link>
          <Link href="/creator/content" className="action-card action-content">
            <div className="action-icon">💎</div>
            <div className="action-label">Contenido</div>
          </Link>
          <Link href="/wallet" className="action-card action-payout">
            <div className="action-icon">💸</div>
            <div className="action-label">Pagos</div>
          </Link>
          <Link href="/agency" className="action-card action-agency">
            <div className="action-icon"><AgencyIcon /></div>
            <div className="action-label">Agencia</div>
          </Link>
          <Link href="/exclusive" className="action-card action-exclusive">
            <div className="action-icon">🔓</div>
            <div className="action-label">Exclusivo</div>
          </Link>
          <button
            type="button"
            className="action-card action-calls"
            onClick={() => document.getElementById("call-settings")?.scrollIntoView({ behavior: "smooth" })}
          >
            <div className="action-icon">📞</div>
            <div className="action-label">Llamadas</div>
          </button>
        </div>
      </div>

      {/* ── 7. PRIVATE CALL SETTINGS ───────────────────── */}
      <div className="panel panel-calls" id="call-settings">
        <div className="panel-header">
          <h2 className="section-title" style={{ margin: 0 }}>📞 Llamadas privadas</h2>
        </div>
        <p className="settings-desc">
          Permite que tus fans te llamen en privado. Recibirás el <strong>60%</strong> de cada minuto.
        </p>

        {(stats?.totalCalls > 0) && (
          <div className="call-stats-grid">
            <div className="call-stat-item">
              <div className="call-stat-value">{stats.totalCalls ?? 0}</div>
              <div className="call-stat-label">Llamadas</div>
            </div>
            <div className="call-stat-item">
              <div className="call-stat-value">{Math.round((stats.totalCallDurationSeconds ?? 0) / 60)} min</div>
              <div className="call-stat-label">Duración total</div>
            </div>
            <div className="call-stat-item">
              <div className="call-stat-value" style={{ color: "#34d399" }}>🪙 {stats.totalCallEarnings ?? 0}</div>
              <div className="call-stat-label">Ganado en llamadas</div>
            </div>
          </div>
        )}

        <div className="settings-row">
          <div className="settings-toggle-group">
            <span className="settings-label">Activar llamadas privadas</span>
            <Toggle value={callEnabled} onChange={setCallEnabled} />
          </div>
        </div>

        {callEnabled && (
          <div className="settings-row">
            <label className="settings-label" htmlFor="pricePerMin">
              Precio por minuto (monedas)
            </label>
            <input
              id="pricePerMin"
              type="number"
              min={1}
              step={1}
              className="settings-input"
              value={pricePerMinute}
              onChange={(e) => setPricePerMinute(e.target.value)}
            />
          </div>
        )}

        {callSettingsError && <div className="settings-alert settings-error">{callSettingsError}</div>}
        {callSettingsSuccess && <div className="settings-alert settings-success">{callSettingsSuccess}</div>}

        <button
          className="btn btn-primary settings-save-btn"
          onClick={handleSaveCallSettings}
          disabled={callSettingsSaving}
        >
          {callSettingsSaving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      {/* ── 8. RECENT LIVES ────────────────────────────── */}
      {recentLives.length > 0 && (
        <div className="panel">
          <h2 className="section-title">📺 Directos recientes</h2>
          <div className="recent-list">
            {recentLives.map((live) => (
              <div key={live._id} className="recent-item">
                <div className="recent-item-info">
                  <div className="recent-item-title">{live.title}</div>
                  <div className="recent-item-meta">
                    {live.category && <span className="recent-item-tag">{live.category}</span>}
                    <span className="recent-item-date">
                      {new Date(live.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <div className="recent-item-status">
                  {live.isLive ? (
                    <span className="badge-live-small">EN VIVO</span>
                  ) : (
                    <span className="status-ended">Finalizado</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 9. RECENT GIFT ACTIVITY ────────────────────── */}
      <div className="panel">
        <h2 className="section-title">🎁 Actividad de regalos</h2>
        {(!earnings || !earnings.recentTransactions?.length) ? (
          <p className="no-gifts-msg">Aún no has recibido regalos. ¡Comparte tu perfil!</p>
        ) : (
          <div className="recent-list">
            {earnings.recentTransactions.map((tx) => {
              const contextLabel = tx.context === "live" ? "Directo" : tx.context === "private_call" ? "Llamada" : "Perfil";
              return (
                <div key={tx._id} className="recent-item gift-row">
                  <div className="gift-row-icon">{tx.giftIcon}</div>
                  <div className="recent-item-info">
                    <div className="recent-item-title">
                      {tx.giftName}{" "}
                      <span className="gift-row-from">de @{tx.sender?.username || tx.sender?.name || "usuario"}</span>
                    </div>
                    <div className="recent-item-meta">
                      <span className="recent-item-tag">{contextLabel}</span>
                      <span className="recent-item-date">
                        {new Date(tx.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                  <div className="tx-breakdown">
                    <div className="tx-total">🪙 {tx.coinCost}</div>
                    <div className="tx-shares">
                      <span className="tx-creator">+{tx.creatorShare} tuyo</span>
                      <span className="tx-platform">{tx.platformShare} plat.</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── STYLES ─────────────────────────────────────── */}
      <style jsx>{`
        .creator-page {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          max-width: 860px;
          margin: 0 auto;
          padding-bottom: 2rem;
        }

        /* ── Shared panel ──────────────────────────────── */
        .panel {
          background: rgba(12,5,25,0.88);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(224,64,251,0.14);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.4);
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0;
          letter-spacing: -0.01em;
        }

        /* ── Hero ──────────────────────────────────────── */
        .hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(24,10,52,0.98) 0%, rgba(14,6,30,0.99) 100%);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius);
          padding: 1.75rem;
          box-shadow: var(--shadow);
        }

        .hero-glow {
          position: absolute;
          pointer-events: none;
          border-radius: 50%;
          filter: blur(55px);
        }

        .hero-glow-1 {
          top: -70px; right: -50px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(224,64,251,0.18), transparent 70%);
        }

        .hero-glow-2 {
          bottom: -60px; left: -40px;
          width: 220px; height: 220px;
          background: radial-gradient(circle, rgba(255,45,120,0.12), transparent 70%);
        }

        .hero-inner {
          position: relative;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
          flex: 1;
        }

        .hero-avatar {
          width: 72px; height: 72px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 800; font-size: 1.8rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.28), 0 0 24px rgba(224,64,251,0.35);
        }

        .hero-info { flex: 1; min-width: 0; }

        .hero-badges {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.4rem;
        }

        .badge-creator {
          font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--accent-2);
          background: rgba(224,64,251,0.12); border: 1px solid rgba(224,64,251,0.28);
          border-radius: var(--radius-pill); padding: 0.18rem 0.6rem;
        }

        .badge-verified {
          font-size: 0.7rem; font-weight: 800;
          color: #60a5fa;
          background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.25);
          border-radius: var(--radius-pill); padding: 0.18rem 0.6rem;
        }

        .badge-approved {
          font-size: 0.7rem; font-weight: 800;
          color: #34d399;
          background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25);
          border-radius: var(--radius-pill); padding: 0.18rem 0.6rem;
        }

        .hero-title {
          font-size: 1.5rem; font-weight: 800;
          background: var(--grad-primary);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0; line-height: 1.2;
        }

        .hero-display {
          font-size: 0.85rem; color: var(--text-muted);
          margin: 0.15rem 0 0;
        }

        .hero-quick-stats {
          display: flex; align-items: center; gap: 1rem;
          flex-wrap: wrap; margin-top: 0.6rem;
        }

        .hero-stat {
          display: flex; align-items: center; gap: 0.35rem;
          font-size: 0.82rem; font-weight: 600; color: var(--text-muted);
        }

        .hero-stat :global(svg) { width: 14px; height: 14px; flex-shrink: 0; }

        .hero-stat-earn { color: #fbbf24; }
        .hero-stat-agency { color: #a855f7; }

        .hero-cta { flex-shrink: 0; display: flex; align-items: flex-start; }

        .btn-start-live {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: var(--grad-primary);
          color: #fff; font-weight: 700; font-size: 0.9rem;
          border: none; border-radius: var(--radius-sm);
          padding: 0.65rem 1.25rem; cursor: pointer;
          text-decoration: none;
          box-shadow: 0 0 18px rgba(255,45,120,0.35);
          transition: opacity var(--transition), transform var(--transition);
          white-space: nowrap;
        }

        .btn-start-live:hover { opacity: 0.9; transform: translateY(-1px); }

        .btn-live-active {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: rgba(255,45,120,0.15); border: 1px solid rgba(255,45,120,0.5);
          color: #ff2d78; font-weight: 700; font-size: 0.9rem;
          border-radius: var(--radius-sm);
          padding: 0.65rem 1.25rem; cursor: pointer;
          text-decoration: none;
          animation: pulse-live 2s ease-in-out infinite;
          white-space: nowrap;
        }

        @keyframes pulse-live {
          0%, 100% { box-shadow: 0 0 8px rgba(255,45,120,0.3); }
          50% { box-shadow: 0 0 20px rgba(255,45,120,0.6); }
        }

        /* ── Live panel ────────────────────────────────── */
        .panel-live { border-color: rgba(248,113,113,0.18); }

        .live-dot-badge {
          font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
          color: #f87171;
          background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.3);
          border-radius: var(--radius-pill); padding: 0.2rem 0.7rem;
          animation: pulse-live 2s ease-in-out infinite;
        }

        .offline-badge {
          font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
          color: var(--text-dim);
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-pill); padding: 0.2rem 0.7rem;
        }

        .live-active-wrap {
          display: flex; flex-direction: column; gap: 1rem;
        }

        .live-active-info {
          background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.15);
          border-radius: var(--radius-sm); padding: 1rem 1.1rem;
        }

        .live-title-row {
          display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
          margin-bottom: 0.4rem;
        }

        .live-current-title {
          font-size: 0.95rem; font-weight: 700; color: var(--text);
        }

        .live-private-tag {
          font-size: 0.7rem; font-weight: 700;
          color: #818cf8;
          background: rgba(129,140,248,0.1); border: 1px solid rgba(129,140,248,0.22);
          border-radius: var(--radius-pill); padding: 0.15rem 0.5rem;
        }

        .live-meta-row {
          display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
        }

        .live-meta-item {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.8rem; color: var(--text-muted);
        }

        .live-meta-item :global(svg) { width: 14px; height: 14px; }

        .live-toggles {
          display: flex; flex-direction: column; gap: 0.6rem;
          background: rgba(255,255,255,0.02); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 0.875rem 1rem;
        }

        .live-toggle-row {
          display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        }

        .live-toggle-label {
          font-size: 0.85rem; font-weight: 600; color: var(--text);
        }

        .live-actions {
          display: flex; gap: 0.75rem; flex-wrap: wrap;
        }

        .btn-end-live {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.35);
          color: #f87171; font-weight: 700; font-size: 0.875rem;
          border-radius: var(--radius-sm); padding: 0.6rem 1rem;
          cursor: pointer; transition: all var(--transition);
        }

        .btn-end-live :global(svg) { width: 14px; height: 14px; }
        .btn-end-live:hover:not(:disabled) { background: rgba(248,113,113,0.2); }
        .btn-end-live:disabled { opacity: 0.5; cursor: not-allowed; }

        .live-offline-wrap {
          display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
          padding: 1.5rem; text-align: center;
        }

        .live-offline-icon { font-size: 2.5rem; }
        .live-offline-msg { font-size: 0.875rem; color: var(--text-muted); margin: 0; }

        /* ── Earnings panel ────────────────────────────── */
        .panel-earnings { border-color: rgba(251,191,36,0.18); }

        .badge-split {
          font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em;
          color: #fbbf24;
          background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.25);
          border-radius: var(--radius-pill); padding: 0.2rem 0.7rem;
        }

        .earnings-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }

        @media (max-width: 600px) {
          .earnings-grid { grid-template-columns: repeat(2, 1fr); }
        }

        .ecard {
          display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
          padding: 1rem 0.75rem; text-align: center;
          border-radius: var(--radius-sm); border: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
          transition: transform var(--transition-slow), border-color var(--transition);
        }

        .ecard:hover { transform: translateY(-2px); }

        .ecard-today { border-color: rgba(251,191,36,0.2); }
        .ecard-today:hover { border-color: rgba(251,191,36,0.4); box-shadow: 0 0 14px rgba(251,191,36,0.1); }

        .ecard-total { border-color: rgba(52,211,153,0.2); }
        .ecard-total:hover { border-color: rgba(52,211,153,0.4); box-shadow: 0 0 14px rgba(52,211,153,0.1); }

        .ecard-agency { border-color: rgba(168,85,247,0.2); }
        .ecard-agency:hover { border-color: rgba(168,85,247,0.4); box-shadow: 0 0 14px rgba(168,85,247,0.1); }

        .ecard-gifts { border-color: rgba(224,64,251,0.2); }
        .ecard-gifts:hover { border-color: rgba(224,64,251,0.4); box-shadow: 0 0 14px rgba(224,64,251,0.1); }

        .ecard-icon { font-size: 1.3rem; line-height: 1; }

        .ecard-value {
          font-size: 1.3rem; font-weight: 800; color: var(--text); line-height: 1.2;
        }

        .ecard-total .ecard-value { color: #34d399; }
        .ecard-today .ecard-value { color: #fbbf24; }
        .ecard-agency .ecard-value { color: #a855f7; }

        .ecard-label {
          font-size: 0.68rem; color: var(--text-muted); font-weight: 600;
          letter-spacing: 0.03em; text-transform: uppercase;
        }

        .earnings-bar-wrap { display: flex; flex-direction: column; gap: 0.4rem; }

        .earnings-bar {
          width: 100%; height: 6px;
          background: rgba(129,140,248,0.2); border-radius: 999px; overflow: hidden;
        }

        .earnings-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #34d399, #059669);
          border-radius: 999px; transition: width 0.6s ease;
        }

        .earnings-bar-legend {
          display: flex; gap: 1.25rem; font-size: 0.72rem; font-weight: 600; color: var(--text-muted);
        }

        .ebl-creator { color: #34d399; }
        .ebl-platform { color: #818cf8; }

        .payout-inline {
          background: rgba(52,211,153,0.04); border: 1px solid rgba(52,211,153,0.14);
          border-radius: var(--radius-sm); padding: 1rem 1.1rem;
          display: flex; flex-direction: column; gap: 0.75rem;
        }

        .payout-inline-balance {
          display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
          flex-wrap: wrap;
        }

        .payout-inline-label { font-size: 0.82rem; font-weight: 600; color: var(--text-muted); }
        .payout-inline-value { font-size: 1.05rem; font-weight: 800; color: #34d399; }

        .btn-payout {
          display: inline-flex; align-items: center; gap: 0.35rem;
          background: linear-gradient(135deg, rgba(52,211,153,0.18), rgba(5,150,105,0.18));
          border: 1px solid rgba(52,211,153,0.4);
          color: #34d399; font-weight: 700; font-size: 0.875rem;
          border-radius: var(--radius-sm); padding: 0.6rem 1rem;
          cursor: pointer; transition: all var(--transition);
        }

        .btn-payout:hover:not(:disabled) { background: rgba(52,211,153,0.25); }
        .btn-payout:disabled { opacity: 0.45; cursor: not-allowed; }

        .payout-pending-notice {
          font-size: 0.82rem; color: #fbbf24;
          background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2);
          border-radius: var(--radius-sm); padding: 0.6rem 0.875rem; line-height: 1.5;
        }

        .payout-actions { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
        .payout-hint { font-size: 0.75rem; color: var(--text-dim); margin: 0; }

        /* ── Agency panel ──────────────────────────────── */
        .panel-agency { border-color: rgba(168,85,247,0.18); }

        .agency-status-badge {
          font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
          border-radius: var(--radius-pill); padding: 0.2rem 0.7rem;
        }

        .agency-on {
          color: #22c55e; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3);
        }

        .agency-off {
          color: var(--text-dim); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
        }

        .agency-stats {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;
        }

        @media (max-width: 540px) {
          .agency-stats { grid-template-columns: repeat(2, 1fr); }
        }

        .agency-stat {
          display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
          padding: 0.875rem 0.5rem; text-align: center;
          background: rgba(168,85,247,0.04); border: 1px solid rgba(168,85,247,0.14);
          border-radius: var(--radius-sm);
        }

        .agency-stat-value {
          font-size: 1.2rem; font-weight: 800; color: var(--text); line-height: 1;
        }

        .agency-stat-label {
          font-size: 0.67rem; color: var(--text-muted); font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.03em;
        }

        .agency-name-row {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          font-size: 0.85rem;
        }

        .agency-name-label { color: var(--text-muted); font-weight: 600; }
        .agency-name-value { color: var(--text); font-weight: 700; }

        .agency-code {
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em;
          color: #a855f7;
          background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.22);
          border-radius: var(--radius-pill); padding: 0.15rem 0.5rem;
        }

        .agency-btn {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 0.4rem;
        }

        .agency-btn :global(svg) { width: 15px; height: 15px; }

        /* ── Exclusive content panel ───────────────────── */
        .panel-exclusive { border-color: rgba(224,64,251,0.18); }

        .exclusive-count-badge {
          font-size: 0.72rem; font-weight: 800;
          color: var(--accent-2);
          background: rgba(224,64,251,0.1); border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius-pill); padding: 0.2rem 0.7rem;
        }

        .exclusive-preview {
          display: flex; flex-direction: column; gap: 0.5rem;
        }

        .exclusive-item {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.6rem 0.875rem;
          background: rgba(255,255,255,0.02); border: 1px solid var(--border);
          border-radius: var(--radius-sm);
        }

        .exclusive-item-type { font-size: 1.1rem; flex-shrink: 0; }

        .exclusive-item-title {
          flex: 1; font-size: 0.85rem; font-weight: 600; color: var(--text);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .exclusive-item-price {
          font-size: 0.8rem; font-weight: 700; color: #fbbf24; flex-shrink: 0;
        }

        .exclusive-more {
          font-size: 0.78rem; color: var(--text-dim); text-align: center; margin: 0;
        }

        .exclusive-empty {
          font-size: 0.875rem; color: var(--text-muted); margin: 0;
          text-align: center; padding: 0.5rem 0;
        }

        .exclusive-btn { align-self: flex-start; }

        /* ── Quick actions ─────────────────────────────── */
        .panel-actions { border-color: rgba(129,140,248,0.16); }

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 0.75rem;
        }

        @media (max-width: 640px) {
          .actions-grid { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 360px) {
          .actions-grid { grid-template-columns: repeat(2, 1fr); }
        }

        .action-card {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 1rem 0.5rem; text-align: center;
          background: rgba(255,255,255,0.02); border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          text-decoration: none; cursor: pointer;
          transition: all var(--transition);
          color: var(--text-muted);
        }

        .action-card:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.05);
        }

        .action-live { border-color: rgba(248,113,113,0.22); color: #f87171; }
        .action-live:hover { border-color: rgba(248,113,113,0.45); box-shadow: 0 0 14px rgba(248,113,113,0.12); }

        .action-content { border-color: rgba(224,64,251,0.22); color: var(--accent-2); }
        .action-content:hover { border-color: rgba(224,64,251,0.45); box-shadow: 0 0 14px rgba(224,64,251,0.12); }

        .action-payout { border-color: rgba(52,211,153,0.22); color: #34d399; }
        .action-payout:hover { border-color: rgba(52,211,153,0.45); box-shadow: 0 0 14px rgba(52,211,153,0.12); }

        .action-agency { border-color: rgba(168,85,247,0.22); color: #a855f7; }
        .action-agency:hover { border-color: rgba(168,85,247,0.45); box-shadow: 0 0 14px rgba(168,85,247,0.12); }

        .action-exclusive { border-color: rgba(129,140,248,0.22); color: #818cf8; }
        .action-exclusive:hover { border-color: rgba(129,140,248,0.45); box-shadow: 0 0 14px rgba(129,140,248,0.12); }

        .action-calls { border-color: rgba(251,191,36,0.22); color: #fbbf24; background: transparent; }
        .action-calls:hover { border-color: rgba(251,191,36,0.45); box-shadow: 0 0 14px rgba(251,191,36,0.12); }

        .action-icon {
          font-size: 1.4rem; line-height: 1;
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px;
          border-radius: 50%; background: rgba(255,255,255,0.04);
        }

        .action-icon :global(svg) { width: 18px; height: 18px; }

        .action-label {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em;
        }

        /* ── Calls panel ───────────────────────────────── */
        .panel-calls { border-color: rgba(99,102,241,0.2); }

        .call-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
        }

        .call-stat-item {
          display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
          padding: 0.875rem 0.5rem;
          background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.18);
          border-radius: var(--radius-sm); text-align: center;
        }

        .call-stat-value {
          font-size: 1.15rem; font-weight: 800; color: var(--text);
        }

        .call-stat-label {
          font-size: 0.72rem; font-weight: 600; color: var(--text-muted); letter-spacing: 0.02em;
        }

        /* ── Toggle ────────────────────────────────────── */
        .toggle-btn {
          position: relative; width: 44px; height: 24px;
          border-radius: 999px; background: rgba(255,255,255,0.12);
          border: none; cursor: pointer;
          transition: background var(--transition);
          flex-shrink: 0; padding: 0;
        }

        .toggle-btn.toggle-on { background: var(--accent); }

        .toggle-btn.toggle-disabled { opacity: 0.5; cursor: not-allowed; }

        .toggle-thumb {
          position: absolute; top: 3px; left: 3px;
          width: 18px; height: 18px;
          border-radius: 50%; background: #fff;
          transition: transform var(--transition); display: block;
        }

        .toggle-btn.toggle-on .toggle-thumb { transform: translateX(20px); }

        /* ── Settings ──────────────────────────────────── */
        .settings-desc { font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin: 0; }

        .settings-row {
          display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
        }

        .settings-label { font-size: 0.875rem; font-weight: 600; color: var(--text); }

        .settings-toggle-group {
          display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 1rem;
        }

        .settings-input {
          width: 120px; padding: 0.55rem 0.75rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
          color: var(--text); font-size: 0.9rem; outline: none;
        }

        .settings-input:focus { border-color: rgba(139,92,246,0.5); }

        .settings-alert {
          padding: 0.6rem 0.875rem; border-radius: var(--radius-sm);
          font-size: 0.82rem; font-weight: 600;
        }

        .settings-error {
          background: rgba(244,67,54,0.1); border: 1px solid var(--error); color: var(--error);
        }

        .settings-success {
          background: rgba(34,197,94,0.1); border: 1px solid #22c55e; color: #4ade80;
        }

        .settings-save-btn { align-self: flex-start; }

        /* ── Recent lists ──────────────────────────────── */
        .recent-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .recent-item {
          display: flex; align-items: center; justify-content: space-between; gap: 1rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.02); border: 1px solid var(--border);
          transition: background var(--transition);
        }

        .recent-item:hover { background: rgba(255,255,255,0.04); }

        .recent-item-title { font-size: 0.875rem; font-weight: 600; color: var(--text); }

        .recent-item-info { flex: 1; min-width: 0; }

        .recent-item-meta {
          display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; flex-wrap: wrap;
        }

        .recent-item-tag {
          font-size: 0.7rem; font-weight: 700;
          color: var(--accent-3);
          background: rgba(129,140,248,0.1); border: 1px solid rgba(129,140,248,0.2);
          border-radius: var(--radius-pill); padding: 0.1rem 0.5rem;
        }

        .recent-item-date { font-size: 0.72rem; color: var(--text-dim); }

        .recent-item-status { flex-shrink: 0; }

        .badge-live-small {
          font-size: 0.68rem; font-weight: 800; letter-spacing: 0.05em;
          color: #f87171;
          background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.3);
          border-radius: var(--radius-pill); padding: 0.15rem 0.5rem;
        }

        .status-ended { font-size: 0.75rem; font-weight: 600; color: var(--text-dim); }

        /* Gift activity */
        .gift-row { gap: 0.75rem; }

        .gift-row-icon { font-size: 1.5rem; flex-shrink: 0; line-height: 1; }

        .gift-row-from { font-size: 0.78rem; color: var(--text-muted); font-weight: 500; }

        .no-gifts-msg {
          font-size: 0.875rem; color: var(--text-muted); text-align: center; padding: 0.75rem 0; margin: 0;
        }

        .tx-breakdown {
          display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; gap: 0.2rem;
        }

        .tx-total { font-size: 0.92rem; font-weight: 800; color: #fbbf24; }

        .tx-shares {
          display: flex; flex-direction: column; align-items: flex-end; gap: 0.05rem;
        }

        .tx-creator { font-size: 0.7rem; font-weight: 700; color: #34d399; }
        .tx-platform { font-size: 0.65rem; color: var(--text-dim); }
      `}</style>
    </div>
  );
}
