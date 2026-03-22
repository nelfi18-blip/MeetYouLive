"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_MESSAGES = {
  Configuration: "Hay un problema con la configuración del servidor.",
  AccessDenied: "No tienes permiso para iniciar sesión.",
  Verification: "El enlace de verificación ha expirado o ya fue usado.",
  Default: "Ocurrió un error al iniciar sesión. Por favor, inténtalo de nuevo.",
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = ERROR_MESSAGES[error] || ERROR_MESSAGES.Default;

  return (
    <div className="card" style={{ maxWidth: 420, margin: "80px auto", padding: "2rem", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1rem" }}>Error de autenticación</h1>
      <p style={{ marginBottom: "1.5rem", color: "var(--text)" }}>{message}</p>
      <Link href="/login" className="btn btn-primary">
        Volver al inicio de sesión
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<p>Cargando...</p>}>
      <AuthErrorContent />
    </Suspense>
  );
}
