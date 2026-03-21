"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SuccessContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <div className="status-page">
      <div className="status-icon">✅</div>
      <h1>Pago completado</h1>
      <p>Tu compra ha sido procesada correctamente. Ya puedes usar tus monedas.</p>
      {token && (
        <p className="session-ref">
          Referencia: <code>{token.slice(0, 20)}…</code>
        </p>
      )}
      <div className="status-actions">
        <Link href="/coins" className="btn btn-primary btn-lg">
          💰 Ver mis monedas
        </Link>
        <Link href="/dashboard" className="btn btn-secondary btn-lg">
          🏠 Ir al dashboard
        </Link>
      </div>

      <style jsx>{`
        .status-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          gap: 1rem;
          padding: 2rem;
        }

        .status-icon {
          font-size: 5rem;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        h1 {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
        }

        p {
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 380px;
        }

        .session-ref {
          font-size: 0.8rem;
        }

        .session-ref code {
          font-family: monospace;
          background: var(--card);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }

        .status-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="status-loading">
            <div className="status-icon">⏳</div>
            <p>Cargando…</p>
          </div>
        }
      >
        <SuccessContent />
      </Suspense>

      <style jsx>{`
        .status-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 1rem;
          text-align: center;
          padding: 2rem;
        }

        .status-loading .status-icon {
          font-size: 3rem;
          line-height: 1;
        }

        .status-loading p {
          color: var(--text-muted);
          font-size: 1rem;
        }
      `}</style>
    </>
  );
}
