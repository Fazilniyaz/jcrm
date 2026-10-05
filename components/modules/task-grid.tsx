"use client";

/*
 * The grid — a Monday-style board, and the fastest way to get work written down.
 *
 * The other three views are for READING the board. This one is for WRITING it:
 * every cell is edited where it sits, every group ends in a permanent add row,
 * a task opens downward into its subtasks, and rows can be dragged — within a
 * group to reorder, across groups to move the work to another project.
 *
 * Four things hold the design together:
 *
 *   1. COLUMNS ARE DATA. `COLUMNS` is the single registry, so showing, hiding
 *      and ordering all fall out of filtering one list.
 *   2. Task and Status cannot be hidden. A row with neither is not something
 *      anyone can act on.
 *   3. POPOVERS ARE PORTALLED. The table scrolls horizontally, and a scroll
 *      container clips on BOTH axes — `overflow-x: auto` computes `overflow-y`
 *      to `auto` too, so an absolutely-positioned menu inside it gets cut off.
 *      Every menu here renders into document.body at a fixed position instead.
 *   4. Rows are grouped by PROJECT, which is what lets the add row create a
 *      task without asking anything, and what dragging across groups changes.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  GripVertical,
  Lock,
  Plus,
  Trash2,
  Users,
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
import type { Team } from "@/lib/api/types";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `chk-${crypto.randomUUID().slice(0, 8)}`
    : `chk-${Math.random().toString(36).slice(2, 10)}`;

const today = () => new Date().toISOString().slice(0, 10);

/** Rows sort by their manual position, with the code as a stable tiebreak. */
const byOrder = (a: Task, b: Task) =>
  (a.order ?? 0) - (b.order ?? 0) || a.taskId.localeCompare(b.taskId);

/* =========================================================== primitives == */

/**
 * A cell that opens a menu.
 *
 * The menu is PORTALLED to document.body and positioned from the trigger's
 * bounding rect. Rendering it in place looks simpler and is wrong: the table is
 * inside `overflow-x-auto`, and once one axis is not `visible` the other
 * computes to `auto`, so an in-place menu is clipped by the scroller — which is
 * exactly what cut the column list in half.
 */
