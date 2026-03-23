"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AUTH_ERROR_MESSAGES } from "@/lib/authErrors";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = AUTH_ERROR_MESSAGES[error] || AUTH_ERROR_MESSAGES.Default;

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
