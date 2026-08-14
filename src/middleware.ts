import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * First gate only — an *optimistic* check that a session cookie exists, so signed-out
 * visitors get a redirect instead of a flash of the app shell.
 *
 * This is not the authorisation layer. Middleware runs on the edge and cannot reach
 * the database, so it cannot know whether the session is valid, whether the account
 * was deactivated, or whether this person may see a given record. Every page, server
 * action and route handler independently calls requireUser()/requireAdmin()
 * (NFR-07, skills/auth-roles). Deleting this file would cost polish, not safety.
 */
const PUBLIC_PREFIXES = ["/login", "/activate", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  /**
   * API routes are never redirected. A caller asking for JSON must get a JSON 401 from
   * the handler, not an HTML login page with a 200 — which is also what makes the
   * direct-API acceptance tests meaningful: a redirect would mask every status code
   * AC-08, AC-13 and AC-14 are written to assert.
   */
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    // Come back to where they were headed once signed in.
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, the favicon, and static brand assets.
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
