import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Community Guidelines - MeetYouLive",
  description:
    "MeetYouLive community guidelines for matches, chat, live streaming, video calls and creator interactions.",
  path: "/community-guidelines",
});

export default function Page() {
  return <LegalPage policyKey="communityGuidelines" />;
}
