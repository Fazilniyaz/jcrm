import type { Tone } from "@/lib/ui/tone";
import type { PortalSlug } from "@/lib/portals";

/*
 * The editable half of the product. Projects, Tasks and Employees are the three
 * modules the user drives; everything else in the app is still static demo data.
 *
 * Records reference each other by `id` (an opaque string), never by name — a
 * rename must never orphan a relation. The human-facing codes (`empId`, `code`,
 * `taskId`) are separate, editable, and only ever shown, never joined on.
 */

/* ------------------------------------------------------------- employees -- */

/*
 * "Super Admin" is appended rather than inserted, and is deliberately NOT in
 * `ASSIGNABLE_ROLES`: it is a role someone HAS, never one you give them from
 * the employee form. The company owner gets it at creation and nothing in the
 * UI hands it out.
 */
export const EMPLOYEE_ROLES = [
  "Manager",
  "Team Leader",
  "Developer",
  "QC",
  "Sales",
  "Super Admin",
] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

/** What the Add/Edit employee form offers. */
export const ASSIGNABLE_ROLES = EMPLOYEE_ROLES.filter((r) => r !== "Super Admin");

export const EMPLOYEE_STATUSES = ["Idle", "Work Assigned", "Break", "Leave"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/**
 * Whether the ACCOUNT can be signed into — not what the person is doing today.
 *
 * Distinct from `EmployeeStatus`, which is availability. A new joiner is
 * `Invited` from the moment they are created until they follow the emailed link
 * and set a password, at which point they become `Active`. `Disabled` is an
 * account that exists but has been switched off.
 */
export const ACCOUNT_STATES = ["Invited", "Active", "Disabled"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export type Employee = {
  id: string;
  /** Human-facing badge number, e.g. JDX-041. Auto or manual, see settings. */
  empId: string;
  name: string;
  email: string;
  phone: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  /** Starts at 100 on create; adjusted by whoever runs the review. */
  kraScore: number;
  /** Joined date, ISO yyyy-mm-dd. */
  createdAt: string;
  branch: string;
  /** Set when this person also has a portal login. */
  portal?: PortalSlug;
  tone: Tone;
  /**
   * The company owner. Their row is read-only — no edit, no delete — and they
   * are never offered as a project assignee. Absent for the demo store.
   */
  isOwner?: boolean;
  /**
   * Whether this person can sign in yet. Absent in the demo store, where nobody
   * signs in at all; the roster treats absent as `Active` so the seeded
   * workspace does not read as fourteen people who never accepted.
   */
  accountState?: AccountState;
  /** An invite is outstanding — sent, and not yet accepted. */
  invitePending?: boolean;
  /** That outstanding invite has passed its expiry and needs re-sending. */
  inviteExpired?: boolean;
};

/* -------------------------------------------------------------- projects -- */

export const PROJECT_STATUSES = [
  "Planning",
  "On Track",
  "At Risk",
  "Delayed",
  "Delivered",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  /** Human-facing code, e.g. PRJ-101. */
  code: string;
  name: string;
  description: string;
  /** Display name, kept for search and for projects with no linked account. */
  client: string;
  /** Id of the client record this belongs to — how the client portal finds it. */
  clientId?: string;
  problemStatement: string;
  solution: string;
  startDate: string;
  endDate?: string;
  /** Employee ids doing the work. */
  assignedEmployees: string[];
  /** Employee ids this project reports into — managers, leads, QC. */
  reportTo: string[];
  status: ProjectStatus;
  /** Client-facing delivery plan, ordered by due date. */
  plan: Milestone[];
  /** Configuration values for this project. Never shown to the client. */
  secrets: SecretEntry[];
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------- clients -- */

export const CLIENT_STATUSES = ["Active", "Onboarding", "Dormant"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/**
 * An account we deliver for.
 *
 * Projects reference this by id, and the client portal signs in against one —
 * which is what makes Monitor show a client their own plan and nobody else's.
 */
export type Client = {
  id: string;
  /**
   * Human-facing code, e.g. CL-01.
   *
   * Separate from `id` since the accounts moved to the API: the id is now an
   * opaque database key that must never be shown, and this is what a person
   * reads. Absent in the demo store, where the id WAS the code.
   */
  code?: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  industry: string;
  /** Lifetime value, stored as a number so it can be summed. */
  value: number;
  since: string;
  status: ClientStatus;
  notes?: string;
  tone: Tone;
  /** The portal that signs in as this account, when it has one. */
  portal?: PortalSlug;
  createdAt: string;
};

export const CLIENT_STATUS_TONE: Record<ClientStatus, Tone> = {
  Active: "sky",
  Onboarding: "orange",
  Dormant: "slate",
};

/* ---------------------------------------------------------------- leads -- */

export const LEAD_STAGES = ["New", "Qualified", "Proposal", "Won", "Lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = ["Referral", "Website", "Outbound", "Event"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type Lead = {
  id: string;
  code: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  /** Numeric so the pipeline can be totalled and weighted. */
  value: number;
  stage: LeadStage;
  source: LeadSource;
  /** Employee id of the sales owner. */
  ownerId: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Set once a won lead has been converted into a client account. */
  clientId?: string;
};

export const LEAD_STAGE_TONE: Record<LeadStage, Tone> = {
  New: "slate",
  Qualified: "blue",
  Proposal: "orange",
  Won: "sky",
  Lost: "red",
};

/** Rough probability per stage, used for the weighted pipeline figure. */
export const LEAD_STAGE_WEIGHT: Record<LeadStage, number> = {
  New: 0.1,
  Qualified: 0.3,
  Proposal: 0.6,
  Won: 1,
  Lost: 0,
};

/* -------------------------------------------------------------- calendar -- */

export const CALENDAR_KINDS = [
  "Standup",
  "Demo",
  "Deadline",
  "Release",
  "Event",
  "Holiday",
] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO date. */
  date: string;
  /** 24-hour "13:00". Absent for all-day entries. */
  time?: string;
  kind: CalendarKind;
  projectId?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
};

export const CALENDAR_KIND_TONE: Record<CalendarKind, Tone> = {
  Standup: "blue",
  Demo: "sky",
  Deadline: "red",
  Release: "orange",
  Event: "blue",
  Holiday: "slate",
};

/* -------------------------------------------------------- project plan -- */

export const MILESTONE_STATUSES = ["Planned", "In Progress", "Done", "Delayed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/**
 * One step in the delivery plan — a sprint, a hand-off, a go-live.
 *
 * This is the only part of a project the client is shown, so the wording is
 * client-facing by design: no internal task ids, no assignee names.
 */
export type Milestone = {
  id: string;
  label: string;
  due: string;
  status: MilestoneStatus;
  note?: string;
};

export const MILESTONE_TONE: Record<MilestoneStatus, Tone> = {
  Planned: "slate",
  "In Progress": "blue",
  Done: "sky",
  Delayed: "red",
};

/* ------------------------------------------------------------- secrets -- */

export const SECRET_ENVS = ["local", "development", "staging", "production"] as const;
export type SecretEnv = (typeof SECRET_ENVS)[number];

/**
 * A configuration value kept against a project, in the shape a `.env` file
 * would hold it.
 *
 * SECURITY: this is a frontend-only demo, so these live in localStorage in
 * plain text — readable by any script on the page and written to disk. Treat
 * the vault as a convenience for placeholder and non-production values, and
 * move it behind a real secret store before anything sensitive goes in.
 */
export type SecretEntry = {
  id: string;
  key: string;
  value: string;
  env: SecretEnv;
  note?: string;
  updatedAt: string;
  updatedBy: string;
};

export const SECRET_ENV_TONE: Record<SecretEnv, Tone> = {
  local: "slate",
  development: "blue",
  staging: "orange",
  production: "red",
};

/** The file each environment maps to, shown in the vault and used on export. */
export const SECRET_ENV_FILE: Record<SecretEnv, string> = {
  local: ".env.local",
  development: ".env.development",
  staging: ".env.staging",
  production: ".env.production",
};

/* ------------------------------------------------------------- clocking -- */

export const CLOCK_STATUSES = ["Running", "Complete", "Overtime"] as const;
export type ClockStatus = (typeof CLOCK_STATUSES)[number];

/** One person's attendance for one day. `outAt` is absent while still in. */
export type ClockEntry = {
  id: string;
  employeeId: string;
  /** ISO date, the day the shift belongs to. */
  date: string;
  /** ISO datetimes. */
  inAt: string;
  outAt?: string;
  /** Minutes on break, subtracted from the worked total. */
  breakMinutes: number;
  status: ClockStatus;
};

export const CLOCK_STATUS_TONE: Record<ClockStatus, Tone> = {
  Running: "blue",
  Complete: "sky",
  Overtime: "orange",
};

/** A day over this is flagged as overtime. */
export const STANDARD_DAY_MINUTES = 8 * 60;

/* ----------------------------------------------------------------- tasks -- */

export const TASK_STATUSES = ["New", "Backlog", "In Progress", "In Review", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * One subtask — a single unit of acceptance under a task.
 *
 * Two separate numbers, deliberately:
 *   score  — the ACCEPTANCE SCORE, 0 → 1 in tenths. How far along this subtask
 *            is, and what rolls up into the parent task's completion.
 *   points — what this subtask is worth. Only used when QC rejects it, at which
 *            point the points come off every assignee's KRA.
 *
 * A subtask can be fully scored and still be worth points: `score` is the
 * employee's claim, `points` is what it costs if QC disagrees.
 */
export type Subtask = { id: string; label: string; score: number; points: number };

/**
 * The old name for a Subtask.
 *
 * Retained as an alias because the API still calls this field `checklist` on
 * the wire — renaming it there would break a deployed contract for a word. The
 * product says "subtask" everywhere a person can read it; `Subtask` is the name
 * to use in new code.
 */
export type ChecklistItem = Subtask;

/** An entry in a task's audit trail. */
export type TaskUpdate = { id: string; at: string; by: string; summary: string };

/* -------------------------------------------------------------- QC review -- */

export const QC_VERDICTS = ["Approved", "Corrections", "Error"] as const;
export type QcVerdict = (typeof QC_VERDICTS)[number];

/**
 * A QC pass over a finished task.
 *
 * Append-only. `affected` records the KRA move per person at the time of the
 * review, so the history stays true even if someone's score is edited later.
 */
export type QcReview = {
  id: string;
  at: string;
  by: string;
  verdict: QcVerdict;
  note?: string;
  /** Checklist lines QC marked as not satisfying. */
  failedItemIds: string[];
  /** Sum of the failed lines' points. Zero unless the verdict is Error. */
  pointsDeducted: number;
  affected: { employeeId: string; from: number; to: number }[];
};

export const QC_VERDICT_TONE: Record<QcVerdict, Tone> = {
  Approved: "sky",
  Corrections: "orange",
  Error: "red",
};

/** What each verdict does, shown in the review panel before it is committed. */
export const QC_VERDICT_EFFECT: Record<QcVerdict, string> = {
  Approved: "Signs the task off. Nothing moves, nobody loses KRA.",
  Corrections: "Sends the task back to In Progress. No KRA deduction.",
  Error: "Sends the task back to In Progress and deducts the flagged points from every assignee's KRA.",
};

export type Task = {
  id: string;
  /** Human-facing code, e.g. TSK-412. */
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** 1 is done first. See PRIORITIES for the labels. */
  priority: number;
  /** A task can serve more than one project. */
  projectIds: string[];
  assignedTo: string[];
  reportTo: string[];
  createdBy: string;
  createdAt: string;
  /** Append-only audit trail, newest last. */
  updatedBy: TaskUpdate[];
  /** Append-only QC history, newest last. Drives the rework count. */
  qcReviews: QcReview[];
  checklist: ChecklistItem[];
  startDate: string;
  endDate?: string;
  /** Optional pull-request link. */
  prUrl?: string;
  /** Set when the task came from somewhere other than the task form. */
  origin?: TaskOrigin;
};

export const BUG_SEVERITIES = ["Critical", "Major", "Minor"] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

/**
 * Where a task came from.
 *
 * A defect raised in Proposed Bugs becomes a real task rather than living in a
 * parallel list — it needs an assignee, a checklist and a QC pass like any
 * other work. This marks it so both modules can tell it apart.
 */
export type TaskOrigin = {
  kind: "qc-bug";
  severity: BugSeverity;
  raisedBy: string;
  /** Where the defect was seen. */
  foundIn?: string;
};

export const BUG_SEVERITY_TONE: Record<BugSeverity, Tone> = {
  Critical: "red",
  Major: "orange",
  Minor: "slate",
};

/* --------------------------------------------------------------- leave -- */

export const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Withdrawn"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/**
 * One entry in a request's trail.
 *
 * Withdrawing and reverting a decision are recorded rather than erased: a
 * request that was approved and then pulled is a different thing from one that
 * never existed, and the manager who approved it should still be able to see
 * that they did.
 */
export type LeaveEvent = {
  id: string;
  at: string;
  by: string;
  action: "Raised" | "Approved" | "Rejected" | "Withdrawn" | "Reopened" | "Decision undone";
  note?: string;
};

export const LEAVE_EVENT_TONE: Record<LeaveEvent["action"], Tone> = {
  Raised: "blue",
  Approved: "sky",
  Rejected: "red",
  Withdrawn: "slate",
  Reopened: "blue",
  "Decision undone": "orange",
};

/** Days per type, per year. Unpaid is capped rather than budgeted. */
export const LEAVE_ALLOWANCE: Record<LeaveType, number> = {
  Annual: 24,
  Sick: 12,
  Casual: 10,
  Unpaid: 30,
};

/**
 * Notice below which a request is flagged as short.
 *
 * Measured from when the request was raised to midnight at the start of the
 * first day off — which is why `requestedAt` is a full timestamp and `from` is
 * only a date.
 */
export const SHORT_NOTICE_HOURS = 24;

export type LeaveRequest = {
  id: string;
  /** Human-facing code, e.g. LV-311. */
  code: string;
  employeeId: string;
  type: LeaveType;
  /** Inclusive ISO dates. */
  from: string;
  to: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  /** ISO datetime — the hours matter for the short-notice flag. */
  requestedAt: string;
  /** Cleared when a decision is undone — the trail keeps the record. */
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
  /** Append-only, oldest first. Always opens with a "Raised" entry. */
  history: LeaveEvent[];
};

export const LEAVE_STATUS_TONE: Record<LeaveStatus, Tone> = {
  Pending: "orange",
  Approved: "sky",
  Rejected: "red",
  Withdrawn: "slate",
};

export const LEAVE_TYPE_TONE: Record<LeaveType, Tone> = {
  Annual: "blue",
  Sick: "orange",
  Casual: "sky",
  Unpaid: "slate",
};

/* -------------------------------------------------------- notifications -- */

export const NOTIFICATION_KINDS = [
  "task-assigned",
  "qc-approved",
  "qc-corrections",
  "qc-error",
  "leave-requested",
  "leave-approved",
  "leave-rejected",
  "leave-withdrawn",
  "leave-reopened",
  "calendar-event",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * A message addressed to one person.
 *
 * Notifications are never broadcast: every one names a single recipient by
 * employee id, and the module only ever shows the signed-in portal's own. An
 * event affecting three assignees writes three rows.
 */
export type Notification = {
  id: string;
  /** Employee id this is for. */
  to: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** ISO datetime, so the list can read "40 min ago". */
  at: string;
  read: boolean;
  /** Context for the reader; not a link target in this build. */
  taskId?: string;
  leaveId?: string;
};

export const NOTIFICATION_TONE: Record<NotificationKind, Tone> = {
  "task-assigned": "blue",
  "qc-approved": "sky",
  "qc-corrections": "orange",
  "qc-error": "red",
  "leave-requested": "orange",
  "leave-approved": "sky",
  "leave-rejected": "red",
  "leave-withdrawn": "slate",
  "leave-reopened": "orange",
  "calendar-event": "blue",
};

/* -------------------------------------------------------------- settings -- */

export type WorkspaceSettings = {
  /** On: employee IDs are generated from the highest existing number. */
  autoEmployeeId: boolean;
  /**
   * Branch the workspace is scoped to, by branch name. Null is the whole group.
   *
   * Set by an admin portal from the Branches module and applied everywhere that
   * counts people or their work, so the numbers on every module describe the
   * same office. A banner states it wherever it is in force — silently showing
   * two of fourteen employees would just read as a bug.
   */
  defaultBranch: string | null;
  /**
   * ISO 4217 code of the branch in force, when the workspace is scoped to one.
   *
   * Null for the demo store and for an unscoped group view — a company spanning
   * three currencies has no single one to report in, and `money()` falls back
   * to its plain dollar formatting rather than picking one and being wrong.
   */
  currency?: string | null;
};

export type StoreState = {
  employees: Employee[];
  projects: Project[];
  tasks: Task[];
  leaveRequests: LeaveRequest[];
  notifications: Notification[];
  clockEntries: ClockEntry[];
  clients: Client[];
  leads: Lead[];
  calendarEvents: CalendarEvent[];
  settings: WorkspaceSettings;
};

/* ----------------------------------------------------------------- tones -- */
/* Explicit maps rather than statusTone()'s regex: these vocabularies are closed,
   so the mapping should be exhaustive and checked by the compiler. */

export const EMPLOYEE_STATUS_TONE: Record<EmployeeStatus, Tone> = {
  Idle: "slate",
  "Work Assigned": "blue",
  Break: "orange",
  Leave: "red",
};

export const ACCOUNT_STATE_TONE: Record<AccountState, Tone> = {
  Invited: "orange",
  Active: "sky",
  Disabled: "red",
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  Planning: "slate",
  "On Track": "blue",
  "At Risk": "orange",
  Delayed: "red",
  Delivered: "sky",
};

export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  New: "slate",
  Backlog: "slate",
  "In Progress": "blue",
  "In Review": "orange",
  Done: "sky",
};

export const ROLE_TONE: Record<EmployeeRole, Tone> = {
  Manager: "blue",
  "Team Leader": "sky",
  Developer: "slate",
  QC: "orange",
  Sales: "red",
  "Super Admin": "blue",
};

export const PRIORITIES = [
  { value: 1, label: "P1 — Do first", short: "P1", tone: "red" as Tone },
  { value: 2, label: "P2 — High", short: "P2", tone: "orange" as Tone },
  { value: 3, label: "P3 — Normal", short: "P3", tone: "blue" as Tone },
  { value: 4, label: "P4 — Low", short: "P4", tone: "sky" as Tone },
  { value: 5, label: "P5 — Whenever", short: "P5", tone: "slate" as Tone },
];

export function priorityMeta(value: number) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[2];
}
