"use client";

import { useMeQuery } from "./api";
import type { MasterSession, SessionUser } from "./types";

/*
 * Who is signed in, from the API's point of view.
 *
 * There is no bootstrap call to make: /auth/me answers 401 on a cold load, the
 * base query spends the httpOnly refresh cookie on a new access token, and the
 * request is retried. So a page refresh restores the session in one round trip
 * without the access token ever having been written anywhere a script can read.
 */

export type Session =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "user"; user: SessionUser }
  | { status: "master"; master: MasterSession };

export function useSession(): Session {
  const { data, isLoading, isFetching, isError } = useMeQuery();

  if (isLoading || (isFetching && !data)) return { status: "loading" };
  if (isError || !data) return { status: "anonymous" };
  if (data.kind === "master") return { status: "master", master: data.master };
  return { status: "user", user: data.user };
}

/** True when the signed-in account may open a module, by the server's answer. */
export function canOpen(session: Session, slug: string): boolean {
  const modules =
    session.status === "user"
      ? session.user.modules
      : session.status === "master"
        ? session.master.modules
        : [];
  return modules.includes(slug);
}
