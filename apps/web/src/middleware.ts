import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protección liviana de /panel/*: sin cookie de sesión se redirige a /panel/login.
 * La validación real (sesión vigente, rol) la hace `requireSession()` en el layout del panel
 * y la API en cada endpoint; esto solo evita renderizar el panel para anónimos.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/panel/login') return NextResponse.next();
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'ifts2_session';
  if (!req.cookies.has(cookieName)) {
    const url = req.nextUrl.clone();
    url.pathname = '/panel/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/panel/:path*'] };
