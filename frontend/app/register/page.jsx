import { Suspense } from "react";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Cargando…" style={{ minHeight: "100vh", background: "#060411" }} />}>
      <RegisterForm />
    </Suspense>
  );
}
