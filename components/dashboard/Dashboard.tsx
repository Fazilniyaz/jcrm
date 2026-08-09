"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  FolderKanban,
  ListChecks,
  Users,
  Handshake,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Avatar,
  Progress,
  StatTile,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
} from "@/components/ui";
import { Bars } from "@/components/charts/Charts";
import { useStore } from "@/lib/store/StoreProvider";
import {
  formatDate,
  initialsOf,
  daysBetween,
  projectProgress,
  scopedEmployees,
  scopedProjects,
  scopedTasks,
  statusCounts,
} from "@/lib/store/selectors";
import {
  PROJECT_STATUS_TONE,
  TASK_STATUS_TONE,
  EMPLOYEE_STATUS_TONE,
  TASK_STATUSES,
  type Project,
} from "@/lib/store/types";

/*
 * The workspace dashboard.
 *
 * This was the Valex template's e-commerce demo — invented KPIs, sales revenue,
 * order counts, customers and top countries, none of which this product records.
 * Every figure below is instead computed from what the workspace actually has:
 * the same projects, tasks, employees and clients the modules render, narrowed
 * by the branch scope so the numbers agree with what those modules show.
 *
 * Nothing here is fetched separately. The store is already populated by
 * ApiStoreProvider, so this is a read over data the shell has loaded anyway.
 */

const num = (n: number) => n.toLocaleString("en-US");

/** Everything the tiles and panels need, computed once per state change. */
function useDashboardData() {
  const { hydrated, state, settings } = useStore();

  return useMemo(() => {
    const employees = scopedEmployees(state);
    const projects = scopedProjects(state);
    const tasks = scopedTasks(state);
    const clients = state.clients;

    const byStatus = statusCounts(tasks);
    const openTasks = tasks.filter((t) => t.status !== "Done");
    const liveProjects = projects.filter((p) => p.status !== "Delivered");

    /*
     * Due inside a fortnight and not finished. Sorted soonest first and
     * including anything already overdue, because that is the list someone
     * opens a dashboard to find.
     */
    const today = new Date().toISOString().slice(0, 10);
    const dueSoon = liveProjects
      .filter((p) => p.endDate && daysBetween(today, p.endDate) <= 14)
      .sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? ""))
      .slice(0, 6);

    return {
      hydrated,
      branch: settings.defaultBranch,
      employees,
      projects,
      liveProjects,
      tasks,
      openTasks,
      clients,
      byStatus,
      dueSoon,
      // Newest first — `createdAt` is the only clock the store keeps.
      recentProjects: [...projects]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    };
  }, [hydrated, state, settings.defaultBranch]);
}

