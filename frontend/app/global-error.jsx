"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LANG,
  LANGUAGE_STORAGE_KEY,
  detectLanguageFromNavigator,
  normalizeLanguage,
} from "@/lib/language";

const GLOBAL_ERROR_COPY = {
  es: {
    title: "Algo salió mal",
    message: "Recarga la página o inténtalo nuevamente en unos segundos.",
    retry: "Reintentar",
  },
  en: {
    title: "Something went wrong",
    message: "Refresh the page or try again in a few seconds.",
    retry: "Try again",
  },
  pt: {
    title: "Algo deu errado",
    message: "Recarregue a página ou tente novamente em alguns segundos.",
    retry: "Tentar novamente",
  },
};

function snapshotErrorLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANG;
  return (
    normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)) ||
    detectLanguageFromNavigator(navigator)
  );
}

export default function GlobalError({ error, reset }) {
  // Snapshot the language once; this isolated error boundary should stay stable
  // while the user decides whether to retry the failed render.
  const [lang] = useState(snapshotErrorLanguage);
  const copy = GLOBAL_ERROR_COPY[lang] || GLOBAL_ERROR_COPY[DEFAULT_LANG];

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.reportError === "function") {
      window.reportError(error);
    }
  }, [error]);

  return (
    <html lang={lang}>
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
            <h1>{copy.title}</h1>
            <p style={{ color: "#c8c1df", lineHeight: 1.5 }}>
              {copy.message}
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
              {copy.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
