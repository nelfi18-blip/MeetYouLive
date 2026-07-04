import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Pagos y Reembolsos · MeetYouLive",
  description: "Pagos, coins, regalos, Stripe Connect y reembolsos en MeetYouLive.",
  alternates: { canonical: canonicalUrl("/payments-refunds") },
  openGraph: { url: canonicalUrl("/payments-refunds") },
};

export default function Layout({ children }) {
  return children;
}
