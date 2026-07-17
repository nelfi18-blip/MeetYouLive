import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Security - MeetYouLive",
  description:
    "MeetYouLive security information for reporting, blocking, moderation, content review, fraud protection, minors and account verification.",
  path: "/security",
});

export default function Page() {
  return <LegalPage policyKey="security" />;
}
