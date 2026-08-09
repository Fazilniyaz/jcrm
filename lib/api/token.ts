/*
 * Where the access token lives.
 *
 * In a module variable — NOT localStorage and NOT a readable cookie.
 *
 * localStorage is readable by any script that ends up on the page, so a single
 * XSS turns into a stolen bearer token that keeps working until it expires.
 * A module variable dies with the tab, which is the correct lifetime for a
 * 15-minute credential. The long-lived half of the session is the refresh
 * token, and that is httpOnly — the browser will send it and no script can read
 * it.
 *
 * The cost is that a hard reload starts with no token; `bootstrapSession` pays
 * that cost once by calling /auth/refresh before the first render.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

export const API_ROOT = `${API_BASE_URL}/api/v1`;
