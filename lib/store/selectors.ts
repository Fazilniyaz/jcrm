import {
  LEAD_STAGE_WEIGHT,
  LEAVE_ALLOWANCE,
  LEAVE_TYPE_TONE,
  LEAVE_TYPES,
  SECRET_ENV_FILE,
  SECRET_ENVS,
  SHORT_NOTICE_HOURS,
  type CalendarEvent,
  type Client,
  type ClockEntry,
  type Employee,
  type Lead,
  type LeaveRequest,
  type Milestone,
  type Notification,
  type Project,
  type QcReview,
  type SecretEntry,
  type StoreState,
  type Subtask,
  type Task,
  type TaskStatus,
} from "./types";

/*
 * Pure derivations over the store. Kept out of the provider so any component
 * can call them against a snapshot without subscribing to more than it needs.
 */

/* ------------------------------------------------------------ formatting -- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * ISO yyyy-mm-dd -> "04 Aug 2026".
 *
 * Formatted by hand rather than through toLocaleDateString: the runtime locale
 * differs between the server render and the browser, which both changes the
 * output and desyncs the markup.
 */
export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!y || !d || mi < 0 || mi > 11) return iso;
  return `${d} ${MONTHS[mi]} ${y}`;
}

/** Short form for dense rows: "04 Aug". */
export function formatDateShort(iso?: string): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!d || mi < 0 || mi > 11) return iso;
  return `${d} ${MONTHS[mi]}`;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/* ----------------------------------------------------------------- codes -- */

/**
 * Next code in a `PREFIX-NNN` series, based on the highest number in use.
 * Max rather than count, so deleting a record never hands out a code twice.
 */
function nextCode(existing: string[], prefix: string, pad: number): string {
  let max = 0;
  for (const value of existing) {
    const m = value.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}

export const nextEmployeeId = (employees: Employee[]) =>
  nextCode(employees.map((e) => e.empId), "JDX", 3);

export const nextProjectCode = (projects: Project[]) =>
  nextCode(projects.map((p) => p.code), "PRJ", 3);

export const nextTaskCode = (tasks: Task[]) => nextCode(tasks.map((t) => t.taskId), "TSK", 3);

export const nextLeaveCode = (requests: LeaveRequest[]) =>
  nextCode(requests.map((l) => l.code), "LV", 3);

/* ------------------------------------------------------------ task scores -- */

/** Mean checklist score as a percentage. An empty checklist scores 0. */
export function taskScore(task: Task): number {
  if (task.checklist.length === 0) return 0;
  const sum = task.checklist.reduce((n, c) => n + clampScore(c.score), 0);
  return Math.round((sum / task.checklist.length) * 100);
}

export function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}

export function checklistDone(task: Task): number {
  return task.checklist.filter((c) => clampScore(c.score) >= 1).length;
}

/** What all of a task's subtasks are worth together. */
export function checklistPoints(task: Task): number {
  return task.checklist.reduce((n, c) => n + itemPoints(c), 0);
}

/**
 * Every subtask in the workspace, each carrying the task it belongs to.
 *
 * The Subtasks view is a flat list across tasks rather than a second tree: a
 * subtask has no meaning without its parent, so the parent travels with it and
 * the row can be read on its own.
 */
export type SubtaskRow = {
  subtask: Subtask;
  task: Task;
  /** The acceptance score as a percentage, which is how it is shown. */
  accepted: number;
  done: boolean;
};

export function subtaskRows(tasks: Task[]): SubtaskRow[] {
  return tasks.flatMap((task) =>
    task.checklist.map((subtask) => ({
      subtask,
      task,
      accepted: Math.round(clampScore(subtask.score) * 100),
      done: clampScore(subtask.score) >= 1,
    })),
  );
}

/** Points of a chosen subset — what an Error verdict would cost each assignee. */
export function pointsFor(task: Task, itemIds: Iterable<string>): number {
  const wanted = new Set(itemIds);
  return task.checklist.reduce((n, c) => (wanted.has(c.id) ? n + itemPoints(c) : n), 0);
}

