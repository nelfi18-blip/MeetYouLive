import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Content Policy - MeetYouLive",
  description:
    "MeetYouLive content policy for profiles, photos, videos, chat, video calls, live streams, creators and user-generated content.",
  path: "/content-policy",
});

export default function Page() {
  return <LegalPage policyKey="contentPolicy" />;
}
