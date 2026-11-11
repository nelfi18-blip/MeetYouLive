import FloatingNavPreview from "@/components/FloatingNavPreview";

export const metadata = {
  title: "Prueba de barra flotante | MeetYouLive",
  description: "Vista aislada para validar el comportamiento de navegación móvil.",
  robots: { index: false, follow: false },
};

export default function Page() {
  // This public route has no account data and makes no authenticated requests.
  return <FloatingNavPreview />;
}
