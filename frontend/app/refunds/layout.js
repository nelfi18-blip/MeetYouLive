import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Pagos y Reembolsos · MeetYouLive",
  description: "Política de pagos, coins, regalos, suscripciones, Stripe Connect, payouts y reembolsos de MeetYouLive.",
  alternates: { canonical: canonicalUrl("/refunds") },
  openGraph: { url: canonicalUrl("/refunds") },
};

export default function Layout({ children }) {
  return children;
}
