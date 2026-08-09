"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  LayoutGrid,
  Rows3,
  ListChecks,
  GitPullRequest,
  Check,
  History,
  RotateCcw,
  CalendarDays,
  FolderKanban,
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
  Button,
  IconButton,
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  PersonChip,
  tone,
} from "@/components/ui";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { SelectInput } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  checklistDone,
  checklistPoints,
  clampScore,
  itemPoints,
  employeesByIds,
  formatDate,
  formatDateShort,
  initialsOf,
  projectsByIds,
  reworkCount,
  scopedTasks,
  taskScore,
} from "@/lib/store/selectors";
import {
  ROLE_TONE,
  TASK_STATUSES,
  TASK_STATUS_TONE,
  priorityMeta,
  type Task,
  type TaskStatus,
} from "@/lib/store/types";
import TaskForm from "./TaskForm";
import { QcHistory } from "./checklist";
import SubtaskList from "./SubtaskList";

/**
 * May the signed-in person change what a task IS — retitle, re-scope, delete?
 *
 * Mirrors the API's `full` level exactly, so a button is never offered that can
 * only produce a 403: a super admin, or an accepted MANAGER on one of the
 * task's projects. `project.reportTo` is precisely that list, which is why it
 * is the thing consulted rather than membership generally.
 *
 * Moving a task's status and scoring its subtasks is a different, wider right
 * — the API's `work` level, open to anyone on the project team — and is
 * deliberately NOT gated here.
 */
function useCanManageTasks() {
  const { state, currentEmployee } = useStore();
  const isAdmin = Boolean(currentEmployee?.isOwner) || currentEmployee?.role === "Super Admin";
  const me = currentEmployee?.id;

  return (task: Task) => {
    if (isAdmin) return true;
    if (!me) return false;
    return state.projects.some(
      (p) => task.projectIds.includes(p.id) && p.reportTo.includes(me),
    );
  };
}

type SortKey = "priority" | "score" | "due" | "title" | "status";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "priority", label: "Priority (P1 first)" },
  { value: "due", label: "Due date (soonest)" },
  { value: "score", label: "Completion (low first)" },
  { value: "title", label: "Title A–Z" },
  { value: "status", label: "Status" },
];

