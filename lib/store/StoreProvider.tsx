"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { emptyState } from "./emptyState";
import {
  isShortNotice,
  itemPoints,
  shiftMinutes,
  leaveApprovers,
  nextClientCode,
  nextEmployeeId,
  nextLeadCode,
  nextLeaveCode,
  nextProjectCode,
  nextTaskCode,
} from "./selectors";
import { STANDARD_DAY_MINUTES } from "./types";
import type {
  CalendarEvent,
  Client,
  ClockEntry,
  Employee,
  EmployeeStatus,
  Lead,
  LeaveEvent,
  LeaveRequest,
  Milestone,
  Notification,
  NotificationKind,
  Project,
  SecretEntry,
  QcReview,
  QcVerdict,
  StoreState,
  Task,
  TaskUpdate,
  WorkspaceSettings,
} from "./types";

/*
 * The workspace store for Projects, Tasks and Employees.
 *
 * Frontend only: the data lives in a module-level store mirrored into
 * localStorage, so it survives a reload and a client-side navigation but is
 * per-browser and shared with nobody. That is the whole persistence story —
 * there is no API behind this. When a backend arrives, the mutators below are
 * the only place that has to change.
 *
 * It is an external store read through useSyncExternalStore rather than React
 * state, because localStorage *is* an external system: the server can't see it,
 * so the first render has to be a skeleton and the swap has to happen without
 * a setState-in-effect cascade.
 */

/*
 * Bumped to v2 when the seed was deleted.
 *
 * Deleting seed.ts removes it from the bundle but NOT from the browsers that
 * already ran the old build: their v1 blob still holds the fourteen invented
 * employees and everything around them, and `readStored` would happily load it
 * back. A new key orphans that blob so the store genuinely starts empty.
 */
const STORAGE_KEY = "jadvix.crm.v2";
const LEGACY_STORAGE_KEYS = ["jadvix.crm.v1"];

type Snapshot = { hydrated: boolean; state: StoreState };

