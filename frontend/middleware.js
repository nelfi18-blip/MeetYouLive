import { NextResponse } from 'next/server'

export function middleware(request) {
  const token = request.cookies.get('next-auth.session-token') ||
                request.cookies.get('__Secure-next-auth.session-token')

  // Si el usuario intenta ir a una ruta protegida sin token
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

// ESTO EVITA EL REFRESCO INFINITO
export const config = {
  matcher: [
    /*
     * Excluir rutas que NO deben refrescarse:
     * - api/auth (crucial para que NextAuth trabaje)
     * - _next/static y _next/image (archivos del sistema)
     * - favicon y logos
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
}
