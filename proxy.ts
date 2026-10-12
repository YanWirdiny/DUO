import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// /api/cron/notifications has no session: it checks its own CRON_SECRET bearer token.
const PUBLIC_PATHS = ["/login", "/manifest.json", "/sw.js", "/offline.html", "/api/cron/notifications"];

// Static chunks next-pwa generates next to sw.js and the SW imports at install time
// (including worker-*.js, the push handler built from worker/index.ts).
const SW_CHUNK = /^\/(workbox|swe-worker|worker|fallback)-[A-Za-z0-9_-]+\.js$/;

/**
 * Edge-runtime request gate: allows public paths through, redirects an already
 * signed-in user away from /login, and otherwise requires a valid session —
 * returning 401 JSON for API routes or redirecting page routes to /login.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    SW_CHUNK.test(pathname) ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/api/auth/login");

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  if (isPublic) {
    if (userId && pathname === "/login") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|images/|manifest.json|sw.js).*)",
  ],
};
