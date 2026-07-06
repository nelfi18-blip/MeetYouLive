"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function ChatsError({ error, reset }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="No pudimos cargar tus chats"
      message="La conversación no se perdió. Reintenta para reconectar con tus mensajes."
      homeHref="/feed"
      homeLabel="Volver al feed"
    />
  );
}
