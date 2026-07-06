"use client";

import { useEffect } from "react";

const GLOBAL_ERROR_COPY = {
  brand: "MeetYouLive",
  title: "Algo salió mal",
  message: "Recarga la página o inténtalo nuevamente en unos segundos.",
  retry: "Reintentar",
};

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
              {GLOBAL_ERROR_COPY.brand}
            </p>
            <h1>{GLOBAL_ERROR_COPY.title}</h1>
            <p style={{ color: "#c8c1df", lineHeight: 1.5 }}>
              {GLOBAL_ERROR_COPY.message}
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
              {GLOBAL_ERROR_COPY.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
