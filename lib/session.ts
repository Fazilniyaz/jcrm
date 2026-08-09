import "server-only";
import { cookies } from "next/headers";
import { getPortal, type Portal, type PortalSlug } from "./portals";

/*
 * DEMO SESSION — not a real auth system.
 *
 * The cookie holds nothing but the portal slug, and the "password check" is a
 * string compare against a hard-coded table. That is fine for a credentialed
 * UI demo and completely unfit for production: there is no hashing, no signing,
 * no expiry enforcement and no server-side user store. Swap this whole module
 * for a real provider before any live data goes near it.
 */

export const SESSION_COOKIE = "jadvix_portal";

export async function createSession(portal: PortalSlug) {
  const store = await cookies();
  store.set(SESSION_COOKIE, portal, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // demo build runs over http locally; secure would drop the cookie.
    // COOKIE_SECURE=false forces it off for an http-only (Elastic IP) deploy.
    secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The portal the current visitor signed into, if any. */
export async function getSession(): Promise<Portal | null> {
  const store = await cookies();
  const slug = store.get(SESSION_COOKIE)?.value;
  if (!slug) return null;
  return getPortal(slug) ?? null;
}
