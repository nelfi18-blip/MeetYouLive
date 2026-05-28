import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Términos de Servicio · MeetYouLive",
  description: "Términos y condiciones de uso de la plataforma MeetYouLive.",
  alternates: {
    canonical: canonicalUrl("/terms"),
  },
  openGraph: {
    url: canonicalUrl("/terms"),
  },
};

export default function TermsLayout({ children }) {
  return children;
}
