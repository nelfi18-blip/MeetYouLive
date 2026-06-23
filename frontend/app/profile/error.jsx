"use client";

import { useEffect } from "react";

export default function ProfileError({ error, reset }) {
  useEffect(() => {
    console.error("[profile-flow]", {
      event: "profile-route-error-boundary",
      message: error?.message || "unknown",
      stack: error?.stack || "",
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  return (
    <div className="profile-page">
      <div className="banner-error">
        No se pudo renderizar el perfil. Revisa la consola para el evento [profile-flow].
      </div>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
