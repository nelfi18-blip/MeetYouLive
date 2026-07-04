import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Normas de la Comunidad · MeetYouLive",
  description: "Normas para una comunidad segura en MeetYouLive.",
  alternates: { canonical: canonicalUrl("/community-guidelines") },
  openGraph: { url: canonicalUrl("/community-guidelines") },
};

export default function Layout({ children }) {
  return children;
}
