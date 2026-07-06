"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function FeedError({ error, reset }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="No pudimos cargar el feed"
      message="Tus matches y preferencias no se han modificado. Reintenta para volver a cargar perfiles."
      homeHref="/dashboard"
      homeLabel="Ir al dashboard"
    />
  );
}
