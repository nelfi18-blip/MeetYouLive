"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function LiveError({ error, reset }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      titleKey="routeError.liveTitle"
      messageKey="routeError.liveMessage"
      homeHref="/feed"
      homeLabelKey="routeError.feed"
    />
  );
}
