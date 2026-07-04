import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Seguridad y Moderación · MeetYouLive",
  description: "Reportes, moderación, suspensiones y apelaciones en MeetYouLive.",
  alternates: { canonical: canonicalUrl("/safety-moderation") },
  openGraph: { url: canonicalUrl("/safety-moderation") },
};

export default function Layout({ children }) {
  return children;
}
