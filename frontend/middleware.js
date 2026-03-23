import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Detectar varias posibles cookies de sesión de NextAuth/Auth.js
  // También verificar la cookie auth-session que establecen usuarios con email/contraseña
  const token =
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value ||
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value ||
    request.cookies.get("auth-session")?.value;

  const isAuthPage = pathname === "/login" || pathname === "/register";

  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/admin");

  // Si ya está logueado, no permitir volver a login/register
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Si no está logueado y quiere entrar a ruta protegida
  if (!token && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Excluir:
     * - auth API
     * - archivos internos de Next.js
     * - archivos estáticos comunes
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|favicon.svg|logo.png|.*\\.(?:png|jpg|jpeg|svg|webp|gif|css|js)$).*)",
  ],
};
