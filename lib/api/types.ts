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

/*
 * The four states the product has, plus one it does not offer.
 *
 * `failed` is not a column and no control in this app can produce it. It stays
 * in the union because the API still accepts it: it is the trigger for the
 * spec's secondary KRA rule, which is deliberately NOT wired to `stuck` — a
 * card dragged to Stuck must never quietly cost anyone points. A row that
 * somehow carries it is rendered as Stuck and left alone.
 */
export type TaskStateApi = "notStarted" | "working" | "stuck" | "done" | "failed";

/**
 * A file attached to a task.
 *
 * Note what is NOT here: the storage key. The server never sends it — a client
 * has no use for a path on the server's disk, and the download route takes the
 * attachment's id, not a location.
 */
export type TaskAttachment = {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  /** Bytes. */
  size: number;
  uploadedById: string;
  uploadedBy: string;
  createdAt: string;
};

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
  avatar: string | null;
  status: UserStatus;
  /** Derived from the heartbeat — see the API's lib/presence.ts. */
  presence: Presence;
  /** The manual switch behind it: "auto" or "away". */
  presenceMode: string;
  modules: string[];
  /** slug -> "view" | "edit" for everything in `modules`. */
  moduleLevels: Record<string, AccessLevel>;
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

  /** Profile picture, or null for initials. */
  avatar: string | null;
  /** The line they wrote about themselves. A lapsed one arrives as nulls. */
  status: UserStatus;
  /** Derived from the heartbeat, never a stored boolean. */
  presence: Presence;
  /** The manual switch behind it: "auto" or "away". */
  presenceMode: string;
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
  /** Teams on this project — a reference; the people are in `members`. */
  teamIds: string[];
  /** The sprint lane, or null for the project backlog. */
  sprintId: string | null;
  /** Denormalised by the API so a board row can label its lane. */
  sprint?: { id: string; name: string; tone: string; state: SprintState } | null;
  /** Null means "follow the workspace default". */
  requireAcceptance: boolean | null;
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
  // Subtask metadata — descriptive only, never an input to KRA. All optional so
  // a line written before these existed still reads back cleanly.
  description?: string | null;
  status?: TaskStateApi | null;
  ownerId?: string | null;
  priorityLevel?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
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
  /** Teams on this task — a reference; the people are in `assigneeIds`. */
  teamIds: string[];
  /** The sprint lane, or null for the project backlog. */
  sprintId: string | null;
  /** Denormalised by the API so a board row can label its lane. */
  sprint?: { id: string; name: string; tone: string; state: SprintState } | null;
  /** Manual sort position for the grid view. */
  order: number;
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
    /** slug -> the level it resolved to. Absent means no access at all. */
    levels: Record<string, AccessLevel>;
    locked: boolean;
  }[];
};

/**
 * How much of a module someone gets.
 *
 *   view  they may read it; the API refuses every write.
 *   edit  the full module.
 *
 * `edit` is the default: a role's own modules come in at `edit`, and a grant
 * stored without a level predates this and still means `edit`.
 */
export type AccessLevel = "view" | "edit";

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
    /** Org-wide default for whether joining a project needs acceptance. */
    requireProjectAcceptance: boolean;
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

/* ------------------------------------------------------------ playground -- */

/** One person on the Playground floor. Composed server-side in one request. */
export type PlaygroundPerson = {
  id: string;
  name: string;
  empId: string;
  email: string;
  roles: Role[];
  empType: EmpType;
  empStatus: string;
  currentStatus: string;
  branch: string | null;
  tone: ToneApi;
  avatar: string | null;
  presence: Presence;
  status: UserStatus;
  kra: number;
  phone: string | null;
  joinedAt: string;
  openTasks: number;
  doneTasks: number;
  projects: { id: string; name: string; code: string | null; state: string; role: string }[];
};

export type PlaygroundRoster = {
  people: PlaygroundPerson[];
  stats: { total: number; avgKra: number; branches: string[]; roles: string[] };
};

/* ----------------------------------------------------------------- teams -- */

/** A person as a team picker needs them — enough to show a row, no more. */
export type TeamMember = {
  id: string;
  name: string;
  empId: string;
  email: string;
  tone: ToneApi;
  roles: Role[];
  kra: number;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
  tone: ToneApi;
  leadId: string | null;
  memberIds: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** Resolved by the list endpoint, so a picker needs one request. */
  members: TeamMember[];
};

