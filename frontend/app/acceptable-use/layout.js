import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Política de Uso Aceptable · MeetYouLive",
  description: "Reglas de uso aceptable para MeetYouLive.",
  alternates: { canonical: canonicalUrl("/acceptable-use") },
  openGraph: { url: canonicalUrl("/acceptable-use") },
};

export default function Layout({ children }) {
  return children;
}
