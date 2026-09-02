import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Refund Policy · MeetYouLive",
  description: "Política de pagos, coins, regalos, suscripciones, Stripe Connect, payouts y reembolsos de MeetYouLive.",
  alternates: { canonical: canonicalUrl("/refund-policy") },
  openGraph: { url: canonicalUrl("/refund-policy") },
};

export default function Layout({ children }) {
  return children;
}
