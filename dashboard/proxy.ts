import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedRequest } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const isLoggedIn = await isAuthenticatedRequest(req);
  const pathname = req.nextUrl.pathname;

  if (!isLoggedIn && (pathname.startsWith('/portfolio') || pathname.startsWith('/analytics'))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portfolio/:path*', '/analytics/:path*']
};
