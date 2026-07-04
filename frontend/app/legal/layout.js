import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Centro Legal · MeetYouLive",
  description: "Políticas legales, privacidad, seguridad y cumplimiento de MeetYouLive.",
  alternates: { canonical: canonicalUrl("/legal") },
  openGraph: { url: canonicalUrl("/legal") },
};

export default function Layout({ children }) {
  return children;
}
