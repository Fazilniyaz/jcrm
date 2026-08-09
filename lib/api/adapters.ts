import type {
  AccountState,
  ChecklistItem,
  Client as UiClient,
  Employee as UiEmployee,
  EmployeeRole,
  EmployeeStatus,
  Milestone,
  MilestoneStatus,
  Project as UiProject,
  ProjectStatus,
  QcReview as UiQcReview,
  SecretEntry as UiSecret,
  Task as UiTask,
  TaskStatus,
} from "@/lib/store/types";
import type { Tone } from "@/lib/ui/tone";
import type {
  Client as ApiClient,
  Employee as ApiEmployee,
  Project as ApiProject,
  ProjectStateApi,
  Role,
  SecretEntry as ApiSecret,
  Task as ApiTask,
  TaskStateApi,
} from "./types";

/*
 * The seam between the API and the UI.
 *
 * The modules render lib/store/types.ts and were not rewritten — the brief is
 * the exact existing functionality — so everything the backend sends is
 * translated here and nowhere else. Each mapping is total and its inverse is
 * next to it, so a round trip through the API cannot quietly change a value.
 */

/* ----------------------------------------------------------------- dates -- */

/** ISO datetime -> the yyyy-mm-dd the UI formats. */
export const toDay = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "");
const toOptionalDay = (iso: string | null | undefined): string | undefined =>
  iso ? iso.slice(0, 10) : undefined;

/* ----------------------------------------------------------------- roles -- */

/**
 * Roles are a list on the server and a single label in the UI.
 *
 * Resolved by precedence rather than by taking roles[0], so someone who is both
 * a developer and a team leader reads as the more senior of the two — which is
 * how the roster and the approver checks already treat them.
 */
const ROLE_PRECEDENCE: [Role, EmployeeRole][] = [
  ["superAdmin", "Super Admin"],
  ["manager", "Manager"],
  ["teamLeader", "Team Leader"],
  ["qualityCheck", "QC"],
  ["sales", "Sales"],
  ["developer", "Developer"],
];

export function toUiRole(roles: Role[]): EmployeeRole {
  for (const [role, label] of ROLE_PRECEDENCE) if (roles.includes(role)) return label;
  return "Developer";
}

const UI_ROLE_TO_API: Record<EmployeeRole, Role> = {
  Manager: "manager",
  "Team Leader": "teamLeader",
  Developer: "developer",
  QC: "qualityCheck",
  Sales: "sales",
  // Present for completeness of the map only. The API refuses to grant
  // superAdmin through any endpoint, so this never travels.
  "Super Admin": "superAdmin",
};

export const toApiRoles = (role: EmployeeRole): Role[] => [UI_ROLE_TO_API[role]];

/**
 * The job title shown in the header for a signed-in account.
 *
 * The owner reads as "Super Admin" whatever else they also are — it is the
 * capability that matters, and it is the one they cannot be stripped of.
 */
export function roleLabelFor(user: { roles: Role[]; isOwner: boolean }): string {
  if (user.isOwner || user.roles.includes("superAdmin")) return "Super Admin";
  return toUiRole(user.roles);
}

/* -------------------------------------------------------------- statuses -- */

const STATUS_TO_UI: Record<ApiEmployee["currentStatus"], EmployeeStatus> = {
  idle: "Idle",
  workAssigned: "Work Assigned",
  break: "Break",
  leave: "Leave",
};

const STATUS_TO_API: Record<EmployeeStatus, ApiEmployee["currentStatus"]> = {
  Idle: "idle",
  "Work Assigned": "workAssigned",
  Break: "break",
  Leave: "leave",
};

export const toApiStatus = (status: EmployeeStatus) => STATUS_TO_API[status];

/* ------------------------------------------------------------- employees -- */

/**
 * The server's account lifecycle, in the UI's vocabulary.
 *
 * `invited` is the state every employee is created in — the row exists, the
 * password does not — and it holds until the emailed link is accepted.
 */
const ACCOUNT_STATE_TO_UI: Record<ApiEmployee["state"], AccountState> = {
  invited: "Invited",
  active: "Active",
  disabled: "Disabled",
};

export function toUiEmployee(employee: ApiEmployee): UiEmployee {
  return {
    id: employee.id,
    empId: employee.empId,
    name: employee.name,
    email: employee.email,
    phone: employee.phone ?? "",
    role: toUiRole(employee.roles),
    status: STATUS_TO_UI[employee.currentStatus],
    kraScore: employee.kra,
    createdAt: toDay(employee.joinedAt),
    branch: employee.branch ?? "",
    tone: employee.tone as Tone,
    isOwner: employee.isOwner,
    accountState: ACCOUNT_STATE_TO_UI[employee.state],
    invitePending: employee.invitePending,
    inviteExpired: employee.inviteExpired,
  };
}

