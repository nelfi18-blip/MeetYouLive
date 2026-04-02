"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MIN_PAYOUT_COINS = 100;

function BroadcastIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/>
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 21 12 17 16 21"/>
      <path d="M19 3H5v10a7 7 0 0014 0V3z"/>
      <line x1="9" y1="3" x2="9" y2="13"/><line x1="15" y1="3" x2="15" y2="13"/>
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export default function CreatorPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [earnings, setEarnings] = useState(null);
  const [stats, setStats] = useState(null);

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

    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/lives/mine`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/creator/earnings`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/creator/stats`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([userRes, livesRes, earningsRes, statsRes]) => {
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

        if (earningsRes.ok) {
          setEarnings(await earningsRes.json());
        }

        if (statsRes.ok) {
          setStats(await statsRes.json());
        }
      })
      .catch(() => setError("No se pudo cargar el estudio"))
      .finally(() => setLoading(false));
  }, [router]);

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

  if (loading) {
    return (
      <div className="creator-page">
        <div className="skeleton" style={{ height: 120, borderRadius: "var(--radius)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius)" }} />
          ))}
        </div>
        <style jsx>{`.creator-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 780px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--error)" }}>{error}</div>
    );
  }

  const displayName = user?.username || user?.name || "Creador";
  const initial = displayName[0].toUpperCase();

  const recentLives = lives.slice(0, 5);
  const availableEarnings = stats?.earningsCoins ?? user?.earningsCoins ?? 0;

  return (
    <div className="creator-page">
      {/* Hero */}
      <div className="creator-hero">
        <div className="creator-hero-bg" />
        <div className="creator-hero-content">
          <div className="creator-avatar">{initial}</div>
          <div className="creator-hero-text">
            <div className="creator-badge">🎙 Estudio del Creador</div>
            <h1 className="creator-title">Hola, <span className="creator-name">{displayName}</span></h1>
            <p className="creator-sub">Gestiona tus directos y consulta tus ganancias</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="creator-stats">
        <div className="creator-stat">
          <div className="creator-stat-icon" style={{ color: "var(--accent-orange)" }}><CoinIcon /></div>
          <div className="creator-stat-value">{user?.coins ?? 0}</div>
          <div className="creator-stat-label">Monedas</div>
        </div>
        <div className="creator-stat">
          <div className="creator-stat-icon" style={{ color: "#fbbf24" }}><TrophyIcon /></div>
          <div className="creator-stat-value">{user?.earningsCoins ?? 0}</div>
          <div className="creator-stat-label">Ganancias</div>
        </div>
        <div className="creator-stat">
          <div className="creator-stat-icon" style={{ color: "var(--accent)" }}><VideoIcon /></div>
          <div className="creator-stat-value">{lives.length}</div>
          <div className="creator-stat-label">Directos totales</div>
        </div>
      </div>

      {/* Earnings Dashboard */}
      {earnings && (
        <div className="earnings-dashboard">
          <div className="earnings-header">
            <h2 className="section-title" style={{ margin: 0 }}>💰 Dashboard de Ganancias</h2>
            <span className="earnings-badge">60 / 40</span>
          </div>
          <div className="earnings-stats">
            <div className="earnings-stat e-total">
              <div className="e-icon">🪙</div>
              <div className="e-stat-value">{earnings.totalCoinsReceived}</div>
              <div className="e-stat-label">Total recibido</div>
            </div>
            <div className="earnings-stat e-creator">
              <div className="e-icon">💚</div>
              <div className="e-stat-value">+{earnings.totalCreatorShare}</div>
              <div className="e-stat-label">Tu parte (60%)</div>
            </div>
            <div className="earnings-stat e-platform">
              <div className="e-icon">🏦</div>
              <div className="e-stat-value">{earnings.totalPlatformShare}</div>
              <div className="e-stat-label">Plataforma (40%)</div>
            </div>
            <div className="earnings-stat e-count">
              <div className="e-icon">🎁</div>
              <div className="e-stat-value">{earnings.totalGiftCount}</div>
              <div className="e-stat-label">Regalos totales</div>
            </div>
          </div>
          {earnings.totalCoinsReceived > 0 && (
            <div className="earnings-bar-wrap">
              <div className="earnings-bar">
                <div
                  className="earnings-bar-creator"
                  style={{ width: `${Math.round((earnings.totalCreatorShare / earnings.totalCoinsReceived) * 100)}%` }}
                />
              </div>
              <div className="earnings-bar-legend">
                <span className="ebl-creator">● Tu parte</span>
                <span className="ebl-platform">● Plataforma</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payout Section */}
      <div className="payout-card">
        <div className="payout-header">
          <h2 className="section-title" style={{ margin: 0 }}>💸 Solicitar pago</h2>
          {stats?.pendingPayout && (
            <span className="payout-status-badge">En proceso</span>
          )}
        </div>
        <p className="payout-desc">
          Retira tus ganancias acumuladas. Mínimo {MIN_PAYOUT_COINS} monedas requeridas.
        </p>
        <div className="payout-balance">
          <span className="payout-balance-label">Saldo disponible</span>
          <span className="payout-balance-value">
            🪙 {availableEarnings}
          </span>
        </div>
        {stats?.pendingPayout ? (
          <div className="payout-pending-notice">
            ⏳ Tienes una solicitud pendiente de <strong>{stats.pendingPayout.amountCoins} monedas</strong> — te avisaremos cuando sea procesada.
          </div>
        ) : (
          <>
            {payoutError && <div className="settings-alert settings-error">{payoutError}</div>}
            {payoutSuccess && <div className="settings-alert settings-success">{payoutSuccess}</div>}
            <button
              className="btn btn-primary payout-btn"
              onClick={handleRequestPayout}
              disabled={payoutLoading || availableEarnings < MIN_PAYOUT_COINS}
            >
              {payoutLoading ? "Enviando…" : "Solicitar pago"}
            </button>
            {availableEarnings < MIN_PAYOUT_COINS && (
              <p className="payout-hint">Necesitas al menos {MIN_PAYOUT_COINS} monedas de ganancias para solicitar un pago.</p>
            )}
          </>
        )}
      </div>

      <div className="creator-tools">
        <h2 className="section-title">Herramientas</h2>
        <div className="tools-grid">
          <Link href="/live/start" className="tool-card tool-live">
            <div className="tool-card-icon"><BroadcastIcon /></div>
            <div className="tool-card-body">
              <div className="tool-card-title">Iniciar directo</div>
              <div className="tool-card-sub">Empieza a transmitir en vivo ahora</div>
            </div>
            <span className="tool-card-arrow"><ArrowIcon /></span>
          </Link>

          <Link href="/videos/upload" className="tool-card tool-video">
            <div className="tool-card-icon"><VideoIcon /></div>
            <div className="tool-card-body">
              <div className="tool-card-title">Subir vídeo</div>
              <div className="tool-card-sub">Publica contenido para tus fans</div>
            </div>
            <span className="tool-card-arrow"><ArrowIcon /></span>
          </Link>

          <Link href="/live" className="tool-card tool-archive">
            <div className="tool-card-icon"><ChartIcon /></div>
            <div className="tool-card-body">
              <div className="tool-card-title">Ver directos</div>
              <div className="tool-card-sub">Explora los streams activos</div>
            </div>
            <span className="tool-card-arrow"><ArrowIcon /></span>
          </Link>
        </div>
      </div>

      {/* Private call settings */}
      <div className="creator-settings-card">
        <h2 className="section-title">📞 Llamadas privadas de pago</h2>
        <p className="settings-desc">
          Permite que tus fans te llamen en privado y paga por minuto. Recibirás el <strong>60%</strong> de cada minuto.
        </p>

        <div className="settings-row">
          <div className="settings-toggle-group">
            <span className="settings-label">Activar llamadas privadas</span>
            <button
              type="button"
              className={`toggle-btn${callEnabled ? " toggle-on" : ""}`}
              onClick={() => setCallEnabled((v) => !v)}
              aria-pressed={callEnabled}
            >
              <span className="toggle-thumb" />
            </button>
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

      {/* Recent lives */}
      {recentLives.length > 0 && (
        <div className="creator-recent">
          <h2 className="section-title">Directos recientes</h2>
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
                    <span className="badge badge-live">EN VIVO</span>
                  ) : (
                    <span className="status-ended">Finalizado</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent earnings transactions */}
      <div className="creator-recent">
        <h2 className="section-title">🎁 Actividad de regalos</h2>
        {(!earnings || earnings.recentTransactions?.length === 0) ? (
          <p className="no-gifts-msg">Aún no has recibido regalos. ¡Comparte tu perfil para que tus fans te regalen!</p>
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
                      <span className="tx-platform">{tx.platformShare} plataforma</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .creator-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 780px;
          margin: 0 auto;
        }

        /* Hero */
        .creator-hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(22,12,45,0.95) 0%, rgba(15,8,32,0.98) 100%);
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: var(--radius);
          padding: 2rem;
          box-shadow: var(--shadow);
        }

        .creator-hero-bg {
          position: absolute;
          top: -60px; right: -40px;
          width: 260px; height: 260px;
          background: radial-gradient(circle, rgba(224,64,251,0.15), transparent 70%);
          pointer-events: none;
          border-radius: 50%;
          filter: blur(40px);
        }

        .creator-hero-content {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        .creator-avatar {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.7rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.3);
        }

        .creator-hero-text { flex: 1; }

        .creator-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--accent-2);
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.75rem;
          margin-bottom: 0.5rem;
        }

        .creator-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .creator-name {
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .creator-sub {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }

        /* Stats */
        .creator-stats {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1rem;
        }

        .creator-stat {
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

        .creator-stat:hover {
          border-color: rgba(139,92,246,0.3);
          transform: translateY(-2px);
        }

        .creator-stat-icon {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .creator-stat-icon :global(svg) { width: 20px; height: 20px; }

        .creator-stat-value { font-size: 1.4rem; font-weight: 800; color: var(--text); }
        .creator-stat-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }

        /* Tools */
        .creator-tools, .creator-recent {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1rem;
          letter-spacing: -0.01em;
        }

        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 0.75rem;
        }

        .tool-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.1rem 1.25rem;
          border-radius: var(--radius-sm);
          transition: all var(--transition);
          text-decoration: none;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
        }

        .tool-live { border-color: rgba(248,113,113,0.2); }
        .tool-video { border-color: rgba(52,211,153,0.2); }
        .tool-archive { border-color: rgba(129,140,248,0.2); }

        .tool-card:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.04);
        }

        .tool-live:hover { border-color: rgba(248,113,113,0.4); box-shadow: 0 0 16px rgba(248,113,113,0.15); }
        .tool-video:hover { border-color: rgba(52,211,153,0.4); box-shadow: 0 0 16px rgba(52,211,153,0.15); }
        .tool-archive:hover { border-color: rgba(129,140,248,0.4); box-shadow: 0 0 16px rgba(129,140,248,0.15); }

        .tool-card-icon {
          width: 42px;
          height: 42px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(248,113,113,0.08);
          color: #f87171;
        }

        .tool-video .tool-card-icon {
          background: rgba(52,211,153,0.08);
          color: #34d399;
        }

        .tool-archive .tool-card-icon {
          background: rgba(129,140,248,0.08);
          color: #818cf8;
        }

        .tool-card-icon :global(svg) { width: 20px; height: 20px; }

        .tool-card-body { flex: 1; }

        .tool-card-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
        }

        .tool-card-sub {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }

        .tool-card-arrow {
          color: var(--text-dim);
          opacity: 0;
          transition: all var(--transition);
          display: flex;
        }

        .tool-card:hover .tool-card-arrow { opacity: 1; }

        /* Recent lives */
        .recent-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .recent-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          transition: background var(--transition);
        }

        .recent-item:hover { background: rgba(255,255,255,0.04); }

        .recent-item-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .recent-item-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.2rem;
        }

        .recent-item-tag {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--accent-3);
          background: rgba(129,140,248,0.1);
          border: 1px solid rgba(129,140,248,0.2);
          border-radius: var(--radius-pill);
          padding: 0.1rem 0.5rem;
        }

        .recent-item-date {
          font-size: 0.75rem;
          color: var(--text-dim);
        }

        .recent-item-status { flex-shrink: 0; }

        .status-ended {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-dim);
        }

        /* Received gifts */
        .gift-row { align-items: center; gap: 0.75rem; }

        .gift-row-icon {
          font-size: 1.6rem;
          flex-shrink: 0;
          line-height: 1;
        }

        .gift-row-from {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .gift-row-earnings {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex-shrink: 0;
        }

        .gift-earnings-value {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fbbf24;
        }

        .gift-earnings-label {
          font-size: 0.68rem;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .no-gifts-msg {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-align: center;
          padding: 1rem 0;
        }

        /* Earnings Dashboard */
        .earnings-dashboard {
          background: linear-gradient(135deg, rgba(15,8,32,0.95) 0%, rgba(22,12,45,0.95) 100%);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .earnings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .earnings-badge {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.75rem;
        }

        .earnings-stats {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.75rem;
        }

        .earnings-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 1.1rem 0.75rem;
          text-align: center;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
          transition: transform var(--transition-slow), border-color var(--transition);
        }

        .earnings-stat:hover { transform: translateY(-2px); }

        .e-total { border-color: rgba(251,191,36,0.2); }
        .e-total:hover { border-color: rgba(251,191,36,0.4); box-shadow: 0 0 16px rgba(251,191,36,0.1); }

        .e-creator { border-color: rgba(52,211,153,0.2); }
        .e-creator:hover { border-color: rgba(52,211,153,0.4); box-shadow: 0 0 16px rgba(52,211,153,0.1); }

        .e-platform { border-color: rgba(129,140,248,0.2); }
        .e-platform:hover { border-color: rgba(129,140,248,0.4); box-shadow: 0 0 16px rgba(129,140,248,0.1); }

        .e-count { border-color: rgba(224,64,251,0.2); }
        .e-count:hover { border-color: rgba(224,64,251,0.4); box-shadow: 0 0 16px rgba(224,64,251,0.1); }

        .e-icon { font-size: 1.4rem; line-height: 1; }

        .e-stat-value {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1.2;
        }

        .e-creator .e-stat-value { color: #34d399; }

        .e-stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        /* Earnings split bar */
        .earnings-bar-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .earnings-bar {
          width: 100%;
          height: 8px;
          background: rgba(129,140,248,0.2);
          border-radius: 999px;
          overflow: hidden;
        }

        .earnings-bar-creator {
          height: 100%;
          background: linear-gradient(90deg, #34d399, #059669);
          border-radius: 999px;
          transition: width 0.6s ease;
        }

        .earnings-bar-legend {
          display: flex;
          gap: 1.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .ebl-creator { color: #34d399; }
        .ebl-platform { color: #818cf8; }

        /* Transaction breakdown */
        .tx-breakdown {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex-shrink: 0;
          gap: 0.25rem;
        }

        .tx-total {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fbbf24;
        }

        .tx-shares {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.1rem;
        }

        .tx-creator {
          font-size: 0.72rem;
          font-weight: 700;
          color: #34d399;
        }

        .tx-platform {
          font-size: 0.68rem;
          color: var(--text-dim);
        }

        /* Private call settings */
        .creator-settings-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .settings-desc {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .settings-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .settings-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .settings-toggle-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 1rem;
        }

        .toggle-btn {
          position: relative;
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          border: none;
          cursor: pointer;
          transition: background var(--transition);
          flex-shrink: 0;
          padding: 0;
        }

        .toggle-btn.toggle-on {
          background: var(--accent);
        }

        .toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          transition: transform var(--transition);
          display: block;
        }

        .toggle-btn.toggle-on .toggle-thumb {
          transform: translateX(20px);
        }

        .settings-input {
          width: 120px;
          padding: 0.55rem 0.75rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          color: var(--text);
          font-size: 0.9rem;
          outline: none;
        }

        .settings-input:focus {
          border-color: rgba(139,92,246,0.5);
        }

        .settings-alert {
          padding: 0.6rem 0.875rem;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          font-weight: 600;
        }

        .settings-error {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .settings-success {
          background: rgba(34,197,94,0.1);
          border: 1px solid #22c55e;
          color: #4ade80;
        }

        .settings-save-btn {
          align-self: flex-start;
        }

        /* Payout card */
        .payout-card {
          background: linear-gradient(135deg, rgba(15,8,32,0.95) 0%, rgba(22,12,45,0.95) 100%);
          border: 1px solid rgba(52,211,153,0.2);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .payout-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .payout-status-badge {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.75rem;
        }

        .payout-desc {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .payout-balance {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1rem;
          background: rgba(52,211,153,0.06);
          border: 1px solid rgba(52,211,153,0.15);
          border-radius: var(--radius-sm);
        }

        .payout-balance-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .payout-balance-value {
          font-size: 1.1rem;
          font-weight: 800;
          color: #34d399;
        }

        .payout-pending-notice {
          font-size: 0.85rem;
          color: #fbbf24;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          line-height: 1.5;
        }

        .payout-btn {
          align-self: flex-start;
        }

        .payout-hint {
          font-size: 0.78rem;
          color: var(--text-dim);
          margin: 0;
        }
      `}</style>
    </div>
  );
}
