import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "About MeetYouLive - MeetYouLive",
  description:
    "Learn what MeetYouLive is, including matches, chat, video calls, live streams, creators, coins, virtual gifts and digital memberships.",
  path: "/about",
});

export default function Page() {
  return <LegalPage policyKey="about" />;
}
