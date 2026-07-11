import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

/**
 * Optimistic auth gate: checks only for the presence of the session cookie so it
 * can run on the edge without a DB round-trip. The real session is validated in
 * the protected server components (e.g. the dashboard) via `auth.api.getSession`.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/pending'],
}
