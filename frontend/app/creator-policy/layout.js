import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Política de Creadores · MeetYouLive",
  description: "Condiciones para creadores, regalos, coins y monetización.",
  alternates: { canonical: canonicalUrl("/creator-policy") },
  openGraph: { url: canonicalUrl("/creator-policy") },
};

export default function Layout({ children }) {
  return children;
}