export default function Dashboard() {
  const d = useDashboardData();

  if (!d.hydrated) return <ModuleSkeleton rows={6} />;

  const nothingYet =
    d.projects.length === 0 && d.tasks.length === 0 && d.employees.length === 0;

  if (nothingYet) {
    return (
      <Card>
        <EmptyState
          icon={FolderKanban}
          title="Nothing in this workspace yet"
          desc="Add people from Employees and create your first project — this page fills in from what the workspace actually holds."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Live projects"
          value={num(d.liveProjects.length)}
          hint={`${num(d.projects.length)} in total`}
          t="blue"
          icon={FolderKanban}
        />
        <StatTile
          label="Open tasks"
          value={num(d.openTasks.length)}
          hint={`${num(d.byStatus["In Review"] ?? 0)} awaiting review`}
          t="orange"
          icon={ListChecks}
        />
        <StatTile
          label="People"
          value={num(d.employees.length)}
          hint={d.branch ? `In ${d.branch}` : "Across every branch"}
          t="sky"
          icon={Users}
        />
        <StatTile
          label="Clients"
          value={num(d.clients.length)}
          hint="Accounts on the books"
          t="slate"
          icon={Handshake}
        />
      </Grid>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <TaskBoardSummary counts={d.byStatus} total={d.tasks.length} />
        </div>
        <div className="xl:col-span-5">
          <DueSoon projects={d.dueSoon} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <RecentProjects projects={d.recentProjects} />
        </div>
        <div className="xl:col-span-5">
          <WhoIsOn employees={d.employees} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tasks -- */

function TaskBoardSummary({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  // One bar series over the board's own columns, so this reads as the Tasks
  // module compressed rather than as a different measurement.
  const series = [
    {
      name: "Tasks",
      color: "rgb(var(--primary-rgb))",
      data: TASK_STATUSES.map((s) => counts[s] ?? 0),
    },
  ];

  return (
    <Card className="h-full">
      <CardHeader title="Task board" desc="Every task in scope, by column." />
      <CardBody>
        {total === 0 ? (
          <EmptyState icon={ListChecks} title="No tasks yet" />
        ) : (
          <>
            <Bars series={series} labels={[...TASK_STATUSES]} height={250} />
            <div className="mt-3 flex flex-wrap gap-2">
              {TASK_STATUSES.map((status) => (
                <Badge key={status} t={TASK_STATUS_TONE[status]}>
                  {status} · {num(counts[status] ?? 0)}
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------ due soon -- */

function DueSoon({ projects }: { projects: Project[] }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="h-full">
      <CardHeader title="Due soon" desc="Unfinished projects landing within a fortnight." />
      {projects.length === 0 ? (
        <CardBody>
          <EmptyState icon={CalendarClock} title="Nothing due in the next two weeks" />
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {projects.map((p) => {
            const days = p.endDate ? daysBetween(today, p.endDate) : 0;
            const overdue = days < 0;
            return (
              <li key={p.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[0.8125rem] font-semibold text-heading">
                    {p.name}
                  </span>
                  <Badge t={overdue ? "red" : days <= 3 ? "orange" : "slate"}>
                    {overdue
                      ? `${Math.abs(days)}d overdue`
                      : days === 0
                        ? "Today"
                        : `${days}d left`}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-[0.6875rem] text-muted">
                  {p.client || "No client"} · due {formatDate(p.endDate)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ projects -- */

function RecentProjects({ projects }: { projects: Project[] }) {
  const { state } = useStore();

  return (
    <Card className="h-full">
      <CardHeader title="Recent projects" desc="Newest first, with delivery progress." />
      {projects.length === 0 ? (
        <CardBody>
          <EmptyState icon={FolderKanban} title="No projects yet" />
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {projects.map((p) => {
            const progress = projectProgress(state, p.id);
            return (
              <li key={p.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8125rem] font-semibold text-heading">
                      {p.name}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-muted">
                      {p.code} · {p.client || "No client"}
                    </span>
                  </span>
                  <Badge t={PROJECT_STATUS_TONE[p.status]}>{p.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={progress} t={PROJECT_STATUS_TONE[p.status]} />
                  <span className="w-9 shrink-0 text-right text-[0.6875rem] font-semibold text-heading">
                    {progress}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- team -- */

function WhoIsOn({ employees }: { employees: { id: string; name: string; role: string; status: string; tone: string; branch: string }[] }) {
  const shown = employees.slice(0, 6);

  return (
    <Card className="h-full">
      <CardHeader
        title="Who's on"
        desc="Current availability across the roster."
        action={
          <Link
            href="employee-management"
            className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-primary hover:underline"
          >
            All <ArrowRight size={12} />
          </Link>
        }
      />
      {shown.length === 0 ? (
        <CardBody>
          <EmptyState icon={Users} title="Nobody on the roster yet" />
        </CardBody>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {shown.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Avatar
                  initials={initialsOf(e.name)}
                  t={e.tone as "blue" | "sky" | "orange" | "red" | "slate"}
                  size={32}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-heading">
                    {e.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-muted">
                    {e.role}
                    {e.branch ? ` · ${e.branch}` : ""}
                  </span>
                </span>
                <Badge
                  t={
                    EMPLOYEE_STATUS_TONE[
                      e.status as keyof typeof EMPLOYEE_STATUS_TONE
                    ] ?? "slate"
                  }
                >
                  {e.status}
                </Badge>
              </li>
            ))}
          </ul>
          {employees.length > shown.length && (
            <CardBody className="pt-0">
              <SectionLabel>
                {num(employees.length - shown.length)} more on the roster
              </SectionLabel>
            </CardBody>
          )}
        </>
      )}
    </Card>
  );
}
