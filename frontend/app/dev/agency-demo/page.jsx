import { notFound } from "next/navigation";
import { isAgencyDemoPreviewEnabled } from "@/lib/agencyDemoPreviewAccess";
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
  if (!isAgencyDemoPreviewEnabled()) {
    notFound();
  }
  return <AgencyDemoClient />;
}
