import PricingPageContent from "@/components/PricingPageContent";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Pricing - MeetYouLive",
  description:
    "MeetYouLive pricing: Coins packages, VIP membership status and how gifts, exclusive content and private calls are priced.",
  path: "/pricing",
});

export default function PricingPage() {
  return <PricingPageContent />;
}
