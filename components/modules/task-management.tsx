"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  LayoutGrid,
  Rows3,
  Table2,
  Grid3x3,
  Plus as PlusIcon,
  ListChecks,
  GitPullRequest,
  Check,
  History,
  RotateCcw,
  CalendarDays,
  FolderKanban,
  Paperclip,
  Info,
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
  StatusChip,
  OwnerChip,
  UnassignedChip,
  tone,
} from "@/components/ui";
import { ConfirmDialog, Modal, SplitPanel } from "@/components/ui/overlay";
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
  TASK_STATUS_DEFS,
  TASK_STATUS_TONE,
  priorityMeta,
  taskStatusMeta,
  taskStatusOrder,
  type Subtask,
  type Task,
  type TaskStatus,
} from "@/lib/store/types";
import TaskForm from "./TaskForm";
import { QcHistory } from "./checklist";
import type { IconType } from "@/lib/ui/icon";
import SubtaskList from "./SubtaskList";
import TaskStatusControl from "./TaskStatusControl";
import TaskAttachments, { AttachmentButton } from "./TaskAttachments";
import { RichTextView, hasRichText, richTextToPlain } from "@/components/ui/RichText";
import { GridView } from "./task-grid";

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
  const [view, setView] = useState<"board" | "table" | "list" | "grid">("list");
  /** Which of the two readings is on screen — see the switch below. */
  const [scope, setScope] = useState<"tasks" | "subtasks">("tasks");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Task | null>(null);
  /** The subtask open in the right-hand panel, by parent + line id. */
  const [openSubtask, setOpenSubtask] = useState<{ taskId: string; subtaskId: string } | null>(
    null,
  );
  const [editing, setEditing] = useState<Task | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  // Only one thing lives in the right panel at a time — opening a task closes an
  // open subtask and the reverse, so the column never shows two records at once.
  const openTaskPanel = (t: Task) => {
    setOpenSubtask(null);
    setDetail(t);
  };
  const openSubtaskPanel = (taskId: string, subtaskId: string) => {
    setDetail(null);
    setOpenSubtask({ taskId, subtaskId });
  };

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
      stuck: by("Stuck"),
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
      return `${t.title} ${t.taskId} ${richTextToPlain(t.description)} ${people} ${projects}`
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
        (a, b) => taskStatusOrder(a.status) - taskStatusOrder(b.status) || a.priority - b.priority,
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
    setOpenSubtask(null);
    setEditing(t);
    setFormOpen(true);
  };

  // Switching view drops whatever the panel was showing: the panel is a
  // list-view surface, and a card popup left mid-open behind a board is a ghost.
  const changeView = (v: "board" | "table" | "list" | "grid") => {
    setView(v);
    setDetail(null);
    setOpenSubtask(null);
  };

  const filtersActive = query.trim() !== "" || status !== "All";
  // In list view the panel reserves a column on lg+, so the list pads to match
  // and both stay visible. Below lg the panel overlays and no padding is added.
  const panelOpen = view === "list" && (Boolean(detail) || Boolean(openSubtask));

  return (
    <div
      className={`space-y-4 transition-[padding] duration-300 ${panelOpen ? "lg:pe-[33rem]" : ""}`}
    >
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
          label="Stuck"
          value={String(counts.stuck)}
          hint="Blocked, needs a decision"
          t="red"
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
                { key: "table", icon: Table2, label: "Table view" },
                { key: "grid", icon: Grid3x3, label: "Grid view — add tasks inline" },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => changeView(v.key)}
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

      {/*
        The grid is exempt from the empty state.
        It is the view people open to WRITE, and an empty workspace is exactly
        when that matters most — it renders its own project groups, each with
        an add row, so there is always somewhere to type the first task.
      */}
      {view === "grid" ? (
        <GridView tasks={filtered} onOpen={openTaskPanel} />
      ) : filtered.length === 0 ? (
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
        <BoardView tasks={filtered} onOpen={openTaskPanel} filtersActive={filtersActive} />
      ) : view === "list" ? (
        <ListView
          tasks={filtered}
          expandedId={openId}
          onToggle={(id) => setOpenId(openId === id ? null : id)}
          onOpen={openTaskPanel}
          onOpenSubtask={openSubtaskPanel}
          onEdit={openEdit}
        />
      ) : (
        <TableView
          tasks={filtered}
          openId={openId}
          onToggle={(id) => setOpenId(openId === id ? null : id)}
          onOpen={openTaskPanel}
          onEdit={openEdit}
          onDelete={setPendingDelete}
        />
      )}
        </>
      )}

      {/* Task detail: the non-modal split panel in list view (left stays live),
          a centred popup from a board card or table row. */}
      {detail &&
        (view === "list" ? (
          <TaskWorkspacePanel
            task={tasks.find((t) => t.id === detail.id) ?? detail}
            onClose={() => setDetail(null)}
            onEdit={openEdit}
          />
        ) : (
          <TaskDetailModal
            task={tasks.find((t) => t.id === detail.id) ?? detail}
            onClose={() => setDetail(null)}
            onEdit={openEdit}
          />
        ))}

      {/* Subtask detail — same split panel, resolved fresh from the store each
          render so an edit made in the task form shows here without reopening. */}
      {openSubtask &&
        (() => {
          const parent = tasks.find((t) => t.id === openSubtask.taskId);
          const sub = parent?.checklist.find((c) => c.id === openSubtask.subtaskId);
          if (!parent || !sub) return null;
          return (
            <SubtaskWorkspacePanel
              task={parent}
              subtask={sub}
              onClose={() => setOpenSubtask(null)}
              onEdit={openEdit}
            />
          );
        })()}

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
      <div className="grid min-w-[900px] grid-cols-4 gap-4">
        {TASK_STATUS_DEFS.map((def) => {
          const column = def.value;
          const items = tasks.filter((t) => t.status === column);
          const t = def.tone;
          return (
            <section key={column} className="flex flex-col">
              {/* The column header IS the status, so it carries the chip. A
                  second copy on every card underneath would repeat the same
                  word down a column where every card already agrees. */}
              <header className="mb-3 flex items-center gap-2">
                <h3 className="min-w-0">
                  <StatusChip label={def.label} colour={def.solid} size="sm" />
                </h3>
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
                  const [owner, ...others] = people;
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
                        <AttachmentButton taskId={task.id} onOpen={() => onOpen(task)} />
                      </div>

                      {/* Ownership reads as a name, not two letters. The stack
                          only appears once there IS an "and others" to show. */}
                      <div className="mt-2.5 flex items-center gap-1.5">
                        {owner ? (
                          <OwnerChip
                            initials={initialsOf(owner.name)}
                            name={owner.name}
                            t={owner.tone}
                            size="sm"
                          />
                        ) : (
                          <UnassignedChip size="sm" />
                        )}
                        {others.length > 0 && (
                          <AvatarStack items={others.map((e) => initialsOf(e.name))} />
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

/* ------------------------------------------------------------------ table -- */

/**
 * The dense reading: every column, sortable, expandable to the full detail.
 *
 * Renamed from ListView when the Monday-style ListView below was added — the
 * two are different things and sharing a name made the render branch a puzzle.
 * Its markup is otherwise untouched apart from the bright chips.
 */
function TableView({
  tasks,
  openId,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  openId: string | null;
  onToggle: (id: string) => void;
  onOpen: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const { state, updateTask } = useStore();
  const canManage = useCanManageTasks();

  const setStatus = (task: Task, next: TaskStatus) => {
    if (next === task.status) return;
    updateTask(task.id, { status: next }, `Status ${task.status} → ${next}.`);
  };

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
            const [owner, ...others] = people;
            const projects = projectsByIds(state, task.projectIds);
            return (
              <Fragment key={task.id}>
                {/* Row opens the popup; the arrow (below) expands the subtasks
                    in place — two separate gestures, matching the list view. */}
                <Tr expanded={expanded} onClick={() => onOpen(task)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(task.id);
                        }}
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
                    {/* Editable here too: the table is where someone reviewing
                        a long list actually notices a status is wrong. */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <TaskStatusControl
                        status={task.status}
                        size="sm"
                        onChange={(next) => setStatus(task, next)}
                      />
                    </div>
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
                    <div className="flex items-center gap-1.5">
                      {owner ? (
                        <OwnerChip
                          initials={initialsOf(owner.name)}
                          name={owner.name}
                          t={owner.tone}
                          size="sm"
                        />
                      ) : (
                        <UnassignedChip size="sm" />
                      )}
                      {others.length > 0 && (
                        <AvatarStack items={others.map((e) => initialsOf(e.name))} />
                      )}
                    </div>
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

/* ------------------------------------------------------------------- list -- */

/**
 * The Monday-style reading: one row per task, everything editable in place.
 *
 * Not a <table>. The rows expand into nested subtask rows with their own
 * column widths, and a table cannot hold a second grid inside a cell without
 * colspan gymnastics that break the moment a column is added. A grid whose
 * template is declared once and reused by both levels keeps the two aligned by
 * construction. The header row carries the column names for sighted users and
 * `role="row"` semantics do the same for a screen reader.
 *
 * Deliberately NOT sortable or filterable on its own — the toolbar above
 * already owns that, and a second set of controls would be a second answer to
 * the same question.
 */

/** Shared by the header, the task rows and the subtask rows, so they line up. */
const LIST_COLUMNS = "grid-cols-[minmax(0,1fr)_9rem_10rem_7rem_3rem]";

function ListView({
  tasks,
  expandedId,
  onToggle,
  onOpen,
  onOpenSubtask,
  onEdit,
}: {
  tasks: Task[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onOpen: (t: Task) => void;
  onOpenSubtask: (taskId: string, subtaskId: string) => void;
  onEdit: (t: Task) => void;
}) {
  const { state, updateTask } = useStore();

  const setStatus = (task: Task, next: TaskStatus) => {
    if (next === task.status) return;
    updateTask(task.id, { status: next }, `Status ${task.status} → ${next}.`);
  };

  return (
    <Card>
      <CardHeader
        title="All Tasks"
        desc="Open a row for the full task, or change its status and owner right here."
      />

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[52rem]">
          {/* header */}
          <div
            className={`grid ${LIST_COLUMNS} gap-3 border-b border-line px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted`}
          >
            <span>Task</span>
            <span>Owner</span>
            <span>Status</span>
            <span>Date</span>
            <span className="text-right">Files</span>
          </div>

          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                expanded={expandedId === task.id}
                onToggle={() => onToggle(task.id)}
                onOpen={() => onOpen(task)}
                onOpenSubtask={(subId) => onOpenSubtask(task.id, subId)}
                onStatus={(next) => setStatus(task, next)}
                onEdit={onEdit}
                state={state}
              />
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function TaskRow({
  task,
  expanded,
  onToggle,
  onOpen,
  onOpenSubtask,
  onStatus,
  onEdit,
  state,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenSubtask: (subtaskId: string) => void;
  onStatus: (next: TaskStatus) => void;
  onEdit: (t: Task) => void;
  state: ReturnType<typeof useStore>["state"];
}) {
  const people = employeesByIds(state, task.assignedTo);
  const [owner, ...others] = people;
  const projects = projectsByIds(state, task.projectIds);
  const meta = taskStatusMeta(task.status);

  return (
    <li>
      {/*
       * The row opens the drawer; the controls inside it do not. Every
       * interactive child stops propagation, so "click the row" and "click the
       * status" stay two different gestures rather than one that fires both.
       */}
      <div
        onClick={onOpen}
        className={`grid ${LIST_COLUMNS} cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover`}
      >
          {/*
           * The row is clickable but carries no role and is not focusable.
           *
           * It holds three real buttons — expand, status, attachments — and a
           * role="button" wrapping other buttons is invalid ARIA: a screen
           * reader flattens the whole row into one control and the buttons
           * inside become unreachable. So the mouse target is the whole row,
           * and the keyboard path is the title button below, which does the
           * same thing and announces itself properly.
           */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-expanded={expanded}
              aria-label={
                expanded ? `Hide subitems of ${task.title}` : `Show subitems of ${task.title}`
              }
              className="shrink-0 rounded-sm text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ transform: expanded ? "rotate(90deg)" : undefined }}
            >
              <ChevronRight size={16} />
            </button>

            {/* The keyboard route into the drawer, and the accessible name of
                the row. Styled as text, not as a control, because the whole
                row already reads as clickable to a mouse. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="min-w-0 rounded-sm text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="block truncate text-[0.8125rem] font-medium text-heading">
                {task.title}
              </span>
              <span className="block truncate font-mono text-[0.6875rem] text-muted">
                {task.taskId}
                {projects.length > 0 && ` · ${projects.map((p) => p.code).join(", ")}`}
              </span>
            </button>
          </div>

          {/* owner */}
          <div className="flex min-w-0 items-center gap-1.5">
            {owner ? (
              <OwnerChip
                initials={initialsOf(owner.name)}
                name={owner.name}
                t={owner.tone}
                size="sm"
              />
            ) : (
              <UnassignedChip size="sm" />
            )}
            {others.length > 0 && <AvatarStack items={others.map((e) => initialsOf(e.name))} />}
          </div>

          {/* status */}
          <div onClick={(e) => e.stopPropagation()}>
            <TaskStatusControl status={task.status} onChange={onStatus} className="w-full" />
          </div>

          {/* date */}
          <span className="whitespace-nowrap text-[0.75rem] text-muted">
            {task.endDate ? formatDateShort(task.endDate) : "—"}
          </span>

          <span className="flex justify-end">
            <AttachmentButton taskId={task.id} onOpen={onOpen} />
          </span>
      </div>

      {expanded && (
        <SubitemRows
          task={task}
          state={state}
          meta={meta}
          onEdit={onEdit}
          onOpenSubtask={onOpenSubtask}
        />
      )}
    </li>
  );
}

/**
 * The tree line from a task down to each of its subitems — list view only.
 *
 * Pure decoration, drawn per row: an elbow curving into this row's checkbox,
 * plus a straight trunk carried on to the next sibling. The last child omits
 * the trunk, so the line stops at its own elbow instead of running into empty
 * space. Both pieces are absolutely positioned, so they sit OUTSIDE the row's
 * grid flow and never shift the columns that `LIST_COLUMNS` keeps aligned.
 * `--gray-3` reads in both themes without competing with the row dividers.
 */
function SubitemConnector({ isLast }: { isLast: boolean }) {
  // Deliberately high-contrast (--gray-5, 2px) so the tree reads at a glance —
  // the row dividers use --line, so the connector must sit clearly above them.
  const line = "2px solid var(--gray-5)";
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-[1.375rem] top-0 h-1/2 w-3 rounded-bl-[6px]"
        style={{ borderLeft: line, borderBottom: line }}
      />
      {!isLast && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[1.375rem] top-1/2 h-1/2"
          style={{ borderLeft: line }}
        />
      )}
    </>
  );
}

/**
 * A task's subtasks, as nested rows.
 *
 * A subtask has no owner or status of its own in the data model — it carries an
 * acceptance score and a points value (see Subtask in lib/store/types.ts). So
 * rather than inventing fields to fill the columns, Owner and Status here show
 * the PARENT's, tinted lighter, and the subtask's own numbers get the space
 * they actually need. Inventing a per-subtask owner would mean a column that
 * looks editable and silently is not.
 */
function SubitemRows({
  task,
  state,
  meta,
  onEdit,
  onOpenSubtask,
}: {
  task: Task;
  state: ReturnType<typeof useStore>["state"];
  meta: ReturnType<typeof taskStatusMeta>;
  onEdit: (t: Task) => void;
  onOpenSubtask: (subtaskId: string) => void;
}) {
  return (
    <div className="border-t border-line bg-subtle">
      {/* Indent lives INSIDE the first column, never on the grid container:
          padding on the container narrows column 1 and shifts every column
          after it, so the sub-rows would stop lining up with the task row
          above them — which is the whole reason both share LIST_COLUMNS. */}
      <div
        className={`grid ${LIST_COLUMNS} gap-3 border-b border-line px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted`}
      >
        <span className="ps-6">Subitem</span>
        <span>Owner</span>
        <span>Score</span>
        <span>Points</span>
        <span />
      </div>

      {task.checklist.length === 0 ? (
        <p className="px-3 py-3 ps-9 text-[0.75rem] text-muted">No subitems on this task yet.</p>
      ) : (
        <ul>
          {task.checklist.map((item, i, arr) => {
            const value = clampScore(item.score);
            const complete = value >= 1;
            const isLast = i === arr.length - 1;
            // A subtask carries its OWN owner now — one of the task's assignees.
            const itemOwner = item.ownerId
              ? state.employees.find((e) => e.id === item.ownerId)
              : undefined;
            return (
              <li
                key={item.id}
                className={`relative grid ${LIST_COLUMNS} items-center gap-3 border-b border-line px-3 py-2 last:border-b-0`}
              >
                <SubitemConnector isLast={isLast} />
                <span className="flex min-w-0 items-center gap-2 ps-6">
                  <span
                    aria-hidden
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border"
                    style={
                      complete
                        ? { background: tone.sky.solid, borderColor: "transparent", color: "#fff" }
                        : undefined
                    }
                  >
                    {complete && <Check size={10} />}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenSubtask(item.id)}
                    className={`truncate rounded-sm text-start text-[0.8125rem] transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      complete ? "text-muted line-through" : "text-text"
                    }`}
                  >
                    {item.label}
                  </button>
                </span>

                <span className="min-w-0">
                  {itemOwner ? (
                    <OwnerChip
                      initials={initialsOf(itemOwner.name)}
                      name={itemOwner.name}
                      t={itemOwner.tone}
                      size="sm"
                    />
                  ) : (
                    <UnassignedChip size="sm" />
                  )}
                </span>

                <span className="flex items-center gap-2">
                  <Progress value={value * 100} t={complete ? "sky" : meta.tone} />
                  <span className="w-7 shrink-0 text-right font-mono text-[0.6875rem] font-semibold text-heading">
                    {value.toFixed(1)}
                  </span>
                </span>

                <span
                  className="justify-self-start rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold"
                  style={{ background: tone.slate.soft, color: tone.slate.text }}
                  title={`Worth ${itemPoints(item)} KRA point${itemPoints(item) === 1 ? "" : "s"} if QC rejects this line`}
                >
                  {itemPoints(item)} pt{itemPoints(item) === 1 ? "" : "s"}
                </span>

                <span />
              </li>
            );
          })}
        </ul>
      )}

      {/*
       * Add a subitem.
       *
       * Not an inline text field: a subtask carries POINTS, and points are what
       * come off someone's KRA when QC rejects the line. A row that let you
       * type a label and pick nothing else would have to invent that number.
       * So this opens the task form, which is the one place a subtask's wording
       * and its cost are set together.
       */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(task);
        }}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 ps-9 text-start text-[0.75rem] text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        <PlusIcon size={13} />
        Add subitem
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- detail -- */

/* ------------------------------------------------------------ workspace -- */

type PanelTab = { key: string; label: string; icon: IconType };

/** The Monday-style tab strip inside a workspace panel: Details / Files / Activity. */
function PanelTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: PanelTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[0.8125rem] font-medium transition-colors ${
              on
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const WORKSPACE_TABS: PanelTab[] = [
  { key: "details", label: "Details", icon: Info },
  { key: "files", label: "Files", icon: Paperclip },
  { key: "activity", label: "Activity", icon: History },
];

/**
 * The task, open in the non-modal right-hand panel — the list-view surface.
 *
 * The list on the left stays live (SplitPanel draws no backdrop), so clicking
 * another row just re-points this. Tabs split the record the way Monday's item
 * view does: the fields, its files, and its history each get their own space
 * rather than one long scroll. Structural editing still goes to TaskForm.
 */
function TaskWorkspacePanel({
  task,
  onClose,
  onEdit,
}: {
  task: Task;
  onClose: () => void;
  onEdit: (t: Task) => void;
}) {
  const canManage = useCanManageTasks();
  const [tab, setTab] = useState("details");

  return (
    <SplitPanel
      open
      onClose={onClose}
      title={`${task.taskId} · ${task.title}`}
      desc={richTextToPlain(task.description) || undefined}
      size="xl"
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
      <PanelTabs tabs={WORKSPACE_TABS} active={tab} onChange={setTab} />
      {tab === "details" && <TaskDetail task={task} showAttachments={false} showActivity={false} />}
      {tab === "files" && <TaskAttachments taskId={task.id} />}
      {tab === "activity" && <TaskActivity task={task} />}
    </SplitPanel>
  );
}

/** The task in a centred popup — what a board card or table row opens. */
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
      desc={richTextToPlain(task.description) || undefined}
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

/** A subtask, open in the split panel — same tabs, its own record. */
function SubtaskWorkspacePanel({
  task,
  subtask,
  onClose,
  onEdit,
}: {
  task: Task;
  subtask: Subtask;
  onClose: () => void;
  onEdit: (t: Task) => void;
}) {
  const canManage = useCanManageTasks();
  const [tab, setTab] = useState("details");

  return (
    <SplitPanel
      open
      onClose={onClose}
      title={`Subtask · ${subtask.label}`}
      desc={`${task.taskId} · ${task.title}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {canManage(task) && (
            <Button icon={Pencil} onClick={() => onEdit(task)}>
              Edit in task
            </Button>
          )}
        </>
      }
    >
      <PanelTabs tabs={WORKSPACE_TABS} active={tab} onChange={setTab} />
      {tab === "details" && <SubtaskDetail task={task} subtask={subtask} />}
      {tab === "files" && <TaskAttachments taskId={task.id} subtaskId={subtask.id} />}
      {tab === "activity" && <SubtaskActivity subtask={subtask} />}
    </SplitPanel>
  );
}

/* ------------------------------------------------------------ detail bits -- */

/** QC trail + the task's own audit log. Shown in the Activity tab and inline. */
function TaskActivity({ task }: { task: Task }) {
  return (
    <div className="space-y-4">
      <QcHistory task={task} />
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
  );
}

/** The created/updated trail of one subtask. */
function SubtaskActivity({ subtask }: { subtask: Subtask }) {
  const dot = (
    <span
      className="absolute -start-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full"
      style={{ background: tone.blue.solid }}
    />
  );
  return (
    <ul className="space-y-2 border-s border-line ps-3">
      <li className="relative">
        {dot}
        <p className="text-[0.8125rem] text-text">
          Created{subtask.createdBy ? ` by ${subtask.createdBy}` : ""}.
        </p>
        {subtask.createdAt && (
          <p className="mt-0.5 text-[0.6875rem] text-muted">{formatDate(subtask.createdAt)}</p>
        )}
      </li>
      {subtask.updatedBy && (
        <li className="relative">
          {dot}
          <p className="text-[0.8125rem] text-text">Last updated by {subtask.updatedBy}.</p>
          {subtask.updatedAt && (
            <p className="mt-0.5 text-[0.6875rem] text-muted">{formatDate(subtask.updatedAt)}</p>
          )}
        </li>
      )}
    </ul>
  );
}

/**
 * One subtask's full record — the Details tab of the subtask panel.
 *
 * Read-only: the numbers that touch KRA (score, points) and the wording are set
 * in the task form, the one place a subtask's cost and its meaning move
 * together. Everything here is the subtask's own metadata.
 */
function SubtaskDetail({ task, subtask }: { task: Task; subtask: Subtask }) {
  const { state } = useStore();
  const owner = subtask.ownerId
    ? state.employees.find((e) => e.id === subtask.ownerId)
    : undefined;
  const pri = priorityMeta(subtask.priority ?? 3);
  const statusMeta = taskStatusMeta(subtask.status ?? "Not Started");
  const value = clampScore(subtask.score);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label={statusMeta.label} colour={statusMeta.solid} size="sm" />
        <Badge t={pri.tone}>{pri.label}</Badge>
        <span
          className="rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold"
          style={{ background: tone.slate.soft, color: tone.slate.text }}
          title={`Worth ${itemPoints(subtask)} KRA point${itemPoints(subtask) === 1 ? "" : "s"} if QC rejects this line`}
        >
          {itemPoints(subtask)} pt{itemPoints(subtask) === 1 ? "" : "s"}
        </span>
      </div>

      <div>
        <SectionLabel>Description</SectionLabel>
        {hasRichText(subtask.description) ? (
          <RichTextView html={subtask.description} />
        ) : (
          <p className="text-[0.75rem] text-muted">No description on this subtask.</p>
        )}
      </div>

      <div>
        <SectionLabel>Acceptance score</SectionLabel>
        <div className="flex items-center gap-2">
          <Progress value={value * 100} t={value >= 1 ? "sky" : statusMeta.tone} />
          <span className="w-8 shrink-0 text-right font-mono text-[0.75rem] font-semibold text-heading">
            {value.toFixed(1)}
          </span>
        </div>
      </div>

      <div>
        <SectionLabel>Owner</SectionLabel>
        {owner ? (
          <OwnerChip initials={initialsOf(owner.name)} name={owner.name} t={owner.tone} />
        ) : (
          <UnassignedChip />
        )}
      </div>

      <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="shrink-0 text-[0.75rem] text-muted">Parent task</dt>
          <dd className="min-w-0 truncate text-right text-[0.8125rem] font-medium text-heading">
            {task.taskId} · {task.title}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-[0.75rem] text-muted">Start date</dt>
          <dd className="text-[0.8125rem] font-medium text-heading">
            {subtask.startDate ? formatDate(subtask.startDate) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-[0.75rem] text-muted">End date</dt>
          <dd className="text-[0.8125rem] font-medium text-heading">
            {subtask.endDate ? formatDate(subtask.endDate) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-[0.75rem] text-muted">Created by</dt>
          <dd className="text-[0.8125rem] font-medium text-heading">
            {subtask.createdBy ?? task.createdBy}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Shared by the expanded list row and the detail modal.
 *
 * Read-only apart from the status control. The subtasks — their wording, their
 * scores and its points — is only editable through the task form, so a number
 * that costs someone KRA can't be moved by brushing a slider while reading.
 */
function TaskDetail({
  task,
  showAttachments = true,
  showActivity = true,
}: {
  task: Task;
  /** The panel shows files and activity in their own tabs, so it hides them here. */
  showAttachments?: boolean;
  showActivity?: boolean;
}) {
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
          <RichTextView html={task.description} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge t={pri.tone}>{pri.label}</Badge>
          <TaskStatusControl status={task.status} onChange={setStatus} size="sm" />
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

        {showActivity && <TaskActivity task={task} />}
      </div>

      {/* right: people and dates */}
      <div className="space-y-4 xl:col-span-5">
        <div>
          <SectionLabel>Status</SectionLabel>
          {/* The same control as the board and the list, so changing a status
              is one gesture wherever you happen to be looking at the task. */}
          <TaskStatusControl status={task.status} onChange={setStatus} />
        </div>

        {showAttachments && <TaskAttachments taskId={task.id} />}

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