export function TaskManagement() {
  const { hydrated, state, deleteTask } = useStore();
  const tasks = useMemo(() => scopedTasks(state), [state]);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "All">("All");
  const [sort, setSort] = useState<SortKey>("priority");
  const [view, setView] = useState<"board" | "list">("board");
  /** Which of the two readings is on screen — see the switch below. */
  const [scope, setScope] = useState<"tasks" | "subtasks">("tasks");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Task | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const subtaskCount = useMemo(
    () => tasks.reduce((n, t) => n + t.checklist.length, 0),
    [tasks],
  );

  const counts = useMemo(() => {
    const by = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
    return {
      total: tasks.length,
      open: tasks.filter((t) => t.status !== "Done").length,
      p1: tasks.filter((t) => t.priority === 1 && t.status !== "Done").length,
      review: by("In Review"),
      byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, by(s)])) as Record<
        TaskStatus,
        number
      >,
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tasks.filter((t) => {
      if (status !== "All" && t.status !== status) return false;
      if (!q) return true;
      const people = employeesByIds(state, t.assignedTo)
        .map((e) => e.name)
        .join(" ");
      const projects = projectsByIds(state, t.projectIds)
        .map((p) => `${p.name} ${p.code}`)
        .join(" ");
      return `${t.title} ${t.taskId} ${t.description} ${people} ${projects}`
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...rows];
    if (sort === "priority")
      sorted.sort((a, b) => a.priority - b.priority || a.taskId.localeCompare(b.taskId));
    else if (sort === "score") sorted.sort((a, b) => taskScore(a) - taskScore(b));
    else if (sort === "due")
      sorted.sort((a, b) => (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999"));
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else
      sorted.sort(
        (a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) ||
          a.priority - b.priority,
      );
    return sorted;
  }, [tasks, query, status, sort, state]);

  if (!hydrated) return <ModuleSkeleton />;

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (t: Task) => {
    setDetail(null);
    setEditing(t);
    setFormOpen(true);
  };

  const filtersActive = query.trim() !== "" || status !== "All";

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Open Tasks"
          value={String(counts.open)}
          hint={`${counts.total} in total`}
          t="blue"
          icon={ListChecks}
        />
        <StatTile
          label="P1 Outstanding"
          value={String(counts.p1)}
          hint="Worked before anything else"
          t="red"
          icon={ChevronRight}
        />
        <StatTile
          label="In Review"
          value={String(counts.review)}
          hint="Waiting on QC sign-off"
          t="orange"
          icon={History}
        />
        <StatTile
          label="Done"
          value={String(counts.byStatus.Done)}
          hint="Closed and scored"
          t="sky"
          icon={FolderKanban}
        />
      </Grid>

      {/*
       * Tasks or subtasks.
       *
       * Two readings of the same data, not two datasets: Tasks answers "what
       * work is open", Subtasks answers "what acceptance is outstanding". The
       * switch sits above the toolbar because it changes what the filters below
       * it apply to.
       */}
      <div className="flex overflow-hidden rounded-sm border border-line" role="tablist">
        {(
          [
            { key: "tasks", label: "Tasks", count: counts.total },
            { key: "subtasks", label: "Subtasks", count: subtaskCount },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={scope === t.key}
            onClick={() => setScope(t.key)}
            className={`flex-1 px-4 py-2 text-[0.8125rem] font-medium transition-colors sm:flex-none ${
              scope === t.key
                ? "bg-primary text-white"
                : "bg-card text-muted hover:text-primary"
            }`}
          >
            {t.label}
            <span className="ms-1.5 opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {scope === "subtasks" ? (
        <SubtaskList tasks={tasks} />
      ) : (
        <>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          placeholder="Search tasks, people or projects…"
          value={query}
          onChange={setQuery}
          className="sm:w-64"
        />
        <Chip active={status === "All"} onClick={() => setStatus("All")} count={counts.total}>
          All
        </Chip>
        {TASK_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={counts.byStatus[s]}>
            {s}
          </Chip>
        ))}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <div className="w-44">
            <SelectInput<SortKey>
              label="Sort tasks by"
              hideLabel
              value={sort}
              onChange={setSort}
              options={SORTS}
            />
          </div>
          {/* view switch */}
          <div className="flex overflow-hidden rounded-sm border border-line">
            {(
              [
                { key: "board", icon: LayoutGrid, label: "Board view" },
                { key: "list", icon: Rows3, label: "List view" },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-label={v.label}
                aria-pressed={view === v.key}
                title={v.label}
                className={`flex h-9 w-9 items-center justify-center transition-colors ${
                  view === v.key ? "bg-primary text-white" : "bg-card text-muted hover:text-primary"
                }`}
              >
                <v.icon size={16} />
              </button>
            ))}
          </div>
          <Button icon={Plus} onClick={openCreate}>
            New Task
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={tasks.length === 0 ? "No tasks yet" : "Nothing matches those filters"}
            desc={
              tasks.length === 0
                ? "Create a task to start tracking work, subtasks and scores."
                : "Try a different search term, or clear the status filter."
            }
            action={
              tasks.length === 0 ? (
                <Button icon={Plus} onClick={openCreate}>
                  New Task
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
        </Card>
      ) : view === "board" ? (
        <BoardView tasks={filtered} onOpen={setDetail} filtersActive={filtersActive} />
      ) : (
        <ListView
          tasks={filtered}
          openId={openId}
          onToggle={(id) => setOpenId(openId === id ? null : id)}
          onEdit={openEdit}
          onDelete={setPendingDelete}
        />
      )}
        </>
      )}

      {detail && (
        <TaskDetailModal
          task={tasks.find((t) => t.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onEdit={openEdit}
        />
      )}

      {formOpen && (
        <TaskForm
          key={editing?.id ?? "new"}
          open={formOpen}
          task={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteTask(pendingDelete.id)}
        title="Delete task"
        message={`${pendingDelete?.taskId ?? "This task"} — “${pendingDelete?.title ?? ""}” will be removed. This can't be undone.`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ board -- */

function BoardView({
  tasks,
  onOpen,
  filtersActive,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  filtersActive: boolean;
}) {
  const { state } = useStore();

  return (
    // The board scrolls horizontally rather than squashing five columns.
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid min-w-[1100px] grid-cols-5 gap-4">
        {TASK_STATUSES.map((column) => {
          const items = tasks.filter((t) => t.status === column);
          const t = TASK_STATUS_TONE[column];
          return (
            <section key={column} className="flex flex-col">
              <header className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: tone[t].solid }} />
                <h3 className="text-[0.8125rem] font-semibold text-heading">{column}</h3>
                <span className="rounded-sm bg-subtle px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted">
                  {items.length}
                </span>
              </header>

              <div className="space-y-3">
                {items.length === 0 && (
                  <p className="rounded-card border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">
                    {filtersActive ? "Nothing here matches" : "Nothing here yet"}
                  </p>
                )}
                {items.map((task) => {
                  const score = taskScore(task);
                  const pri = priorityMeta(task.priority);
                  const people = employeesByIds(state, task.assignedTo);
                  const projects = projectsByIds(state, task.projectIds);
                  const rework = reworkCount(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpen(task)}
                      className="w-full rounded-card border border-line bg-card p-3 text-left shadow-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[0.6875rem] text-muted">{task.taskId}</span>
                        <Badge t={pri.tone}>{pri.short}</Badge>
                      </div>

                      <p className="text-[0.8125rem] font-medium leading-snug text-heading">
                        {task.title}
                      </p>

                      {projects.length > 0 && (
                        <p className="mt-1.5 truncate text-[0.6875rem] text-muted">
                          {projects.map((p) => p.code).join(" · ")}
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center gap-2">
                        <Progress value={score} t={t} />
                        <span className="w-9 shrink-0 text-right text-[0.6875rem] font-semibold text-heading">
                          {score}%
                        </span>
                      </div>

                      {/* rework is the thing you most need to see at a glance */}
                      {rework > 0 && (
                        <p
                          className="mt-2 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.625rem] font-semibold"
                          style={{ background: tone.red.soft, color: tone.red.text }}
                        >
                          <RotateCcw size={10} />
                          Sent back by QC {rework}×
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-[0.6875rem] text-muted">
                          <ListChecks size={12} />
                          {checklistDone(task)}/{task.checklist.length}
                          {task.endDate && (
                            <>
                              <span className="mx-1">·</span>
                              <CalendarDays size={12} />
                              {formatDateShort(task.endDate)}
                            </>
                          )}
                        </span>
                        {people.length > 0 ? (
                          <AvatarStack items={people.map((e) => initialsOf(e.name))} />
                        ) : (
                          <span className="text-[0.6875rem] text-muted">Unassigned</span>
                        )}
                      </div>

                      <p className="mt-1.5 truncate text-[0.625rem] text-muted">
                        Created by {task.createdBy}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- list -- */

function ListView({
  tasks,
  openId,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  openId: string | null;
  onToggle: (id: string) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const { state } = useStore();
  const canManage = useCanManageTasks();

  return (
    <Card>
      <CardHeader title="All Tasks" desc="Select a row to open the full task." />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <Th>Task</Th>
            <Th>Project</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th>Created by</Th>
            <Th className="w-36">Score</Th>
            <Th>Assigned</Th>
            <Th>Due</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const expanded = openId === task.id;
            const score = taskScore(task);
            const pri = priorityMeta(task.priority);
            const people = employeesByIds(state, task.assignedTo);
            const projects = projectsByIds(state, task.projectIds);
            return (
              <Fragment key={task.id}>
                <Tr expanded={expanded} onClick={() => onToggle(task.id)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={expanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
                        aria-expanded={expanded}
                        className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                      >
                        <ChevronRight size={16} />
                      </button>
                      <span className="min-w-0">
                        <span className="block font-medium text-heading">{task.title}</span>
                        <span className="font-mono text-[0.6875rem] text-muted">{task.taskId}</span>
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {projects.length === 0 ? "—" : projects.map((p) => p.code).join(", ")}
                  </Td>
                  <Td>
                    <Badge t={TASK_STATUS_TONE[task.status]}>{task.status}</Badge>
                  </Td>
                  <Td>
                    <Badge t={pri.tone}>{pri.short}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{task.createdBy}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Progress value={score} t={TASK_STATUS_TONE[task.status]} />
                      <span className="w-9 shrink-0 text-right text-[0.75rem] font-semibold text-heading">
                        {score}%
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {people.length > 0 ? (
                      <AvatarStack items={people.map((e) => initialsOf(e.name))} />
                    ) : (
                      <span className="text-[0.75rem] text-muted">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(task.endDate)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {canManage(task) ? (
                        <>
                          <IconButton
                            icon={Pencil}
                            label={`Edit ${task.taskId}`}
                            onClick={() => onEdit(task)}
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${task.taskId}`}
                            tone="red"
                            onClick={() => onDelete(task)}
                          />
                        </>
                      ) : (
                        <span className="text-[0.6875rem] text-muted">Manager only</span>
                      )}
                    </div>
                  </Td>
                </Tr>
                {expanded && (
                  <ExpandRow colSpan={9}>
                    <TaskDetail task={task} />
                  </ExpandRow>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TableWrap>
    </Card>
  );
}

/* ----------------------------------------------------------------- detail -- */

function TaskDetailModal({
  task,
  onClose,
  onEdit,
}: {
  task: Task;
  onClose: () => void;
  onEdit: (t: Task) => void;
}) {
  const canManage = useCanManageTasks();

  return (
    <Modal
      open
      onClose={onClose}
      title={`${task.taskId} · ${task.title}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {canManage(task) && (
            <Button icon={Pencil} onClick={() => onEdit(task)}>
              Edit task
            </Button>
          )}
        </>
      }
    >
      <TaskDetail task={task} />
    </Modal>
  );
}

/**
 * Shared by the expanded list row and the detail modal.
 *
 * Read-only apart from the status control. The subtasks — their wording, their
 * scores and its points — is only editable through the task form, so a number
 * that costs someone KRA can't be moved by brushing a slider while reading.
 */
function TaskDetail({ task }: { task: Task }) {
  const { state, updateTask } = useStore();
  const assignees = employeesByIds(state, task.assignedTo);
  const reports = employeesByIds(state, task.reportTo);
  const projects = projectsByIds(state, task.projectIds);
  const score = taskScore(task);
  const pri = priorityMeta(task.priority);
  const rework = reworkCount(task);

  const setStatus = (next: TaskStatus) => {
    if (next === task.status) return;
    updateTask(task.id, { status: next }, `Status ${task.status} → ${next}.`);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      {/* left: brief + subtasks */}
      <div className="space-y-4 xl:col-span-7">
        <div>
          <SectionLabel>Description</SectionLabel>
          <p className="text-[0.8125rem] leading-relaxed text-text">{task.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge t={pri.tone}>{pri.label}</Badge>
          <Badge t={TASK_STATUS_TONE[task.status]}>{task.status}</Badge>
          {rework > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[0.6875rem] font-semibold"
              style={{ background: tone.red.soft, color: tone.red.text }}
            >
              <RotateCcw size={11} />
              Sent back by QC {rework}×
            </span>
          )}
          {projects.map((p) => (
            <span
              key={p.id}
              className="rounded-sm px-2 py-1 text-[0.6875rem] font-medium"
              style={{ background: tone.slate.soft, color: tone.slate.text }}
            >
              {p.code} · {p.name}
            </span>
          ))}
          {task.prUrl && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[0.6875rem] font-medium underline-offset-2 hover:underline"
              style={{ background: tone.blue.soft, color: tone.blue.text }}
            >
              <GitPullRequest size={12} />
              Pull request
            </a>
          )}
        </div>

        {/* Read-only. Scores and points are set in the task form; changing them
            from a detail view made it too easy to move a number by accident. */}
        <div className="rounded-sm border border-line bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <SectionLabel>
              Checklist — {checklistDone(task)}/{task.checklist.length} complete ·{" "}
              {checklistPoints(task)} point{checklistPoints(task) === 1 ? "" : "s"}
            </SectionLabel>
            <span
              className="rounded-sm px-2 py-0.5 text-[0.75rem] font-bold"
              style={{ background: tone.blue.soft, color: tone.blue.text }}
            >
              {score}%
            </span>
          </div>
          {task.checklist.length === 0 ? (
            <p className="p-4 text-center text-[0.75rem] text-muted">No subtasks on this task.</p>
          ) : (
            <ul className="divide-y divide-line">
              {task.checklist.map((c) => {
                const value = clampScore(c.score);
                const complete = value >= 1;
                return (
                  <li key={c.id} className="flex items-center gap-3 p-2.5">
                    <span
                      aria-hidden
                      className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border"
                      style={
                        complete
                          ? { background: tone.sky.solid, borderColor: "transparent", color: "#fff" }
                          : undefined
                      }
                    >
                      {complete && <Check size={11} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[0.8125rem] ${
                          complete ? "text-muted line-through" : "text-text"
                        }`}
                      >
                        {c.label}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <Progress value={value * 100} t={complete ? "sky" : "blue"} />
                        <span className="w-7 shrink-0 text-right font-mono text-[0.6875rem] font-semibold text-heading">
                          {value.toFixed(1)}
                        </span>
                      </span>
                    </span>

                    <span
                      className="shrink-0 rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold"
                      style={{ background: tone.slate.soft, color: tone.slate.text }}
                      title={`Worth ${itemPoints(c)} KRA point${itemPoints(c) === 1 ? "" : "s"} if QC rejects this line`}
                    >
                      {itemPoints(c)} pt{itemPoints(c) === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-muted">
            Scores and points are edited from the task form. QC scores subtasks in the QC Review
            module.
          </p>
        </div>

        {/* QC trail — why the task came back, and what it cost */}
        <QcHistory task={task} />

        {/* history */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-muted">
            <History size={14} />
            <SectionLabel>Updated by ({task.updatedBy.length})</SectionLabel>
          </div>
          {task.updatedBy.length === 0 ? (
            <p className="text-[0.75rem] text-muted">
              No changes recorded since {task.createdBy} created it on {formatDate(task.createdAt)}.
            </p>
          ) : (
            <ul className="space-y-2 border-s border-line ps-3">
              {[...task.updatedBy].reverse().map((u) => (
                <li key={u.id} className="relative">
                  <span
                    className="absolute -start-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full"
                    style={{ background: tone.blue.solid }}
                  />
                  <p className="text-[0.8125rem] leading-snug text-text">{u.summary}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-muted">
                    {u.by} · {formatDate(u.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* right: people and dates */}
      <div className="space-y-4 xl:col-span-5">
        <div>
          <SectionLabel>Status</SectionLabel>
          <SelectInput<TaskStatus>
            label="Change status"
            hideLabel
            value={task.status}
            onChange={setStatus}
            options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>

        <div>
          <SectionLabel>Assigned to ({assignees.length})</SectionLabel>
          {assignees.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Nobody assigned.</p>
          ) : (
            <ul className="space-y-1.5">
              {assignees.map((e) => (
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

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-[0.75rem] text-muted">Created by</dt>
            <dd className="text-[0.8125rem] font-medium text-heading">{task.createdBy}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-[0.75rem] text-muted">Created</dt>
            <dd className="text-[0.8125rem] font-medium text-heading">
              {formatDate(task.createdAt)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-[0.75rem] text-muted">Start date</dt>
            <dd className="text-[0.8125rem] font-medium text-heading">
              {formatDate(task.startDate)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-[0.75rem] text-muted">End date</dt>
            <dd className="text-[0.8125rem] font-medium text-heading">{formatDate(task.endDate)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