/** UI record -> the create/update body. Only fields the UI actually edits. */
export function toApiEmployeeBody(patch: Partial<UiEmployee>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.empId !== undefined) body.empId = patch.empId;
  if (patch.phone !== undefined) body.phone = patch.phone;
  if (patch.role !== undefined) body.roles = toApiRoles(patch.role);
  if (patch.status !== undefined) body.currentStatus = toApiStatus(patch.status);
  if (patch.kraScore !== undefined) body.kra = patch.kraScore;
  // An empty branch is omitted, not sent. The form no longer asks for one, and
  // sending "" would read as "clear their branch" rather than "leave it to the
  // server", which places a new joiner in the hub currently in force.
  if (patch.branch) body.branch = patch.branch;
  if (patch.tone !== undefined) body.tone = patch.tone;
  return body;
}

/* --------------------------------------------------------------- clients -- */

const CLIENT_STATUS_TO_UI = {
  active: "Active",
  onboarding: "Onboarding",
  dormant: "Dormant",
} as const;

const CLIENT_STATUS_TO_API = {
  Active: "active",
  Onboarding: "onboarding",
  Dormant: "dormant",
} as const;

export function toUiClient(client: ApiClient): UiClient {
  return {
    // The UI id has to be the DATABASE id, because a project points at it. The
    // human-facing CL-01 travels separately as `code`.
    id: client.id,
    code: client.code,
    name: client.name,
    contact: client.contact,
    email: client.email,
    phone: client.phone ?? "",
    industry: client.industry ?? "—",
    value: client.value,
    since: client.since ?? "",
    status: CLIENT_STATUS_TO_UI[client.status],
    notes: client.notes ?? undefined,
    tone: client.tone as Tone,
    createdAt: toDay(client.createdAt),
  };
}

export function toApiClientBody(patch: Partial<UiClient>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.contact !== undefined) body.contact = patch.contact;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.phone !== undefined) body.phone = patch.phone;
  if (patch.industry !== undefined) body.industry = patch.industry === "—" ? "" : patch.industry;
  if (patch.value !== undefined) body.value = Math.round(patch.value);
  if (patch.since !== undefined) body.since = patch.since;
  if (patch.status !== undefined) body.status = CLIENT_STATUS_TO_API[patch.status];
  if (patch.notes !== undefined) body.notes = patch.notes ?? "";
  if (patch.tone !== undefined) body.tone = patch.tone;
  return body;
}

/* -------------------------------------------------------------- projects -- */

const PROJECT_STATE_TO_UI: Record<ProjectStateApi, ProjectStatus> = {
  planning: "Planning",
  active: "On Track",
  atRisk: "At Risk",
  delayed: "Delayed",
  // Neither of these has a UI label of its own; both read as work that has
  // stopped moving, which is what "At Risk" says on the board.
  onHold: "At Risk",
  cancelled: "At Risk",
  completed: "Delivered",
};

const PROJECT_STATE_TO_API: Record<ProjectStatus, ProjectStateApi> = {
  Planning: "planning",
  "On Track": "active",
  "At Risk": "atRisk",
  Delayed: "delayed",
  Delivered: "completed",
};

const MILESTONE_TO_UI: Record<string, MilestoneStatus> = {
  planned: "Planned",
  inProgress: "In Progress",
  done: "Done",
  delayed: "Delayed",
};

const MILESTONE_TO_API: Record<MilestoneStatus, string> = {
  Planned: "planned",
  "In Progress": "inProgress",
  Done: "done",
  Delayed: "delayed",
};

function toUiSecret(secret: ApiSecret): UiSecret {
  return {
    id: secret.id,
    key: secret.key,
    value: secret.value,
    env: secret.env,
    note: secret.note ?? undefined,
    updatedAt: toDay(secret.updatedAt),
    updatedBy: secret.updatedBy,
  };
}

export function toUiProject(project: ApiProject): UiProject {
  return {
    id: project.id,
    code: project.code ?? "",
    name: project.name,
    description: project.description ?? "",
    client: project.client ?? "",
    clientId: project.clientId ?? undefined,
    problemStatement: project.problemStatement ?? "",
    solution: project.solution ?? "",
    startDate: toDay(project.startDate),
    endDate: toOptionalDay(project.dueDate),
    assignedEmployees: project.assignedEmployees,
    reportTo: project.reportTo,
    status: PROJECT_STATE_TO_UI[project.state],
    plan: project.plan.map<Milestone>((m) => ({
      id: m.id,
      label: m.label,
      due: toDay(m.due),
      status: MILESTONE_TO_UI[m.status] ?? "Planned",
      note: m.note ?? undefined,
    })),
    secrets: (project.secrets ?? []).map(toUiSecret),
    createdAt: toDay(project.createdAt),
    updatedAt: toDay(project.updatedAt),
  };
}