/** Tolerates records saved before `points` existed. */
export function itemPoints(item: { points?: number }): number {
  const n = Number(item.points);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/* ------------------------------------------------------------- QC review -- */

export function lastReview(task: Task): QcReview | undefined {
  return task.qcReviews.at(-1);
}

/** How many times QC has sent this task back. */
export function reworkCount(task: Task): number {
  return task.qcReviews.filter((r) => r.verdict !== "Approved").length;
}

export function isSignedOff(task: Task): boolean {
  return task.status === "Done" && lastReview(task)?.verdict === "Approved";
}

/**
 * Finished work QC has not cleared yet. A task that comes back from rework and
 * is marked Done again re-enters the queue, because its newest review is the
 * rejection rather than an approval.
 */
export function isAwaitingReview(task: Task): boolean {
  return task.status === "Done" && lastReview(task)?.verdict !== "Approved";
}

/** Sent back by QC and not yet finished again. */
export function isInRework(task: Task): boolean {
  return task.status !== "Done" && reworkCount(task) > 0;
}

/** Total KRA points a person has lost to QC across every task. */
export function kraDeducted(state: StoreState, employeeId: string): number {
  return state.tasks.reduce(
    (total, task) =>
      total +
      task.qcReviews.reduce(
        (n, review) =>
          n + review.affected.reduce((m, a) => (a.employeeId === employeeId ? m + (a.from - a.to) : m), 0),
        0,
      ),
    0,
  );
}

/* -------------------------------------------------------------- lookups -- */

export function employeeById(state: StoreState, id: string): Employee | undefined {
  return state.employees.find((e) => e.id === id);
}

export function employeesByIds(state: StoreState, ids: string[]): Employee[] {
  // Map over ids (not a filter over employees) so the caller's order survives.
  return ids.map((id) => employeeById(state, id)).filter((e): e is Employee => Boolean(e));
}

export function projectById(state: StoreState, id: string): Project | undefined {
  return state.projects.find((p) => p.id === id);
}

export function projectsByIds(state: StoreState, ids: string[]): Project[] {
  return ids.map((id) => projectById(state, id)).filter((p): p is Project => Boolean(p));
}

/** The employee record behind the signed-in portal, matched by name. */
export function employeeByName(state: StoreState, name: string): Employee | undefined {
  return state.employees.find((e) => e.name === name);
}

/* ---------------------------------------------------------- relations -- */

export function tasksForProject(state: StoreState, projectId: string): Task[] {
  return state.tasks.filter((t) => t.projectIds.includes(projectId));
}

export function tasksForEmployee(state: StoreState, employeeId: string): Task[] {
  return state.tasks.filter((t) => t.assignedTo.includes(employeeId));
}

export function projectsForEmployee(state: StoreState, employeeId: string): Project[] {
  return state.projects.filter(
    (p) => p.assignedEmployees.includes(employeeId) || p.reportTo.includes(employeeId),
  );
}

/** Employees on a project, work roster first, then anyone it reports into. */
export function projectPeople(state: StoreState, project: Project) {
  return {
    team: employeesByIds(state, project.assignedEmployees),
    reports: employeesByIds(state, project.reportTo),
  };
}

/* ------------------------------------------------------------- progress -- */

/**
 * A project's progress is the mean score of its tasks — not a stored number.
 * Ticking a checklist line moves the project bar, which is the whole point of
 * scoring at the checklist level.
 */
export function projectProgress(state: StoreState, projectId: string): number {
  const tasks = tasksForProject(state, projectId);
  if (tasks.length === 0) return 0;
  return Math.round(tasks.reduce((n, t) => n + taskScore(t), 0) / tasks.length);
}

export function statusCounts(tasks: Task[]): Record<TaskStatus, number> {
  const out = { New: 0, Backlog: 0, "In Progress": 0, "In Review": 0, Done: 0 };
  for (const t of tasks) out[t.status] += 1;
  return out;
}

/** Rough per-person load — how much open work is assigned right now. */
export function openTaskCount(state: StoreState, employeeId: string): number {
  return tasksForEmployee(state, employeeId).filter((t) => t.status !== "Done").length;
}

/* ----------------------------------------------------------------- time -- */

/** "just now" / "40 min ago" / "3 hrs ago" / "2 days ago" / a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.floor((now.getTime() - then) / 60000);

  if (mins < 0) return formatDate(iso.slice(0, 10));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso.slice(0, 10));
}

/** Whole days between two inclusive ISO dates. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/* ---------------------------------------------------------------- leave -- */

/**
 * Hours between raising the request and the leave starting.
 *
 * Measured to midnight at the start of the first day off, so a request filed
 * mid-morning for tomorrow gives well under 24 hours of notice, not 24.
 *
 * `from` is a bare date and parses as local midnight, while `requestedAt` is an
 * absolute instant — deliberately, since a day off starts when it starts for
 * the person taking it. The consequence is that the figure is computed in the
 * viewer's timezone, which is right for a single-office demo and would need an
 * explicit employee timezone if the roster ever spanned regions.
 */
export function noticeHours(request: LeaveRequest): number {
  const raised = new Date(request.requestedAt).getTime();
  const starts = new Date(`${request.from}T00:00:00`).getTime();
  if (Number.isNaN(raised) || Number.isNaN(starts)) return 0;
  return (starts - raised) / 3600000;
}

export function isShortNotice(request: LeaveRequest): boolean {
  return noticeHours(request) < SHORT_NOTICE_HOURS;
}

/** "15h" / "8 days" — the number behind the notice flag. */
export function noticeLabel(request: LeaveRequest): string {
  const hrs = noticeHours(request);
  if (hrs < 0) return "started already";
  if (hrs < 48) return `${Math.round(hrs)}h before start`;
  return `${Math.round(hrs / 24)} days before start`;
}

export function leaveForEmployee(state: StoreState, employeeId: string): LeaveRequest[] {
  return state.leaveRequests.filter((l) => l.employeeId === employeeId);
}

export function pendingLeave(state: StoreState): LeaveRequest[] {
  return state.leaveRequests.filter((l) => l.status === "Pending");
}

/** Allowance minus days already approved, per type. */
export function leaveBalance(state: StoreState, employeeId: string) {
  return LEAVE_TYPES.map((type) => {
    const used = leaveForEmployee(state, employeeId)
      .filter((l) => l.type === type && l.status === "Approved")
      .reduce((n, l) => n + l.days, 0);
    const total = LEAVE_ALLOWANCE[type];
    return { type, used, total, left: Math.max(0, total - used), tone: LEAVE_TYPE_TONE[type] };
  });
}

/** Who a leave request goes to: managers, plus the two admin portals. */
export function leaveApprovers(state: StoreState): Employee[] {
  return state.employees.filter(
    (e) => e.role === "Manager" || e.portal === "master-portal" || e.portal === "super-admin",
  );
}

/** Whether the signed-in person may approve or reject. */
export function canApproveLeave(employee: Employee | undefined, portal: string): boolean {
  if (portal === "master-portal" || portal === "super-admin") return true;
  return employee?.role === "Manager";
}

/* --------------------------------------------------------- branch scope -- */

/*
 * The default-branch filter.
 *
 * When an admin pins a branch, every module that counts people or their work
 * narrows to that office. Projects and tasks have no branch of their own, so
 * they inherit one: a project belongs to a branch if anyone on it works there,
 * and a task belongs if any assignee does. That keeps a London manager's view
 * of a shared project intact rather than hiding it because the build team sits
 * in Kochi.
 */

export function branchOf(state: StoreState): string | null {
  return state.settings.defaultBranch ?? null;
}

export function scopedEmployees(state: StoreState): Employee[] {
  const branch = branchOf(state);
  return branch ? state.employees.filter((e) => e.branch === branch) : state.employees;
}

function idsInBranch(state: StoreState): Set<string> | null {
  const branch = branchOf(state);
  if (!branch) return null;
  return new Set(state.employees.filter((e) => e.branch === branch).map((e) => e.id));
}

export function scopedProjects(state: StoreState): Project[] {
  const ids = idsInBranch(state);
  if (!ids) return state.projects;
  return state.projects.filter(
    (p) =>
      p.assignedEmployees.some((id) => ids.has(id)) || p.reportTo.some((id) => ids.has(id)),
  );
}

export function scopedTasks(state: StoreState): Task[] {
  const ids = idsInBranch(state);
  if (!ids) return state.tasks;
  return state.tasks.filter((t) => t.assignedTo.some((id) => ids.has(id)));
}

export function scopedLeave(state: StoreState): LeaveRequest[] {
  const ids = idsInBranch(state);
  if (!ids) return state.leaveRequests;
  return state.leaveRequests.filter((l) => ids.has(l.employeeId));
}

export function scopedClock(state: StoreState): ClockEntry[] {
  const ids = idsInBranch(state);
  if (!ids) return state.clockEntries;
  return state.clockEntries.filter((c) => ids.has(c.employeeId));
}

/** Only the admin portals may pin a branch for everyone. */
export function canSetDefaultBranch(portal: string): boolean {
  return portal === "master-portal" || portal === "super-admin";
}

/* ---------------------------------------------------------------- clock -- */

export function clockFor(state: StoreState, employeeId: string): ClockEntry[] {
  return state.clockEntries
    .filter((c) => c.employeeId === employeeId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The shift someone is currently in, if any. */
export function openShift(state: StoreState, employeeId: string): ClockEntry | undefined {
  return state.clockEntries.find((c) => c.employeeId === employeeId && !c.outAt);
}

/** Minutes worked, net of breaks. Counts up to now while the shift is open. */
export function shiftMinutes(entry: ClockEntry, now: number): number {
  const start = new Date(entry.inAt).getTime();
  const end = entry.outAt ? new Date(entry.outAt).getTime() : now;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.max(0, Math.round((end - start) / 60000) - entry.breakMinutes);
}

/** 512 -> "8h 32m". */
export function formatMinutes(total: number): string {
  const h = Math.floor(Math.max(0, total) / 60);
  const m = Math.max(0, total) % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Clock time from an ISO datetime, e.g. "09:04". Local, matching the row. */
export function clockTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Everyone's most recent shift, for the admin roster. */
export function latestShifts(state: StoreState): { employee: Employee; entry?: ClockEntry }[] {
  return scopedEmployees(state).map((employee) => ({
    employee,
    entry: clockFor(state, employee.id)[0],
  }));
}

/* ----------------------------------------------------------------- plan -- */

/** Share of a project's milestones that are done. */
export function planProgress(project: Project): number {
  if (project.plan.length === 0) return 0;
  const done = project.plan.filter((m) => m.status === "Done").length;
  return Math.round((done / project.plan.length) * 100);
}

/** Plan steps in date order — the plan is a sequence, not a set. */
export function orderedPlan(project: Project): Milestone[] {
  return [...project.plan].sort((a, b) => a.due.localeCompare(b.due));
}

/** Projects belonging to one client account. */
export function projectsForClient(state: StoreState, clientId: string): Project[] {
  return state.projects.filter((p) => p.clientId === clientId);
}

/* -------------------------------------------------------------- secrets -- */

/** Secrets bucketed by environment, in SECRET_ENVS order. */
export function secretsByEnv(project: Project) {
  return SECRET_ENVS.map((env) => ({
    env,
    file: SECRET_ENV_FILE[env],
    entries: project.secrets.filter((s) => s.env === env),
  })).filter((g) => g.entries.length > 0);
}

/** The vault is for staff who run deployments — never for the client portal. */
export function canSeeSecrets(employee: Employee | undefined, portal: string): boolean {
  if (portal === "client") return false;
  if (portal === "master-portal" || portal === "super-admin") return true;
  return employee?.role === "Manager" || employee?.role === "Team Leader";
}

/** Renders a group back into the file it came from. */
export function toEnvFile(entries: SecretEntry[]): string {
  return entries.map((s) => `${s.key}=${s.value}`).join("\n");
}

/* ------------------------------------------------------------------ bugs -- */

/** Defects live as tasks; this is how both modules agree on which ones. */
export function bugTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.origin?.kind === "qc-bug");
}

/* -------------------------------------------------- clients and leads -- */

export function clientById(state: StoreState, id?: string): Client | undefined {
  return id ? state.clients.find((c) => c.id === id) : undefined;
}

export const nextClientCode = (clients: Client[]) => nextCode(clients.map((c) => c.id), "CL", 2);

export const nextLeadCode = (leads: Lead[]) => nextCode(leads.map((l) => l.code), "LD", 3);

/** Pipeline value, and the same figure weighted by stage probability. */
export function pipelineValue(leads: Lead[]) {
  const open = leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  return {
    open: open.reduce((n, l) => n + l.value, 0),
    weighted: Math.round(open.reduce((n, l) => n + l.value * LEAD_STAGE_WEIGHT[l.stage], 0)),
    won: leads.filter((l) => l.stage === "Won").reduce((n, l) => n + l.value, 0),
  };
}

/** Closed deals as a share of everything that reached a decision. */
export function winRate(leads: Lead[]): number {
  const decided = leads.filter((l) => l.stage === "Won" || l.stage === "Lost").length;
  if (decided === 0) return 0;
  return Math.round((leads.filter((l) => l.stage === "Won").length / decided) * 100);
}

/*
 * Money is stored as a number and only formatted at the edge.
 *
 * `currency` is the ISO 4217 code of the branch the workspace is scoped to, and
 * comes from settings.currency. The locale is pinned to en-US rather than the
 * viewer's, deliberately: the server and the browser must produce the same
 * string or the markup mismatches on hydration.
 *
 * Falls back to plain dollars when there is no currency — an unscoped group can
 * span three of them, and picking one would be worse than not saying.
 */
export function money(n: number, currency?: string | null): string {
  if (!currency) return `$${n.toLocaleString("en-US")}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // An unknown code would throw a RangeError and take the page with it.
    return `${currency} ${n.toLocaleString("en-US")}`;
  }
}

/** Compact form for stat tiles: $412k, ₹1.24m. */
export function moneyShort(n: number, currency?: string | null): string {
  const unit = n >= 1_000_000 ? "m" : n >= 1_000 ? "k" : "";
  const scaled = n >= 1_000_000 ? Number((n / 1_000_000).toFixed(2)) : n >= 1_000 ? Math.round(n / 1_000) : n;

  if (!currency) return `$${scaled}${unit}`;
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: n >= 1_000_000 ? 2 : 0,
    }).format(scaled);
    return `${formatted}${unit}`;
  } catch {
    return `${currency} ${scaled}${unit}`;
  }
}

/**
 * Projects the signed-in portal is allowed to see.
 *
 * The branch scope narrows staff to one office; the client portal is narrowed
 * to its own account instead. Without this a client signing in would see every
 * other client's engagements in Project Management — the modules are granted
 * per portal, but the rows inside them were not filtered.
 */
export function visibleProjects(state: StoreState, portal: string, clientId?: string): Project[] {
  if (portal === "client") return clientId ? projectsForClient(state, clientId) : [];
  return scopedProjects(state);
}

/* -------------------------------------------------------------- calendar -- */

export function eventsOn(state: StoreState, date: string): CalendarEvent[] {
  return state.calendarEvents
    .filter((e) => e.date === date)
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
}

export function eventsInMonth(state: StoreState, year: number, month: number): CalendarEvent[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return state.calendarEvents.filter((e) => e.date.startsWith(prefix));
}

/**
 * Everything that happened on one day, assembled from the records themselves.
 *
 * Nothing here is a separate activity log — it is the tasks, reviews, leave and
 * attendance already in the store, filtered to a date. That means it can never
 * drift from what the modules show, and it needs no extra writes on every
 * mutation.
 */
export function dayActivity(state: StoreState, date: string) {
  const created = state.tasks.filter((t) => t.createdAt === date);

  const updates = state.tasks.flatMap((task) =>
    task.updatedBy.filter((u) => u.at === date).map((u) => ({ task, update: u })),
  );

  const reviews = state.tasks.flatMap((task) =>
    task.qcReviews.filter((r) => r.at.slice(0, 10) === date).map((r) => ({ task, review: r })),
  );

  // A KRA drop is always the consequence of a QC error, so it is read off the
  // review rather than tracked separately.
  const kraDrops = reviews.flatMap(({ task, review }) =>
    review.affected.map((a) => ({
      task,
      employee: employeeById(state, a.employeeId),
      from: a.from,
      to: a.to,
    })),
  );

  // "Completed" means QC signed it off that day — the point at which work is
  // actually finished, not the moment someone dragged a card.
  const completed = reviews.filter((r) => r.review.verdict === "Approved");

  const leave = state.leaveRequests.flatMap((request) =>
    request.history
      .filter((h) => h.at.slice(0, 10) === date)
      .map((event) => ({ request, event })),
  );

  const clockedIn = state.clockEntries.filter((c) => c.date === date);

  const milestones = state.projects.flatMap((project) =>
    project.plan.filter((m) => m.due === date).map((milestone) => ({ project, milestone })),
  );

  return {
    date,
    events: eventsOn(state, date),
    created,
    updates,
    reviews,
    completed,
    kraDrops,
    leave,
    clockedIn,
    milestones,
    /** Whether the day has anything worth opening. */
    get isEmpty() {
      return (
        this.events.length === 0 &&
        created.length === 0 &&
        updates.length === 0 &&
        reviews.length === 0 &&
        leave.length === 0 &&
        clockedIn.length === 0 &&
        milestones.length === 0
      );
    },
  };
}

/** Small count used to dot a day cell in the month grid. */
export function dayActivityCount(state: StoreState, date: string): number {
  const a = dayActivity(state, date);
  return (
    a.events.length +
    a.created.length +
    a.updates.length +
    a.reviews.length +
    a.leave.length +
    a.milestones.length
  );
}

/* -------------------------------------------------------- notifications -- */

/** One person's notifications, newest first. */
export function notificationsFor(state: StoreState, employeeId: string): Notification[] {
  return state.notifications
    .filter((n) => n.to === employeeId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function unreadCount(state: StoreState, employeeId: string): number {
  return state.notifications.filter((n) => n.to === employeeId && !n.read).length;
}
