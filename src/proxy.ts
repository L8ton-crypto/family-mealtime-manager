import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Paths that don't require a session: the login page itself, the login API
// (so you can actually log in), and static/manifest assets.
const PUBLIC_EXACT_PATHS = new Set(['/login', '/api/auth/login', '/favicon.ico', '/manifest.webmanifest']);
const PUBLIC_PREFIXES = ['/_next/', '/icons/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response: NextResponse;

  if (isPublicPath(pathname)) {
    response = NextResponse.next();
  } else {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const authenticated = await verifySessionToken(token);

    if (authenticated) {
      response = NextResponse.next();
    } else if (pathname.startsWith('/api/')) {
      response = NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    } else {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
      response = NextResponse.redirect(loginUrl);
    }
  }

  // Private household app: never let it show up in search results.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Every API response is private, per-request data (session-gated, always
  // fresh) — never cacheable by a browser, proxy or CDN. Set centrally here
  // rather than in every individual route handler. See
  // docs/slices/05-service.md's Hardening scope.
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
}

export const config = {
  // Skip Next's own static/image asset pipeline for performance; everything
  // else (pages and API routes, including the public ones above) runs
  // through proxy so every real response gets X-Robots-Tag.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
