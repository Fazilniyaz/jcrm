/*
 * The wire types — exactly what jadvix-backend returns.
 *
 * Kept separate from lib/store/types.ts on purpose: those describe what the UI
 * renders and have not changed, these describe what the API sends, and
 * lib/api/adapters.ts is the single seam between them. When one side gains a
 * field the other does not care about, only the adapter has to know.
 */

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string; code?: string }[] | unknown;
  };
};

export type Role =
  | "developer"
  | "sales"
  | "qualityCheck"
  | "manager"
  | "teamLeader"
  | "superAdmin"
  | "client"
  | "vendor";

export type EmpType = "employee" | "manager" | "admin";
export type EmpStatusApi = "fullTime" | "partTime" | "contractBased";
export type CurrentStatus = "idle" | "workAssigned" | "break" | "leave";
export type EntityState = "invited" | "active" | "disabled";
export type MemberRole = "manager" | "member";
export type MemberState = "invited" | "accepted" | "declined";

export type ProjectStateApi =
  | "planning"
  | "active"
  | "atRisk"
  | "delayed"
  | "onHold"
  | "completed"
  | "cancelled";

export type TaskStateApi =
  | "todo"
  | "backlog"
  | "inProgress"
  | "inReview"
  | "done"
  | "blocked"
  | "failed";

export type QcVerdictApi = "Approved" | "Corrections" | "Error";
export type ToneApi = "blue" | "sky" | "orange" | "red" | "slate";

/* ------------------------------------------------------------------ auth -- */

export type SessionUser = {
  id: string;
  companyId: string;
  company: { id: string; name: string; headBranch: string };
  name: string;
  email: string;
  empId: string;
  roles: Role[];
  empType: EmpType;
  empStatus: EmpStatusApi;
  currentStatus: CurrentStatus;
  isOwner: boolean;
  kra: number;
  openWork: number;
  branchId: string | null;
  phone: string | null;
  tone: ToneApi;
  modules: string[];
  moduleAccess: string[];
};

export type MasterSession = { email: string; name: string; modules: string[] };

export type LoginResponse = { user: SessionUser; accessToken: string };
export type MasterLoginResponse = { accessToken: string; master: MasterSession };
export type MeResponse =
  | { kind: "user"; user: SessionUser }
  | { kind: "master"; master: MasterSession };

/* ------------------------------------------------------------- companies -- */

export type Company = {
  id: string;
  companyName: string;
  companyAddress: string;
  linkedinProfile: string | null;
  companyWebsite: string;
  about: string;
  ownerName: string;
  email: string;
  headBranch: string;
  state: EntityState;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
  projectCount?: number;
  /** The head office's location, flattened off its Branch row. */
  headBranchCity: string | null;
  headBranchCountry: string | null;
  headBranchCurrency: string | null;
  headBranchCountryName: string | null;
  headBranchCurrencySymbol: string | null;
};

export type CompanyDetail = Company & {
  branches: {
    id: string;
    name: string;
    isHead: boolean;
    city: string | null;
    country: string | null;
    currency: string | null;
  }[];
  taskCount: number;
  owner: {
    id: string;
    name: string;
    email: string;
    empId: string;
    state: EntityState;
    inviteExpiresAt: string | null;
    invitePending: boolean;
    inviteExpired: boolean;
    lastLoginAt: string | null;
  } | null;
};

/**
 * `queued` means the invite was handed to the mail transport, not that it was
 * delivered — the API no longer holds the response open for an SMTP round trip.
 * False when mail is not configured, in which case `url` carries the link so
 * local development can still complete the flow.
 */
export type InviteResult = { queued: boolean; expiresAt: string; url?: string };

export type MasterDashboard = {
  counts: {
    total: number;
    active: number;
    invited: number;
    disabled: number;
    users: number;
    projects: number;
  };
  recent: Company[];
  pendingInvites: {
    userId: string;
    name: string;
    email: string;
    companyId: string;
    companyName: string;
    invitedAt: string;
    expiresAt: string | null;
    expired: boolean;
  }[];
};

/* ------------------------------------------------------------- employees -- */

export type Employee = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  empId: string;
  roles: Role[];
  empType: EmpType;
  empStatus: EmpStatusApi;
  currentStatus: CurrentStatus;
  kra: number;
  openWork: number;
  isOwner: boolean;
  state: EntityState;
  moduleAccess: string[];
  branchId: string | null;
  branch: string | null;
  branchIsHead: boolean;
  reportsToId: string | null;
  reportsTo: { id: string; name: string; empId: string } | null;
  phone: string | null;
  tone: ToneApi;
  joinedAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  inviteExpiresAt: string | null;
  invitePending: boolean;
  inviteExpired: boolean;
};

/**
 * One movement of someone's KRA score.
 *
 * Append-only and written in the same transaction as the score change itself,
 * so the trail cannot disagree with the balance. `delta` is negative for a
 * deduction; `balanceAfter` is what the score became at that moment, which is
 * why editing a score later does not rewrite history.
 */
export type KraEvent = {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  taskId: string | null;
  createdAt: string;
};

/** What `GET /employees/:id` adds on top of the roster row. */
export type EmployeeDetail = Employee & {
  acceptedProjects: unknown[];
  invitedProjects: unknown[];
  assignedTasks: unknown[];
  openTaskCount: number;
  kraEvents: KraEvent[];
};

/* -------------------------------------------------------------- projects -- */

export type ProjectMember = {
  id: string;
  userId: string;
  role: MemberRole;
  state: MemberState;
  invitedById: string;
  invitedAt: string;
  respondedAt: string | null;
  user: { id: string; name: string; empId: string; email: string; roles: Role[]; tone: ToneApi };
};

