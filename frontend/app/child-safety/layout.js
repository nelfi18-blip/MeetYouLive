import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Estándares de Seguridad Infantil · MeetYouLive",
  description:
    "Tolerancia cero de MeetYouLive al CSAE/CSAM, reportes y punto de contacto de Child Safety.",
  alternates: { canonical: canonicalUrl("/child-safety") },
  openGraph: { url: canonicalUrl("/child-safety") },
};

export default function Layout({ children }) {
  return children;
}
