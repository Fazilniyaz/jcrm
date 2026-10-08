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

/*
 * Who else cares when the token changes.
 *
 * The realtime socket authenticates with this same token at handshake time,
 * so it has to be told when the token is rotated or dropped — otherwise a
 * socket stays subscribed on a credential that has expired, and a sign-out
 * leaves it connected as the person who just left.
 */
type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  if (accessToken === token) return;
  accessToken = token;
  for (const listener of listeners) listener(token);
}

/** Subscribe to rotations. Returns the unsubscribe. */
export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

export const API_ROOT = `${API_BASE_URL}/api/v1`;
