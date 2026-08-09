import type { ModuleSlug } from "./modules";
import { ALL_MODULES } from "./modules";

export type PortalSlug =
  | "master-portal"
  | "super-admin"
  | "manager-1"
  | "manager-2"
  | "team-leader-1"
  | "team-leader-2"
  | "quality-check-1"
  | "quality-check-2"
  | "quality-check-3"
  | "employee-1"
  | "employee-2"
  | "employee-3"
  | "sales-1"
  | "sales-2"
  | "client";

/** Groups the switcher and the login credential list, so 15 portals stay readable. */
export type PortalGroup =
  | "Administration"
  | "Management"
  | "Delivery"
  | "Quality"
  | "Sales"
  | "External";

export const PORTAL_GROUP_ORDER: readonly PortalGroup[] = [
  "Administration",
  "Management",
  "Delivery",
  "Quality",
  "Sales",
  "External",
];

export type Portal = {
  slug: PortalSlug;
  name: string;
  /** Shown under the portal name in the switcher. */
  blurb: string;
  /** Short tag rendered next to the logo. */
  tag: string;
  group: PortalGroup;
  modules: readonly ModuleSlug[];
  /** May open the Module Access editor and change other portals' grants. */
  canManageAccess?: boolean;
  /**
   * For external portals: the client account this login belongs to.
   *
   * How the Monitor module works out which projects to show. Staff portals
   * leave it unset. It used to match an id in the deleted mock client list; for
   * a real tenant it must match a client record from the API.
   */
  clientId?: string;
  demo: { email: string; password: string; user: string; role: string };
};

/*
 * `modules` is the ceiling — the most a portal could ever be granted. What a
 * portal actually sees is resolved at request time by lib/access.ts, which
 * layers the super admin's grants on top of the mandatory baseline.
 *
 * Roles are numbered rather than singular (manager-1, manager-2, quality-check-1…)
 * because the org has several people in each seat. Each used to map to one
 * seeded employee; the seed is gone, so a portal is now only a shell identity —
 * who is really signed in comes from /auth/me.
 */
