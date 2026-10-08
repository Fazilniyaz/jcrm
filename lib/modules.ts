import {
  LayoutDashboard,
  FolderKanban,
  MessagesSquare,
  Users,
  TrendingUp,
  CalendarOff,
  Settings,
  Wallet,
  CreditCard,
  CalendarDays,
  Clock,
  ListChecks,
  Bell,
  Building2,
  GitBranch,
  Bug,
  Target,
  Handshake,
  Activity,
  ClipboardCheck,
  Inbox,
  Orbit,
  UsersRound,
  ClipboardList,
} from "lucide-react";
import type { IconType } from "./ui/icon";

export type ModuleSlug =
  | "dashboard"
  | "project-management"
  | "communication"
  | "employee-management"
  | "performance"
  | "leave-requests"
  | "settings"
  | "salary"
  | "payments"
  | "calendar"
  | "clock"
  | "task-management"
  | "notifications"
  | "companies"
  | "branches"
  | "proposed-bugs"
  | "leads"
  | "clients"
  | "monitor"
  | "checklist"
  | "requests"
  | "playground"
  | "teams"
  | "reports";

export type ModuleDef = {
  slug: ModuleSlug;
  label: string;
  /** Sidebar grouping, mirroring how the Valex menu is sectioned. */
  group: "Overview" | "Work" | "People" | "Finance" | "Organisation" | "System";
  icon: IconType;
  /** Sub-line under the page title. */
  blurb: string;
};

export const MODULES: readonly ModuleDef[] = [
  {
    slug: "dashboard",
    label: "Dashboard",
    group: "Overview",
    icon: LayoutDashboard,
    blurb: "Sales, orders and revenue at a glance.",
  },
  {
    slug: "monitor",
    label: "Monitor",
    group: "Overview",
    icon: Activity,
    blurb: "Delivery plan and progress, as the client sees it.",
  },
  {
    slug: "project-management",
    label: "Projects",
    group: "Work",
    icon: FolderKanban,
    blurb: "Delivery status, budgets and teams for every engagement.",
  },
  {
    slug: "task-management",
    label: "Tasks",
    group: "Work",
    icon: ListChecks,
    blurb: "Work in progress across the board.",
  },
  {
    slug: "checklist",
    label: "Checklist",
    group: "Work",
    icon: ClipboardCheck,
    blurb: "QC review queue — score finished work and sign it off or send it back.",
  },
  {
    slug: "proposed-bugs",
    label: "Proposed Bugs",
    group: "Work",
    icon: Bug,
    blurb: "Defects raised for triage, with severity and owner.",
  },
  {
    slug: "requests",
    label: "Requests",
    group: "Work",
    icon: Inbox,
    blurb: "Projects you've been invited to. Accept one to join its team.",
  },
  {
    slug: "communication",
    label: "Communication",
    group: "Work",
    icon: MessagesSquare,
    blurb: "Conversations with your team and clients.",
  },
  {
    slug: "employee-management",
    label: "Employees",
    group: "People",
    icon: Users,
    blurb: "Everyone on the roster, their department and status.",
  },
  {
    slug: "performance",
    label: "Performance",
    group: "People",
    icon: TrendingUp,
    blurb: "Delivery quality and throughput by person.",
  },
  {
    slug: "leave-requests",
    label: "Leave Requests",
    group: "People",
    icon: CalendarOff,
    blurb: "Time-off requests and remaining balances.",
  },
  {
    slug: "clock",
    label: "Clock",
    group: "People",
    icon: Clock,
    blurb: "Clock in, clock out and review this week's hours.",
  },
  {
    slug: "reports",
    label: "Reports",
    group: "People",
    icon: ClipboardList,
    blurb: "What each person did today, day by day, rated out of five.",
  },
  {
    slug: "salary",
    label: "Salary",
    group: "Finance",
    icon: Wallet,
    blurb: "Payroll runs, payslips and deductions.",
  },
  {
    slug: "payments",
    label: "Payments",
    group: "Finance",
    icon: CreditCard,
    blurb: "Invoices raised and settled.",
  },
  {
    slug: "leads",
    label: "Leads",
    group: "Organisation",
    icon: Target,
    blurb: "Pipeline by stage, from first contact to close.",
  },
  {
    slug: "clients",
    label: "Clients",
    group: "Organisation",
    icon: Handshake,
    blurb: "Accounts, owners and lifetime value.",
  },
  {
    slug: "companies",
    label: "Companies",
    group: "Organisation",
    icon: Building2,
    blurb: "Legal entities operating under the group.",
  },
  {
    slug: "branches",
    label: "Branches",
    group: "Organisation",
    icon: GitBranch,
    blurb: "Offices, headcount and regional leads.",
  },
  {
    slug: "calendar",
    label: "Calendar",
    group: "System",
    icon: CalendarDays,
    blurb: "Releases, leave and company events this month.",
  },
  {
    slug: "notifications",
    label: "Notifications",
    group: "System",
    icon: Bell,
    blurb: "Everything that needed your attention recently.",
  },
  {
    slug: "settings",
    label: "Settings",
    group: "System",
    icon: Settings,
    blurb: "Profile, workspace and security preferences.",
  },
  {
    slug: "teams",
    label: "Teams",
    group: "People",
    icon: UsersRound,
    blurb: "Named groups of people you can put on a project or a task in one go.",
  },
  {
    slug: "playground",
    label: "Your Playground",
    group: "Overview",
    icon: Orbit,
    blurb: "The whole office on one floor — who is here, how they are doing, and what they are on.",
  },
];

