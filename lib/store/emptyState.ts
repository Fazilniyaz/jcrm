import type { StoreState } from "./types";

/*
 * The local store starts empty.
 *
 * This replaces lib/store/seed.ts, which invented fourteen employees and the
 * projects, tasks, leave, attendance and calendar entries around them so the
 * front end had something to render before there was a backend. There is one
 * now: employees, projects, tasks, clients, notifications and workspace
 * settings all come from the API, and ApiStoreProvider swaps them in over this.
 *
 * What is left underneath — leads, leave, clock, calendar — has no endpoint
 * yet. Those modules render their empty states until one exists, which is the
 * honest answer and, unlike the seed, cannot be mistaken for real records.
 */
export function emptyState(): StoreState {
  return {
    employees: [],
    projects: [],
    tasks: [],
    leaveRequests: [],
    notifications: [],
    clockEntries: [],
    clients: [],
    leads: [],
    calendarEvents: [],
    settings: { autoEmployeeId: true, defaultBranch: null },
  };
}
