"use client";

import dynamic from "next/dynamic";
import type { ModuleSlug } from "@/lib/modules";
import { ModuleSkeleton } from "@/components/ui";

/*
 * The slug -> view switch, and the reason it is a Client Component.
 *
 * Every module view is a client component, and all of them are reachable from
 * the single /[portal]/[module] route. A static `import { Leads } from
 * "./leads"` therefore put all ~12k lines of module code into that route's
 * client bundle: opening Clients downloaded and hydrated Calendar, Task
 * Management, Employee Management and the rest along with it. Measured, that
 * was 1021KB of JS on every module, identical for every slug.
 *
 * next/dynamic only splits the client bundle when the dynamic() call itself
 * lives in a Client Component — used from a Server Component it makes the
 * component lazy for SSR but still ships it, which is why this file exists
 * separately from registry.tsx rather than the switch staying there.
 *
 * The calls must stay at module scope: the bundler reads them statically, so
 * moving one inside the switch would silently undo the split.
 */

const loading = () => <ModuleSkeleton />;

const Dashboard = dynamic(() => import("@/components/dashboard/Dashboard"), { loading });
const MasterDashboard = dynamic(() => import("./master-dashboard"), { loading });
const MasterCompanies = dynamic(() => import("./master-companies"), { loading });
const Communication = dynamic(() => import("./work").then((m) => m.Communication), { loading });
const Performance = dynamic(() => import("./people").then((m) => m.Performance), { loading });
const ProjectManagement = dynamic(
  () => import("./project-management").then((m) => m.ProjectManagement),
  { loading },
);
const TaskManagement = dynamic(() => import("./task-management").then((m) => m.TaskManagement), {
  loading,
});
const EmployeeManagement = dynamic(
  () => import("./employee-management").then((m) => m.EmployeeManagement),
  { loading },
);
const Checklist = dynamic(() => import("./checklist").then((m) => m.Checklist), { loading });
const Requests = dynamic(() => import("./requests").then((m) => m.Requests), { loading });
const Salary = dynamic(() => import("./finance").then((m) => m.Salary), { loading });
const Payments = dynamic(() => import("./finance").then((m) => m.Payments), { loading });
const Companies = dynamic(() => import("./org").then((m) => m.Companies), { loading });
const Leads = dynamic(() => import("./leads").then((m) => m.Leads), { loading });
const Branches = dynamic(() => import("./org-live").then((m) => m.Branches), { loading });
const Clients = dynamic(() => import("./clients").then((m) => m.Clients), { loading });
const Settings = dynamic(() => import("./system").then((m) => m.Settings), { loading });
const Reports = dynamic(() => import("./reports").then((m) => m.Reports), { loading });
const Teams = dynamic(() => import("./teams").then((m) => m.Teams), { loading });
// WebGL, so client-only: three.js reaches for `window` at module scope and
// throws if it is evaluated on the server.
const Playground = dynamic(() => import("./playground").then((m) => m.Playground), {
  loading,
  ssr: false,
});

const Calendar = dynamic(() => import("./calendar").then((m) => m.Calendar), { loading });
const Monitor = dynamic(() => import("./monitor").then((m) => m.Monitor), { loading });
const Clock = dynamic(() => import("./clock").then((m) => m.Clock), { loading });
const ProposedBugs = dynamic(() => import("./proposed-bugs").then((m) => m.ProposedBugs), {
  loading,
});
const Notifications = dynamic(() => import("./notifications").then((m) => m.Notifications), {
  loading,
});
const LeaveRequests = dynamic(() => import("./leave-requests").then((m) => m.LeaveRequests), {
  loading,
});

export type ModuleViewProps = {
  slug: ModuleSlug;
  user: string;
  role: string;
  portal: string;
  /*
   * Rendered on the server and handed down as a slot. Settings is the only
   * module with a server-side piece, and passing the finished element keeps
   * readGrants() out of the client bundle.
   */
  accessEditor?: React.ReactNode;
};

export default function ModuleView({ slug, user, role, portal, accessEditor }: ModuleViewProps) {
  // The master portal is a different product from the staff portals: it manages
  // tenants, not sales. Two modules render a master-specific view; the rest of
  // the registry is untouched, so every other portal is exactly as it was.
  const isMaster = portal === "master-portal";

  switch (slug) {
    case "dashboard":
      return isMaster ? <MasterDashboard /> : <Dashboard />;
    case "project-management":
      return <ProjectManagement />;
    case "task-management":
      return <TaskManagement />;
    case "checklist":
      return <Checklist />;
    case "requests":
      return <Requests />;
    case "proposed-bugs":
      return <ProposedBugs />;
    case "communication":
      return <Communication />;
    case "employee-management":
      return <EmployeeManagement />;
    case "performance":
      return <Performance />;
    case "leave-requests":
      return <LeaveRequests />;
    case "clock":
      return <Clock />;
    case "salary":
      return <Salary />;
    case "payments":
      return <Payments />;
    case "leads":
      return <Leads />;
    case "clients":
      return <Clients />;
    case "companies":
      return isMaster ? <MasterCompanies /> : <Companies />;
    case "branches":
      return <Branches />;
    case "calendar":
      return <Calendar />;
    case "notifications":
      return <Notifications />;
    case "monitor":
      return <Monitor />;
    case "settings":
      return <Settings user={user} role={role} accessEditor={accessEditor} />;
    case "playground":
      return <Playground />;
    case "teams":
      return <Teams />;
    case "reports":
      return <Reports />;

    default:
      /*
       * Every ModuleSlug must have a case above.
       *
       * This assignment is the guard: add a slug to lib/modules.ts without
       * wiring a view here and `slug` is no longer `never`, so the build
       * fails. Without it the switch just fell through to `return null`, and
       * the module rendered as a page title with an empty body — which is
       * exactly how the Playground shipped broken once.
       */
      slug satisfies never;
      return null;
  }
}
