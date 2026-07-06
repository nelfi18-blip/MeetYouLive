"use client";

import RouteErrorFallback from "@/components/RouteErrorFallback";

export default function AppError({ error, reset }) {
  return <RouteErrorFallback error={error} reset={reset} />;
}
