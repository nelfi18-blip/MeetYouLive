import { notFound } from "next/navigation";
import AgencyDemoClient from "./AgencyDemoClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Demo de agencias — MeetYouLive Preview",
  robots: { index: false, follow: false },
};

/**
 * No passwordless real accounts exist here. This Preview-only view uses
 * synthetic browser-local props to show the agency UI in two role scenarios.
 * Never sets a session, reads backend data, or writes to Mongo/Coins.
 */
export default function AgencyDemoPage() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "fix/creator-only-agency-application-2026-11-10") {
    notFound();
  }
  return <AgencyDemoClient />;
}
