import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Payments & Refund Policy - MeetYouLive",
  description:
    "MeetYouLive payments and refunds policy for coins, subscriptions, premium purchases, virtual gifts, Stripe processing, payouts and refund requests.",
  path: "/payments-refunds",
});

export default function Page() {
  return <LegalPage policyKey="paymentsRefunds" />;
}
