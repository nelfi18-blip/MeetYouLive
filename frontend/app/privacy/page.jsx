import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Privacy Policy - MeetYouLive",
  description:
    "MeetYouLive privacy policy describing how user data is collected, used and protected across profiles, matches, chat, calls, live streams, payments and moderation.",
  path: "/privacy",
});

export default function Page() {
  return <LegalPage policyKey="privacy" />;
}
