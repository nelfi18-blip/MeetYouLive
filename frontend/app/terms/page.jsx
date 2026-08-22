import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "MeetYouLive Terms of Service",
  description:
    "MeetYouLive terms of service for matches, chat, calls, video calls, live streams, gifts, coins, creators, purchases and moderation.",
  path: "/terms",
});

export default function Page() {
  return <LegalPage policyKey="terms" />;
}
