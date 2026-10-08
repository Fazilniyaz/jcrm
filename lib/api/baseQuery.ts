import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { API_ROOT, getAccessToken, setAccessToken } from "./token";

/*
 * The transport.
 *
 * `credentials: "include"` is what carries the httpOnly refresh cookie to
 * /auth/refresh; the access token goes in the Authorization header instead, so
 * it is never attached automatically to a cross-site request and CSRF has
 * nothing to ride on for the data endpoints.
 */

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_ROOT,
  credentials: "include",
  prepareHeaders(headers) {
    const token = getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    return headers;
  },
});

/**
 * A single in-flight refresh, shared.
 *
 * Without this, a dashboard that fires eight queries on mount would fire eight
 * refreshes the moment the token expires — and since refresh ROTATES the token,
 * seven of them would present an already-revoked one and the backend would read
 * that as replay and kill the session. One promise, awaited by everyone.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  const response = await fetch(`${API_ROOT}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });

  if (!response.ok) {
    setAccessToken(null);
    return false;
  }

  const body = (await response.json()) as { data?: { accessToken?: string } };
  const token = body.data?.accessToken;
  if (!token) {
    setAccessToken(null);
    return false;
  }

  setAccessToken(token);
  return true;
}

function refresh(): Promise<boolean> {
  refreshInFlight ??= refreshOnce().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Endpoints where a 401 is the answer, not a reason to re-authenticate. */
const NO_RETRY = ["/auth/login", "/auth/master/login", "/auth/refresh", "/auth/logout"];

/*
 * The breaker, for when the API is simply not there.
 *
 * An unreachable API fails in about a millisecond — the connection is refused
 * rather than timing out — and anything that reacts to the failure by asking
 * again turns that into a request per frame. Measured at ~57 a second with the
 * backend stopped, which is the worst possible behaviour at the worst possible
 * moment: the API that just restarted is met by every open tab hammering it,
 * and the rate limiter answers 429 to the requests that would have worked.
 *
 * So after a transport failure, every request is refused locally for a second
 * without touching the network. The cost is that recovery can take up to a
 * second longer than it would have; the benefit is that it is a request a
 * second instead of sixty.
 *
 * This is deliberately about TRANSPORT failures only. A 500 is the API
 * answering, and the caller is entitled to ask again.
 */
const OFFLINE_COOLDOWN_MS = 1_000;
let lastTransportFailureAt = 0;

const OFFLINE_ERROR: FetchBaseQueryError = {
  status: "FETCH_ERROR",
  error: "The API is unreachable.",
};

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const url = typeof args === "string" ? args : args.url;

  if (Date.now() - lastTransportFailureAt < OFFLINE_COOLDOWN_MS) return { error: OFFLINE_ERROR };

  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === "FETCH_ERROR") {
    lastTransportFailureAt = Date.now();
    return result;
  }
  // Anything else means the API answered, so the breaker is closed again.
  lastTransportFailureAt = 0;

  if (result.error?.status === 401 && !NO_RETRY.some((path) => url.startsWith(path))) {
    if (await refresh()) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};

/** Pulls the human-readable message out of the API's error envelope. */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  const fetchError = error as FetchBaseQueryError | undefined;
  if (!fetchError) return fallback;

  if (typeof fetchError.status === "number" && fetchError.data) {
    const body = fetchError.data as { error?: { message?: string; details?: unknown } };
    if (body.error?.message) {
      const details = body.error.details;
      if (Array.isArray(details) && details.length > 0) {
        const lines = details
          .map((d) => (typeof d === "object" && d && "message" in d ? String(d.message) : null))
          .filter(Boolean);
        if (lines.length > 0) return lines.join(" ");
      }
      return body.error.message;
    }
  }

  if (fetchError.status === "FETCH_ERROR") {
    return "Can't reach the API. Is jadvix-backend running?";
  }
  return fallback;
}
