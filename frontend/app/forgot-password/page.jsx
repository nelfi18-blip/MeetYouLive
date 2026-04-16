"use client";

import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main className="forgot-wrap">
      <section className="forgot-card">
        <h1>Recuperar contraseña</h1>
        <p>
          Estamos preparando el flujo de recuperación de contraseña para esta versión.
        </p>
        <p className="hint">
          Si necesitas acceso inmediato, inicia sesión con Google o contacta soporte.
        </p>
        <Link href="/login">Volver a iniciar sesión</Link>
      </section>

      <style jsx>{`
        .forgot-wrap {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 1.25rem;
          background:
            radial-gradient(ellipse at top, rgba(224,64,251,0.18), transparent 55%),
            radial-gradient(ellipse at bottom, rgba(96,165,250,0.12), transparent 50%),
            #06020f;
        }
        .forgot-card {
          width: 100%;
          max-width: 460px;
          padding: 1.5rem;
          border-radius: 20px;
          border: 1px solid rgba(224,64,251,0.24);
          background: rgba(10,5,22,0.9);
          box-shadow: 0 16px 56px rgba(0,0,0,0.55), 0 0 38px rgba(224,64,251,0.12);
          text-align: center;
        }
        h1 {
          margin: 0;
          font-size: 1.4rem;
          color: var(--text);
        }
        p {
          margin: 0.85rem 0 0;
          color: var(--text-muted);
          line-height: 1.5;
        }
        .hint {
          font-size: 0.92rem;
          color: rgba(196,181,253,0.95);
        }
        :global(a) {
          display: inline-block;
          margin-top: 1.15rem;
          color: #ff2d78;
          font-weight: 600;
          text-decoration: none;
        }
        :global(a:hover) {
          color: #e040fb;
        }
      `}</style>
    </main>
  );
}
