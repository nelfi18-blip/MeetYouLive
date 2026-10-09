import { redirect } from "next/navigation";

// /dashboard/creator was the previous creator earnings/payout dashboard.
// It has been superseded by /creator (the Creator Command Center), which
// includes the same payout/withdrawal functionality plus the modernized
// command center UI. This route now only exists to safely redirect any
// existing links, bookmarks, or notifications to the official panel.
// Authentication/authorization is still enforced by the /creator page
// itself and by middleware.js (both paths are protected routes).
export default function LegacyCreatorDashboardRedirect() {
  redirect("/creator");
}
