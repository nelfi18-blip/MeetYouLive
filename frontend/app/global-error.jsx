"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main
          style={{
            minHeight: "100svh",
            display: "grid",
            placeItems: "center",
            padding: "1.5rem",
            background: "#0f0821",
            color: "#fff",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
          role="alert"
        >
          <div
            style={{
              width: "min(100%, 420px)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 24,
              padding: "1.5rem",
              background: "rgba(255,255,255,.06)",
              textAlign: "center",
            }}
          >
            <h1 style={{ margin: "0 0 .75rem", fontSize: "1.35rem" }}>Algo salió mal</h1>
            <p style={{ margin: "0 0 1.25rem", color: "#c9c3df" }}>
              La aplicación encontró un dato inesperado. Intenta recargar.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 999,
                padding: ".8rem 1.25rem",
                background: "#e040fb",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
