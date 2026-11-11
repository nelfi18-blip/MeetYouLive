import FloatingNavPreview from "@/components/FloatingNavPreview";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Prueba de barra flotante | MeetYouLive",
  description: "Vista aislada para validar el comportamiento de navegación móvil.",
  robots: { index: false, follow: false },
};

export default function Page() {
  // The demo is accessible in Vercel Preview or local dev only; never ship
  // this demo page to visitors on the official production website.
  if (process.env.VERCEL_ENV === "production") notFound();
  return <FloatingNavPreview />;
}
