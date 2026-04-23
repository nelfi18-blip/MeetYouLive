"use client";

import NeonBadge from "@/components/ui/NeonBadge";

const STATUS_MAP = {
  approved: { label: "Aprobado", tone: "green" },
  pending: { label: "En revisión", tone: "purple" },
  rejected: { label: "Rechazado", tone: "pink" },
  suspended: { label: "Suspendido", tone: "pink" },
  none: { label: "No creador", tone: "cyan" },
};

export default function StatusBadge({ status }) {
  const normalized = status || "none";
  const item = STATUS_MAP[normalized] || STATUS_MAP.none;

  return <NeonBadge tone={item.tone}>Estado · {item.label}</NeonBadge>;
}
