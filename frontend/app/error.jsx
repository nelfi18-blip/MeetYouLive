"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("Client render error:", error);
  }, [error]);

  return (
    <main className="app-error-page" role="alert">
      <section className="app-error-card">
        <h1>No pudimos cargar esta pantalla</h1>
        <p>Ocurrió un error inesperado. Intenta recargar sin perder tu sesión.</p>
        <button type="button" onClick={() => reset()}>
          Intentar de nuevo
        </button>
        <a href="/feed">Volver al feed</a>
      </section>

      <style jsx>{`
        .app-error-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
        }

        .app-error-card {
          width: min(100%, 420px);
          padding: 1.5rem;
          border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
          border-radius: 24px;
          background: var(--card, rgba(24, 16, 48, 0.9));
          text-align: center;
          box-shadow: var(--shadow, 0 18px 50px rgba(0, 0, 0, 0.35));
        }

        .app-error-card h1 {
          margin: 0 0 0.75rem;
          font-size: 1.35rem;
        }

        .app-error-card p {
          margin: 0 0 1.25rem;
          color: var(--text-muted, #a39ec0);
          line-height: 1.5;
        }

        .app-error-card button,
        .app-error-card a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          margin: 0.25rem;
          padding: 0 1rem;
          border-radius: 999px;
          color: #fff;
          font-weight: 800;
          text-decoration: none;
        }

        .app-error-card button {
          border: none;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          cursor: pointer;
        }

        .app-error-card a {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </main>
  );
}
