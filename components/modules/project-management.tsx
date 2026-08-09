"use client";

import { Fragment, useMemo, useState } from "react";
import {
  FolderKanban,
  CircleAlert,
  CheckCircle2,
  Timer,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ListChecks,
  CalendarClock,
  Users,
  KeyRound,
  Target,
  Lightbulb,
} from "lucide-react";
import {
  Card,
  CardHeader,
  Badge,
  Avatar,
  AvatarStack,
  Progress,
  StatTile,
  TableWrap,
  Th,
  Td,
  Tr,
  ExpandRow,
  Toolbar,
  Button,
  IconButton,
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  Fact,
  PersonChip,
  tone,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/overlay";
import { SelectInput } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  employeesByIds,
  formatDate,
  initialsOf,
  canSeeSecrets,
  orderedPlan,
  projectProgress,
  visibleProjects,
  taskScore,
  tasksForProject,
} from "@/lib/store/selectors";
import {
  PROJECT_STATUSES,
  MILESTONE_TONE,
  PROJECT_STATUS_TONE,
  ROLE_TONE,
  TASK_STATUS_TONE,
  priorityMeta,
  type Project,
  type ProjectStatus,
} from "@/lib/store/types";
import { getPortal } from "@/lib/portals";
import ProjectForm from "./ProjectForm";
import PlanEditor from "./PlanEditor";
import SecretsVault, { VaultEditor } from "./SecretsVault";

type SortKey = "updated" | "name" | "progress" | "due";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name A–Z" },
  { value: "progress", label: "Progress (high first)" },
  { value: "due", label: "Due date (soonest)" },
];

