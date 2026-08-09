import type { ModuleSlug } from "@/lib/modules";
import { MODULES, MANDATORY_MODULES, OPTIONAL_MODULES, isMandatory } from "@/lib/modules";
import { PORTALS } from "@/lib/portals";
import { readGrants } from "@/lib/access";
import Dashboard from "@/components/dashboard/Dashboard";
import MasterDashboard from "./master-dashboard";
import MasterCompanies from "./master-companies";
import { Communication } from "./work";
import { Performance } from "./people";
import { ProjectManagement } from "./project-management";
import { TaskManagement } from "./task-management";
import { EmployeeManagement } from "./employee-management";
import { Checklist } from "./checklist";
import { Requests } from "./requests";
import { Salary, Payments } from "./finance";
import { Companies } from "./org";
import { Leads } from "./leads";
import { Branches } from "./org-live";
import { Clients } from "./clients";
import { Settings } from "./system";
import { Calendar } from "./calendar";
import { Monitor } from "./monitor";
import { Clock } from "./clock";
import { ProposedBugs } from "./proposed-bugs";
import { Notifications } from "./notifications";
import { LeaveRequests } from "./leave-requests";
import ModuleAccess, { type AccessRow, type AccessCol } from "./ModuleAccess";

export type ModuleViewProps = {
  user: string;
  role: string;
  portal: string;
  canManageAccess: boolean;
};

/** Builds the access matrix from the live grants. Server-side only. */
async function AccessEditor() {
  const grants = await readGrants();

  // Mandatory rows first so the locked baseline reads as a block.
  const rows: AccessRow[] = [
    ...MANDATORY_MODULES,
    ...OPTIONAL_MODULES,
  ].map((slug) => {
    const def = MODULES.find((m) => m.slug === slug)!;
    return {
      slug,
      label: def.label,
      group: def.group,
      mandatory: isMandatory(slug),
    };
  });

  const cols: AccessCol[] = PORTALS.map((p) => ({
    slug: p.slug,
    name: p.name,
    tag: p.tag,
    // The super admin is the one granting access, so it can't be reduced.
    locked: p.slug === "super-admin",
  }));

  const granted = PORTALS.flatMap((p) =>
    (grants[p.slug] ?? []).map((m) => `${p.slug}:${m}`),
  );

  return <ModuleAccess rows={rows} cols={cols} granted={granted} />;
}

/**
 * Slug -> view. Adding a module is one entry here plus a definition in
 * lib/modules.ts.
 */
export function renderModule(slug: ModuleSlug, props: ModuleViewProps): React.ReactNode {
  // The master portal is a different product from the staff portals: it manages
  // tenants, not sales. Two modules render a master-specific view; the rest of
  // the registry is untouched, so every other portal is exactly as it was.
  const isMaster = props.portal === "master-portal";

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
      return (
        <Settings
          user={props.user}
          role={props.role}
          accessEditor={props.canManageAccess ? <AccessEditor /> : undefined}
        />
      );
  }
}
