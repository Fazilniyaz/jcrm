"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useDispatch } from "react-redux";
import { io, type Socket } from "socket.io-client";
import { api } from "./api/api";
import { API_BASE_URL, getAccessToken, onAccessTokenChange } from "./api/token";
import type { AppDispatch } from "./store/redux";

/*
 * The realtime client.
 *
 * The server pushes "something in `tasks` changed for your company" and
 * nothing more — no entity bodies (see src/lib/realtime.ts in the API for
 * why). So this file's whole job is to turn one of those words into the cache
 * tags it affects and hand them to RTK Query, which refetches exactly the
 * queries that are actually mounted. A screen nobody is looking at costs
 * nothing.
 *
 * Polling stays as the fallback and is slowed rather than switched off while
 * the socket is up: a proxy that will not upgrade, a corporate network that
 * drops WebSockets, or a server restart should make the app slower to notice
 * changes, never blind to them.
 */

/** What a change in each resource invalidates. */
const TAGS: Record<string, string[]> = {
  tasks: ["TaskList", "Task"],
  projects: ["ProjectList", "Project", "ProjectInvitations"],
  sprints: ["Sprint", "TaskList"],
  // Status, presence and profile edits all arrive as `employees`, and they are
  // drawn in four places.
  employees: ["EmployeeList", "Employee", "Playground", "Profile", "ClockRoster"],
  teams: ["Team"],
  clients: ["ClientList", "Client"],
  branches: ["Branch"],
  clock: ["Clock", "ClockRoster", "ClockStats"],
  reports: ["Report", "ReportDay"],
  playground: ["Playground"],
  settings: ["Workspace", "ModuleAccess"],
  notifications: ["Notification"],
};

type Change = { resource: string; by?: string; at: string };

let socket: Socket | null = null;
let connected = false;
const watchers = new Set<() => void>();

function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  for (const watcher of watchers) watcher();
}

function subscribe(watcher: () => void) {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** True while the socket is up. Used to decide how hard to poll. */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connected,
    () => false,
  );
}

function teardown() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setConnected(false);
}

/**
 * Hold a socket open for as long as someone is signed in.
 *
 * Mounted once, in the dashboard shell. `myUserId` suppresses the echo of this
 * tab's own writes: the mutation that caused them has already invalidated the
 * same tags locally, and refetching twice for one click is the one cost this
 * design can actually avoid.
 */
export function useRealtime(enabled: boolean, myUserId?: string) {
  // The store is built per request (see makeStore), so the dispatch comes from
  // the provider rather than from a module singleton — on the server a shared
  // store would hand one visitor's cache to the next.
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!enabled) {
      teardown();
      return;
    }

    const token = getAccessToken();
    if (!token) return; // the next rotation brings us back

    /*
     * An empty NEXT_PUBLIC_API_URL means "same origin", which is how the
     * single-instance deploy is wired — and `io()` with no URL is exactly
     * that, so it must not be called with an empty string instead.
     */
    const options = {
      path: "/socket.io",
      auth: { token },
      withCredentials: true,
      // Poll first, then upgrade. A proxy that refuses the upgrade keeps
      // working rather than never connecting at all.
      transports: ["polling", "websocket"] as string[],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
    };

    socket = API_BASE_URL ? io(API_BASE_URL, options) : io(options);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("change", (change: Change) => {
      if (myUserId && change.by === myUserId) return;
      const tags = TAGS[change.resource];
      if (!tags) return;
      dispatch(api.util.invalidateTags(tags as never));
    });

    /*
     * The access token is a 15-minute credential and the socket outlives it.
     * On every rotation the server is handed the new one and re-derives the
     * rooms; on sign-out the token becomes null and the socket goes with it.
     */
    const stopWatchingToken = onAccessTokenChange((next) => {
      if (!next) {
        teardown();
        return;
      }
      if (!socket) return;
      socket.auth = { token: next };
      socket.emit("reauth", next, (okFlag: boolean) => {
        // Refused means the token is for someone else, or the account is gone.
        // Reconnecting from scratch is the only honest recovery.
        if (!okFlag) socket?.connect();
      });
    });

    return () => {
      stopWatchingToken();
      teardown();
    };
  }, [dispatch, enabled, myUserId]);
}