export type Milestone = {
  id: string;
  label: string;
  due: string;
  status: "planned" | "inProgress" | "done" | "delayed";
  note: string | null;
};

export type SecretEntry = {
  id: string;
  key: string;
  value: string;
  env: "local" | "development" | "staging" | "production";
  note: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type Project = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  state: ProjectStateApi;
  code: string | null;
  client: string | null;
  clientId: string | null;
  problemStatement: string | null;
  solution: string | null;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  plan: Milestone[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  assignedEmployees: string[];
  reportTo: string[];
  pendingMembers: string[];
  myMembership: { role: MemberRole; state: MemberState } | null;
  canManage: boolean;
  secrets?: SecretEntry[] | null;
};

export type ProjectInvitation = {
  id: string;
  role: MemberRole;
  invitedAt: string;
  invitedById: string;
  project: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    state: ProjectStateApi;
    dueDate: string | null;
  };
};

/* ----------------------------------------------------------------- tasks -- */

export type ChecklistLine = {
  id: string;
  label: string;
  done: boolean;
  score: number;
  points: number;
};

export type QcReview = {
  id: string;
  at: string;
  by: string;
  byUserId: string | null;
  verdict: QcVerdictApi;
  note: string | null;
  failedItemIds: string[];
  pointsDeducted: number;
  affected: { userId: string; from: number; to: number }[];
};

export type TaskUpdateEntry = { id: string; at: string; by: string; summary: string };

export type Task = {
  id: string;
  companyId: string;
  projectId: string;
  projectIds: string[];
  title: string;
  description: string | null;
  taskCode: string | null;
  assigneeId: string | null;
  assigneeIds: string[];
  reportToIds: string[];
  createdById: string;
  state: TaskStateApi;
  priority: "low" | "medium" | "high" | "urgent";
  priorityLevel: number;
  kraPoints: number;
  kraApplied: boolean;
  checklist: ChecklistLine[];
  origin: {
    kind: string;
    severity: "Critical" | "Major" | "Minor";
    raisedBy: string;
    raisedByUserId: string | null;
    foundIn: string | null;
  } | null;
  updates: TaskUpdateEntry[];
  qcReviews: QcReview[];
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  prUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; code: string | null };
  score: number;
  lastReview: QcReview | null;
  reworkCount: number;
  awaitingReview: boolean;
  signedOff: boolean;
};

/* -------------------------------------------------------------- settings -- */

export type Profile = {
  id: string;
  name: string;
  email: string;
  empId: string;
  phone: string | null;
  tone: ToneApi;
  roles: Role[];
  empType: EmpType;
  empStatus: EmpStatusApi;
  currentStatus: CurrentStatus;
  kra: number;
  openWork: number;
  isOwner: boolean;
  joinedAt: string;
  lastLoginAt: string | null;
  moduleAccess: string[];
  branch: string | null;
  reportsTo: { id: string; name: string; empId: string } | null;
  company: {
    id: string;
    companyName: string;
    headBranch: string;
    settings: { autoEmployeeId: boolean; defaultBranch: string | null } | null;
  };
  modules: string[];
  defaultModules: string[];
};

export type ModuleAccessMatrix = {
  modules: string[];
  rows: {
    id: string;
    name: string;
    empId: string;
    email: string;
    roles: Role[];
    empType: EmpType;
    isOwner: boolean;
    moduleAccess: string[];
    defaults: string[];
    granted: string[];
    effective: string[];
    locked: boolean;
  }[];
};

export type BranchScope = {
  /** The branch every module filters by, or null for the whole group. */
  defaultBranch: string | null;
  /** False when the value is the head office simply because nobody has chosen. */
  explicit: boolean;
  headBranch: string | null;
  allBranches: boolean;
};

export type Country = {
  code: string;
  name: string;
  currency: string;
  currencyName: string;
  symbol: string;
};

export type Branch = {
  id: string;
  name: string;
  isHead: boolean;
  createdAt: string;
  city: string | null;
  country: string | null;
  countryName: string | null;
  /** Derived server-side from `country`. Never sent by the client. */
  currency: string | null;
  currencySymbol: string | null;
  headcount: number;
  projectCount: number;
  lead: { id: string; name: string; empId: string; tone: ToneApi } | null;
  isDefault: boolean;
};

export type BranchList = {
  branches: Branch[];
  scope: BranchScope;
  groupHeadcount: number;
  /** People with no branch set — they vanish the moment a scope applies. */
  unassigned: number;
};

export type Workspace = {
  company: { id: string; name: string; headBranch: string };
  settings: {
    autoEmployeeId: boolean;
    defaultBranch: string | null;
    defaultBranchExplicit: boolean;
    headBranch: string | null;
    allBranches: boolean;
    /** ISO 4217 of the branch in force; null when scoped to all branches. */
    currency: string | null;
    currencySymbol: string | null;
  };
  branches: { id: string; name: string; isHead: boolean }[];
};

/* --------------------------------------------------------------- clients -- */

export type ClientStatusApi = "active" | "onboarding" | "dormant";

export type Client = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string | null;
  industry: string | null;
  value: number;
  since: string | null;
  status: ClientStatusApi;
  notes: string | null;
  tone: ToneApi;
  createdAt: string;
  updatedAt: string;
  projectCount?: number;
};

/* --------------------------------------------------------- notifications -- */

export type Notification = {
  id: string;
  companyId: string;
  toUserId: string;
  kind: string;
  title: string;
  detail: string;
  read: boolean;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
};
