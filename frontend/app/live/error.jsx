"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function LiveError({ error, reset }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="No pudimos cargar Live"
      message="La sesión en vivo no se modificó. Reintenta para reconectar."
      homeHref="/feed"
      homeLabel="Volver al feed"
    />
  );
}
