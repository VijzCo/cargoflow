import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/rbac/session-shared";

// Edge runtime cannot run firebase-admin (it uses Node APIs), so this middleware
// does a *presence-only* check on the cookie. Deep verification happens in
// server components/actions via getSessionUser(). This pattern is fast and
// keeps the middleware bundle small.

const PUBLIC_PATHS = [
  "/login",
  "/reset-password",
  "/api/auth/session",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  // Next.js internals
  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Apply to everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
