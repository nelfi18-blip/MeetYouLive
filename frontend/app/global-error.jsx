"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.reportError === "function") {
      window.reportError(error);
    }
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "2rem 1rem",
            background: "#0f0821",
            color: "#fff",
            fontFamily: "Inter, system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <section style={{ maxWidth: "32rem" }}>
            <p style={{ color: "#ff4ecd", fontWeight: 800, letterSpacing: "0.08em" }}>
              MeetYouLive
            </p>
            <h1>Algo salió mal</h1>
            <p style={{ color: "#c8c1df", lineHeight: 1.5 }}>
              Recarga la página o inténtalo nuevamente en unos segundos.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                marginTop: "1rem",
                padding: "0 1rem",
                border: 0,
                borderRadius: "999px",
                background: "linear-gradient(135deg, #ff4ecd, #7c5cff)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
