import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Appeal a Moderation Decision - MeetYouLive",
  description:
    "How to appeal a MeetYouLive moderation decision, including content removal, account restriction, suspension and account termination.",
  path: "/appeal",
});

export default function Page() {
  return <LegalPage policyKey="appeal" />;
}
