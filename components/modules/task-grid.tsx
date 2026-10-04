"use client";

/*
 * The grid — a Monday-style board, and the fastest way to get work written down.
 *
 * The other three views are for READING the board: the Kanban shows flow, the
 * list shows one task in depth, the table shows a dense export. This one is for
 * WRITING. Everything in it is editable where it sits, and every group ends in
 * an always-present "+ Add task" row, so adding five tasks is five lines of
 * typing rather than five trips through a modal.
 *
 * Rows are grouped by PROJECT. That is not a cosmetic choice: a task must
 * belong to a project, so grouping by project is what lets the add row create
 * one without asking a single question — the group already answers it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Avatar, Card, tone } from "@/components/ui";
import { useStore } from "@/lib/store/StoreProvider";
import {
  employeesByIds,
  initialsOf,
  projectsByIds,
  taskScore,
} from "@/lib/store/selectors";
import {
  PRIORITIES,
  TASK_STATUS_DEFS,
  priorityMeta,
  taskStatusMeta,
  type Task,
  type TaskStatus,
} from "@/lib/store/types";

/** The columns, in order. Widths are fixed so every group lines up. */
const COLS = "minmax(16rem,1fr) 7rem 9.5rem 6.5rem 6.5rem 7rem 7rem";

type Group = { id: string; name: string; code: string; tasks: Task[] };

/* ------------------------------------------------------------- popover -- */

