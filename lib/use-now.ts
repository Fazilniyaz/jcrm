"use client";

import { useSyncExternalStore } from "react";

/*
 * The wall clock, as an external store.
 *
 * Reading Date.now() while rendering makes a component impure — the same props
 * give a different answer on a re-render, which is exactly what the compiler
 * warns about. The clock genuinely is an external system, so it belongs behind
 * useSyncExternalStore like any other.
 *
 * One interval is shared by every subscriber and stops when the last one
 * unmounts. Thirty seconds is enough for a running shift shown to the minute,
 * and cheap enough to leave on.
 */

const TICK_MS = 30_000;

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const fn of listeners) fn();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  // Seeded on first read so the first paint after subscribe is already correct.
  if (now === 0) now = Date.now();
  return now;
}

/* The server has no clock the client could match, so durations render as zero
   there. Every caller sits behind the store's `hydrated` gate, so this is only
   ever the pre-hydration value. */
function getServerSnapshot(): number {
  return 0;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
