"use client";

import NeonBadge from "@/components/ui/NeonBadge";
import { useLanguage } from "@/contexts/LanguageContext";

const STATUS_MAP = {
  approved: { key: "approved", tone: "green" },
  pending: { key: "pending", tone: "purple" },
  rejected: { key: "rejected", tone: "pink" },
  suspended: { key: "suspended", tone: "pink" },
  none: { key: "none", tone: "cyan" },
};

export default function StatusBadge({ status }) {
  const { t } = useLanguage();
  const normalized = status || "none";
  const item = STATUS_MAP[normalized] || STATUS_MAP.none;

  return <NeonBadge tone={item.tone}>{t("creatorStatus.status")} · {t(`creatorStatus.${item.key}`)}</NeonBadge>;
}