/** A cell that opens a small menu under itself. Closes on outside click/Esc. */
function CellMenu({
  children,
  render,
  label,
}: {
  children: React.ReactNode;
  render: (close: () => void) => React.ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative h-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="h-full w-full"
      >
        {children}
      </button>
      {open && (
        <div className="pk-menu absolute left-1/2 top-[calc(100%-2px)] z-30 w-44 -translate-x-1/2 overflow-hidden rounded-card border border-line bg-card p-1 shadow-pop">
          {render(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- cells -- */

/** The solid colour block Monday uses for a status. */
function StatusCell({ task }: { task: Task }) {
  const { updateTask } = useStore();
  const meta = taskStatusMeta(task.status);

  return (
    <CellMenu
      label={`Status: ${task.status}`}
      render={(close) => (
        <ul>
          {TASK_STATUS_DEFS.map((s) => (
            <li key={s.value}>
              <button
                type="button"
                onClick={() => {
                  if (s.value !== task.status) {
                    updateTask(task.id, { status: s.value as TaskStatus }, `moved to ${s.label}`);
                  }
                  close();
                }}
                className="mb-0.5 block w-full rounded-sm px-2 py-1.5 text-center text-[0.75rem] font-semibold text-white transition-transform hover:scale-[1.02]"
                style={{ background: s.solid }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    >
      <span
        className="flex h-full w-full items-center justify-center text-[0.75rem] font-semibold text-white"
        style={{ background: meta.solid }}
      >
        {meta.label}
      </span>
    </CellMenu>
  );
}

function PriorityCell({ task }: { task: Task }) {
  const { updateTask } = useStore();
  const meta = priorityMeta(task.priority);

  return (
    <CellMenu
      label={`Priority: ${meta.short}`}
      render={(close) => (
        <ul>
          {PRIORITIES.map((p) => (
            <li key={p.value}>
              <button
                type="button"
                onClick={() => {
                  if (p.value !== task.priority) {
                    updateTask(task.id, { priority: p.value }, `priority set to ${p.short}`);
                  }
                  close();
                }}
                className="mb-0.5 block w-full rounded-sm px-2 py-1.5 text-center text-[0.75rem] font-semibold text-white transition-transform hover:scale-[1.02]"
                style={{ background: tone[p.tone].solid }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    >
      <span
        className="flex h-full w-full items-center justify-center text-[0.75rem] font-semibold text-white"
        style={{ background: tone[meta.tone].solid }}
      >
        {meta.short}
      </span>
    </CellMenu>
  );
}

/** Owner avatars, with a picker limited to the people on this task's projects. */
function OwnerCell({ task }: { task: Task }) {
  const { state, updateTask } = useStore();
  const people = employeesByIds(state, task.assignedTo);

  // Only people already on one of the task's projects can be put on it — the
  // API enforces the same rule, so offering anyone else would be a dead end.
  const assignable = useMemo(() => {
    const onProjects = new Set(
      projectsByIds(state, task.projectIds).flatMap((p) => p.assignedEmployees),
    );
    return state.employees.filter((e) => onProjects.has(e.id));
  }, [state, task.projectIds]);

  return (
    <CellMenu
      label={people.length ? `Owners: ${people.map((p) => p.name).join(", ")}` : "Unassigned"}
      render={() => (
        <ul className="max-h-56 overflow-y-auto">
          {assignable.length === 0 && (
            <li className="px-2 py-3 text-center text-[0.6875rem] text-muted">
              Nobody is on this project yet.
            </li>
          )}
          {assignable.map((e) => {
            const on = task.assignedTo.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() =>
                    updateTask(
                      task.id,
                      {
                        assignedTo: on
                          ? task.assignedTo.filter((id) => id !== e.id)
                          : [...task.assignedTo, e.id],
                      },
                      on ? `unassigned ${e.name}` : `assigned ${e.name}`,
                    )
                  }
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[0.75rem] transition-colors hover:bg-hover ${
                    on ? "text-heading" : "text-text"
                  }`}
                >
                  <Avatar initials={initialsOf(e.name)} t="blue" size={20} />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  {on && <X size={12} className="shrink-0 text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    >
      <span className="flex h-full w-full items-center justify-center gap-0.5">
        {people.length === 0 ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line text-muted">
            <Plus size={11} />
          </span>
        ) : (
          people
            .slice(0, 3)
            .map((p) => <Avatar key={p.id} initials={initialsOf(p.name)} t="blue" size={22} />)
        )}
        {people.length > 3 && (
          <span className="text-[0.625rem] text-muted">+{people.length - 3}</span>
        )}
      </span>
    </CellMenu>
  );
}

/** The title, edited where it sits. Enter commits, Escape reverts. */
function TitleCell({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const { updateTask } = useStore();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.title);

  function commit() {
    const next = text.trim();
    if (next && next !== task.title) updateTask(task.id, { title: next }, "renamed");
    else setText(task.title);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setText(task.title);
            setEditing(false);
          }
        }}
        className="h-full w-full rounded-sm border border-primary bg-form-bg px-2 text-[0.8125rem] text-heading outline-none"
      />
    );
  }

  return (
    <div className="flex h-full items-center gap-2 px-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 truncate text-left text-[0.8125rem] text-heading hover:underline"
        title="Click to rename"
      >
        {task.title}
      </button>
      {/* Opening the full record is a separate, deliberate gesture — clicking
          the title is for renaming, which is what people come to the grid for. */}
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="shrink-0 rounded-sm px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted opacity-0 transition-opacity hover:bg-hover hover:text-heading group-hover/row:opacity-100"
      >
        Open
      </button>
    </div>
  );
}

/* ----------------------------------------------------------- summaries -- */

/** The stacked proportion bar Monday puts under each group. */
function SummaryBar({ parts }: { parts: { colour: string; count: number; label: string }[] }) {
  const total = parts.reduce((n, p) => n + p.count, 0);
  if (total === 0) return <span className="block h-2.5 rounded-sm bg-light" />;
  return (
    <span className="flex h-2.5 overflow-hidden rounded-sm" role="img" aria-label={
      parts.filter((p) => p.count > 0).map((p) => `${p.label} ${p.count}`).join(", ")
    }>
      {parts
        .filter((p) => p.count > 0)
        .map((p) => (
          <span
            key={p.label}
            style={{ width: `${(p.count / total) * 100}%`, background: p.colour }}
            title={`${p.label}: ${p.count}`}
          />
        ))}
    </span>
  );
}

/* --------------------------------------------------------------- group -- */

function GroupBlock({
  group,
  colour,
  onOpen,
}: {
  group: Group;
  colour: string;
  onOpen: (t: Task) => void;
}) {
  const { createTask, suggestTaskCode, state } = useStore();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Create the task and stay in the row.
   *
   * Keeping the input open and focused is the whole point of this view: the
   * common case is writing several tasks at once, and a form that closes after
   * each one turns that into five round trips.
   */
  function add() {
    const next = title.trim();
    if (!next) {
      setAdding(false);
      return;
    }
    createTask({
      taskId: suggestTaskCode(),
      title: next,
      description: "",
      status: "Not Started",
      priority: 3,
      projectIds: [group.id],
      assignedTo: [],
      assignedTeams: [],
      reportTo: [],
      checklist: [],
      startDate: new Date().toISOString().slice(0, 10),
    });
    setTitle("");
    inputRef.current?.focus();
  }

  const statusParts = TASK_STATUS_DEFS.map((s) => ({
    colour: s.solid,
    label: s.label,
    count: group.tasks.filter((t) => t.status === s.value).length,
  }));
  const priorityParts = PRIORITIES.map((p) => ({
    colour: tone[p.tone].solid,
    label: p.short,
    count: group.tasks.filter((t) => t.priority === p.value).length,
  }));

  return (
    <div className="mb-6">
      {/* group header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-1.5 flex items-center gap-1.5"
      >
        {open ? (
          <ChevronDown size={16} style={{ color: colour }} />
        ) : (
          <ChevronRight size={16} style={{ color: colour }} />
        )}
        <span className="text-[1rem] font-bold" style={{ color: colour }}>
          {group.name}
        </span>
        <span className="text-[0.75rem] text-muted">
          {group.code} · {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <div className="min-w-[56rem]">
            {/* column heads */}
            <div
              className="grid items-center border-b border-line text-[0.6875rem] font-semibold uppercase tracking-wide text-muted"
              style={{ gridTemplateColumns: COLS }}
            >
              {["Task", "Owner", "Status", "Priority", "Task ID", "Progress", "Due"].map((h, i) => (
                <span key={h} className={`px-2 py-2 ${i === 0 ? "" : "text-center"}`}>
                  {h}
                </span>
              ))}
            </div>

            {/* rows — the colour bar down the left is the group's, as Monday does */}
            {group.tasks.map((task) => (
              <div
                key={task.id}
                className="group/row grid items-stretch border-b border-line transition-colors hover:bg-hover"
                style={{ gridTemplateColumns: COLS, boxShadow: `inset 3px 0 0 0 ${colour}` }}
              >
                <div className="min-h-[2.4rem]">
                  <TitleCell task={task} onOpen={onOpen} />
                </div>
                <div className="border-s border-line">
                  <OwnerCell task={task} />
                </div>
                <div className="border-s border-line">
                  <StatusCell task={task} />
                </div>
                <div className="border-s border-line">
                  <PriorityCell task={task} />
                </div>
                <span className="flex items-center justify-center border-s border-line font-mono text-[0.6875rem] text-muted">
                  {task.taskId}
                </span>
                <span className="flex flex-col items-center justify-center gap-1 border-s border-line px-2">
                  <span className="text-[0.6875rem] text-muted">
                    {task.checklist.filter((c) => c.score >= 1).length}/{task.checklist.length}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-light">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${taskScore(task)}%`, background: colour }}
                    />
                  </span>
                </span>
                <span className="flex items-center justify-center border-s border-line text-[0.6875rem] text-muted">
                  {task.endDate ?? "—"}
                </span>
              </div>
            ))}

            {/* the add row — always there, never behind a button */}
            <div
              className="grid border-b border-line"
              style={{ gridTemplateColumns: COLS, boxShadow: `inset 3px 0 0 0 ${colour}` }}
            >
              <div className="min-h-[2.4rem]">
                {adding ? (
                  <input
                    ref={inputRef}
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={add}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add();
                      if (e.key === "Escape") {
                        setTitle("");
                        setAdding(false);
                      }
                    }}
                    placeholder="Task name, then Enter…"
                    aria-label={`New task in ${group.name}`}
                    className="h-full w-full border border-primary bg-form-bg px-2 text-[0.8125rem] text-heading outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex h-full w-full items-center gap-1.5 px-2 text-left text-[0.8125rem] text-muted transition-colors hover:text-primary"
                  >
                    <Plus size={14} /> Add task
                  </button>
                )}
              </div>
              <span className="border-s border-line" />
              <span className="border-s border-line" />
              <span className="border-s border-line" />
              <span className="border-s border-line" />
              <span className="border-s border-line" />
              <span className="border-s border-line" />
            </div>

            {/* the group's shape, at a glance */}
            <div
              className="grid items-center py-2"
              style={{ gridTemplateColumns: COLS }}
            >
              <span />
              <span />
              <span className="px-2">
                <SummaryBar parts={statusParts} />
              </span>
              <span className="px-2">
                <SummaryBar parts={priorityParts} />
              </span>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- view -- */

const GROUP_TONES = ["primary", "blue", "purple", "teal", "orange", "pink", "sky"] as const;

export function GridView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const { state } = useStore();

  /*
   * One group per project that HAS a project row, in the store's own order, so
   * the grid does not reshuffle itself as tasks move. A task on several
   * projects is listed under its first — the same primary the API keeps.
   */
  const groups = useMemo<Group[]>(() => {
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.projectIds[0] ?? "";
      byProject.set(key, [...(byProject.get(key) ?? []), task]);
    }

    const out: Group[] = state.projects
      .filter((p) => byProject.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, code: p.code, tasks: byProject.get(p.id) ?? [] }));

    // Tasks whose project has gone. Never gets an add row by construction —
    // there is no project for a new task to belong to.
    const orphans = byProject.get("") ?? [];
    if (orphans.length) out.push({ id: "", name: "No project", code: "—", tasks: orphans });
    return out;
  }, [tasks, state.projects]);

  /*
   * Projects with no tasks still get a group.
   *
   * This is the difference between a grid you can read and a grid you can
   * write in: an empty project with no row has nowhere to add its first task.
   */
  const empties = useMemo<Group[]>(
    () =>
      state.projects
        .filter((p) => !groups.some((g) => g.id === p.id))
        .map((p) => ({ id: p.id, name: p.name, code: p.code, tasks: [] })),
    [state.projects, groups],
  );

  const all = [...groups, ...empties];

  return (
    <Card className="p-4">
      {all.length === 0 ? (
        <p className="py-10 text-center text-[0.875rem] text-muted">
          Create a project first — a task has to belong to one.
        </p>
      ) : (
        all.map((group, i) => (
          <GroupBlock
            key={group.id || "orphans"}
            group={group}
            colour={tone[GROUP_TONES[i % GROUP_TONES.length]].solid}
            onOpen={onOpen}
          />
        ))
      )}
    </Card>
  );
}

export default GridView;