export function toApiProjectBody(patch: Partial<UiProject>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.code !== undefined) body.code = patch.code;
  if (patch.client !== undefined) body.client = patch.client;
  if (patch.clientId !== undefined) body.clientId = patch.clientId;
  if (patch.problemStatement !== undefined) body.problemStatement = patch.problemStatement;
  if (patch.solution !== undefined) body.solution = patch.solution;
  if (patch.status !== undefined) body.state = PROJECT_STATE_TO_API[patch.status];
  if (patch.startDate) body.startDate = patch.startDate;
  if (patch.endDate) body.dueDate = patch.endDate;
  return body;
}

export function toApiPlan(plan: Milestone[]): Record<string, unknown>[] {
  return plan.map((m) => ({
    id: m.id,
    label: m.label,
    due: m.due,
    status: MILESTONE_TO_API[m.status] ?? "planned",
    note: m.note ?? "",
  }));
}

export function toApiSecrets(secrets: UiSecret[]): Record<string, unknown>[] {
  return secrets.map((s) => ({
    id: s.id,
    key: s.key,
    value: s.value,
    env: s.env,
    note: s.note ?? "",
  }));
}

/* ----------------------------------------------------------------- tasks -- */

const TASK_STATE_TO_UI: Record<TaskStateApi, TaskStatus> = {
  todo: "New",
  backlog: "Backlog",
  inProgress: "In Progress",
  inReview: "In Review",
  done: "Done",
  // Neither has a column of its own on the board; both are work that is open
  // and not currently moving.
  blocked: "Backlog",
  failed: "In Progress",
};

const TASK_STATE_TO_API: Record<TaskStatus, TaskStateApi> = {
  New: "todo",
  Backlog: "backlog",
  "In Progress": "inProgress",
  "In Review": "inReview",
  Done: "done",
};

/**
 * `nameOf` resolves an id to a display name.
 *
 * The API stores ids; the UI's Task carries `createdBy` and `qcReviews[].by` as
 * names because that is what it renders. The caller passes a lookup built from
 * the employee list rather than this module reaching for a store.
 */
export function toUiTask(task: ApiTask, nameOf: (id: string) => string): UiTask {
  return {
    id: task.id,
    taskId: task.taskCode ?? "",
    title: task.title,
    description: task.description ?? "",
    status: TASK_STATE_TO_UI[task.state],
    priority: task.priorityLevel,
    projectIds: task.projectIds,
    assignedTo: task.assigneeIds,
    reportTo: task.reportToIds,
    createdBy: nameOf(task.createdById),
    createdAt: toDay(task.createdAt),
    updatedBy: task.updates.map((u) => ({
      id: u.id,
      at: toDay(u.at),
      by: u.by,
      summary: u.summary,
    })),
    qcReviews: task.qcReviews.map<UiQcReview>((r) => ({
      id: r.id,
      at: toDay(r.at),
      by: r.by,
      verdict: r.verdict,
      note: r.note ?? undefined,
      failedItemIds: r.failedItemIds,
      pointsDeducted: r.pointsDeducted,
      affected: r.affected.map((a) => ({ employeeId: a.userId, from: a.from, to: a.to })),
    })),
    checklist: task.checklist.map<ChecklistItem>((c) => ({
      id: c.id,
      label: c.label,
      score: c.score,
      points: c.points,
    })),
    startDate: toDay(task.startDate) || toDay(task.createdAt),
    endDate: toOptionalDay(task.endDate ?? task.dueDate),
    prUrl: task.prUrl ?? undefined,
    origin: task.origin
      ? {
          kind: "qc-bug",
          severity: task.origin.severity,
          raisedBy: task.origin.raisedBy,
          foundIn: task.origin.foundIn ?? undefined,
        }
      : undefined,
  };
}

export function toApiTaskBody(patch: Partial<UiTask>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.taskId !== undefined) body.taskCode = patch.taskId;
  if (patch.status !== undefined) body.state = TASK_STATE_TO_API[patch.status];
  if (patch.priority !== undefined) body.priorityLevel = patch.priority;
  if (patch.projectIds !== undefined) body.projectIds = patch.projectIds;
  if (patch.assignedTo !== undefined) body.assigneeIds = patch.assignedTo;
  if (patch.reportTo !== undefined) body.reportToIds = patch.reportTo;
  if (patch.checklist !== undefined) {
    body.checklist = patch.checklist.map((c) => ({
      id: c.id,
      label: c.label,
      score: c.score,
      points: c.points,
    }));
  }
  if (patch.startDate) body.startDate = patch.startDate;
  if (patch.endDate) body.dueDate = patch.endDate;
  if (patch.prUrl !== undefined) body.prUrl = patch.prUrl ?? "";
  if (patch.origin !== undefined && patch.origin) {
    body.origin = {
      kind: "qc-bug",
      severity: patch.origin.severity,
      foundIn: patch.origin.foundIn ?? "",
    };
  }
  return body;
}
