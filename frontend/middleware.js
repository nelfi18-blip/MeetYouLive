import { NextResponse } from 'next/server';

export function middleware(request) {
  // Detecta el token de sesión (normal y seguro para producción)
  const token = request.cookies.get('next-auth.session-token') || 
                request.cookies.get('__Secure-next-auth.session-token');

  const { pathname } = request.nextUrl;

  // 1. Si ya está logueado, no dejarlo ir a login/register
  if (token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 2. Proteger rutas sensibles (si no hay token, al login)
  const isProtectedRoute = pathname.startsWith('/dashboard') || 
                           pathname.startsWith('/profile') || 
                           pathname.startsWith('/admin');

  if (!token && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// 3. MATCHER: IMPORTANTE PARA EVITAR REFRESCADO INFINITO
export const config = {
  matcher: [
    /*
     * Excluye rutas internas de Next.js y archivos estáticos
     * Esto permite que la API de auth funcione sin interferencias
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|logo.png|favicon.svg).*)',
  ],
};
