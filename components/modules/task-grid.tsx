"use client";

/*
 * The grid — a Monday-style board, and the fastest way to get work written down.
 *
 * The other three views are for READING the board. This one is for WRITING it:
 * every cell is edited where it sits, every group ends in a permanent add row,
 * and a task opens downward into its subtasks rather than into a modal.
 *
 * Three things hold the design together:
 *
 *   1. COLUMNS ARE DATA. `COLUMNS` below is the single registry — a column is a
 *      key, a width and a cell renderer. Showing, hiding and ordering all fall
 *      out of filtering that list, which is why the column manager is a dozen
 *      lines rather than a feature.
 *   2. Some columns cannot be hidden. A row with no name and no status is not a
 *      task you can act on, so those two are `locked` and the manager refuses
 *      to switch them off.
 *   3. Rows are grouped by PROJECT, and that is load-bearing: a task must
 *      belong to one, so the group already answers the only question the add
 *      row would otherwise have to ask.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, Card, tone } from "@/components/ui";
import { useStore } from "@/lib/store/StoreProvider";
import { useListTeamsQuery } from "@/lib/api/api";
import { useSession } from "@/lib/api/session";
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
  type Subtask,
  type Task,
  type TaskStatus,
} from "@/lib/store/types";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `chk-${crypto.randomUUID().slice(0, 8)}`
    : `chk-${Math.random().toString(36).slice(2, 10)}`;

const today = () => new Date().toISOString().slice(0, 10);

/* =========================================================== primitives == */

