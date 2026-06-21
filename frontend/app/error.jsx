"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <main className="app-error-fallback" role="alert">
      <div className="app-error-card">
        <h1>Algo salió mal</h1>
        <p>No pudimos mostrar esta sección. Intenta recargarla.</p>
        <button type="button" onClick={reset}>Reintentar</button>
      </div>
      <style jsx>{`
        .app-error-fallback {
          min-height: 100svh;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          background: #0f0821;
          color: #fff;
        }
        .app-error-card {
          width: min(100%, 420px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.06);
          text-align: center;
        }
        h1 {
          margin: 0 0 0.75rem;
          font-size: 1.35rem;
        }
        p {
          margin: 0 0 1.25rem;
          color: #c9c3df;
        }
        button {
          border: 0;
          border-radius: 999px;
          padding: 0.8rem 1.25rem;
          background: #e040fb;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
      `}</style>
    </main>
  );
}
