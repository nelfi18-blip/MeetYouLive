import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Refund Policy - MeetYouLive",
  description:
    "MeetYouLive refund policy for coins, premium purchases, virtual gifts, eligible refunds, non-refundable cases, request timing and support contact.",
  path: "/refund",
});

export default function Page() {
  return <LegalPage policyKey="paymentsRefunds" />;
}