/** A cell that opens a small menu under itself. Closes on outside click / Esc. */
function CellMenu({
  children,
  render,
  label,
  width = "11rem",
}: {
  children: React.ReactNode;
  render: (close: () => void) => React.ReactNode;
  label: string;
  width?: string;
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
        <div
          className="pk-menu absolute left-1/2 top-[calc(100%-1px)] z-40 -translate-x-1/2 overflow-hidden rounded-card border border-line bg-card p-1 shadow-pop"
          style={{ width }}
        >
          {render(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Text edited in place. Enter commits, Escape reverts, blur commits. */
function EditableText({
  value,
  onCommit,
  placeholder = "—",
  mono = false,
  align = "left",
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  mono?: boolean;
  align?: "left" | "center";
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  function commit() {
    setEditing(false);
    if (text.trim() !== value) onCommit(text.trim());
  }

  const base = `h-full w-full bg-transparent px-2 text-[0.75rem] ${
    mono ? "font-mono" : ""
  } ${align === "center" ? "text-center" : "text-left"}`;

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
            setText(value);
            setEditing(false);
          }
        }}
        className={`${base} border border-primary bg-form-bg text-heading outline-none`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${base} truncate ${value ? "text-text" : "text-muted"} hover:bg-hover`}
      title="Click to edit"
    >
      {value || placeholder}
    </button>
  );
}

/** A number, edited in place. `suffix` is shown but never stored. */
function EditableNumber({
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => setText(String(value)), [value]);

  function commit() {
    setEditing(false);
    const n = Number(text);
    if (!Number.isFinite(n)) return setText(String(value));
    const clamped = Math.min(Math.max(n, min ?? -Infinity), max ?? Infinity);
    if (clamped !== value) onCommit(clamped);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setText(String(value));
            setEditing(false);
          }
        }}
        className="h-full w-full border border-primary bg-form-bg px-1 text-center text-[0.75rem] text-heading outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="h-full w-full px-2 text-center text-[0.75rem] text-text hover:bg-hover"
      title="Click to edit"
    >
      {value}
      {suffix}
    </button>
  );
}

/** A date. The native picker is the right control here — nobody types dates. */
function EditableDate({
  value,
  onCommit,
}: {
  value: string | undefined;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value !== (value ?? "")) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-full w-full border border-primary bg-form-bg px-1 text-center text-[0.6875rem] text-heading outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`h-full w-full px-2 text-center text-[0.6875rem] hover:bg-hover ${
        value ? "text-text" : "text-muted"
      }`}
      title="Click to set a date"
    >
      {value || "—"}
    </button>
  );
}

/* ============================================================== pickers == */

function StatusPill({
  status,
  onPick,
}: {
  status: TaskStatus;
  onPick: (next: TaskStatus) => void;
}) {
  const meta = taskStatusMeta(status);
  return (
    <CellMenu
      label={`Status: ${status}`}
      render={(close) => (
        <ul>
          {TASK_STATUS_DEFS.map((s) => (
            <li key={s.value}>
              <button
                type="button"
                onClick={() => {
                  if (s.value !== status) onPick(s.value as TaskStatus);
                  close();
                }}
                className="mb-0.5 block w-full rounded-sm px-2 py-1.5 text-center text-[0.75rem] font-semibold text-white"
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

function PriorityPill({
  priority,
  onPick,
}: {
  priority: number;
  onPick: (next: number) => void;
}) {
  const meta = priorityMeta(priority);
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
                  if (p.value !== priority) onPick(p.value);
                  close();
                }}
                className="mb-0.5 block w-full rounded-sm px-2 py-1.5 text-center text-[0.75rem] font-semibold text-white"
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

/** Avatars + a toggle list. `candidates` is already narrowed by the caller. */
function PeoplePicker({
  ids,
  candidates,
  onToggle,
  empty = "—",
}: {
  ids: string[];
  candidates: { id: string; name: string }[];
  onToggle: (id: string) => void;
  empty?: string;
}) {
  const { state } = useStore();
  const people = employeesByIds(state, ids);

  return (
    <CellMenu
      label={people.length ? people.map((p) => p.name).join(", ") : empty}
      render={() => (
        <ul className="max-h-56 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="px-2 py-3 text-center text-[0.6875rem] text-muted">
              Nobody is on this project yet.
            </li>
          )}
          {candidates.map((e) => {
            const on = ids.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onToggle(e.id)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[0.75rem] hover:bg-hover ${
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

/* ============================================================== columns == */

type ColKey =
  | "task"
  | "owner"
  | "status"
  | "priority"
  | "taskId"
  | "progress"
  | "due"
  | "start"
  | "reportTo"
  | "teams"
  | "pr"
  | "kra";

type ColDef = {
  key: ColKey;
  label: string;
  width: string;
  /** Cannot be hidden — a row without these is not a task you can act on. */
  locked?: boolean;
};

const COLUMNS: ColDef[] = [
  { key: "task", label: "Task", width: "minmax(16rem,1fr)", locked: true },
  { key: "owner", label: "Owner", width: "7rem" },
  { key: "status", label: "Status", width: "9.5rem", locked: true },
  { key: "priority", label: "Priority", width: "6rem" },
  { key: "taskId", label: "Task ID", width: "7rem" },
  { key: "progress", label: "Progress", width: "7rem" },
  { key: "due", label: "Due", width: "7.5rem" },
  { key: "start", label: "Start", width: "7.5rem" },
  { key: "reportTo", label: "Reports to", width: "7rem" },
  { key: "teams", label: "Teams", width: "8rem" },
  { key: "pr", label: "PR link", width: "9rem" },
  { key: "kra", label: "KRA pts", width: "6rem" },
];

const DEFAULT_VISIBLE: ColKey[] = [
  "task",
  "owner",
  "status",
  "priority",
  "taskId",
  "progress",
  "due",
];

const STORAGE_KEY = "jadvix.grid-columns";

/**
 * Which columns are on, remembered per browser.
 *
 * Seeded from the default on the server and read from storage after mount —
 * reading during render would be a hydration mismatch, and the grid would flash
 * the default set on every load.
 */
function useVisibleColumns() {
  const [keys, setKeys] = useState<ColKey[]>(DEFAULT_VISIBLE);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as ColKey[];
      const valid = saved.filter((k) => COLUMNS.some((c) => c.key === k));
      // A locked column missing from storage (saved before it was locked, or
      // hand-edited) is put back rather than honoured.
      for (const c of COLUMNS) if (c.locked && !valid.includes(c.key)) valid.unshift(c.key);
      if (valid.length) setKeys(valid);
    } catch {
      // Blocked storage: the default set is a perfectly good answer.
    }
  }, []);

  function toggle(key: ColKey) {
    const col = COLUMNS.find((c) => c.key === key);
    if (col?.locked) return;
    setKeys((current) => {
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : // Keep registry order, so toggling never shuffles the table.
          COLUMNS.filter((c) => current.includes(c.key) || c.key === key).map((c) => c.key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // As above.
      }
      return next;
    });
  }

  const visible = COLUMNS.filter((c) => keys.includes(c.key));
  return { visible, keys, toggle };
}

/** The "+" at the end of the header, as Monday does it. */
function ColumnManager({
  keys,
  onToggle,
}: {
  keys: ColKey[];
  onToggle: (k: ColKey) => void;
}) {
  return (
    <CellMenu
      label="Add or remove columns"
      width="14rem"
      render={() => (
        <>
          <p className="px-2 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
            Columns
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {COLUMNS.map((c) => {
              const on = keys.includes(c.key);
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    disabled={c.locked}
                    onClick={() => onToggle(c.key)}
                    title={c.locked ? "Always shown — a task needs this" : undefined}
                    className={`mb-0.5 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[0.75rem] ${
                      c.locked ? "cursor-default text-muted" : "text-text hover:bg-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      readOnly
                      disabled={c.locked}
                      className="h-3.5 w-3.5 accent-[rgb(var(--primary-rgb))]"
                    />
                    <span className="flex-1">{c.label}</span>
                    {c.locked && <Lock size={10} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    >
      <span className="flex h-full w-full items-center justify-center text-muted hover:text-primary">
        <Columns3 size={14} />
      </span>
    </CellMenu>
  );
}

/* ============================================================= subtasks == */

/**
 * The subtask table, nested under its task — Monday's "subitems".
 *
 * A subtask IS a checklist line: the same row drives the checklist module and
 * the QC deduction. `score` and `points` are the two that matter — they are
 * the only inputs to KRA — so both are editable here, and the score is shown
 * as a percentage because 0.4 is not how anyone thinks about "40% done".
 */
function SubtaskRows({
  task,
  colour,
  span,
}: {
  task: Task;
  colour: string;
  span: number;
}) {
  const { state, updateTask } = useStore();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const owners = employeesByIds(state, task.assignedTo);

  function write(next: Subtask[], note: string) {
    updateTask(task.id, { checklist: next }, note);
  }

  function patch(id: string, change: Partial<Subtask>, note: string) {
    write(
      task.checklist.map((c) => (c.id === id ? { ...c, ...change } : c)),
      note,
    );
  }

  function add() {
    const next = label.trim();
    if (!next) {
      setAdding(false);
      return;
    }
    write(
      [
        ...task.checklist,
        {
          id: newId(),
          label: next,
          score: 0,
          points: 1,
          status: "Not Started" as TaskStatus,
          createdAt: today(),
        },
      ],
      `added subtask "${next}"`,
    );
    setLabel("");
    inputRef.current?.focus();
  }

  const SUB_COLS = "minmax(14rem,1fr) 7rem 9.5rem 6.5rem 5.5rem 7.5rem 2.5rem";

  return (
    <div
      className="border-b border-line bg-subtle/60"
      style={{ gridColumn: `1 / span ${span}`, boxShadow: `inset 3px 0 0 0 ${colour}` }}
    >
      <div className="overflow-x-auto py-1.5 ps-8 pe-2">
        <div className="min-w-[52rem] rounded-card border border-line bg-card">
          {/* heads */}
          <div
            className="grid items-center border-b border-line bg-subtle text-[0.625rem] font-semibold uppercase tracking-wide text-muted"
            style={{ gridTemplateColumns: SUB_COLS }}
          >
            {["Subtask", "Owner", "Status", "Score", "Points", "Due", ""].map((h, i) => (
              <span key={h || i} className={`px-2 py-1.5 ${i === 0 ? "" : "text-center"}`}>
                {h}
              </span>
            ))}
          </div>

          {task.checklist.map((line) => (
            <div
              key={line.id}
              className="grid items-stretch border-b border-line last:border-b-0 hover:bg-hover"
              style={{ gridTemplateColumns: SUB_COLS }}
            >
              <span className="flex min-h-[2.1rem] items-center">
                <EditableText
                  value={line.label}
                  onCommit={(v) => v && patch(line.id, { label: v }, "renamed a subtask")}
                />
              </span>

              <span className="border-s border-line">
                <PeoplePicker
                  ids={line.ownerId ? [line.ownerId] : []}
                  candidates={owners}
                  empty="Unassigned"
                  // One owner per subtask: picking a second replaces the first.
                  onToggle={(id) =>
                    patch(
                      line.id,
                      { ownerId: line.ownerId === id ? undefined : id },
                      "changed a subtask owner",
                    )
                  }
                />
              </span>

              <span className="border-s border-line">
                <StatusPill
                  status={line.status ?? "Not Started"}
                  onPick={(s) =>
                    patch(
                      line.id,
                      // Status and score are two readings of the same thing, so
                      // marking a subtask Done completes it rather than leaving
                      // a "Done" line sitting at 0%.
                      s === "Done" ? { status: s, score: 1 } : { status: s },
                      `subtask moved to ${s}`,
                    )
                  }
                />
              </span>

              <span className="flex items-center justify-center border-s border-line">
                <EditableNumber
                  value={Math.round((line.score ?? 0) * 100)}
                  min={0}
                  max={100}
                  step={10}
                  suffix="%"
                  onCommit={(n) =>
                    patch(
                      line.id,
                      { score: n / 100, ...(n >= 100 ? { status: "Done" as TaskStatus } : {}) },
                      "scored a subtask",
                    )
                  }
                />
              </span>

              <span className="flex items-center justify-center border-s border-line">
                <EditableNumber
                  value={line.points ?? 1}
                  min={1}
                  max={99}
                  onCommit={(n) => patch(line.id, { points: n }, "changed subtask points")}
                />
              </span>

              <span className="flex items-center border-s border-line">
                <EditableDate
                  value={line.endDate}
                  onCommit={(v) => patch(line.id, { endDate: v || undefined }, "dated a subtask")}
                />
              </span>

              <span className="flex items-center justify-center border-s border-line">
                <button
                  type="button"
                  onClick={() =>
                    write(
                      task.checklist.filter((c) => c.id !== line.id),
                      `removed subtask "${line.label}"`,
                    )
                  }
                  aria-label={`Delete ${line.label}`}
                  className="rounded-sm p-1 text-muted hover:bg-hover"
                  style={{ color: "rgb(var(--danger-rgb))" }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}

          {/* add row */}
          <div className="grid" style={{ gridTemplateColumns: SUB_COLS }}>
            <span className="flex min-h-[2.1rem] items-center">
              {adding ? (
                <input
                  ref={inputRef}
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onBlur={add}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                    if (e.key === "Escape") {
                      setLabel("");
                      setAdding(false);
                    }
                  }}
                  placeholder="Subtask name, then Enter…"
                  aria-label={`New subtask on ${task.title}`}
                  className="h-full w-full border border-primary bg-form-bg px-2 text-[0.75rem] text-heading outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-full w-full items-center gap-1.5 px-2 text-left text-[0.75rem] text-muted hover:text-primary"
                >
                  <Plus size={13} /> Add subtask
                </button>
              )}
            </span>
            <span className="border-s border-line" />
            <span className="border-s border-line" />
            <span className="border-s border-line" />
            <span className="border-s border-line" />
            <span className="border-s border-line" />
            <span className="border-s border-line" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================= rows == */

function TaskRow({
  task,
  colour,
  columns,
  expanded,
  onExpand,
  onOpen,
}: {
  task: Task;
  colour: string;
  columns: ColDef[];
  expanded: boolean;
  onExpand: () => void;
  onOpen: (t: Task) => void;
}) {
  const { state, updateTask } = useStore();
  const session = useSession();
  const { data: teams = [] } = useListTeamsQuery(undefined, {
    skip: session.status !== "user",
  });

  // Only people already on one of the task's projects — the API enforces the
  // same rule, so offering anyone else would be a dead end.
  const assignable = useMemo(() => {
    const onProjects = new Set(
      projectsByIds(state, task.projectIds).flatMap((p) => p.assignedEmployees),
    );
    return state.employees.filter((e) => onProjects.has(e.id));
  }, [state, task.projectIds]);

  const oversight = useMemo(
    () =>
      state.employees.filter(
        (e) => e.role === "Manager" || e.role === "Team Leader" || e.role === "QC",
      ),
    [state.employees],
  );

  const done = task.checklist.filter((c) => (c.score ?? 0) >= 1).length;

  function cell(col: ColDef) {
    switch (col.key) {
      case "task":
        return (
          <div className="flex h-full items-center gap-1 px-1">
            <button
              type="button"
              onClick={onExpand}
              aria-expanded={expanded}
              aria-label={expanded ? "Hide subtasks" : "Show subtasks"}
              className="shrink-0 rounded-sm p-0.5 text-muted hover:bg-hover hover:text-heading"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className="min-w-0 flex-1">
              <EditableText
                value={task.title}
                onCommit={(v) => v && updateTask(task.id, { title: v }, "renamed")}
              />
            </span>
            {task.checklist.length > 0 && (
              <span className="shrink-0 rounded-full bg-subtle px-1.5 text-[0.625rem] text-muted">
                {task.checklist.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpen(task)}
              className="shrink-0 rounded-sm px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted opacity-0 hover:bg-hover hover:text-heading group-hover/row:opacity-100"
            >
              Open
            </button>
          </div>
        );

      case "owner":
        return (
          <PeoplePicker
            ids={task.assignedTo}
            candidates={assignable}
            onToggle={(id) =>
              updateTask(
                task.id,
                {
                  assignedTo: task.assignedTo.includes(id)
                    ? task.assignedTo.filter((x) => x !== id)
                    : [...task.assignedTo, id],
                },
                "reassigned",
              )
            }
          />
        );

      case "status":
        return (
          <StatusPill
            status={task.status}
            onPick={(s) => updateTask(task.id, { status: s }, `moved to ${s}`)}
          />
        );

      case "priority":
        return (
          <PriorityPill
            priority={task.priority}
            onPick={(p) => updateTask(task.id, { priority: p }, "changed priority")}
          />
        );

      case "taskId":
        return (
          <span className="flex h-full items-center">
            <EditableText
              value={task.taskId}
              mono
              align="center"
              onCommit={(v) => v && updateTask(task.id, { taskId: v }, "changed the code")}
            />
          </span>
        );

      case "progress":
        // Derived from the subtasks, so it is the one read-only column — the
        // way to change it is to score a subtask, which is a click away above.
        return (
          <span className="flex h-full flex-col items-center justify-center gap-1 px-2">
            <span className="text-[0.6875rem] text-muted">
              {done}/{task.checklist.length}
            </span>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-light">
              <span
                className="block h-full rounded-full"
                style={{ width: `${taskScore(task)}%`, background: colour }}
              />
            </span>
          </span>
        );

      case "due":
        return (
          <span className="flex h-full items-center">
            <EditableDate
              value={task.endDate}
              onCommit={(v) => updateTask(task.id, { endDate: v || undefined }, "changed the due date")}
            />
          </span>
        );

      case "start":
        return (
          <span className="flex h-full items-center">
            <EditableDate
              value={task.startDate}
              onCommit={(v) => updateTask(task.id, { startDate: v }, "changed the start date")}
            />
          </span>
        );

      case "reportTo":
        return (
          <PeoplePicker
            ids={task.reportTo}
            candidates={oversight}
            onToggle={(id) =>
              updateTask(
                task.id,
                {
                  reportTo: task.reportTo.includes(id)
                    ? task.reportTo.filter((x) => x !== id)
                    : [...task.reportTo, id],
                },
                "changed the reporting line",
              )
            }
          />
        );

      case "teams": {
        const picked = task.assignedTeams ?? [];
        return (
          <CellMenu
            label="Teams"
            render={() => (
              <ul className="max-h-56 overflow-y-auto">
                {teams.length === 0 && (
                  <li className="px-2 py-3 text-center text-[0.6875rem] text-muted">
                    No teams yet.
                  </li>
                )}
                {teams.map((t) => {
                  const on = picked.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() =>
                          updateTask(
                            task.id,
                            {
                              assignedTeams: on
                                ? picked.filter((x) => x !== t.id)
                                : [...picked, t.id],
                            },
                            "changed the teams",
                          )
                        }
                        className={`mb-0.5 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[0.75rem] hover:bg-hover ${
                          on ? "text-heading" : "text-text"
                        }`}
                      >
                        <span className="flex-1 truncate">{t.name}</span>
                        {on && <X size={12} className="text-muted" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          >
            <span className="flex h-full w-full items-center justify-center gap-1 px-1 text-[0.6875rem] text-text">
              {picked.length === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="truncate">
                  {teams.find((t) => t.id === picked[0])?.name ?? "1 team"}
                  {picked.length > 1 ? ` +${picked.length - 1}` : ""}
                </span>
              )}
            </span>
          </CellMenu>
        );
      }

      case "pr":
        return (
          <span className="flex h-full items-center">
            <EditableText
              value={task.prUrl ?? ""}
              placeholder="—"
              onCommit={(v) => updateTask(task.id, { prUrl: v || undefined }, "changed the PR link")}
            />
          </span>
        );

      case "kra":
        /*
         * Derived, like Progress: the points at stake are the sum of the
         * subtasks' own points, which is what QC actually deducts against.
         * Rendering it as an input you can type into would be a lie — the way
         * to change it is to change a subtask's points, one row below.
         */
        return (
          <span
            className="flex h-full items-center justify-center text-[0.75rem] text-text"
            title="Sum of the subtasks' points — edit a subtask to change it"
          >
            {task.checklist.reduce((n, c) => n + (c.points ?? 1), 0)}
          </span>
        );

      default:
        return null;
    }
  }

  return (
    <>
      <div
        className="group/row grid items-stretch border-b border-line transition-colors hover:bg-hover"
        style={{
          gridTemplateColumns: `${columns.map((c) => c.width).join(" ")} 2.5rem`,
          boxShadow: `inset 3px 0 0 0 ${colour}`,
        }}
      >
        {columns.map((col, i) => (
          <div key={col.key} className={`min-h-[2.4rem] ${i === 0 ? "" : "border-s border-line"}`}>
            {cell(col)}
          </div>
        ))}
        <span className="border-s border-line" />
      </div>

      {expanded && (
        <div
          className="grid"
          style={{ gridTemplateColumns: `${columns.map((c) => c.width).join(" ")} 2.5rem` }}
        >
          <SubtaskRows task={task} colour={colour} span={columns.length + 1} />
        </div>
      )}
    </>
  );
}

/* =============================================================== groups == */

type Group = { id: string; name: string; code: string; tasks: Task[] };

function SummaryBar({ parts }: { parts: { colour: string; count: number; label: string }[] }) {
  const total = parts.reduce((n, p) => n + p.count, 0);
  if (total === 0) return <span className="block h-2.5 rounded-sm bg-light" />;
  return (
    <span
      className="flex h-2.5 overflow-hidden rounded-sm"
      role="img"
      aria-label={parts.filter((p) => p.count > 0).map((p) => `${p.label} ${p.count}`).join(", ")}
    >
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

function GroupBlock({
  group,
  colour,
  columns,
  colKeys,
  onToggleColumn,
  onOpen,
}: {
  group: Group;
  colour: string;
  columns: ColDef[];
  colKeys: ColKey[];
  onToggleColumn: (k: ColKey) => void;
  onOpen: (t: Task) => void;
}) {
  const { createTask, suggestTaskCode } = useStore();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const template = `${columns.map((c) => c.width).join(" ")} 2.5rem`;

  /** Create and STAY in the row — writing several at once is the point. */
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
      startDate: today(),
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
        <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
          <div style={{ minWidth: "56rem" }}>
            {/* heads, with the column manager pinned at the end */}
            <div
              className="grid items-center border-b border-line bg-subtle text-[0.6875rem] font-semibold uppercase tracking-wide text-muted"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((c, i) => (
                <span key={c.key} className={`px-2 py-2 ${i === 0 ? "" : "text-center"}`}>
                  {c.label}
                </span>
              ))}
              <span className="h-full">
                <ColumnManager keys={colKeys} onToggle={onToggleColumn} />
              </span>
            </div>

            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                colour={colour}
                columns={columns}
                expanded={expanded === task.id}
                onExpand={() => setExpanded(expanded === task.id ? null : task.id)}
                onOpen={onOpen}
              />
            ))}

            {/* the add row — always there, never behind a button */}
            <div
              className="grid border-b border-line"
              style={{ gridTemplateColumns: template, boxShadow: `inset 3px 0 0 0 ${colour}` }}
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
                    className="flex h-full w-full items-center gap-1.5 px-2 text-left text-[0.8125rem] text-muted hover:text-primary"
                  >
                    <Plus size={14} /> Add task
                  </button>
                )}
              </div>
              {columns.slice(1).map((c) => (
                <span key={c.key} className="border-s border-line" />
              ))}
              <span className="border-s border-line" />
            </div>

            <div className="grid items-center bg-subtle/50 py-2" style={{ gridTemplateColumns: template }}>
              {columns.map((c) => (
                <span key={c.key} className="px-2">
                  {c.key === "status" ? (
                    <SummaryBar parts={statusParts} />
                  ) : c.key === "priority" ? (
                    <SummaryBar parts={priorityParts} />
                  ) : null}
                </span>
              ))}
              <span />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================= view == */

const GROUP_TONES = ["primary", "blue", "purple", "teal", "orange", "pink", "sky"] as const;

export function GridView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const { state } = useStore();
  const { visible, keys, toggle } = useVisibleColumns();

  const groups = useMemo<Group[]>(() => {
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.projectIds[0] ?? "";
      byProject.set(key, [...(byProject.get(key) ?? []), task]);
    }

    const out: Group[] = state.projects
      .filter((p) => byProject.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, code: p.code, tasks: byProject.get(p.id) ?? [] }));

    const orphans = byProject.get("") ?? [];
    if (orphans.length) out.push({ id: "", name: "No project", code: "—", tasks: orphans });
    return out;
  }, [tasks, state.projects]);

  /* Projects with no tasks still get a group — otherwise an empty project has
     nowhere to add its first task. */
  const empties = useMemo<Group[]>(
    () =>
      state.projects
        .filter((p) => !groups.some((g) => g.id === p.id))
        .map((p) => ({ id: p.id, name: p.name, code: p.code, tasks: [] })),
    [state.projects, groups],
  );

  const all = [...groups, ...empties];

  if (all.length === 0) {
    return (
      <Card className="p-4">
        <p className="py-10 text-center text-[0.875rem] text-muted">
          Create a project first — a task has to belong to one.
        </p>
      </Card>
    );
  }

  return (
    <div>
      {all.map((group, i) => (
        <GroupBlock
          key={group.id || "orphans"}
          group={group}
          colour={tone[GROUP_TONES[i % GROUP_TONES.length]].solid}
          columns={visible}
          colKeys={keys}
          onToggleColumn={toggle}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

export default GridView;
