"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * MultiGuestIdentityDebugPanel — TEMPORARY diagnostic UI (see
 * frontend/lib/multiGuestIdentityDiagnostic.js for what it shows and why).
 *
 * Rendered by the Live room page ONLY when the parent decides the
 * `?debugMultiGuestIdentity=1` query param is present — this component
 * itself has no visibility logic beyond its own open/closed toggle, so the
 * caller stays the single gate for "cero UI adicional" when the param is
 * absent.
 *
 * Purely local: the diagnostic prop is never sent to any backend, never
 * persisted (no localStorage), never logged remotely. The only "export" is
 * copying the JSON to the clipboard on an explicit user tap, so it can be
 * read from a phone that was used to reproduce the bug, without needing
 * DevTools.
 */
export default function MultiGuestIdentityDebugPanel({ diagnostic }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState("idle"); // idle | copied | error

  const json = JSON.stringify(diagnostic, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    } finally {
      setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  return (
    <div style={{ position: "fixed", bottom: 12, right: 12, zIndex: 99999 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: "#111",
          color: "#fff",
          border: "1px solid #555",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          opacity: 0.85,
        }}
      >
        🛠️ {t("multiGuestIdentityDebug.buttonLabel")}
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            width: "min(90vw, 420px)",
            maxHeight: "70vh",
            overflow: "auto",
            background: "#0b0b0b",
            color: "#d8f9d8",
            border: "1px solid #444",
            borderRadius: 10,
            padding: 12,
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 13 }}>
              {t("multiGuestIdentityDebug.panelTitle")}
            </strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#fff", fontSize: 14, cursor: "pointer" }}
              aria-label={t("multiGuestIdentityDebug.closeLabel")}
            >
              ✕
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            style={{
              background: "#1f6feb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              fontFamily: "sans-serif",
              marginBottom: 8,
              cursor: "pointer",
            }}
          >
            {copyState === "copied"
              ? t("multiGuestIdentityDebug.copied")
              : copyState === "error"
              ? t("multiGuestIdentityDebug.copyError")
              : t("multiGuestIdentityDebug.copyButton")}
          </button>

          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{json}</pre>
        </div>
      )}
    </div>
  );
}