function CellMenu({
  children,
  render,
  label,
  width = 176,
}: {
  children: React.ReactNode;
  render: (close: () => void) => React.ReactNode;
  label: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // Measured before paint, so the menu never flashes at 0,0.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    setBox({ top: r.bottom + 2, left });
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // A menu pinned to a rect has to close when that rect moves.
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="h-full w-full"
      >
        {children}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={pop}
            role="menu"
            className="pk-menu fixed z-[200] max-h-[22rem] overflow-y-auto rounded-card border border-line bg-card p-1 shadow-pop"
            style={{ top: box.top, left: box.left, width }}
          >
            {render(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
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

  const base = `h-full w-full bg-transparent px-2 text-[0.75rem] ${mono ? "font-mono" : ""} ${
    align === "center" ? "text-center" : "text-left"
  }`;

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
  compact = false,
}: {
  status: TaskStatus;
  onPick: (next: TaskStatus) => void;
  compact?: boolean;
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
        className={`flex h-full w-full items-center justify-center font-semibold text-white ${
          compact ? "text-[0.6875rem]" : "text-[0.75rem]"
        }`}
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

/**
 * Owners, and the teams they can come from.
 *
 * A project staffed by a TEAM used to read as "nobody is on this project yet",
 * because the picker only ever listed individuals. The teams on the project are
 * listed first now: expanding one shows who is in it, and picking it puts the
 * whole team on the task in a single click.
 */
function OwnerPicker({
  ids,
  candidates,
  teams,
  onToggle,
  onAddMany,
}: {
  ids: string[];
  candidates: { id: string; name: string }[];
  teams: Team[];
  onToggle: (id: string) => void;
  onAddMany: (ids: string[]) => void;
}) {
  const { state } = useStore();
  const people = employeesByIds(state, ids);
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  return (
    <CellMenu
      label={people.length ? people.map((p) => p.name).join(", ") : "Unassigned"}
      width={240}
      render={() => (
        <>
          {teams.length > 0 && (
            <>
              <p className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
                Teams on this project
              </p>
              <ul className="mb-1 border-b border-line pb-1">
                {teams.map((t) => {
                  const expanded = openTeam === t.id;
                  const memberIds = t.memberIds ?? [];
                  const allOn = memberIds.length > 0 && memberIds.every((m) => ids.includes(m));
                  return (
                    <li key={t.id}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setOpenTeam(expanded ? null : t.id)}
                          aria-expanded={expanded}
                          aria-label={`Who is in ${t.name}`}
                          className="rounded-sm p-1 text-muted hover:bg-hover"
                        >
                          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddMany(memberIds)}
                          disabled={memberIds.length === 0}
                          title={
                            memberIds.length === 0
                              ? "This team has no members"
                              : `Assign all ${memberIds.length}`
                          }
                          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 py-1.5 text-left text-[0.75rem] text-text hover:bg-hover disabled:opacity-50"
                        >
                          <Users size={12} className="shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                          <span className="shrink-0 text-[0.625rem] text-muted">
                            {allOn ? "all on" : memberIds.length}
                          </span>
                        </button>
                      </div>

                      {/* Who is in it — the question the hover was asking. */}
                      {expanded && (
                        <ul className="mb-1 ms-6 border-s border-line ps-1">
                          {memberIds.length === 0 && (
                            <li className="px-2 py-1 text-[0.625rem] text-muted">No members.</li>
                          )}
                          {employeesByIds(state, memberIds).map((m) => {
                            const on = ids.includes(m.id);
                            return (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onClick={() => onToggle(m.id)}
                                  className={`flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-[0.6875rem] hover:bg-hover ${
                                    on ? "text-heading" : "text-text"
                                  }`}
                                >
                                  <Avatar initials={initialsOf(m.name)} t="blue" size={18} />
                                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                                  {on && <X size={10} className="shrink-0 text-muted" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <p className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
            People
          </p>
          <ul>
            {candidates.length === 0 && (
              <li className="px-2 py-3 text-center text-[0.6875rem] leading-relaxed text-muted">
                {teams.length > 0
                  ? "This project's members have not loaded yet."
                  : "Nobody is on this project yet — add people or a team to the project first."}
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
        </>
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

/** One person, for a subtask owner. Picking a second replaces the first. */
function SingleOwnerPicker({
  id,
  candidates,
  onPick,
}: {
  id: string | undefined;
  candidates: { id: string; name: string }[];
  onPick: (next: string | undefined) => void;
}) {
  const { state } = useStore();
  const person = id ? employeesByIds(state, [id])[0] : undefined;

  return (
    <CellMenu
      label={person ? person.name : "Unassigned"}
      render={(close) => (
        <ul>
          {candidates.length === 0 && (
            <li className="px-2 py-3 text-center text-[0.6875rem] text-muted">
              Assign the task first — a subtask owner has to be on it.
            </li>
          )}
          {candidates.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(id === e.id ? undefined : e.id);
                  close();
                }}
                className={`mb-0.5 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[0.75rem] hover:bg-hover ${
                  id === e.id ? "text-heading" : "text-text"
                }`}
              >
                <Avatar initials={initialsOf(e.name)} t="blue" size={20} />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {id === e.id && <X size={12} className="shrink-0 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    >
      <span className="flex h-full w-full items-center justify-center">
        {person ? (
          <Avatar initials={initialsOf(person.name)} t="blue" size={22} />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line text-muted">
            <Plus size={11} />
          </span>
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

type ColDef = { key: ColKey; label: string; width: string; locked?: boolean };

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

function useVisibleColumns() {
  const [keys, setKeys] = useState<ColKey[]>(DEFAULT_VISIBLE);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as ColKey[];
      const valid = saved.filter((k) => COLUMNS.some((c) => c.key === k));
      for (const c of COLUMNS) if (c.locked && !valid.includes(c.key)) valid.unshift(c.key);
      if (valid.length) setKeys(valid);
    } catch {
      // Blocked storage: the default set is a perfectly good answer.
    }
  }, []);

  function toggle(key: ColKey) {
    if (COLUMNS.find((c) => c.key === key)?.locked) return;
    setKeys((current) => {
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : COLUMNS.filter((c) => current.includes(c.key) || c.key === key).map((c) => c.key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // As above.
      }
      return next;
    });
  }

  return { visible: COLUMNS.filter((c) => keys.includes(c.key)), keys, toggle };
}

function ColumnManager({ keys, onToggle }: { keys: ColKey[]; onToggle: (k: ColKey) => void }) {
  return (
    <CellMenu
      label="Add or remove columns"
      width={224}
      render={() => (
        <>
          <p className="px-2 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
            Columns
          </p>
          <ul>
            {COLUMNS.map((c) => (
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
                    checked={keys.includes(c.key)}
                    readOnly
                    disabled={c.locked}
                    className="h-3.5 w-3.5 accent-[rgb(var(--primary-rgb))]"
                  />
                  <span className="flex-1">{c.label}</span>
                  {c.locked && <Lock size={10} />}
                </button>
              </li>
            ))}
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
 * the QC deduction. It carries the same shape as a task, so it gets the same
 * columns: owner, status, PRIORITY, score, points, START and due.
 *
 * Rendered as a plain block, NOT as a child of the row's grid. It has its own
 * column widths, and forcing it into the parent's template is what made the
 * task column collapse and the row slide out from under its header.
 */
function SubtaskRows({ task, colour }: { task: Task; colour: string }) {
  const { state, updateTask } = useStore();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const owners = employeesByIds(state, task.assignedTo);

  const write = (next: Subtask[], note: string) =>
    updateTask(task.id, { checklist: next }, note);

  const patch = (id: string, change: Partial<Subtask>, note: string) =>
    write(task.checklist.map((c) => (c.id === id ? { ...c, ...change } : c)), note);

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
          priority: 3,
          startDate: today(),
          createdAt: today(),
        },
      ],
      `added subtask "${next}"`,
    );
    setLabel("");
    inputRef.current?.focus();
  }

  const SUB = "minmax(13rem,1fr) 6rem 9rem 5.5rem 5rem 5rem 7rem 7rem 2.5rem";
  const HEADS = ["Subtask", "Owner", "Status", "Priority", "Score", "Points", "Start", "Due", ""];

  return (
    <div
      className="border-b border-line bg-subtle"
      style={{ boxShadow: `inset 3px 0 0 0 ${colour}` }}
    >
      <div className="py-2 ps-8 pe-3">
        <div className="min-w-[58rem] overflow-hidden rounded-card border border-line bg-card">
          <div
            className="grid items-center border-b border-line bg-subtle text-[0.625rem] font-semibold uppercase tracking-wide text-muted"
            style={{ gridTemplateColumns: SUB }}
          >
            {HEADS.map((h, i) => (
              <span key={h || i} className={`px-2 py-1.5 ${i === 0 ? "" : "text-center"}`}>
                {h}
              </span>
            ))}
          </div>

          {task.checklist.map((line) => (
            <div
              key={line.id}
              className="grid items-stretch border-b border-line last:border-b-0 hover:bg-hover"
              style={{ gridTemplateColumns: SUB }}
            >
              <span className="flex min-h-[2.1rem] items-center">
                <EditableText
                  value={line.label}
                  onCommit={(v) => v && patch(line.id, { label: v }, "renamed a subtask")}
                />
              </span>

              <span className="border-s border-line">
                <SingleOwnerPicker
                  id={line.ownerId}
                  candidates={owners}
                  onPick={(next) =>
                    patch(line.id, { ownerId: next }, "changed a subtask owner")
                  }
                />
              </span>

              <span className="border-s border-line">
                <StatusPill
                  compact
                  status={line.status ?? "Not Started"}
                  onPick={(s) =>
                    patch(
                      line.id,
                      // Status and score are two readings of the same thing, so
                      // Done completes it rather than leaving a Done line at 0%.
                      s === "Done" ? { status: s, score: 1 } : { status: s },
                      `subtask moved to ${s}`,
                    )
                  }
                />
              </span>

              <span className="border-s border-line">
                <PriorityPill
                  priority={line.priority ?? 3}
                  onPick={(p) => patch(line.id, { priority: p }, "changed subtask priority")}
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
                  value={line.startDate}
                  onCommit={(v) =>
                    patch(line.id, { startDate: v || undefined }, "dated a subtask")
                  }
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
                  className="rounded-sm p-1 hover:bg-hover"
                  style={{ color: "rgb(var(--danger-rgb))" }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}

          <div className="grid" style={{ gridTemplateColumns: SUB }}>
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
            {HEADS.slice(1).map((h, i) => (
              <span key={h || i} className="border-s border-line" />
            ))}
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
  dragging,
  dropHint,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
}: {
  task: Task;
  colour: string;
  columns: ColDef[];
  expanded: boolean;
  onExpand: () => void;
  onOpen: (t: Task) => void;
  dragging: boolean;
  dropHint: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOverRow: (e: React.DragEvent) => void;
  onDropRow: (e: React.DragEvent) => void;
}) {
  const { state, updateTask } = useStore();
  const session = useSession();
  const { data: allTeams = [] } = useListTeamsQuery(undefined, {
    skip: session.status !== "user",
  });

  const projects = useMemo(
    () => projectsByIds(state, task.projectIds),
    [state, task.projectIds],
  );

  // Only people already on one of the task's projects — the API enforces the
  // same rule, so offering anyone else would be a dead end.
  const assignable = useMemo(() => {
    const onProjects = new Set(projects.flatMap((p) => p.assignedEmployees));
    return state.employees.filter((e) => onProjects.has(e.id));
  }, [state.employees, projects]);

  /** The teams the PROJECT was staffed with — the answer to "who is on this". */
  const projectTeams = useMemo(() => {
    const ids = new Set(projects.flatMap((p) => p.assignedTeams ?? []));
    return allTeams.filter((t) => ids.has(t.id));
  }, [projects, allTeams]);

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
          <div className="flex h-full items-center gap-0.5 ps-1 pe-1">
            <span
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              aria-label="Drag to reorder or move to another project"
              title="Drag to reorder, or onto another project to move it"
              className="shrink-0 cursor-grab rounded-sm p-0.5 text-muted opacity-0 hover:bg-hover active:cursor-grabbing group-hover/row:opacity-100"
            >
              <GripVertical size={13} />
            </span>
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
          <OwnerPicker
            ids={task.assignedTo}
            candidates={assignable}
            teams={projectTeams}
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
            onAddMany={(many) =>
              updateTask(
                task.id,
                { assignedTo: [...new Set([...task.assignedTo, ...many])] },
                "assigned a team",
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
              onCommit={(v) =>
                updateTask(task.id, { endDate: v || undefined }, "changed the due date")
              }
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
          <OwnerPicker
            ids={task.reportTo}
            candidates={oversight}
            teams={[]}
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
            onAddMany={(many) =>
              updateTask(
                task.id,
                { reportTo: [...new Set([...task.reportTo, ...many])] },
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
            width={200}
            render={() => (
              <ul>
                {allTeams.length === 0 && (
                  <li className="px-2 py-3 text-center text-[0.6875rem] text-muted">
                    No teams yet.
                  </li>
                )}
                {allTeams.map((t) => {
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
                        <Users size={12} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        {on && <X size={12} className="text-muted" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          >
            <span className="flex h-full w-full items-center justify-center px-1 text-[0.6875rem] text-text">
              {picked.length === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="truncate">
                  {allTeams.find((t) => t.id === picked[0])?.name ?? "1 team"}
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
              onCommit={(v) => updateTask(task.id, { prUrl: v || undefined }, "changed the PR link")}
            />
          </span>
        );

      case "kra":
        /* Derived, like Progress: the points at stake are the sum of the
           subtasks' own points, which is what QC deducts against. */
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

  const template = `${columns.map((c) => c.width).join(" ")} 2.5rem`;

  return (
    <>
      <div
        onDragOver={onDragOverRow}
        onDrop={onDropRow}
        className={`group/row grid items-stretch border-b border-line transition-colors hover:bg-hover ${
          dragging ? "opacity-40" : ""
        }`}
        style={{
          gridTemplateColumns: template,
          boxShadow: dropHint
            ? `inset 3px 0 0 0 ${colour}, inset 0 2px 0 0 rgb(var(--primary-rgb))`
            : `inset 3px 0 0 0 ${colour}`,
        }}
      >
        {columns.map((col, i) => (
          <div key={col.key} className={`min-h-[2.4rem] ${i === 0 ? "" : "border-s border-line"}`}>
            {cell(col)}
          </div>
        ))}
        <span className="border-s border-line" />
      </div>

      {/* Full width, outside the row's grid — see the note on SubtaskRows. */}
      {expanded && <SubtaskRows task={task} colour={colour} />}
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
  drag,
}: {
  group: Group;
  colour: string;
  columns: ColDef[];
  colKeys: ColKey[];
  onToggleColumn: (k: ColKey) => void;
  onOpen: (t: Task) => void;
  drag: DragApi;
}) {
  const { createTask, suggestTaskCode } = useStore();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const template = `${columns.map((c) => c.width).join(" ")} 2.5rem`;

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

  const isTarget = drag.overGroup === group.id && drag.overIndex === null;

  return (
    <div className="mb-6">
      {/* Header, and the column manager — deliberately OUTSIDE the scroller. */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5"
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
      </div>

      {open && (
        <div
          onDragOver={(e) => {
            if (!drag.taskId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            drag.setOver(group.id, null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drag.drop(group.id, null);
          }}
          className={`overflow-x-auto rounded-card border bg-card shadow-card ${
            isTarget ? "border-primary" : "border-line"
          }`}
        >
          <div style={{ minWidth: "58rem" }}>
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

            {group.tasks.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                colour={colour}
                columns={columns}
                expanded={expanded === task.id}
                onExpand={() => setExpanded(expanded === task.id ? null : task.id)}
                onOpen={onOpen}
                dragging={drag.taskId === task.id}
                dropHint={drag.overGroup === group.id && drag.overIndex === i}
                onDragStart={(e) => {
                  /* Firefox refuses to start a drag unless some data is set,
                     and without effectAllowed the cursor shows "no drop". */
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", task.id);
                  drag.start(task.id, group.id);
                }}
                onDragEnd={drag.end}
                onDragOverRow={(e) => {
                  if (!drag.taskId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  drag.setOver(group.id, i);
                }}
                onDropRow={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  drag.drop(group.id, i);
                }}
              />
            ))}

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

            <div className="grid items-center py-2" style={{ gridTemplateColumns: template }}>
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

type DragApi = {
  taskId: string | null;
  overGroup: string | null;
  overIndex: number | null;
  start: (taskId: string, groupId: string) => void;
  end: () => void;
  setOver: (groupId: string, index: number | null) => void;
  drop: (groupId: string, index: number | null) => void;
};

export function GridView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const { state, updateTask } = useStore();
  const { visible, keys, toggle } = useVisibleColumns();

  const [dragId, setDragId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /*
   * Rows are ordered by their own `order`, NOT by the module's sort control.
   *
   * Dragging a row has to have a visible effect, and it cannot if a sort is
   * overriding the result. The other three views honour the sort; this one is
   * the manual board.
   */
  const groups = useMemo<Group[]>(() => {
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.projectIds[0] ?? "";
      byProject.set(key, [...(byProject.get(key) ?? []), task]);
    }
    for (const [, list] of byProject) list.sort(byOrder);

    const out: Group[] = state.projects
      .filter((p) => byProject.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, code: p.code, tasks: byProject.get(p.id) ?? [] }));

    const orphans = byProject.get("") ?? [];
    if (orphans.length) out.push({ id: "", name: "No project", code: "—", tasks: orphans });
    return out;
  }, [tasks, state.projects]);

  const empties = useMemo<Group[]>(
    () =>
      state.projects
        .filter((p) => !groups.some((g) => g.id === p.id))
        .map((p) => ({ id: p.id, name: p.name, code: p.code, tasks: [] })),
    [state.projects, groups],
  );

  const all = [...groups, ...empties];

  /**
   * Where the dragged row lands.
   *
   * The new position is the MIDPOINT of its neighbours, so one row is written
   * and the rest keep the numbers they had. Dropping on a group rather than a
   * row appends to the end of it; dropping into a different group also moves
   * the task to that project, which is the only thing here that changes
   * anything other than ordering.
   */
  function drop(groupId: string, index: number | null) {
    const taskId = dragId;
    setDragId(null);
    setOverGroup(null);
    setOverIndex(null);
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const target = all.find((g) => g.id === groupId);
    if (!target) return;

    const siblings = target.tasks.filter((t) => t.id !== taskId);
    const at = index === null ? siblings.length : Math.min(index, siblings.length);

    const before = at > 0 ? (siblings[at - 1]?.order ?? 0) : undefined;
    const after = at < siblings.length ? (siblings[at]?.order ?? 0) : undefined;

    let order: number;
    if (before === undefined && after === undefined) order = Date.now();
    else if (before === undefined) order = (after as number) - 1000;
    else if (after === undefined) order = before + 1000;
    else order = (before + after) / 2;

    const movedProject = groupId !== (task.projectIds[0] ?? "");
    if (movedProject && !groupId) return; // "No project" is not a real target.

    updateTask(
      task.id,
      {
        order,
        ...(movedProject
          ? { projectIds: [groupId, ...task.projectIds.filter((p) => p !== groupId)] }
          : {}),
      },
      movedProject ? `moved to ${target.name}` : "reordered",
    );
  }

  const drag: DragApi = {
    taskId: dragId,
    overGroup,
    overIndex,
    start: (taskId) => setDragId(taskId),
    end: () => {
      setDragId(null);
      setOverGroup(null);
      setOverIndex(null);
    },
    setOver: (groupId, index) => {
      setOverGroup(groupId);
      setOverIndex(index);
    },
    drop,
  };

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
          drag={drag}
        />
      ))}
    </div>
  );
}

export default GridView;
