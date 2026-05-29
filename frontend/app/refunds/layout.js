import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Política de Reembolsos · MeetYouLive",
  description: "Política de reembolsos y devoluciones de MeetYouLive.",
  alternates: {
    canonical: canonicalUrl("/refunds"),
  },
  openGraph: {
    url: canonicalUrl("/refunds"),
  },
};

export default function RefundsLayout({ children }) {
  return children;
}
