import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Política de Privacidad · MeetYouLive",
  description: "Cómo recopilamos, usamos y protegemos tus datos en MeetYouLive.",
  alternates: {
    canonical: canonicalUrl("/privacy"),
  },
  openGraph: {
    url: canonicalUrl("/privacy"),
  },
};

export default function PrivacyLayout({ children }) {
  return children;
}
