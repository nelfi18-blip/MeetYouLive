"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20M5 20l2-8 5 4 5-4 2 8" />
      <circle cx="12" cy="8" r="2" />
    </svg>
  );
}

const BENEFITS = [
  "Sin anuncios en toda la plataforma",
  "Acceso a directos exclusivos para suscriptores",
  "Badge especial de suscriptor en tu perfil",
  "Descuentos en paquetes de monedas",
  "Prioridad en el soporte",
  "Acceso anticipado a nuevas funciones",
];

export default function SubscriptionPage() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [periodEnd, setPeriodEnd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/subscriptions/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        if (!res.ok) throw new Error("Error al cargar la suscripción");
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setStatus(data.status);
        setPeriodEnd(data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null);
      })
      .catch(() => setError("No se pudo cargar el estado de la suscripción"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleSubscribe = async () => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/subscriptions/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al crear la sesión de pago");
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("¿Seguro que quieres cancelar tu suscripción?")) return;
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/subscriptions/cancel`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al cancelar");
      setStatus("canceled");
      setSuccess("Tu suscripción ha sido cancelada.");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const isActive = status === "active";
  const isPastDue = status === "past_due";

  if (loading) {
    return (
      <div className="sub-page">
        <div className="skeleton" style={{ height: 220, borderRadius: "var(--radius)" }} />
        <div className="skeleton" style={{ height: 340, borderRadius: "var(--radius)" }} />
        <style jsx>{`.sub-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 680px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  return (
    <div className="sub-page">
      {/* Hero */}
      <div className="sub-hero">
        <div className="sub-hero-glow" />
        <div className="sub-hero-content">
          <div className="sub-crown"><CrownIcon /></div>
          <div>
            <div className="sub-badge">✨ Suscripción Premium</div>
            <h1 className="sub-title">Desbloquea la experiencia completa</h1>
            <p className="sub-desc">Accede a funciones exclusivas y apoya a tus creadores favoritos</p>
          </div>
        </div>

        {/* Status pill */}
        <div className={`sub-status-pill ${isActive ? "active" : isPastDue ? "past-due" : "inactive"}`}>
          {isActive
            ? "✅ Activa"
            : isPastDue
            ? "⚠️ Pago pendiente"
            : status === "canceled"
            ? "❌ Cancelada"
            : "Sin suscripción"}
        </div>

        {isActive && periodEnd && (
          <p className="sub-period-end">
            Renovación el {periodEnd.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}
      </div>

      {/* Alerts */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Benefits card */}
      <div className="benefits-card card">
        <div className="benefits-header">
          <div className="benefits-icon"><StarIcon /></div>
          <h2 className="benefits-title">Beneficios incluidos</h2>
        </div>
        <ul className="benefits-list">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="benefit-item">
              <span className="benefit-check"><CheckIcon /></span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action card */}
      <div className="action-card card">
        {!isActive && !isPastDue ? (
          <>
            <div className="price-display">
              <span className="price-amount">9,99 €</span>
              <span className="price-period">/ mes</span>
            </div>
            <p className="action-desc">Cancela en cualquier momento. Sin compromisos.</p>
            <button
              className="btn btn-primary btn-lg sub-btn"
              onClick={handleSubscribe}
              disabled={actionLoading}
            >
              {actionLoading ? "Redirigiendo…" : "✨ Suscribirse ahora"}
            </button>
          </>
        ) : isPastDue ? (
          <>
            <p className="action-desc" style={{ color: "var(--error)" }}>
              Hay un problema con tu pago. Actualiza tu método de pago para continuar disfrutando de los beneficios.
            </p>
            <button
              className="btn btn-primary btn-lg sub-btn"
              onClick={handleSubscribe}
              disabled={actionLoading}
            >
              {actionLoading ? "Redirigiendo…" : "💳 Actualizar método de pago"}
            </button>
          </>
        ) : (
          <>
            <p className="action-desc">
              Tu suscripción está activa.{" "}
              {periodEnd && (
                <>Renovación el{" "}
                  <strong>{periodEnd.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</strong>.
                </>
              )}
            </p>
            <button
              className="btn btn-secondary sub-btn"
              onClick={handleCancel}
              disabled={actionLoading}
            >
              {actionLoading ? "Cancelando…" : "Cancelar suscripción"}
            </button>
          </>
        )}
      </div>

      <Link href="/dashboard" className="back-link">← Volver al inicio</Link>

      <style jsx>{`
        .sub-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 680px;
          margin: 0 auto;
        }

        .sub-hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(22,12,45,0.95) 0%, rgba(15,8,32,0.98) 100%);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius);
          padding: 2rem;
          box-shadow: var(--shadow);
        }

        .sub-hero-glow {
          position: absolute;
          top: -60px; right: -40px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(251,191,36,0.12), transparent 70%);
          pointer-events: none;
          border-radius: 50%;
          filter: blur(40px);
        }

        .sub-hero-content {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 1.25rem;
          flex-wrap: wrap;
          margin-bottom: 1.25rem;
        }

        .sub-crown {
          width: 64px;
          height: 64px;
          border-radius: var(--radius-sm);
          background: rgba(251,191,36,0.12);
          border: 1px solid rgba(251,191,36,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fbbf24;
          flex-shrink: 0;
        }

        .sub-crown :global(svg) { width: 32px; height: 32px; }

        .sub-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.75rem;
          margin-bottom: 0.5rem;
        }

        .sub-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .sub-desc {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }

        .sub-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.82rem;
          font-weight: 700;
          border-radius: var(--radius-pill);
          padding: 0.35rem 1rem;
        }

        .sub-status-pill.active {
          background: rgba(34,197,94,0.12);
          color: #4ade80;
          border: 1px solid rgba(34,197,94,0.3);
        }

        .sub-status-pill.past-due {
          background: rgba(251,191,36,0.1);
          color: #fbbf24;
          border: 1px solid rgba(251,191,36,0.3);
        }

        .sub-status-pill.inactive {
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          border: 1px solid var(--border);
        }

        .sub-period-end {
          margin-top: 0.5rem;
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        /* Alerts */
        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          font-weight: 600;
        }

        .alert-error {
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .alert-success {
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.3);
          color: #4ade80;
        }

        /* Benefits */
        .benefits-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }

        .benefits-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .benefits-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fbbf24;
        }

        .benefits-icon :global(svg) { width: 18px; height: 18px; }

        .benefits-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
        }

        .benefits-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .benefit-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.9rem;
          color: var(--text-muted);
        }

        .benefit-check {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(34,197,94,0.12);
          border: 1px solid rgba(34,197,94,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4ade80;
          flex-shrink: 0;
        }

        .benefit-check :global(svg) { width: 12px; height: 12px; }

        /* Action card */
        .action-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
        }

        .price-display {
          display: flex;
          align-items: baseline;
          gap: 0.3rem;
        }

        .price-amount {
          font-size: 2.5rem;
          font-weight: 900;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .price-period {
          font-size: 0.95rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .action-desc {
          color: var(--text-muted);
          font-size: 0.875rem;
          max-width: 380px;
        }

        .sub-btn { min-width: 220px; }

        .back-link {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
          align-self: flex-start;
        }

        .back-link:hover { color: var(--text); }
      `}</style>
    </div>
  );
}
