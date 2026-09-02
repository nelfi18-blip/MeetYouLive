import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Solicitudes de Autoridades (Law Enforcement) · MeetYouLive",
  description:
    "Protocolos de MeetYouLive para solicitudes de autoridades y organismos gubernamentales sobre información de usuarios.",
  alternates: { canonical: canonicalUrl("/law-enforcement") },
  openGraph: { url: canonicalUrl("/law-enforcement") },
};

export default function Layout({ children }) {
  return children;
}
