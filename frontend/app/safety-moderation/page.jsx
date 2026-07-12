import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Safety and Moderation - MeetYouLive",
  description:
    "MeetYouLive safety and moderation policy covering reports, reviews, account enforcement and community protection.",
  path: "/safety-moderation",
});

export default function Page() {
  return <LegalPage policyKey="safetyModeration" />;
}