/* ------------------------------------------------------------------ ids -- */

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}${counter}`;
}

function todayISO(): string {
  // Sliced off the ISO string rather than built from getMonth() so it is always
  // zero-padded and always yyyy-mm-dd.
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------- notifications -- */

/**
 * Build one notification per recipient.
 *
 * Everything that notifies goes through here, so the shape stays consistent and
 * there is a single place to point at a transport when one exists. Recipients
 * are de-duplicated — being both an assignee and a manager on the same event
 * should not produce two copies.
 */
function notify(
  to: string[],
  kind: NotificationKind,
  title: string,
  detail: string,
  refs: { taskId?: string; leaveId?: string } = {},
): Notification[] {
  return [...new Set(to)].filter(Boolean).map((employeeId) => ({
    id: uid("ntf"),
    to: employeeId,
    kind,
    title,
    detail,
    at: nowISO(),
    read: false,
    ...refs,
  }));
}

/** One entry for a leave request's trail. */
function event(
  action: LeaveEvent["action"],
  by: string,
  note?: string,
): LeaveEvent {
  return { id: uid("lve"), at: nowISO(), by, action, note: note?.trim() || undefined };
}

/** KRA is a 0–100 scale; repeated deductions must not run it negative. */
function clampKra(n: number): number {
  return Math.min(Math.max(Math.round(n), 0), 100);
}

/** The audit-trail line for a verdict, in the same voice as the other entries. */
function describeReview(review: QcReview, assigneeCount: number): string {
  const lines = review.failedItemIds.length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (review.verdict === "Approved") {
    return "QC approved the checklist — task signed off.";
  }
  if (review.verdict === "Corrections") {
    return `QC requested corrections on ${plural(lines, "line")} — back to In Progress, no KRA change.`;
  }
  return (
    `QC marked ${plural(lines, "line")} as errors. ` +
    `${review.pointsDeducted} KRA ${review.pointsDeducted === 1 ? "point" : "points"} deducted from ` +
    `${plural(assigneeCount, "assignee")} — back to In Progress.`
  );
}

/* ------------------------------------------------------------ persistence -- */

/**
 * Fills in fields added after a save was written.
 *
 * `points` and `qcReviews` arrived with the QC checklist; anything stored
 * before that has neither, and a missing `qcReviews` would crash the first
 * component that maps over it. Defaulting on read is cheaper than versioning
 * the key, and it keeps whatever the user had actually entered.
 */
function migrateTask(raw: Partial<Task>): Task {
  return {
    ...(raw as Task),
    updatedBy: Array.isArray(raw.updatedBy) ? raw.updatedBy : [],
    qcReviews: Array.isArray(raw.qcReviews) ? raw.qcReviews : [],
    checklist: Array.isArray(raw.checklist)
      ? raw.checklist.map((c) => ({
          ...c,
          score: Number.isFinite(c?.score) ? c.score : 0,
          // One point per line is the neutral default: the old model had no
          // weighting, so every line was worth the same.
          points: Number.isFinite(c?.points) && c.points > 0 ? c.points : 1,
        }))
      : [],
  };
}

/**
 * Reads the stored snapshot, defaulting every slice to empty.
 *
 * This used to merge over the seed, and most of what it did was repair stored
 * rows against their seeded twins — supplying a `clientId` or a `plan` the save
 * predated. With no seed there is nothing to repair against and nothing to fall
 * back to: a missing or malformed slice is simply empty, which is what it
 * honestly is.
 */
function readStored(): StoreState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = emptyState();
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      projects: Array.isArray(parsed.projects) ? (parsed.projects as Project[]) : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(migrateTask) : [],
      leaveRequests: Array.isArray(parsed.leaveRequests)
        ? parsed.leaveRequests.map((l) => ({
            ...(l as LeaveRequest),
            // The trail arrived with the undo actions; rows saved before it
            // get a synthetic opening entry rather than an empty timeline.
            history: Array.isArray(l?.history)
              ? l.history
              : [
                  {
                    id: `lve-legacy-${l?.id ?? "?"}`,
                    at: l?.requestedAt ?? "",
                    by: "—",
                    action: "Raised" as const,
                  },
                ],
          }))
        : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      clockEntries: Array.isArray(parsed.clockEntries) ? parsed.clockEntries : [],
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      calendarEvents: Array.isArray(parsed.calendarEvents) ? parsed.calendarEvents : [],
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    // A corrupt or unreadable entry should drop us back to empty, not a blank
    // screen.
    return null;
  }
}

function persist(state: StoreState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private-mode failure: keep the in-memory store working.
  }
}

/* ----------------------------------------------------------- the store -- */

/* Frozen and never mutated: the server has no localStorage, so it always
   renders the not-yet-hydrated snapshot and the modules show a skeleton. */
const SERVER_SNAPSHOT: Snapshot = { hydrated: false, state: emptyState() };

let snapshot: Snapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

function commit(next: StoreState) {
  snapshot = { hydrated: true, state: next };
  persist(next);
  for (const listener of listeners) listener();
}

function update(fn: (state: StoreState) => StoreState) {
  commit(fn(snapshot.state));
}

/*
 * Read once, when the client bundle first evaluates. This module is a client
 * component so it also runs during SSR — the window check keeps the server on
 * an empty state, and keeps one visitor's edits from ever leaking into
 * another's render.
 */
if (typeof window !== "undefined") {
  // Clear the superseded blob rather than leaving several megabytes of dead
  // seed data sitting in every user's browser forever.
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode — nothing was stored to clear */
    }
  }
  snapshot = { hydrated: true, state: readStored() ?? emptyState() };
}

/* --------------------------------------------------------------- context -- */

export type StoreValue = {
  /** False until localStorage has been read; render a skeleton while false. */
  hydrated: boolean;
  state: StoreState;
  employees: Employee[];
  projects: Project[];
  tasks: Task[];
  clients: Client[];
  leads: Lead[];
  calendarEvents: CalendarEvent[];
  leaveRequests: LeaveRequest[];
  notifications: Notification[];
  settings: WorkspaceSettings;
  /** Display name of the signed-in portal user, used for createdBy / updatedBy. */
  currentUser: string;
  /** Portal slug of the signed-in session. */
  currentPortal: string;
  /** The employee record behind this portal, if it has one. */
  currentEmployee?: Employee;

  createEmployee: (input: EmployeeInput) => void;
  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id">>) => void;
  deleteEmployee: (id: string) => void;

  createProject: (input: ProjectInput) => void;
  updateProject: (id: string, patch: Partial<Omit<Project, "id">>) => void;
  deleteProject: (id: string) => void;

  createTask: (input: TaskInput) => void;
  /** `note` is appended to the task's audit trail when given. */
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>, note?: string) => void;
  deleteTask: (id: string) => void;
  /** Records a QC verdict and applies its KRA consequence in one step. */
  submitQcReview: (taskId: string, input: QcReviewInput) => void;
  /**
   * Set one subtask's acceptance score, 0 → 1.
   *
   * Separate from `updateTask` because it is a different act by a different
   * person: an assignee claiming progress on one line, not an edit of the task.
   * The API has a dedicated endpoint for it that rewrites nothing else.
   */
  scoreSubtask: (taskId: string, subtaskId: string, score: number) => void;

  createLeaveRequest: (input: LeaveRequestInput) => void;
  decideLeaveRequest: (id: string, status: "Approved" | "Rejected", note?: string) => void;
  withdrawLeaveRequest: (id: string, note?: string) => void;
  restoreLeaveRequest: (id: string) => void;
  undoLeaveDecision: (id: string, note?: string) => void;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (employeeId: string) => void;
  clearNotifications: (employeeId: string) => void;

  createClient: (input: Omit<Client, "id" | "createdAt">) => void;
  updateClient: (id: string, patch: Partial<Omit<Client, "id">>) => void;
  deleteClient: (id: string) => void;

  createLead: (input: Omit<Lead, "id" | "code" | "createdAt" | "updatedAt">) => void;
  updateLead: (id: string, patch: Partial<Omit<Lead, "id">>) => void;
  deleteLead: (id: string) => void;
  convertLead: (leadId: string, tone?: Client["tone"]) => void;

  createCalendarEvent: (input: Omit<CalendarEvent, "id" | "createdBy" | "createdAt">) => void;
  updateCalendarEvent: (id: string, patch: Partial<Omit<CalendarEvent, "id">>) => void;
  deleteCalendarEvent: (id: string) => void;

  clockIn: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  toggleBreak: (employeeId: string, minutes: number) => void;
  setEmployeeStatus: (employeeId: string, status: EmployeeStatus) => void;

  setProjectPlan: (projectId: string, plan: Milestone[]) => void;
  setProjectSecrets: (projectId: string, secrets: SecretEntry[]) => void;
  setDefaultBranch: (branch: string | null) => void;

  setSettings: (patch: Partial<WorkspaceSettings>) => void;
  resetDemoData: () => void;
  /** Suggested next code, for the "auto" path in each create form. */
  suggestEmployeeId: () => string;
  suggestProjectCode: () => string;
  suggestTaskCode: () => string;
};

export type EmployeeInput = Omit<Employee, "id">;
export type ProjectInput = Omit<Project, "id" | "createdAt" | "updatedAt">;
export type TaskInput = Omit<
  Task,
  "id" | "createdAt" | "updatedBy" | "createdBy" | "qcReviews"
> & {
  createdBy?: string;
};

export type LeaveRequestInput = Omit<
  LeaveRequest,
  | "id"
  | "code"
  | "status"
  | "requestedAt"
  | "decidedAt"
  | "decidedBy"
  | "decisionNote"
  | "history"
>;

export type QcReviewInput = {
  verdict: QcVerdict;
  /** Checklist lines QC is rejecting. Their points drive the deduction. */
  failedItemIds: string[];
  note?: string;
};

/*
 * Exported so lib/store/ApiStoreProvider.tsx can re-provide a value on the SAME
 * context. Employees, Projects, Tasks and Settings are served from the API by
 * that overlay; everything else still comes from the local store below. Two
 * contexts would mean two `useStore()` hooks and a component would have to know
 * which of its fields came from where.
 */
export const StoreContext = createContext<StoreValue | null>(null);

/* -------------------------------------------------------------- mutators -- */
/* Module-level, so they are stable identities and never re-created per render. */

function createEmployee(input: EmployeeInput) {
  const employee: Employee = { ...input, id: uid("emp") };
  update((s) => ({ ...s, employees: [employee, ...s.employees] }));
}

function updateEmployee(id: string, patch: Partial<Omit<Employee, "id">>) {
  update((s) => ({
    ...s,
    employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
}

/** Removing a person also pulls them off every project and task they were on. */
function deleteEmployee(id: string) {
  update((s) => ({
    ...s,
    employees: s.employees.filter((e) => e.id !== id),
    projects: s.projects.map((p) => ({
      ...p,
      assignedEmployees: p.assignedEmployees.filter((x) => x !== id),
      reportTo: p.reportTo.filter((x) => x !== id),
    })),
    tasks: s.tasks.map((t) => ({
      ...t,
      assignedTo: t.assignedTo.filter((x) => x !== id),
      reportTo: t.reportTo.filter((x) => x !== id),
    })),
  }));
}

function createProject(input: ProjectInput) {
  const now = todayISO();
  const project: Project = { ...input, id: uid("prj"), createdAt: now, updatedAt: now };
  update((s) => ({ ...s, projects: [project, ...s.projects] }));
}

function updateProject(id: string, patch: Partial<Omit<Project, "id">>) {
  update((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: todayISO() } : p)),
  }));
}

/** Tasks survive their project; they just lose the reference. */
function deleteProject(id: string) {
  update((s) => ({
    ...s,
    projects: s.projects.filter((p) => p.id !== id),
    tasks: s.tasks.map((t) => ({ ...t, projectIds: t.projectIds.filter((x) => x !== id) })),
  }));
}

function deleteTask(id: string) {
  update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
}

/* ---------------------------------------------------------------- clock -- */

/**
 * Start a shift. No-op if one is already open, so a double click on Clock In
 * can't leave two overlapping shifts for the same person.
 */
function clockIn(employeeId: string) {
  update((s) => {
    if (s.clockEntries.some((c) => c.employeeId === employeeId && !c.outAt)) return s;
    const entry: ClockEntry = {
      id: uid("clk"),
      employeeId,
      date: todayISO(),
      inAt: nowISO(),
      breakMinutes: 0,
      status: "Running",
    };
    return {
      ...s,
      clockEntries: [entry, ...s.clockEntries],
      // Clocking in is the moment someone becomes available for work.
      employees: s.employees.map((e) =>
        e.id === employeeId && e.status !== "Leave" ? { ...e, status: "Work Assigned" } : e,
      ),
    };
  });
}

function clockOut(employeeId: string) {
  update((s) => {
    const open = s.clockEntries.find((c) => c.employeeId === employeeId && !c.outAt);
    if (!open) return s;
    const out = nowISO();
    const worked = shiftMinutes({ ...open, outAt: out }, Date.now());
    return {
      ...s,
      clockEntries: s.clockEntries.map((c) =>
        c.id === open.id
          ? {
              ...c,
              outAt: out,
              status: worked > STANDARD_DAY_MINUTES ? "Overtime" : "Complete",
            }
          : c,
      ),
      employees: s.employees.map((e) =>
        e.id === employeeId && e.status !== "Leave" ? { ...e, status: "Idle" } : e,
      ),
    };
  });
}

/** Adds break time to the open shift and flips the person's status. */
function toggleBreak(employeeId: string, minutes: number) {
  update((s) => {
    const open = s.clockEntries.find((c) => c.employeeId === employeeId && !c.outAt);
    const onBreak = s.employees.find((e) => e.id === employeeId)?.status === "Break";
    return {
      ...s,
      clockEntries:
        open && onBreak
          ? s.clockEntries.map((c) =>
              c.id === open.id ? { ...c, breakMinutes: c.breakMinutes + minutes } : c,
            )
          : s.clockEntries,
      employees: s.employees.map((e) =>
        e.id === employeeId ? { ...e, status: onBreak ? "Work Assigned" : "Break" } : e,
      ),
    };
  });
}

/** The header control — someone setting their own availability. */
function setEmployeeStatus(employeeId: string, status: EmployeeStatus) {
  update((s) => ({
    ...s,
    employees: s.employees.map((e) => (e.id === employeeId ? { ...e, status } : e)),
  }));
}

/* --------------------------------------------------------- plan & vault -- */

function setProjectPlan(projectId: string, plan: Milestone[]) {
  update((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      p.id === projectId
        ? { ...p, plan: [...plan].sort((a, b) => a.due.localeCompare(b.due)), updatedAt: todayISO() }
        : p,
    ),
  }));
}

function setProjectSecrets(projectId: string, secrets: SecretEntry[]) {
  update((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === projectId ? { ...p, secrets } : p)),
  }));
}

function setDefaultBranch(branch: string | null) {
  update((s) => ({ ...s, settings: { ...s.settings, defaultBranch: branch } }));
}

/* ------------------------------------------------------------- clients -- */

function createClient(input: Omit<Client, "id" | "createdAt">) {
  update((s) => ({
    ...s,
    clients: [
      { ...input, id: nextClientCode(s.clients), createdAt: todayISO() },
      ...s.clients,
    ],
  }));
}

function updateClient(id: string, patch: Partial<Omit<Client, "id">>) {
  update((s) => ({
    ...s,
    clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    // A renamed account has to stay readable on its projects, which carry the
    // display name alongside the id.
    projects: patch.name
      ? s.projects.map((p) => (p.clientId === id ? { ...p, client: patch.name! } : p))
      : s.projects,
  }));
}

/** Projects survive; they just lose the account link. */
function deleteClient(id: string) {
  update((s) => ({
    ...s,
    clients: s.clients.filter((c) => c.id !== id),
    projects: s.projects.map((p) => (p.clientId === id ? { ...p, clientId: undefined } : p)),
    leads: s.leads.map((l) => (l.clientId === id ? { ...l, clientId: undefined } : l)),
  }));
}

/* --------------------------------------------------------------- leads -- */

function createLead(input: Omit<Lead, "id" | "code" | "createdAt" | "updatedAt">) {
  update((s) => {
    const now = todayISO();
    return {
      ...s,
      leads: [
        { ...input, id: uid("ld"), code: nextLeadCode(s.leads), createdAt: now, updatedAt: now },
        ...s.leads,
      ],
    };
  });
}

function updateLead(id: string, patch: Partial<Omit<Lead, "id">>) {
  update((s) => ({
    ...s,
    leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: todayISO() } : l)),
  }));
}

function deleteLead(id: string) {
  update((s) => ({ ...s, leads: s.leads.filter((l) => l.id !== id) }));
}

/**
 * Turn a won deal into an account.
 *
 * The lead keeps its record and gains a pointer to the client it became, so the
 * pipeline history stays intact rather than the row disappearing on close.
 */
function convertLead(leadId: string, tone: Client["tone"] = "blue") {
  update((s) => {
    const lead = s.leads.find((l) => l.id === leadId);
    if (!lead || lead.clientId) return s;

    const client: Client = {
      id: nextClientCode(s.clients),
      name: lead.company,
      contact: lead.contact,
      email: lead.email,
      phone: lead.phone,
      industry: "—",
      value: lead.value,
      since: new Date().getFullYear().toString(),
      status: "Onboarding",
      notes: `Converted from ${lead.code}.${lead.notes ? ` ${lead.notes}` : ""}`,
      tone,
      createdAt: todayISO(),
    };

    return {
      ...s,
      clients: [client, ...s.clients],
      leads: s.leads.map((l) =>
        l.id === leadId
          ? { ...l, stage: "Won" as const, clientId: client.id, updatedAt: todayISO() }
          : l,
      ),
    };
  });
}

/* ------------------------------------------------------------ calendar -- */

function deleteCalendarEvent(id: string) {
  update((s) => ({ ...s, calendarEvents: s.calendarEvents.filter((e) => e.id !== id) }));
}

function markNotificationRead(id: string) {
  update((s) => ({
    ...s,
    notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
  }));
}

function markAllNotificationsRead(employeeId: string) {
  update((s) => ({
    ...s,
    notifications: s.notifications.map((n) => (n.to === employeeId ? { ...n, read: true } : n)),
  }));
}

function clearNotifications(employeeId: string) {
  update((s) => ({ ...s, notifications: s.notifications.filter((n) => n.to !== employeeId) }));
}

function setSettings(patch: Partial<WorkspaceSettings>) {
  update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

function resetDemoData() {
  commit(emptyState());
}

/* -------------------------------------------------------------- provider -- */

export function StoreProvider({
  children,
  currentUser,
  currentPortal,
}: {
  children: React.ReactNode;
  currentUser: string;
  currentPortal: string;
}) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { hydrated, state } = snap;

  // These two stamp the acting user onto the record, so unlike the rest they
  // have to be bound to the current portal.
  const createTask = useCallback(
    (input: TaskInput) => {
      const task: Task = {
        ...input,
        id: uid("tsk"),
        createdBy: input.createdBy || currentUser,
        createdAt: todayISO(),
        updatedBy: [],
        qcReviews: [],
      };
      update((s) => ({
        ...s,
        tasks: [task, ...s.tasks],
        notifications: [
          ...s.notifications,
          ...notify(
            task.assignedTo,
            "task-assigned",
            `${task.createdBy} assigned a task to you`,
            `${task.taskId} — ${task.title}`,
            { taskId: task.id },
          ),
        ],
      }));
    },
    [currentUser],
  );

  /**
   * Set one subtask's acceptance score.
   *
   * Only the named subtask moves; the task's own completion is derived from the
   * subtask scores rather than stored, so nothing else has to be written.
   */
  const scoreSubtask = useCallback(
    (taskId: string, subtaskId: string, score: number) => {
      const clamped = Math.min(Math.max(score, 0), 1);
      update((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                checklist: t.checklist.map((c) =>
                  c.id === subtaskId ? { ...c, score: clamped } : c,
                ),
              }
            : t,
        ),
      }));
    },
    [],
  );

  /**
   * Commit a QC verdict.
   *
   * One update rather than several, because the task and the assignees' KRA
   * have to move together — a half-applied review would leave points deducted
   * against a task that never records why.
   */
  const submitQcReview = useCallback(
    (taskId: string, input: QcReviewInput) => {
      update((s) => {
        const task = s.tasks.find((t) => t.id === taskId);
        if (!task) return s;

        const failed = new Set(input.failedItemIds);
        // Only an Error costs anything. Corrections is a nudge, not a penalty.
        const deduction =
          input.verdict === "Error"
            ? task.checklist.reduce((n, c) => (failed.has(c.id) ? n + itemPoints(c) : n), 0)
            : 0;

        // Every assignee takes the full deduction — it is not split between
        // them. Two people on a task worth 4 points lose 4 each.
        const affected =
          deduction > 0
            ? task.assignedTo.flatMap((id) => {
                const e = s.employees.find((x) => x.id === id);
                if (!e) return [];
                return [{ employeeId: id, from: e.kraScore, to: clampKra(e.kraScore - deduction) }];
              })
            : [];

        const review: QcReview = {
          id: uid("qc"),
          at: todayISO(),
          by: currentUser,
          verdict: input.verdict,
          note: input.note?.trim() || undefined,
          failedItemIds: input.failedItemIds,
          pointsDeducted: deduction,
          affected,
        };

        const sendBack = input.verdict !== "Approved";
        const moved = new Map(affected.map((a) => [a.employeeId, a.to]));

        // Every assignee hears the outcome, whichever way it went.
        const outcome = {
          Approved: {
            kind: "qc-approved" as const,
            title: "Your task was approved by QC",
            detail: `${task.taskId} — ${task.title} passed review${review.note ? `. “${review.note}”` : "."}`,
          },
          Corrections: {
            kind: "qc-corrections" as const,
            title: "QC returned your task for corrections",
            detail: `${task.taskId} — ${task.title} is back In Progress. No KRA change${review.note ? `. “${review.note}”` : "."}`,
          },
          Error: {
            kind: "qc-error" as const,
            title: "QC marked errors on your task",
            detail: `${task.taskId} — ${task.title} is back In Progress. ${deduction} KRA point${deduction === 1 ? "" : "s"} deducted${review.note ? `. “${review.note}”` : "."}`,
          },
        }[input.verdict];

        return {
          ...s,
          employees: s.employees.map((e) =>
            moved.has(e.id) ? { ...e, kraScore: moved.get(e.id)! } : e,
          ),
          notifications: [
            ...s.notifications,
            ...notify(task.assignedTo, outcome.kind, outcome.title, outcome.detail, {
              taskId: task.id,
            }),
          ],
          tasks: s.tasks.map((t) =>
            t.id !== taskId
              ? t
              : {
                  ...t,
                  status: sendBack ? "In Progress" : t.status,
                  // Rejected lines go back to zero so there is something
                  // concrete to redo and the task's completion reflects it.
                  checklist: sendBack
                    ? t.checklist.map((c) => (failed.has(c.id) ? { ...c, score: 0 } : c))
                    : t.checklist,
                  qcReviews: [...t.qcReviews, review],
                  updatedBy: [
                    ...t.updatedBy,
                    {
                      id: uid("upd"),
                      at: todayISO(),
                      by: currentUser,
                      summary: describeReview(review, task.assignedTo.length),
                    },
                  ],
                },
          ),
        };
      });
    },
    [currentUser],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<Task, "id">>, note?: string) => {
      update((s) => {
        const before = s.tasks.find((t) => t.id === id);
        if (!before) return s;

        // Someone added to the task by an edit is being assigned it just the
        // same as on create, so they get the same notification. People already
        // on it are not re-notified.
        const added = patch.assignedTo
          ? patch.assignedTo.filter((x) => !before.assignedTo.includes(x))
          : [];

        return {
          ...s,
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            const entry: TaskUpdate | null = note
              ? { id: uid("upd"), at: todayISO(), by: currentUser, summary: note }
              : null;
            return { ...t, ...patch, updatedBy: entry ? [...t.updatedBy, entry] : t.updatedBy };
          }),
          notifications: [
            ...s.notifications,
            ...notify(
              added,
              "task-assigned",
              `${currentUser} assigned a task to you`,
              `${patch.taskId ?? before.taskId} — ${patch.title ?? before.title}`,
              { taskId: id },
            ),
          ],
        };
      });
    },
    [currentUser],
  );

  /**
   * Raise a request and tell every approver about it.
   *
   * Depends on currentUser because it opens the request's trail with a "Raised"
   * entry attributed to whoever is signed in.
   */
  /**
   * Put something on the calendar and tell the whole roster.
   *
   * The notification reads the way someone would say it out loud — "Priya
   * Raghavan marked Daily standup for 13:00" — because that is the entire
   * content of the message.
   */
  const createCalendarEvent = useCallback(
    (input: Omit<CalendarEvent, "id" | "createdBy" | "createdAt">) => {
      update((s) => {
        const event: CalendarEvent = {
          ...input,
          id: uid("cal"),
          createdBy: currentUser,
          createdAt: nowISO(),
        };
        const when = event.time ? `for ${event.time}` : "as an all-day entry";

        return {
          ...s,
          calendarEvents: [...s.calendarEvents, event],
          notifications: [
            ...s.notifications,
            ...notify(
              s.employees.map((e) => e.id),
              "calendar-event",
              `${currentUser} marked ${event.title} ${when}`,
              `${event.kind} on ${event.date}${event.time ? ` at ${event.time}` : ""}${
                event.note ? ` — ${event.note}` : "."
              }`,
            ),
          ],
        };
      });
    },
    [currentUser],
  );

  const updateCalendarEvent = useCallback(
    (id: string, patch: Partial<Omit<CalendarEvent, "id">>) => {
      update((s) => ({
        ...s,
        calendarEvents: s.calendarEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
    },
    [],
  );

  const createLeaveRequest = useCallback((input: LeaveRequestInput) => {
    update((s) => {
      const request: LeaveRequest = {
        ...input,
        id: uid("lv"),
        code: nextLeaveCode(s.leaveRequests),
        status: "Pending",
        requestedAt: nowISO(),
        history: [event("Raised", currentUser, input.reason)],
      };
      const who = s.employees.find((e) => e.id === request.employeeId);
      const short = isShortNotice(request);

      return {
        ...s,
        leaveRequests: [request, ...s.leaveRequests],
        notifications: [
          ...s.notifications,
          ...notify(
            leaveApprovers(s).map((e) => e.id),
            "leave-requested",
            "You have a leave request to review",
            `${who?.name ?? "An employee"} requested ${request.days} day${request.days === 1 ? "" : "s"} of ${request.type} leave from ${request.from}${short ? " — short notice" : ""}.`,
            { leaveId: request.id },
          ),
        ],
      };
    });
  }, [currentUser]);

  /** Approve or reject, and tell the person who asked. */
  const decideLeaveRequest = useCallback(
    (id: string, status: "Approved" | "Rejected", note?: string) => {
      update((s) => {
        const request = s.leaveRequests.find((l) => l.id === id);
        if (!request) return s;

        return {
          ...s,
          leaveRequests: s.leaveRequests.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status,
                  decidedAt: nowISO(),
                  decidedBy: currentUser,
                  decisionNote: note?.trim() || undefined,
                  history: [...l.history, event(status, currentUser, note)],
                }
              : l,
          ),
          notifications: [
            ...s.notifications,
            ...notify(
              [request.employeeId],
              status === "Approved" ? "leave-approved" : "leave-rejected",
              `Your leave request was ${status.toLowerCase()}`,
              `${request.code} — ${request.days} day${request.days === 1 ? "" : "s"} of ${request.type} leave from ${request.from}, ${status.toLowerCase()} by ${currentUser}${note?.trim() ? `. “${note.trim()}”` : "."}`,
              { leaveId: request.id },
            ),
          ],
        };
      });
    },
    [currentUser],
  );

  /**
   * The employee pulls their own request.
   *
   * Allowed while Pending and after approval — cancelling booked leave is a
   * normal thing to need. The row stays, marked Withdrawn, so the manager who
   * approved it can still see what happened; the days come straight back into
   * the balance because only Approved rows are counted against it.
   */
  const withdrawLeaveRequest = useCallback(
    (id: string, note?: string) => {
      update((s) => {
        const request = s.leaveRequests.find((l) => l.id === id);
        if (!request) return s;
        const wasApproved = request.status === "Approved";

        return {
          ...s,
          leaveRequests: s.leaveRequests.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status: "Withdrawn" as const,
                  decidedAt: undefined,
                  decidedBy: undefined,
                  decisionNote: undefined,
                  history: [...l.history, event("Withdrawn", currentUser, note)],
                }
              : l,
          ),
          notifications: [
            ...s.notifications,
            ...notify(
              leaveApprovers(s).map((e) => e.id),
              "leave-withdrawn",
              "A leave request was withdrawn",
              `${currentUser} withdrew ${request.code} — ${request.days} day${request.days === 1 ? "" : "s"} of ${request.type} leave from ${request.from}${wasApproved ? ", which you had already approved" : ""}.`,
              { leaveId: request.id },
            ),
          ],
        };
      });
    },
    [currentUser],
  );

  /** The employee puts a withdrawn request back in front of their manager. */
  const restoreLeaveRequest = useCallback(
    (id: string) => {
      update((s) => {
        const request = s.leaveRequests.find((l) => l.id === id);
        if (!request) return s;

        return {
          ...s,
          leaveRequests: s.leaveRequests.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status: "Pending" as const,
                  history: [...l.history, event("Reopened", currentUser)],
                }
              : l,
          ),
          notifications: [
            ...s.notifications,
            ...notify(
              leaveApprovers(s).map((e) => e.id),
              "leave-requested",
              "You have a leave request to review",
              `${currentUser} reopened ${request.code} — ${request.days} day${request.days === 1 ? "" : "s"} of ${request.type} leave from ${request.from}.`,
              { leaveId: request.id },
            ),
          ],
        };
      });
    },
    [currentUser],
  );

  /**
   * An approver takes back an approval or a rejection.
   *
   * The request returns to Pending and the decision fields are cleared, since
   * they no longer describe anything. Who decided what, and who undid it, both
   * survive in the trail.
   */
  const undoLeaveDecision = useCallback(
    (id: string, note?: string) => {
      update((s) => {
        const request = s.leaveRequests.find((l) => l.id === id);
        if (!request || (request.status !== "Approved" && request.status !== "Rejected")) return s;
        const previous = request.status;

        return {
          ...s,
          leaveRequests: s.leaveRequests.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status: "Pending" as const,
                  decidedAt: undefined,
                  decidedBy: undefined,
                  decisionNote: undefined,
                  history: [
                    ...l.history,
                    event(
                      "Decision undone",
                      currentUser,
                      note ?? `${previous} by ${request.decidedBy ?? "—"} was reverted.`,
                    ),
                  ],
                }
              : l,
          ),
          notifications: [
            ...s.notifications,
            ...notify(
              [request.employeeId],
              "leave-reopened",
              "Your leave request is being reconsidered",
              `${currentUser} undid the ${previous.toLowerCase()} decision on ${request.code}. It is back with your manager${note?.trim() ? `. “${note.trim()}”` : "."}`,
              { leaveId: request.id },
            ),
          ],
        };
      });
    },
    [currentUser],
  );

  const value = useMemo<StoreValue>(
    () => ({
      hydrated,
      state,
      employees: state.employees,
      projects: state.projects,
      tasks: state.tasks,
      clients: state.clients,
      leads: state.leads,
      calendarEvents: state.calendarEvents,
      leaveRequests: state.leaveRequests,
      notifications: state.notifications,
      settings: state.settings,
      currentUser,
      currentPortal,
      // Matched on the portal slug, not the display name: two people could
      // share a name, but a portal maps to exactly one seat.
      currentEmployee: state.employees.find((e) => e.portal === currentPortal),
      createEmployee,
      updateEmployee,
      deleteEmployee,
      createProject,
      updateProject,
      deleteProject,
      createTask,
      updateTask,
      deleteTask,
      submitQcReview,
      scoreSubtask,
      createLeaveRequest,
      decideLeaveRequest,
      withdrawLeaveRequest,
      restoreLeaveRequest,
      undoLeaveDecision,
      createClient,
      updateClient,
      deleteClient,
      createLead,
      updateLead,
      deleteLead,
      convertLead,
      createCalendarEvent,
      updateCalendarEvent,
      deleteCalendarEvent,
      clockIn,
      clockOut,
      toggleBreak,
      setEmployeeStatus,
      setProjectPlan,
      setProjectSecrets,
      setDefaultBranch,
      markNotificationRead,
      markAllNotificationsRead,
      clearNotifications,
      setSettings,
      resetDemoData,
      suggestEmployeeId: () => nextEmployeeId(state.employees),
      suggestProjectCode: () => nextProjectCode(state.projects),
      suggestTaskCode: () => nextTaskCode(state.tasks),
    }),
    [
      hydrated,
      state,
      currentUser,
      currentPortal,
      createTask,
      updateTask,
      submitQcReview,
      scoreSubtask,
      createLeaveRequest,
      decideLeaveRequest,
      withdrawLeaveRequest,
      restoreLeaveRequest,
      undoLeaveDecision,
      createCalendarEvent,
      updateCalendarEvent,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