export type TeamInput = {
  name: string;
  description?: string | null;
  tone?: string;
  leadId?: string | null;
  memberIds: string[];
};

/* --------------------------------------------------------------- presence -- */

export type Presence = "online" | "away" | "offline";

export type UserStatus = {
  text: string | null;
  emoji: string | null;
  /** ISO. Null means "until I clear it". */
  until: string | null;
};

/* ---------------------------------------------------------------- sprints -- */

export type SprintState = "planned" | "active" | "completed" | "cancelled";

/**
 * One lane of a project's board.
 *
 * `taskCount` / `doneCount` are computed server-side in a grouped query, not
 * derived here — the board header needs them before the task list has
 * necessarily loaded, and counting a page of tasks client-side would report
 * the page rather than the sprint.
 */
export type Sprint = {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  goal: string | null;
  state: SprintState;
  tone: string;
  startDate: string | null;
  endDate: string | null;
  order: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  doneCount?: number;
};

export type SprintInput = {
  projectId: string;
  name: string;
  goal?: string | null;
  state?: SprintState;
  tone?: string;
  startDate?: string | null;
  endDate?: string | null;
  order?: number;
};

/* ------------------------------------------------------------ attendance -- */

export type Shift = {
  id: string;
  userId: string;
  /** The person's local calendar day, `YYYY-MM-DD`. See the Shift model. */
  date: string;
  inAt: string;
  outAt: string | null;
  breakMinutes: number;
  breakAt: string | null;
  note: string | null;
  open: boolean;
  onBreak: boolean;
  /** Breaks already subtracted, counting up while the shift is open. */
  workedMinutes: number;
};

export type MyClock = {
  open: Shift | null;
  shifts: Shift[];
};

export type RosterPerson = {
  id: string;
  name: string;
  empId: string;
  email: string;
  roles: Role[];
  branch: string | null;
  tone: string;
  avatar: string | null;
  currentStatus: string;
  presence: Presence;
  status: UserStatus;
  shift: Shift | null;
  clockedIn: boolean;
  onBreak: boolean;
  workedMinutes: number;
};

export type ClockRoster = {
  date: string;
  in: RosterPerson[];
  out: RosterPerson[];
  counts: {
    total: number;
    in: number;
    out: number;
    onBreak: number;
    /** Worked today and finished, as against never having started. */
    finished: number;
    notStarted: number;
  };
};

/* ------------------------------------------------------------ clock stats -- */

export type ClockStats = {
  user: { id: string; name: string; empId: string };
  /** The day the numbers were asked for, in the viewer's own calendar. */
  date: string;
  weekStart: string;
  monthStart: string;
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  /**
   * Days present over days the COMPANY was open, as a percentage.
   *
   * Null when there is no attendance to compare with. The denominator comes
   * from the data rather than from an assumed Monday-to-Friday — see the
   * service comment; a six-day week would otherwise read as 120%.
   */
  consistency: number | null;
  daysPresent: number;
  daysExpected: number;
  /** Consecutive open days worked, ending at the last one that has happened. */
  streak: number;
  averageMinutes: number;
  days: { date: string; minutes: number; present: boolean }[];
};

/* ---------------------------------------------------------- daily reports -- */

export type DailyReport = {
  id: string;
  userId: string;
  /** The author's local calendar day, `YYYY-MM-DD`. */
  date: string;
  body: string;
  headline: string | null;
  stars: number | null;
  ratedById: string | null;
  ratedAt: string | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
  rated: boolean;
};

export type ReportSummary = {
  submitted: number;
  ratedDays: number;
  awaitingRating: number;
  stars: number;
  average: number | null;
  byStars: Record<string, number>;
};

export type ReportHistory = {
  user: { id: string; name: string; empId: string; avatar: string | null; tone: string };
  from: string;
  to: string;
  reports: DailyReport[];
  /** Totals for the window on screen. */
  summary: ReportSummary;
  /** Totals for all time — the number an employee means by "my stars". */
  lifetime: { stars: number; ratedDays: number; average: number | null };
};

export type ReportDayRow = {
  user: {
    id: string;
    name: string;
    empId: string;
    email: string;
    roles: Role[];
    avatar: string | null;
    tone: string;
    currentStatus: string;
    branch: string | null;
  };
  /** Null when that person has not written the day up. */
  report: DailyReport | null;
};

export type ReportDay = {
  date: string;
  rows: ReportDayRow[];
  counts: { total: number; filed: number; missing: number; unrated: number };
};
