"use client";

/*
 * Sprints.
 *
 * A project has MANY sprints and a sprint belongs to exactly one project, so
 * this screen is read project-first: pick a project, see its lanes. The lane
 * list always ends with a Backlog, which is not a sprint and has no row in the
 * database — it is simply every task of the project whose `sprintId` is null.
 * Modelling it as a real sprint would have meant creating one before anybody
 * could file the first task.
 *
 * Moving a card between lanes writes one field. Nothing is reordered, no task
 * is created or destroyed, and the backlog is reachable by dragging into it,
 * which is why "unplan this" needs no separate control.
 */

import { useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  Check,
  Flag,
  Layers,
  Pencil,
  Plus,
  Rocket,
  Target,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Grid,
  IconButton,
  ModuleSkeleton,
  StatTile,
  tone,
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { FormGrid, SelectInput, Span, TextArea, TextInput } from "@/components/ui/form";
import {
  useAssignTasksToSprintMutation,
  useCreateSprintMutation,
  useDeleteSprintMutation,
  useListSprintsQuery,
  useUpdateSprintMutation,
} from "@/lib/api/api";
import { useStore } from "@/lib/store/StoreProvider";
import { useSession } from "@/lib/api/session";
import { TASK_STATUS_TONE, type Task } from "@/lib/store/types";
import type { Sprint, SprintState } from "@/lib/api/types";
import type { Tone } from "@/lib/ui/tone";

/* ------------------------------------------------------------- vocabulary -- */

const STATE_LABEL: Record<SprintState, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATE_TONE: Record<SprintState, Tone> = {
  planned: "slate",
  active: "green",
  completed: "blue",
  cancelled: "red",
};

/** The lane colours offered when creating a sprint. */
const TONES: Tone[] = ["purple", "blue", "teal", "green", "amber", "pink", "red", "slate"];

function toneOf(raw: string): Tone {
  return (TONES as string[]).includes(raw) ? (raw as Tone) : "purple";
}

/** `2026-03-04` → `4 Mar`. Compact because two of them share a lane header. */
function shortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Whole days left, or null when there is no end date to count towards. */
function daysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

/* ------------------------------------------------------------------ view -- */

/** The Backlog pseudo-lane. Null is its id everywhere, matching the column. */
type LaneId = string | null;

export function SprintBoard({ onOpen }: { onOpen?: (t: Task) => void }) {
  const { state, hydrated } = useStore();
  const session = useSession();
  const signedIn = session.status === "user";
  const projects = state.projects;

  const [picked, setPicked] = useState<string>("");
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Sprint | null>(null);

  /*
   * Which project's board is showing.
   *
   * DERIVED rather than seeded from an effect. The projects arrive
   * asynchronously, so a `useState(projects[0]?.id)` initialiser would run
   * once against an empty list and never again; an effect that corrects it
   * afterwards costs a second render and a flash of an empty board. Falling
   * back at read time has neither problem, and the moment someone picks
   * explicitly `picked` takes over for good.
   */
  const projectId = picked || projects[0]?.id || "";
  const setProjectId = setPicked;

  /*
   * Skipped for a demo portal.
   *
   * Sprints only exist server-side — the local demo store has no such list —
   * so firing this without a session would be a guaranteed 401 on every load
   * of the view. The empty state below says so rather than showing an empty
   * board that looks like a workspace with no sprints in it.
   */
  const { data: sprints, isLoading } = useListSprintsQuery(
    projectId ? { projectId } : undefined,
    { skip: !projectId || !signedIn },
  );
  const [deleteSprint] = useDeleteSprintMutation();
  const [assignToSprint] = useAssignTasksToSprintMutation();

  const tasks = useMemo(
    () => state.tasks.filter((t) => t.projectIds.includes(projectId)),
    [state.tasks, projectId],
  );

  const lanes = useMemo(() => {
    const ordered = [...(sprints ?? [])].sort((a, b) => a.order - b.order);
    const byLane = new Map<LaneId, Task[]>();
    byLane.set(null, []);
    for (const s of ordered) byLane.set(s.id, []);
    for (const t of tasks) {
      // A task pointing at a sprint of another project (or a deleted one)
      // falls into the backlog rather than vanishing from the board.
      const key = t.sprintId && byLane.has(t.sprintId) ? t.sprintId : null;
      byLane.get(key)!.push(t);
    }
    return { ordered, byLane };
  }, [sprints, tasks]);

  const project = projects.find((p) => p.id === projectId);

  if (!hydrated) return <ModuleSkeleton rows={4} />;

  if (!signedIn) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="Sprints need a signed-in workspace"
          desc="Sprints are stored against your company on the server, so the demo portals have none. Sign in to plan work into sprints."
        />
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="No projects yet"
          desc="A sprint is a slice of one project's work, so there has to be a project first."
        />
      </Card>
    );
  }

  /*
   * Moving a card writes one field, through the sprint endpoint rather than
   * the task one.
   *
   * Both would set `sprintId`, but only this one invalidates the Sprint cache
   * as well as the task list — and the lane headers count from it. Going
   * through `updateTask` left "12 tasks" above a lane that had just lost one.
   */
  const move = (task: Task, to: LaneId) => {
    if ((task.sprintId ?? null) === to) return;
    void assignToSprint({ taskIds: [task.id], sprintId: to });
  };

  const totals = lanes.ordered.reduce(
    (acc, s) => {
      acc.tasks += s.taskCount ?? 0;
      acc.done += s.doneCount ?? 0;
      if (s.state === "active") acc.active += 1;
      return acc;
    },
    { tasks: 0, done: 0, active: 0 },
  );

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Sprints"
          value={String(lanes.ordered.length)}
          hint={project ? `in ${project.name}` : "across this project"}
          t="purple"
          icon={Layers}
        />
        <StatTile
          label="Active"
          value={String(totals.active)}
          hint="Running right now"
          t="green"
          icon={Rocket}
        />
        <StatTile
          label="Planned Work"
          value={String(totals.tasks)}
          hint={`${totals.done} finished`}
          t="blue"
          icon={Target}
        />
        <StatTile
          label="Backlog"
          value={String(lanes.byLane.get(null)?.length ?? 0)}
          hint="Not in any sprint yet"
          t="slate"
          icon={Flag}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Sprint board"
          desc="Drag a card between lanes to plan it. The backlog is everything not in a sprint."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <SelectInput
                  label="Project"
                  hideLabel
                  value={projectId}
                  onChange={setProjectId}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <Button icon={Plus} onClick={() => setCreating(true)}>
                New Sprint
              </Button>
            </div>
          }
        />

        <CardBody>
          {isLoading ? (
            <ModuleSkeleton rows={3} stats={false} />
          ) : (
            /*
             * Horizontal lanes, scrolled as a strip.
             *
             * `items-start` matters: without it every lane stretches to the
             * height of the tallest, which turns a board with one busy sprint
             * into a wall of empty boxes.
             */
            <div className="flex items-start gap-4 overflow-x-auto pb-2">
              {lanes.ordered.map((sprint) => (
                <Lane
                  key={sprint.id}
                  sprint={sprint}
                  tasks={lanes.byLane.get(sprint.id) ?? []}
                  onDropTask={(task) => move(task, sprint.id)}
                  onEdit={() => setEditing(sprint)}
                  onDelete={() => setPendingDelete(sprint)}
                  onOpen={onOpen}
                />
              ))}

              <Lane
                sprint={null}
                tasks={lanes.byLane.get(null) ?? []}
                onDropTask={(task) => move(task, null)}
                onOpen={onOpen}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/*
        Keyed on what it is editing, so switching from one sprint to another
        REMOUNTS the form and its fields initialise from the new sprint. The
        alternative — an effect that re-seeds six useStates — is the same
        thing done later and with a render in between, which is how a dialog
        comes up showing the previous sprint's name for a frame.
      */}
      {(creating || editing !== null) && (
        <SprintForm
          key={editing?.id ?? "new"}
          sprint={editing}
          projectId={projectId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? "sprint"}?`}
        message="Its tasks go back to the backlog — nothing is deleted with it."
        confirmLabel="Delete sprint"
        onConfirm={() => {
          if (pendingDelete) void deleteSprint(pendingDelete.id);
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ lane -- */

function Lane({
  sprint,
  tasks,
  onDropTask,
  onEdit,
  onDelete,
  onOpen,
}: {
  /** Null is the Backlog lane — see LaneId. */
  sprint: Sprint | null;
  tasks: Task[];
  onDropTask: (task: Task) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: (t: Task) => void;
}) {
  const [over, setOver] = useState(false);
  const t = sprint ? toneOf(sprint.tone) : "slate";
  const c = tone[t];

  const done = tasks.filter((x) => x.status === "Done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const left = daysLeft(sprint?.endDate);

  /*
   * The drag payload is the task id as plain text.
   *
   * `dataTransfer` is only readable in `drop` — in `dragover` the browser
   * hides it — so the drop handler looks the task up from the list it already
   * has rather than trying to carry the object across.
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/plain");
    const task = DRAG_SOURCE.current;
    if (task && task.id === id) onDropTask(task);
  };

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={`flex w-[19rem] shrink-0 flex-col rounded-card border bg-card transition-colors ${
        over ? "border-primary" : "border-line"
      }`}
      aria-label={sprint ? `${sprint.name} sprint` : "Backlog"}
    >
      {/*
        The lane header carries the lane's colour as a wash and a top rule.
        A solid fill would fight the cards inside it for attention; the rule is
        what makes six lanes legible as six at a glance.
      */}
      <header
        className="rounded-t-card border-b border-line px-3.5 pb-3 pt-3"
        style={{
          background: `linear-gradient(180deg, ${c.soft}, transparent)`,
          borderTop: `3px solid ${c.solid}`,
        }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[0.875rem] font-bold text-heading">
              {sprint ? sprint.name : "Backlog"}
            </h3>
            <p className="mt-0.5 truncate text-[0.6875rem] text-muted">
              {sprint?.goal || (sprint ? "No goal set" : "Work not planned into a sprint yet")}
            </p>
          </div>
          {sprint && (
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton label={`Edit ${sprint.name}`} icon={Pencil} onClick={onEdit} />
              <IconButton
                label={`Delete ${sprint.name}`}
                icon={Trash2}
                tone="red"
                onClick={onDelete}
              />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {sprint ? (
            <Badge t={STATE_TONE[sprint.state]}>{STATE_LABEL[sprint.state]}</Badge>
          ) : (
            <Badge t="slate">Unplanned</Badge>
          )}
          <span className="text-[0.6875rem] font-semibold text-muted">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
          {sprint && (shortDate(sprint.startDate) || shortDate(sprint.endDate)) && (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-muted">
              <CalendarRange size={12} />
              {shortDate(sprint.startDate) ?? "—"} – {shortDate(sprint.endDate) ?? "—"}
            </span>
          )}
          {/* Only while it matters: a finished sprint counting down is noise. */}
          {sprint && sprint.state === "active" && left !== null && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold"
              style={
                left < 0
                  ? { background: tone.red.soft, color: tone.red.text }
                  : { background: tone.amber.soft, color: tone.amber.text }
              }
            >
              {left < 0 ? `${Math.abs(left)}d over` : `${left}d left`}
            </span>
          )}
        </div>

        <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: c.solid }}
            />
          </div>
          <p className="mt-1 text-[0.625rem] text-muted">
            {done} of {tasks.length} done · {pct}%
          </p>
        </div>
      </header>

      <div className="flex min-h-[7rem] flex-col gap-2 p-2.5">
        {tasks.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line px-3 py-6 text-center text-[0.6875rem] text-muted">
            Drag a task here
          </p>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpen} />)
        )}
      </div>
    </section>
  );
}

/*
 * The task being dragged.
 *
 * A module-level ref rather than state: it is written in `dragstart` and read
 * in `drop`, and nothing renders from it, so putting it in state would
 * re-render every lane on every pick-up for no visible change. See the same
 * pattern in task-grid.tsx, where the state version caused a re-render storm.
 */
const DRAG_SOURCE: { current: Task | null } = { current: null };

function TaskCard({ task, onOpen }: { task: Task; onOpen?: (t: Task) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const score = task.checklist.length
    ? Math.round(
        (task.checklist.reduce((n, c) => n + c.score, 0) / task.checklist.length) * 100,
      )
    : 0;

  return (
    <div
      ref={ref}
      draggable
      onDragStart={(e) => {
        DRAG_SOURCE.current = task;
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => {
        DRAG_SOURCE.current = null;
        setDragging(false);
      }}
      onClick={() => onOpen?.(task)}
      className={`cursor-grab rounded-sm border border-line bg-card p-2.5 shadow-card transition-[opacity,transform] hover:border-primary active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[0.8125rem] font-semibold leading-snug text-heading">
          {task.title}
        </p>
        <Badge t={TASK_STATUS_TONE[task.status]}>{task.status}</Badge>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[0.625rem] text-muted">{task.taskId || "—"}</span>
        <span className="text-[0.625rem] font-semibold text-muted">P{task.priority}</span>
      </div>

      {task.checklist.length > 0 && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full"
              style={{ width: `${score}%`, background: tone.sky.solid }}
            />
          </div>
          <p className="mt-1 text-[0.625rem] text-muted">
            {task.checklist.length} subtask{task.checklist.length === 1 ? "" : "s"} · {score}%
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ form -- */

/**
 * Mounted only while open and keyed on the sprint — see the call site. Every
 * field therefore initialises from props exactly once, which is why there is
 * no effect in here re-seeding them.
 */
function SprintForm({
  sprint,
  projectId,
  onClose,
}: {
  /** Null when creating. */
  sprint: Sprint | null;
  projectId: string;
  onClose: () => void;
}) {
  const [createSprint, createState] = useCreateSprintMutation();
  const [updateSprint, updateState] = useUpdateSprintMutation();

  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [state, setState] = useState<SprintState>(sprint?.state ?? "planned");
  const [laneTone, setLaneTone] = useState<Tone>(sprint ? toneOf(sprint.tone) : "purple");
  const [startDate, setStartDate] = useState(sprint?.startDate?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(sprint?.endDate?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);

  const busy = createState.isLoading || updateState.isLoading;

  const submit = async () => {
    if (!name.trim()) {
      setError("Give the sprint a name.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError("A sprint cannot end before it starts.");
      return;
    }
    setError(null);

    const patch = {
      name: name.trim(),
      goal: goal.trim() || null,
      state,
      tone: laneTone,
      startDate: startDate || null,
      endDate: endDate || null,
    };

    try {
      if (sprint) await updateSprint({ id: sprint.id, patch }).unwrap();
      else await createSprint({ projectId, ...patch }).unwrap();
      onClose();
    } catch (err) {
      // The server owns the real rules — duplicate names, a project you were
      // removed from — so its message is shown rather than a guess at one.
      const message =
        typeof err === "object" && err && "data" in err
          ? ((err as { data?: { error?: { message?: string } } }).data?.error?.message ?? null)
          : null;
      setError(message ?? "That could not be saved. Try again.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={sprint ? `Edit ${sprint.name}` : "New sprint"}
      desc="A sprint is one slice of this project's work, with a window and a goal."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Check} onClick={() => void submit()} disabled={busy}>
            {sprint ? "Save sprint" : "Create sprint"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Span>
          <TextInput label="Name" value={name} onChange={setName} required placeholder="Sprint 4" />
        </Span>
        <Span>
          <TextArea
            label="Goal"
            value={goal}
            onChange={setGoal}
            rows={2}
            placeholder="What this sprint is for, in one line."
          />
        </Span>
        <TextInput label="Starts" type="date" value={startDate} onChange={setStartDate} />
        <TextInput label="Ends" type="date" value={endDate} onChange={setEndDate} />
        <SelectInput<SprintState>
          label="State"
          value={state}
          onChange={setState}
          options={(Object.keys(STATE_LABEL) as SprintState[]).map((s) => ({
            value: s,
            label: STATE_LABEL[s],
          }))}
        />
        <Span>
          <fieldset>
            <legend className="mb-1.5 text-[0.75rem] font-semibold text-heading">Lane colour</legend>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-label={t}
                  aria-pressed={laneTone === t}
                  onClick={() => setLaneTone(t)}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    laneTone === t ? "scale-110 ring-2 ring-offset-2" : ""
                  }`}
                  style={{
                    background: tone[t].solid,
                    // `ring-offset` needs a colour it can sit on, and the modal
                    // surface is not the page background.
                    ["--tw-ring-color" as string]: tone[t].solid,
                    ["--tw-ring-offset-color" as string]: "var(--card-bg)",
                  }}
                />
              ))}
            </div>
          </fieldset>
        </Span>
        {error && (
          <Span>
            <p
              className="rounded-sm px-3 py-2 text-[0.75rem] font-medium"
              style={{ background: tone.red.soft, color: tone.red.text }}
            >
              {error}
            </p>
          </Span>
        )}
      </FormGrid>
    </Modal>
  );
}

export default SprintBoard;
