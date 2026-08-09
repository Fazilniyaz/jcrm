import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPortalSlug } from "@/lib/portals";

/*
 * Next.js 16 renamed Middleware to Proxy — same behaviour, new filename.
 *
 * This is only an optimistic redirect so signed-out visitors don't land on a
 * portal shell. It does not authorise anything; the layout still resolves the
 * real session. Per the Next auth guide, Proxy is not the place for that.
 *
 * It does have to agree with the layout on *whether* there is a session,
 * though. Testing the cookie's presence alone isn't enough: a cookie naming a
 * portal that no longer exists (a slug was renamed, say) looks signed in here
 * and signed out there, and the two bounce the request between "/" and
 * "/login" forever. So this checks the value resolves to a real portal —
 * still a cheap string lookup, no session store involved.
 */

const SESSION_COOKIE = "jadvix_portal";

/*
 * Routes a signed-out visitor is supposed to reach.
 *
 * `/invite` is the one that matters and the one that is easy to forget: the
 * whole point of an invitation link is that it arrives by email, is opened by
 * somebody who has no account yet, and IS the credential. Bouncing it to
 * /login makes the token unusable — and worse, silently, because the link
 * looks like it simply expired.
 */
const PUBLIC_PREFIXES = ["/login", "/invite"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const slug = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = Boolean(slug) && isPortalSlug(slug!);

  if (pathname === "/login" && signedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Note this deliberately does NOT bounce a signed-in visitor away from
  // /invite: someone can be signed in as one account and be setting up
  // another, and the token is what authorises that page, not the cookie.
  if (!isPublic(pathname) && !signedIn) {
    const url = new URL("/login", request.url);
    const response = NextResponse.redirect(url);
    // Clear a cookie that no longer names anything, so the browser stops
    // sending it and the next visit is a clean signed-out one.
    if (slug) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // everything except Next internals, the API, and static assets
  matcher: ["/((?!_next/static|_next/image|icon.svg|.*\\.svg$|favicon.ico).*)"],
};