export function ProjectManagement() {
  const store = useStore();
  const { hydrated, state, deleteProject, currentPortal } = store;
  // Narrowed by the pinned branch for staff, and to its own account for the
  // client portal — otherwise a client would see every other client's work.
  const clientId = getPortal(currentPortal)?.clientId;
  const projects = useMemo(
    () => visibleProjects(state, currentPortal, clientId),
    [state, currentPortal, clientId],
  );

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "All">("All");
  const [sort, setSort] = useState<SortKey>("updated");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Project | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [vaultFor, setVaultFor] = useState<Project | null>(null);
  // Same rule the detail panel uses — staff who deploy, never the client.
  const vaultVisible = canSeeSecrets(store.currentEmployee, currentPortal);

  const counts = useMemo(() => {
    const by = (s: ProjectStatus) => projects.filter((p) => p.status === s).length;
    return {
      total: projects.length,
      active: projects.filter((p) => p.status !== "Delivered").length,
      attention: by("At Risk") + by("Delayed"),
      delivered: by("Delivered"),
      byStatus: Object.fromEntries(PROJECT_STATUSES.map((s) => [s, by(s)])) as Record<
        ProjectStatus,
        number
      >,
    };
  }, [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = projects.filter((p) => {
      if (status !== "All" && p.status !== status) return false;
      if (!q) return true;
      return `${p.name} ${p.code} ${p.client} ${p.description}`.toLowerCase().includes(q);
    });

    const sorted = [...rows];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "progress")
      sorted.sort((a, b) => projectProgress(state, b.id) - projectProgress(state, a.id));
    else if (sort === "due")
      // Projects with no end date sort last rather than first.
      sorted.sort((a, b) => (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999"));
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted;
  }, [projects, query, status, sort, state]);

  if (!hydrated) return <ModuleSkeleton />;

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Active Projects"
          value={String(counts.active)}
          hint={`${counts.total} in total`}
          t="blue"
          icon={FolderKanban}
        />
        <StatTile
          label="Needs Attention"
          value={String(counts.attention)}
          hint="At risk or delayed"
          t="orange"
          icon={CircleAlert}
        />
        <StatTile
          label="Delivered"
          value={String(counts.delivered)}
          hint="Closed and signed off"
          t="sky"
          icon={CheckCircle2}
        />
        <StatTile
          label="Open Tasks"
          value={String(state.tasks.filter((t) => t.status !== "Done").length)}
          hint="Across every project"
          t="slate"
          icon={Timer}
        />
      </Grid>

      <Card>
        <CardHeader
          title="All Projects"
          desc="Select a row to open the brief, its team and its tasks."
          action={
            <Toolbar>
              <SearchBox
                placeholder="Search projects…"
                value={query}
                onChange={setQuery}
                className="sm:w-52"
              />
              <Button icon={Plus} onClick={openCreate}>
                New Project
              </Button>
            </Toolbar>
          }
        />

        {/* filter + sort strip */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Chip active={status === "All"} onClick={() => setStatus("All")} count={counts.total}>
            All
          </Chip>
          {PROJECT_STATUSES.map((s) => (
            <Chip
              key={s}
              active={status === s}
              onClick={() => setStatus(s)}
              count={counts.byStatus[s]}
            >
              {s}
            </Chip>
          ))}
          <div className="ms-auto w-full sm:w-48">
            <SelectInput<SortKey>
              label="Sort projects by"
              hideLabel
              value={sort}
              onChange={setSort}
              options={SORTS}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={projects.length === 0 ? "No projects yet" : "Nothing matches those filters"}
            desc={
              projects.length === 0
                ? "Create the first project to start tracking delivery, teams and tasks."
                : "Try a different search term, or clear the status filter."
            }
            action={
              projects.length === 0 ? (
                <Button icon={Plus} onClick={openCreate}>
                  New Project
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                    setStatus("All");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Project</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th className="w-44">Progress</Th>
                <Th>Team</Th>
                <Th>Tasks</Th>
                <Th>Due</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const expanded = openId === p.id;
                const progress = projectProgress(state, p.id);
                const team = employeesByIds(state, p.assignedEmployees);
                const tasks = tasksForProject(state, p.id);
                const openTasks = tasks.filter((t) => t.status !== "Done").length;

                return (
                  <Fragment key={p.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : p.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${p.name}` : `Expand ${p.name}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <span className="min-w-0">
                            <span className="block font-semibold text-heading">{p.name}</span>
                            <span className="font-mono text-[0.6875rem] text-muted">{p.code}</span>
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">{p.client}</Td>
                      <Td>
                        <Badge t={PROJECT_STATUS_TONE[p.status]}>{p.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} t={PROJECT_STATUS_TONE[p.status]} />
                          <span className="w-9 shrink-0 text-right text-[0.75rem] font-semibold text-heading">
                            {progress}%
                          </span>
                        </div>
                      </Td>
                      <Td>
                        {team.length > 0 ? (
                          <AvatarStack items={team.map((e) => initialsOf(e.name))} />
                        ) : (
                          <span className="text-[0.75rem] text-muted">Unassigned</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="font-semibold text-heading">{openTasks}</span>
                        <span className="text-muted"> / {tasks.length}</span>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(p.endDate)}</Td>
                      <Td>
                        {/* Stop propagation so a row action doesn't also toggle the row. */}
                        <div
                          className="flex justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* One click to the .env values, rather than
                              expanding the row and scrolling past the brief. */}
                          {vaultVisible && (
                            <IconButton
                              icon={KeyRound}
                              label={
                                p.secrets.length
                                  ? `Vault for ${p.name} — ${p.secrets.length} value${p.secrets.length === 1 ? "" : "s"}`
                                  : `Vault for ${p.name} — empty`
                              }
                              tone={p.secrets.length ? "orange" : undefined}
                              onClick={() => setVaultFor(p)}
                            />
                          )}
                          <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => openEdit(p)} />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${p.name}`}
                            tone="red"
                            onClick={() => setPendingDelete(p)}
                          />
                        </div>
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <ProjectDetail project={p} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {formOpen && (
        <ProjectForm
          // Remounts per open so the draft never carries over between records.
          key={editing?.id ?? "new"}
          open={formOpen}
          project={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      {vaultFor && (
        <VaultEditor
          key={vaultFor.id}
          open
          project={state.projects.find((p) => p.id === vaultFor.id) ?? vaultFor}
          onClose={() => setVaultFor(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteProject(pendingDelete.id)}
        title="Delete project"
        message={`${pendingDelete?.name ?? "This project"} will be removed. Its tasks are kept but will no longer belong to a project.`}
      />
    </div>
  );
}

/* ------------------------------------------------------------ detail pane -- */

function ProjectDetail({ project }: { project: Project }) {
  const { state, currentEmployee, currentPortal } = useStore();
  const [planOpen, setPlanOpen] = useState(false);
  const vaultVisible = canSeeSecrets(currentEmployee, currentPortal);
  const team = employeesByIds(state, project.assignedEmployees);
  const reports = employeesByIds(state, project.reportTo);
  const tasks = tasksForProject(state, project.id);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      {/* brief */}
      <div className="space-y-4 xl:col-span-5">
        <Fact label="Description" block>
          {project.description}
        </Fact>

        <div className="rounded-sm border border-line bg-card p-3">
          <div className="mb-1.5 flex items-center gap-1.5" style={{ color: tone.orange.text }}>
            <Target size={14} />
            <SectionLabel>Problem statement</SectionLabel>
          </div>
          <p className="text-[0.8125rem] leading-relaxed text-text">{project.problemStatement}</p>
        </div>

        <div className="rounded-sm border border-line bg-card p-3">
          <div className="mb-1.5 flex items-center gap-1.5" style={{ color: tone.sky.text }}>
            <Lightbulb size={14} />
            <SectionLabel>Solution</SectionLabel>
          </div>
          <p className="text-[0.8125rem] leading-relaxed text-text">{project.solution}</p>
        </div>

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <Fact label="Client">{project.client}</Fact>
          <Fact label="Start date">{formatDate(project.startDate)}</Fact>
          <Fact label="End date">{formatDate(project.endDate)}</Fact>
          <Fact label="Last updated">{formatDate(project.updatedAt)}</Fact>
        </dl>

        {/* Delivery plan — the only part of a project the client is shown. */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-muted">
              <CalendarClock size={14} />
              <SectionLabel>
                Delivery plan ({project.plan.filter((m) => m.status === "Done").length}/
                {project.plan.length})
              </SectionLabel>
            </div>
            <Button variant="ghost" icon={Pencil} onClick={() => setPlanOpen(true)}>
              {project.plan.length ? "Edit plan" : "Add plan"}
            </Button>
          </div>

          {project.plan.length === 0 ? (
            <p className="rounded-sm border border-dashed border-line p-3 text-center text-[0.75rem] text-muted">
              No plan yet. The client sees this on their Monitor page once you add one.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {orderedPlan(project).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-sm border border-line bg-card px-2.5 py-2"
                >
                  <span
                    className={`min-w-0 flex-1 truncate text-[0.8125rem] ${
                      m.status === "Done" ? "text-muted line-through" : "text-text"
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge t={MILESTONE_TONE[m.status]}>{m.status}</Badge>
                    <span className="whitespace-nowrap text-[0.6875rem] text-muted">
                      {formatDate(m.due)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Vault — staff who deploy only; never the client portal. */}
        {vaultVisible && <SecretsVault project={project} />}

        {planOpen && (
          <PlanEditor key={project.id} open project={project} onClose={() => setPlanOpen(false)} />
        )}
      </div>

      {/* people */}
      <div className="space-y-4 xl:col-span-3">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-muted">
            <Users size={14} />
            <SectionLabel>Assigned employees ({team.length})</SectionLabel>
          </div>
          {team.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Nobody assigned yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {team.map((e) => (
                <li key={e.id} className="flex items-center gap-2.5">
                  <Avatar initials={initialsOf(e.name)} t={e.tone} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-heading">
                      {e.name}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-muted">
                      {e.role} · {e.empId}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel>Reports to ({reports.length})</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {reports.length === 0 ? (
              <p className="text-[0.75rem] text-muted">No reporting line set.</p>
            ) : (
              reports.map((e) => (
                <PersonChip
                  key={e.id}
                  initials={initialsOf(e.name)}
                  name={e.name}
                  hint={e.role}
                  t={ROLE_TONE[e.role]}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* tasks */}
      <div className="xl:col-span-4">
        <div className="mb-2 flex items-center gap-1.5 text-muted">
          <ListChecks size={14} />
          <SectionLabel>Tasks ({tasks.length})</SectionLabel>
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">
            No tasks belong to this project yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const score = taskScore(t);
              const assignees = employeesByIds(state, t.assignedTo);
              const pri = priorityMeta(t.priority);
              return (
                <li key={t.id} className="rounded-sm border border-line bg-card p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-medium text-heading">
                        {t.title}
                      </span>
                      <span className="font-mono text-[0.6875rem] text-muted">{t.taskId}</span>
                    </span>
                    <Badge t={TASK_STATUS_TONE[t.status]}>{t.status}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={score} t={TASK_STATUS_TONE[t.status]} />
                    <span className="w-9 shrink-0 text-right text-[0.6875rem] font-semibold text-heading">
                      {score}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge t={pri.tone}>{pri.short}</Badge>
                    {assignees.length > 0 ? (
                      <AvatarStack items={assignees.map((e) => initialsOf(e.name))} />
                    ) : (
                      <span className="text-[0.6875rem] text-muted">Unassigned</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
