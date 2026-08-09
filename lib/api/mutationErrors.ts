"use client";

import { useSyncExternalStore } from "react";
import { apiErrorMessage } from "./baseQuery";

/*
 * Where a failed write goes.
 *
 * The store's mutators return void — the modules call `createClient(...)` and
 * carry on — so a rejected request had nowhere to be reported and was written
 * to the console instead. In practice that meant the form closed, the row never
 * appeared, and the only evidence was a line in devtools that printed as `{}`
 * because a FetchBaseQueryError is not an Error and does not format like one.
 *
 * This is the missing half: one process-wide channel that the API overlay
 * pushes to and one banner that reads it. Deliberately not React state — the
 * publisher is a callback inside a `useMemo`, not a component.
 */

export type MutationError = {
  id: number;
  /** What was attempted, in the overlay's words: "create client". */
  what: string;
  /** The API's own message, already unwrapped from the error envelope. */
  message: string;
};

let current: MutationError | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Records a failure and returns the message that was shown. */
export function reportMutationError(what: string, error: unknown): string {
  const message = apiErrorMessage(error, `Couldn't ${what}.`);
  current = { id: (nextId += 1), what, message };
  emit();

  // Still logged, but as a string plus the raw payload — the previous call
  // passed only the object, which is what rendered as an empty `{}`.
  console.error(`[jadvix] ${what} failed: ${message}`, error);
  return message;
}

export function dismissMutationError() {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
// The server renders no error, and reading `current` there would be a shared
// mutable across requests.
const getServerSnapshot = () => null;

export function useMutationError(): MutationError | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
