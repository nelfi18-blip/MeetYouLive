"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  return res.json();
}

export default function ReferralPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchReferral = useCallback(async () => {
    setLoading(true);
    const json = await apiFetch("/api/referral/me");
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token && status !== "authenticated") {
      router.replace("/login");
      return;
    }
    fetchReferral();
  }, [status, router, fetchReferral]);

  const referralLink =
    typeof window !== "undefined" && data?.referralCode
      ? `${window.location.origin}/register?ref=${data.referralCode}`
      : "";

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `¡Únete a MeetYouLive conmigo! Crea tu cuenta con mi enlace y gana monedas: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleSMS = () => {
    const text = encodeURIComponent(
      `¡Únete a MeetYouLive! ${referralLink}`
    );
    window.open(`sms:?body=${text}`, "_blank");
  };

  const handleClaim = async () => {
    setClaiming(true);
    setMessage(null);
    const json = await apiFetch("/api/referral/claim", { method: "POST" });
    if (json.message) {
      setMessage({ type: json.coinsAwarded ? "success" : "error", text: json.message });
    }
    if (json.coinsAwarded) {
      await fetchReferral();
    }
    setClaiming(false);
  };

  if (loading) {
    return (
      <div className="page-bg">
        <div className="loader-wrap">
          <div className="spinner" />
        </div>
        <style jsx>{pageStyles}</style>
      </div>
    );
  }

  return (
    <div className="page-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <div className="container">
        <div className="hero">
          <div className="hero-icon">🎁</div>
          <h1 className="hero-title">Invita y gana monedas</h1>
          <p className="hero-sub">
            Comparte tu enlace. Cuando un amigo se registre y complete su perfil,
            ambos reciben monedas.
          </p>
        </div>

        {/* Rewards info */}
        <div className="reward-row">
          <div className="reward-card">
            <span className="reward-icon">🪙</span>
            <span className="reward-amount">+50</span>
            <span className="reward-label">Tú por cada invitado</span>
          </div>
          <div className="reward-divider">+</div>
          <div className="reward-card">
            <span className="reward-icon">🎉</span>
            <span className="reward-amount">+20</span>
            <span className="reward-label">Tu amigo al registrarse</span>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-box">
            <span className="stat-value">{data?.referralCount ?? 0}</span>
            <span className="stat-label">Invitados</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{data?.referralRewardsEarned ?? 0}</span>
            <span className="stat-label">Monedas ganadas</span>
          </div>
        </div>

        {/* Referral link */}
        {data?.referralCode ? (
          <div className="link-card">
            <p className="link-label">Tu enlace de referido</p>
            <div className="link-box">
              <span className="link-text">{referralLink}</span>
              <button className="btn-copy" onClick={handleCopy}>
                {copied ? "✓ Copiado" : "Copiar"}
              </button>
            </div>

            <div className="share-row">
              <button className="btn-share btn-whatsapp" onClick={handleWhatsApp}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
              <button className="btn-share btn-sms" onClick={handleSMS}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                SMS
              </button>
            </div>
          </div>
        ) : (
          <div className="link-card">
            <p className="link-label" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Tu código de referido se generará automáticamente.
            </p>
          </div>
        )}

        {/* Claim reward if invited */}
        {data?.referredBy !== undefined && !data?.referralRewardClaimed && (
          <div className="claim-card">
            <p className="claim-title">¿Fuiste invitado?</p>
            <p className="claim-desc">
              {data?.canClaim
                ? "¡Cumpliste las condiciones! Reclama tus 20 monedas de bienvenida."
                : "Completa tu perfil o inicia sesión 2 veces para desbloquear tu recompensa de bienvenida."}
            </p>
            {message && (
              <div className={`banner-${message.type}`}>{message.text}</div>
            )}
            <button
              className="btn-claim"
              onClick={handleClaim}
              disabled={!data?.canClaim || claiming}
            >
              {claiming ? <><span className="spinner-sm" /> Reclamando…</> : "Reclamar +20 monedas"}
            </button>
          </div>
        )}

        {data?.referralRewardClaimed && (
          <div className="claimed-badge">✓ Ya reclamaste tu recompensa de bienvenida</div>
        )}
      </div>

      <style jsx>{pageStyles}</style>
    </div>
  );
}

const pageStyles = `
  .page-bg {
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 15% 10%, rgba(139,92,246,0.18) 0%, transparent 50%),
      radial-gradient(ellipse at 85% 85%, rgba(224,64,251,0.12) 0%, transparent 50%),
      #060411;
    padding: 2rem 1rem 4rem;
    position: relative;
    overflow: hidden;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
  }
  .orb-1 {
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%);
    top: -150px; left: -100px;
  }
  .orb-2 {
    width: 350px; height: 350px;
    background: radial-gradient(circle, rgba(224,64,251,0.14), transparent 70%);
    bottom: -120px; right: -80px;
  }

  .loader-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }

  .spinner {
    width: 40px; height: 40px;
    border: 3px solid rgba(139,92,246,0.2);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-sm {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .container {
    position: relative;
    z-index: 1;
    max-width: 560px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .hero {
    text-align: center;
    padding: 1.5rem 0 0.5rem;
  }
  .hero-icon { font-size: 3rem; margin-bottom: 0.5rem; }
  .hero-title {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text, #f1f5f9);
    margin: 0 0 0.5rem;
  }
  .hero-sub {
    color: var(--text-muted, #94a3b8);
    font-size: 0.95rem;
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .reward-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .reward-card {
    background: rgba(139,92,246,0.1);
    border: 1px solid rgba(139,92,246,0.25);
    border-radius: 16px;
    padding: 1.25rem 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
    min-width: 140px;
  }
  .reward-icon { font-size: 1.75rem; }
  .reward-amount {
    font-size: 1.75rem;
    font-weight: 800;
    color: #c4b5fd;
    letter-spacing: -0.02em;
  }
  .reward-label { font-size: 0.78rem; color: var(--text-muted, #94a3b8); text-align: center; }
  .reward-divider {
    font-size: 1.5rem;
    color: var(--text-muted, #94a3b8);
    font-weight: 700;
  }

  .stats-row {
    display: flex;
    gap: 1rem;
  }
  .stat-box {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }
  .stat-value {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text, #f1f5f9);
  }
  .stat-label { font-size: 0.78rem; color: var(--text-muted, #94a3b8); }

  .link-card {
    background: rgba(12,7,26,0.8);
    border: 1px solid rgba(139,92,246,0.22);
    border-radius: 18px;
    padding: 1.5rem;
  }
  .link-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.75rem;
  }
  .link-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 0.6rem 0.75rem;
    margin-bottom: 1rem;
  }
  .link-text {
    flex: 1;
    font-size: 0.82rem;
    color: #c4b5fd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
  }
  .btn-copy {
    flex-shrink: 0;
    background: linear-gradient(135deg, #8b5cf6, #e040fb);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.4rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }
  .btn-copy:hover { opacity: 0.88; }

  .share-row {
    display: flex;
    gap: 0.75rem;
  }
  .btn-share {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.7rem;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    border: none;
    font-family: inherit;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn-share:hover { opacity: 0.88; transform: translateY(-1px); }
  .btn-whatsapp { background: #25D366; color: #fff; }
  .btn-sms { background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }

  .claim-card {
    background: rgba(139,92,246,0.08);
    border: 1px solid rgba(139,92,246,0.25);
    border-radius: 18px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .claim-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text, #f1f5f9);
    margin: 0;
  }
  .claim-desc {
    font-size: 0.875rem;
    color: var(--text-muted, #94a3b8);
    margin: 0;
    line-height: 1.5;
  }
  .btn-claim {
    background: linear-gradient(135deg, #8b5cf6, #e040fb);
    color: #fff;
    border: none;
    border-radius: 12px;
    padding: 0.85rem;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .btn-claim:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-claim:not(:disabled):hover { opacity: 0.88; }

  .banner-success {
    background: rgba(52,211,153,0.1);
    border: 1px solid rgba(52,211,153,0.35);
    color: #34d399;
    border-radius: 8px;
    padding: 0.65rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .banner-error {
    background: rgba(248,113,113,0.1);
    border: 1px solid rgba(248,113,113,0.35);
    color: #f87171;
    border-radius: 8px;
    padding: 0.65rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .claimed-badge {
    text-align: center;
    color: #34d399;
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.75rem;
    background: rgba(52,211,153,0.08);
    border: 1px solid rgba(52,211,153,0.2);
    border-radius: 12px;
  }

  @media (max-width: 480px) {
    .hero-title { font-size: 1.6rem; }
    .reward-card { padding: 1rem 1.25rem; }
    .reward-amount { font-size: 1.5rem; }
  }
`;
