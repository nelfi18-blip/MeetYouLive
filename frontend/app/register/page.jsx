import { Suspense } from "react";
import RegisterForm from "./RegisterForm";

export const metadata = {
  title: "Crear cuenta gratis - MeetYouLive",
  description: "Regístrate gratis en MeetYouLive. Conoce personas, mira directos en vivo y conecta en tiempo real. Únete a miles de usuarios.",
  openGraph: {
    title: "Crear cuenta gratis en MeetYouLive",
    description: "Regístrate gratis y empieza a conocer personas en vivo.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Cargando…" style={{ minHeight: "100vh", background: "#060411" }} />}>
      <RegisterForm />
    </Suspense>
  );
}
