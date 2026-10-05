"use client";

/*
 * The heartbeat.
 *
 * Presence is derived on the API from `lastSeenAt` (see its lib/presence.ts),
 * so the only thing the client owes it is a regular ping while the app is
 * open. Two rules keep this from becoming a nuisance:
 *
 *   1. It stops when the tab is hidden and fires immediately when it comes
 *      back. A backgrounded tab pinging every minute all afternoon is how a
 *      laptop that was shut at lunchtime stays green until the battery dies.
 *   2. The mutation invalidates nothing. It runs on a timer; refetching the
 *      session each time would turn a keepalive into a request storm.
 */

import { useEffect } from "react";
import { useTouchPresenceMutation } from "@/lib/api/api";

/** Matches HEARTBEAT_MS on the API. The online window there is ~2.5x this. */
const BEAT_MS = 60_000;

export function usePresenceHeartbeat(enabled: boolean) {
  const [touch] = useTouchPresenceMutation();

  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;

    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void touch({}).unwrap().catch(() => undefined);
    };

    const start = () => {
      beat();
      window.clearInterval(timer);
      timer = window.setInterval(beat, BEAT_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else window.clearInterval(timer);
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, touch]);
}
