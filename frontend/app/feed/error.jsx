"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function FeedError({ error, reset }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      titleKey="routeError.feedTitle"
      messageKey="routeError.feedMessage"
      homeHref="/dashboard"
      homeLabelKey="routeError.dashboard"
    />
  );
}
