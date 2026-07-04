import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Términos de Servicio · MeetYouLive",
  description: "Condiciones de uso de MeetYouLive para matches, chat, llamadas, directos, coins, regalos, creadores y moderación.",
  alternates: { canonical: canonicalUrl("/terms") },
  openGraph: { url: canonicalUrl("/terms") },
};

export default function Layout({ children }) {
  return children;
}
