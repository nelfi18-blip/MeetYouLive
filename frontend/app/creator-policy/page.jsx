import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Creator Policy - MeetYouLive",
  description:
    "MeetYouLive creator policy for content, monetization, live streaming, gifts, moderation and payouts.",
  path: "/creator-policy",
});

export default function Page() {
  return <LegalPage policyKey="creatorPolicy" />;
}
