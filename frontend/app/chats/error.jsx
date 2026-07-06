"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function ChatsError({ error, reset }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      titleKey="routeError.chatsTitle"
      messageKey="routeError.chatsMessage"
      homeHref="/feed"
      homeLabelKey="routeError.feed"
    />
  );
}
