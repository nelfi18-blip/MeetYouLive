import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Política DMCA y Copyright · MeetYouLive",
  description: "Proceso de propiedad intelectual y derechos de autor de MeetYouLive.",
  alternates: { canonical: canonicalUrl("/dmca") },
  openGraph: { url: canonicalUrl("/dmca") },
};

export default function Layout({ children }) {
  return children;
}