export const PORTALS: readonly Portal[] = [
  {
    slug: "master-portal",
    name: "Master Portal",
    blurb: "Full control across every company and branch",
    tag: "Master",
    group: "Administration",
    modules: ALL_MODULES,
    canManageAccess: true,
    demo: {
      email: "master@jadvix.com",
      password: "master@123",
      user: "Fazil Niyazdeen",
      role: "Master Administrator",
    },
  },
  {
    slug: "super-admin",
    name: "Super Admin",
    blurb: "Organisation-wide administration",
    tag: "Super Admin",
    group: "Administration",
    modules: ALL_MODULES,
    canManageAccess: true,
    demo: {
      email: "superadmin@jadvix.com",
      password: "super@123",
      user: "Aarav Menon",
      role: "Super Administrator",
    },
  },
  {
    slug: "manager-1",
    name: "Manager 1",
    blurb: "Delivery management — Northwind, Lumen, Kestrel",
    tag: "Manager 1",
    group: "Management",
    modules: ALL_MODULES,
    demo: {
      email: "manager1@jadvix.com",
      password: "manager1@123",
      user: "Priya Raghavan",
      role: "Delivery Manager",
    },
  },
  {
    slug: "manager-2",
    name: "Manager 2",
    blurb: "Engineering management — Harbour, Orbit",
    tag: "Manager 2",
    group: "Management",
    modules: ALL_MODULES,
    demo: {
      email: "manager2@jadvix.com",
      password: "manager2@123",
      user: "Rohan Kurian",
      role: "Engineering Manager",
    },
  },
  {
    slug: "team-leader-1",
    name: "Team Leader 1",
    blurb: "Platform squad planning and standups",
    tag: "Team Lead 1",
    group: "Delivery",
    modules: ALL_MODULES,
    demo: {
      email: "teamlead1@jadvix.com",
      password: "teamlead1@123",
      user: "Karthik Suresh",
      role: "Team Leader — Platform",
    },
  },
  {
    slug: "team-leader-2",
    name: "Team Leader 2",
    blurb: "Web squad planning and standups",
    tag: "Team Lead 2",
    group: "Delivery",
    modules: ALL_MODULES,
    demo: {
      email: "teamlead2@jadvix.com",
      password: "teamlead2@123",
      user: "Meera Krishnan",
      role: "Team Leader — Web",
    },
  },
  {
    slug: "quality-check-1",
    name: "Quality Check 1",
    blurb: "QA lead — release sign-off",
    tag: "QC 1",
    group: "Quality",
    modules: ALL_MODULES,
    demo: {
      email: "qc1@jadvix.com",
      password: "qc1@123",
      user: "Rahul Nair",
      role: "QA Lead",
    },
  },
  {
    slug: "quality-check-2",
    name: "Quality Check 2",
    blurb: "QA engineering — regression and defects",
    tag: "QC 2",
    group: "Quality",
    modules: ALL_MODULES,
    demo: {
      email: "qc2@jadvix.com",
      password: "qc2@123",
      user: "Vishnu Prasad",
      role: "QA Engineer",
    },
  },
  {
    slug: "quality-check-3",
    name: "Quality Check 3",
    blurb: "QA analysis — checklists and scoring",
    tag: "QC 3",
    group: "Quality",
    modules: ALL_MODULES,
    demo: {
      email: "qc3@jadvix.com",
      password: "qc3@123",
      user: "Anjali Thomas",
      role: "QA Analyst",
    },
  },
  {
    slug: "employee-1",
    name: "Employee 1",
    blurb: "Your work, hours and requests",
    tag: "Employee 1",
    group: "Delivery",
    modules: ALL_MODULES,
    demo: {
      email: "employee1@jadvix.com",
      password: "employee1@123",
      user: "Neha Iyer",
      role: "Software Engineer",
    },
  },
  {
    slug: "employee-2",
    name: "Employee 2",
    blurb: "Your work, hours and requests",
    tag: "Employee 2",
    group: "Delivery",
    modules: ALL_MODULES,
    demo: {
      email: "employee2@jadvix.com",
      password: "employee2@123",
      user: "Divya Ramesh",
      role: "Frontend Engineer",
    },
  },
  {
    slug: "employee-3",
    name: "Employee 3",
    blurb: "Your work, hours and requests",
    tag: "Employee 3",
    group: "Delivery",
    modules: ALL_MODULES,
    demo: {
      email: "employee3@jadvix.com",
      password: "employee3@123",
      user: "Arun Varghese",
      role: "UI Designer",
    },
  },
  {
    slug: "sales-1",
    name: "Sales 1",
    blurb: "Pipeline, leads and proposals",
    tag: "Sales 1",
    group: "Sales",
    modules: ALL_MODULES,
    demo: {
      email: "sales1@jadvix.com",
      password: "sales1@123",
      user: "Sneha Pillai",
      role: "Sales Executive",
    },
  },
  {
    slug: "sales-2",
    name: "Sales 2",
    blurb: "Regional sales and key accounts",
    tag: "Sales 2",
    group: "Sales",
    modules: ALL_MODULES,
    demo: {
      email: "sales2@jadvix.com",
      password: "sales2@123",
      user: "Vikram Das",
      role: "Sales Manager",
    },
  },
  {
    slug: "client",
    name: "Client Portal",
    blurb: "Your projects, invoices and requests",
    tag: "Client",
    group: "External",
    modules: ALL_MODULES,
    clientId: "CL-08",
    demo: {
      email: "client@jadvix.com",
      password: "client@123",
      user: "Daniel Fernandes",
      role: "Client — Northwind Ltd",
    },
  },
];

export const PORTAL_MAP = new Map(PORTALS.map((p) => [p.slug, p]));

export function getPortal(slug: string): Portal | undefined {
  return PORTAL_MAP.get(slug as PortalSlug);
}

export function isPortalSlug(slug: string): slug is PortalSlug {
  return PORTAL_MAP.has(slug as PortalSlug);
}

/** Portals bucketed by group, in menu order, skipping empty groups. */
export function portalsByGroup(): { group: PortalGroup; items: Portal[] }[] {
  return PORTAL_GROUP_ORDER.map((group) => ({
    group,
    items: PORTALS.filter((p) => p.group === group),
  })).filter((g) => g.items.length > 0);
}

/**
 * Which portal shell to open for an account signed into jadvix-backend.
 *
 * The API's roles are the authority on what someone may do; this only picks the
 * shell that reads best for them. Ordered most-privileged first, so someone who
 * is both a team leader and a developer lands in the team leader's portal.
 */
export function portalForRoles(roles: readonly string[], isOwner = false): PortalSlug {
  if (isOwner || roles.includes("superAdmin")) return "super-admin";
  if (roles.includes("manager")) return "manager-1";
  if (roles.includes("teamLeader")) return "team-leader-1";
  if (roles.includes("qualityCheck")) return "quality-check-1";
  if (roles.includes("sales")) return "sales-1";
  if (roles.includes("client")) return "client";
  return "employee-1";
}

/** Demo-only credential check. Never ship this shape against real users. */
export function findPortalByCredentials(email: string, password: string): Portal | undefined {
  const e = email.trim().toLowerCase();
  return PORTALS.find((p) => p.demo.email === e && p.demo.password === password);
}
