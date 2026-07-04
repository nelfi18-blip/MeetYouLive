import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Política de Privacidad · MeetYouLive",
  description: "Cómo MeetYouLive recopila, usa, protege y comparte datos personales en sus funciones sociales, pagos y moderación.",
  alternates: { canonical: canonicalUrl("/privacy") },
  openGraph: { url: canonicalUrl("/privacy") },
};

export default function Layout({ children }) {
  return children;
}