export const ALL_MODULES = MODULES.map((m) => m.slug) as readonly ModuleSlug[];

/**
 * Every portal always gets these — they are the baseline a role needs to do
 * any work at all, so the access editor renders them locked on.
 */
export const MANDATORY_MODULES: readonly ModuleSlug[] = [
  "project-management",
  // Where a project invitation is answered. Withholding it would leave an
  // invitation with nowhere to be accepted, so it is never grantable.
  "requests",
  "communication",
  "performance",
  "leave-requests",
  "settings",
  "calendar",
  "clock",
  "task-management",
  "notifications",
];

/**
 * Grantable modules — the ones a super admin switches on and off per portal.
 *
 * ORDER IS LOAD-BEARING: stored grants are a bitmask over this array, so
 * reordering it silently re-points existing grants at the wrong modules.
 * Append new entries at the end; never insert or reorder.
 */
export const OPTIONAL_MODULES: readonly ModuleSlug[] = [
  "dashboard",
  "monitor",
  "employee-management",
  "salary",
  "payments",
  "leads",
  "clients",
  "companies",
  "branches",
  "proposed-bugs",
  // Appended, never inserted — see the bitmask warning above. Grantable rather
  // than mandatory so it can be switched on for the QC portals only.
  "checklist",
  // Also appended. The roster floor: super-admin territory, so it is grantable
  // rather than mandatory and off for everyone until switched on.
  "playground",
  // Appended too. Managers and team leaders get it from their role; everyone
  // else needs it granted.
  "teams",
  // Appended as well. Every employee role gets it from the API; a client or a
  // vendor does not write up a working day, so it is grantable rather than
  // mandatory.
  "reports",
];

export function isMandatory(slug: ModuleSlug): boolean {
  return MANDATORY_MODULES.includes(slug);
}

/* ------------------------------------------------------------ API slugs -- */

/*
 * The API names five of these differently.
 *
 * The backend's registry calls them `projects`, `tasks`, `employees`,
 * `leaveRequests` and `proposedBugs`; this app has always called them
 * `project-management`, `task-management`, `employee-management`,
 * `leave-requests` and `proposed-bugs`. Neither side was renamed to meet the
 * other — the backend's `resolveModuleSlug` accepts both vocabularies, and this
 * is the mirror of it, so a module list from /auth/me can be compared against
 * the sidebar's own slugs.
 */
const TO_API: Partial<Record<ModuleSlug, string>> = {
  "project-management": "projects",
  "task-management": "tasks",
  "employee-management": "employees",
  "leave-requests": "leaveRequests",
  "proposed-bugs": "proposedBugs",
};

export function toApiModuleSlug(slug: ModuleSlug): string {
  return TO_API[slug] ?? slug;
}

/**
 * Narrows a list of API module slugs to the ones this app can render.
 *
 * Anything unrecognised is dropped rather than guessed at: a module the server
 * knows about and this build does not has no page to open.
 */
export function fromApiModuleSlugs(apiSlugs: readonly string[]): ModuleSlug[] {
  const granted = new Set(apiSlugs);
  return ALL_MODULES.filter((slug) => granted.has(toApiModuleSlug(slug)));
}

export const MODULE_MAP = new Map(MODULES.map((m) => [m.slug, m]));

export function getModule(slug: string): ModuleDef | undefined {
  return MODULE_MAP.get(slug as ModuleSlug);
}

/** The sidebar section a module belongs to. */
export type ModuleGroup = ModuleDef["group"];

export const MODULE_GROUP_ORDER: ModuleGroup[] = [
  "Overview",
  "Work",
  "People",
  "Finance",
  "Organisation",
  "System",
];
