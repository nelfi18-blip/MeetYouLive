import LegalIndexContent from "@/components/LegalIndexContent";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Legal Center - MeetYouLive",
  description:
    "MeetYouLive public legal center with privacy policy, terms of service, refund policy, safety, moderation and creator policies.",
  path: "/legal",
});

export default function LegalIndexPage() {
  return <LegalIndexContent />;
}
