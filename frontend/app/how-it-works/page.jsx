import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "How MeetYouLive Works - MeetYouLive",
  description:
    "How MeetYouLive accounts, profiles, matches, chat, video calls, live streams, coins, gifts and memberships work.",
  path: "/how-it-works",
});

export default function Page() {
  return <LegalPage policyKey="howItWorks" />;
}
