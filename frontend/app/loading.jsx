"use client";

export default function Loading() {
  return (
    <main className="app-loading" aria-busy="true" aria-live="polite">
      <div className="app-loading__content">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="app-loading__logo" />
        <div className="app-loading__spinner" aria-hidden="true" />
        <p>Cargando...</p>
      </div>

      <style jsx>{`
        .app-loading {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: calc(1.5rem + env(safe-area-inset-top)) 1.5rem
            calc(1.5rem + env(safe-area-inset-bottom));
          box-sizing: border-box;
          background: #060411;
          color: #fff;
          text-align: center;
        }

        .app-loading__content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
        }

        .app-loading__logo {
          width: clamp(72px, 22vw, 112px);
          height: clamp(72px, 22vw, 112px);
          object-fit: contain;
        }

        .app-loading__spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(255, 255, 255, 0.16);
          border-top-color: #e040fb;
          border-radius: 50%;
          animation: app-loading-spin 0.85s linear infinite;
        }

        .app-loading p {
          margin: 0;
          color: #c9c3df;
          font-weight: 700;
        }

        @keyframes app-loading-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}
