import { Suspense } from "react";
import CreatorRequestForm from "./CreatorRequestForm";

export default function CreatorRequestPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Cargando…" style={{ minHeight: "100vh", background: "#060411" }} />}>
      <CreatorRequestForm />
    </Suspense>
  );
}
