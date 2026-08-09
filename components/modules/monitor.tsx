"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Flag,
  CalendarClock,
  FolderKanban,
  Pencil,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Progress,
  StatTile,
  Button,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  tone,
} from "@/components/ui";
import { useStore } from "@/lib/store/StoreProvider";
import {
  formatDate,
  orderedPlan,
  planProgress,
  projectsForClient,
  scopedProjects,
  tasksForProject,
  taskScore,
} from "@/lib/store/selectors";
import {
  MILESTONE_TONE,
  PROJECT_STATUS_TONE,
  type Milestone,
  type Project,
} from "@/lib/store/types";
import { getPortal } from "@/lib/portals";
import PlanEditor from "./PlanEditor";

/*
 * Monitor — the delivery plan, as the client sees it.
 *
 * The client portal sees only the projects belonging to its own account, and
 * only the plan: milestones, dates and status. No task ids, no assignee names,
 * no internal notes. Staff portals see the same view across every project in
 * scope, plus a way to edit the plan, so what the client reads is never a
 * separate document that drifts.
 */

export function Monitor() {
  const { hydrated, state, currentPortal } = useStore();
  const [editing, setEditing] = useState<Project | null>(null);

  const clientId = getPortal(currentPortal)?.clientId;
  const isClient = currentPortal === "client";

  const projects = useMemo(() => {
    if (isClient) return clientId ? projectsForClient(state, clientId) : [];
    return scopedProjects(state);
  }, [state, isClient, clientId]);

  const stats = useMemo(() => {
    const all = projects.flatMap((p) => p.plan);
    return {
      projects: projects.length,
      done: all.filter((m) => m.status === "Done").length,
      total: all.length,
      delayed: all.filter((m) => m.status === "Delayed").length,
      next: projects
        .flatMap((p) => orderedPlan(p).filter((m) => m.status !== "Done").slice(0, 1))
        .sort((a, b) => a.due.localeCompare(b.due))[0],
    };
  }, [projects]);

  if (!hydrated) return <ModuleSkeleton rows={4} stats />;

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={FolderKanban}
          title={isClient ? "No projects on your account yet" : "Nothing to monitor"}
          desc={
            isClient
              ? "When a project is opened against your account its delivery plan appears here."
              : "Projects need a plan before they show up here. Add milestones from a project's detail panel."
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label={isClient ? "Your Projects" : "Projects"}
          value={String(stats.projects)}
          hint={isClient ? "Open with Jadvix" : "In scope"}
          t="blue"
          icon={FolderKanban}
        />
        <StatTile
          label="Milestones Done"
          value={`${stats.done} / ${stats.total}`}
          hint="Across every plan"
          t="sky"
          icon={CheckCircle2}
        />
        <StatTile
          label="Running Late"
          value={String(stats.delayed)}
          hint={stats.delayed === 0 ? "Everything on schedule" : "Needs a new date"}
          t={stats.delayed === 0 ? "slate" : "red"}
          icon={CircleAlert}
        />
        <StatTile
          label="Next Milestone"
          value={stats.next ? formatDate(stats.next.due).slice(0, 6) : "—"}
          hint={stats.next?.label ?? "Nothing scheduled"}
          t="orange"
          icon={CalendarClock}
        />
      </Grid>

      {projects.map((project) => (
        <ProjectPlan
          key={project.id}
          project={project}
          isClient={isClient}
          onEdit={() => setEditing(project)}
        />
      ))}

      {editing && (
        <PlanEditor
          key={editing.id}
          open
          project={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ plan -- */

function ProjectPlan({
  project,
  isClient,
  onEdit,
}: {
  project: Project;
  isClient: boolean;
  onEdit: () => void;
}) {
  const { state } = useStore();
  const plan = orderedPlan(project);
  const planned = planProgress(project);

  // Delivery percentage from the actual work, shown to staff alongside the
  // milestone count so the two can be compared.
  const tasks = tasksForProject(state, project.id);
  const delivery = tasks.length
    ? Math.round(tasks.reduce((n, t) => n + taskScore(t), 0) / tasks.length)
    : 0;

  return (
    <Card>
      <CardHeader
        title={project.name}
        desc={
          isClient
            ? `${project.code} · ${plan.filter((m) => m.status === "Done").length} of ${plan.length} milestones complete`
            : `${project.code} · ${project.client}`
        }
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Badge t={PROJECT_STATUS_TONE[project.status]}>{project.status}</Badge>
            {!isClient && (
              <Button variant="ghost" icon={Pencil} onClick={onEdit}>
                Edit plan
              </Button>
            )}
          </span>
        }
      />

      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[0.8125rem]">
              <span className="text-muted">Plan complete</span>
              <span className="font-semibold text-heading">{planned}%</span>
            </div>
            <Progress value={planned} t={PROJECT_STATUS_TONE[project.status]} />
          </div>
          {!isClient && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[0.8125rem]">
                <span className="text-muted">Task completion</span>
                <span className="font-semibold text-heading">{delivery}%</span>
              </div>
              <Progress value={delivery} t="blue" />
            </div>
          )}
        </div>

        {plan.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line p-5 text-center text-[0.8125rem] text-muted">
            No plan set for this project yet.
          </p>
        ) : (
          <Timeline plan={plan} />
        )}

        {isClient && (
          <p className="rounded-sm bg-subtle p-3 text-[0.75rem] leading-relaxed text-muted">
            Dates are the current plan and move as work lands. Anything marked{" "}
            <span style={{ color: tone.red.text }}>Delayed</span> has a revised date coming from
            your delivery manager.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * The plan as a vertical timeline.
 *
 * A list of dates would read as unordered facts; the rail makes the sequence —
 * and where along it the project currently is — the first thing you see.
 */
function Timeline({ plan }: { plan: Milestone[] }) {
  return (
    <ol className="relative space-y-4 border-s-2 border-line ps-5">
      {plan.map((m) => {
        const t = MILESTONE_TONE[m.status];
        const done = m.status === "Done";
        return (
          <li key={m.id} className="relative">
            <span
              className="absolute -start-[1.6875rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-[var(--custom-white)]"
              style={{ background: tone[t].solid }}
            >
              {done && <Flag size={9} className="text-white" />}
            </span>

            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <p
                className={`text-[0.875rem] font-semibold ${
                  done ? "text-muted line-through" : "text-heading"
                }`}
              >
                {m.label}
              </p>
              <span className="flex shrink-0 items-center gap-2">
                <Badge t={t}>{m.status}</Badge>
                <span className="whitespace-nowrap text-[0.75rem] text-muted">
                  {formatDate(m.due)}
                </span>
              </span>
            </div>

            {m.note && (
              <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{m.note}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { Activity, Chip };
