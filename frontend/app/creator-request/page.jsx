"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function CreatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}

export default function CreatorRequestPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data) return;
        if (data.role === "creator" || data.creatorStatus === "approved") {
          router.replace("/creator");
          return;
        }
        if (data.role === "admin") {
          router.replace("/admin");
          return;
        }
        setUser(data);
      })
      .catch(() => setError("No se pudo cargar tu perfil"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/user/me/creator-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al enviar solicitud");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
        <style jsx>{`.page { max-width: 560px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  const isPending = user?.creatorStatus === "pending";
  const isApproved = user?.creatorStatus === "approved";

  return (
    <div className="page">
      <div className="card">
        <div className="card-icon">
          <CreatorIcon />
        </div>

        <h1 className="title">Conviértete en Creador</h1>
        <p className="sub">
          Como creador tendrás acceso a transmisiones en vivo, regalos, sesiones
          privadas de pago, contenido exclusivo y un panel de ganancias.
        </p>

        {isPending || success ? (
          <div className="status-box status-pending">
            <span className="status-icon">⏳</span>
            <div>
              <div className="status-title">Solicitud enviada</div>
              <div className="status-desc">
                Un administrador revisará tu solicitud pronto. Te notificaremos cuando haya una respuesta.
              </div>
            </div>
          </div>
        ) : isApproved ? (
          <div className="status-box status-approved">
            <span className="status-icon">✅</span>
            <div>
              <div className="status-title">¡Ya eres creador!</div>
              <div className="status-desc">Tu solicitud fue aprobada. Accede a tus herramientas de creador desde el panel.</div>
            </div>
          </div>
        ) : (
          <>
            <ul className="benefits">
              <li>🎙 Transmisiones en vivo</li>
              <li>🎁 Recibir regalos de tus fans</li>
              <li>📞 Sesiones privadas de pago</li>
              <li>⭐ Contenido exclusivo para suscriptores</li>
              <li>💰 Panel de ganancias</li>
            </ul>

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Enviando…" : "Solicitar ser creador"}
            </button>
          </>
        )}
      </div>

      <style jsx>{`
        .page {
          max-width: 560px;
          margin: 0 auto;
        }

        .card {
          background: rgba(15,8,32,0.8);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: var(--radius);
          padding: 2.5rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          text-align: center;
        }

        .card-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-2);
        }

        .card-icon :global(svg) { width: 32px; height: 32px; }

        .title {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .sub {
          color: var(--text-muted);
          font-size: 0.9rem;
          line-height: 1.6;
          max-width: 420px;
        }

        .benefits {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          width: 100%;
          text-align: left;
        }

        .benefits li {
          font-size: 0.9rem;
          color: var(--text);
          font-weight: 500;
          padding: 0.6rem 1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
        }

        .error-box {
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.3);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          color: var(--error);
          font-size: 0.875rem;
          width: 100%;
          text-align: left;
        }

        .btn-submit {
          width: 100%;
          padding: 0.875rem 1.5rem;
          background: var(--grad-primary);
          border: none;
          border-radius: var(--radius-pill);
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: opacity var(--transition), box-shadow var(--transition);
          box-shadow: 0 4px 20px rgba(224,64,251,0.35);
        }

        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
          box-shadow: 0 6px 28px rgba(224,64,251,0.5);
        }

        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status-box {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-sm);
          text-align: left;
          width: 100%;
        }

        .status-pending {
          background: rgba(251,146,60,0.08);
          border: 1px solid rgba(251,146,60,0.25);
        }

        .status-approved {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.25);
        }

        .status-icon { font-size: 1.4rem; flex-shrink: 0; }

        .status-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
        }

        .status-desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        @media (max-width: 480px) {
          .card { padding: 1.75rem 1.25rem; }
          .title { font-size: 1.35rem; }
        }
      `}</style>
    </div>
  );
}
