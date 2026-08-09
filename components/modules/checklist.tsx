"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ClipboardCheck,
  ChevronRight,
  CircleAlert,
  CheckCircle2,
  RotateCcw,
  TrendingDown,
  ThumbsUp,
  PenLine,
  XCircle,
  Check,
  X,
  History,
  Gauge,
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
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  tone,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/overlay";
import { TextArea } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  checklistPoints,
  clampScore,
  employeesByIds,
  formatDate,
  initialsOf,
  isAwaitingReview,
  isInRework,
  isSignedOff,
  itemPoints,
  lastReview,
  pointsFor,
  projectsByIds,
  reworkCount,
  taskScore,
} from "@/lib/store/selectors";
import {
  QC_VERDICT_TONE,
  TASK_STATUS_TONE,
  priorityMeta,
  type QcVerdict,
  type Task,
} from "@/lib/store/types";

/*
 * The QC review queue — scoring the subtasks on finished work.
 *
 * A task lands here the moment it is marked Done. QC scores each subtask
 * line pass or fail and returns one of three verdicts:
 *
 *   Approved     — signed off, nothing moves.
 *   Corrections  — back to In Progress, no KRA cost, whether or not subtasks
 *                  were flagged. Flagging on this verdict says WHAT to redo.
 *   Error        — back to In Progress, and the flagged subtasks' points come
 *                  off every assignee's KRA. The only verdict that charges, and
 *                  the only one that requires something flagged.
 *
 * The deduction is per person, not shared: two people on a task with four
 * points of rejected subtasks lose four each.
 */

type Tab = "queue" | "rework" | "signed-off" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "queue", label: "Awaiting review" },
  { key: "rework", label: "In rework" },
  { key: "signed-off", label: "Signed off" },
  { key: "all", label: "All reviewed" },
];

export function Checklist() {
  const { hydrated, state, tasks } = useStore();
  const [tab, setTab] = useState<Tab>("queue");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const buckets = useMemo(
    () => ({
      queue: tasks.filter(isAwaitingReview),
      rework: tasks.filter(isInRework),
      "signed-off": tasks.filter(isSignedOff),
      all: tasks.filter((t) => t.qcReviews.length > 0),
    }),
    [tasks],
  );

  const totalDeducted = useMemo(
    () =>
      tasks.reduce(
        (n, t) => n + t.qcReviews.reduce((m, r) => m + r.pointsDeducted * r.affected.length, 0),
        0,
      ),
    [tasks],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = buckets[tab];
    if (!q) return rows;
    return rows.filter((t) => {
      const people = employeesByIds(state, t.assignedTo)
        .map((e) => e.name)
        .join(" ");
      return `${t.title} ${t.taskId} ${people} ${t.createdBy}`.toLowerCase().includes(q);
    });
  }, [buckets, tab, query, state]);

  if (!hydrated) return <ModuleSkeleton />;

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Awaiting Review"
          value={String(buckets.queue.length)}
          hint="Marked Done, not yet cleared"
          t="orange"
          icon={ClipboardCheck}
        />
        <StatTile
          label="Signed Off"
          value={String(buckets["signed-off"].length)}
          hint="Approved by QC"
          t="sky"
          icon={CheckCircle2}
        />
        <StatTile
          label="In Rework"
          value={String(buckets.rework.length)}
          hint="Sent back, being redone"
          t="red"
          icon={RotateCcw}
        />
        <StatTile
          label="KRA Deducted"
          value={String(totalDeducted)}
          hint="Points lost to errors, all time"
          t="slate"
          icon={TrendingDown}
        />
      </Grid>

      <Card>
        <CardHeader
          title="QC Review Queue"
          desc="Select a task to score its subtasks and record a verdict."
          action={
            <SearchBox
              placeholder="Search tasks or people…"
              value={query}
              onChange={setQuery}
              className="sm:w-56"
            />
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          {TABS.map((t) => (
            <Chip
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
              count={buckets[t.key].length}
            >
              {t.label}
            </Chip>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={
              query.trim()
                ? "Nothing matches that search"
                : tab === "queue"
                  ? "Nothing waiting on QC"
                  : "Nothing here yet"
            }
            desc={
              tab === "queue"
                ? "Tasks appear here as soon as they are moved to Done in Task Management."
                : tab === "rework"
                  ? "Tasks QC has sent back will show here until they are finished again."
                  : "Reviewed tasks and their verdicts will collect here."
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Task</Th>
                <Th>Project</Th>
                <Th>Assigned</Th>
                <Th>Created by</Th>
                <Th className="w-32">Score</Th>
                <Th>Points</Th>
                <Th>QC</Th>
                <Th className="text-right">Reviews</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => {
                const expanded = openId === task.id;
                const people = employeesByIds(state, task.assignedTo);
                const projects = projectsByIds(state, task.projectIds);
                const review = lastReview(task);
                const rework = reworkCount(task);
                const score = taskScore(task);

                return (
                  <Fragment key={task.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : task.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${task.title}` : `Review ${task.title}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <span className="min-w-0">
                            <span className="block font-medium text-heading">{task.title}</span>
                            <span className="font-mono text-[0.6875rem] text-muted">
                              {task.taskId}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {projects.length === 0 ? "—" : projects.map((p) => p.code).join(", ")}
                      </Td>
                      <Td>
                        {people.length > 0 ? (
                          <AvatarStack items={people.map((e) => initialsOf(e.name))} />
                        ) : (
                          <span className="text-[0.75rem] text-muted">—</span>
                        )}
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
                      <Td className="whitespace-nowrap font-semibold text-heading">
                        {checklistPoints(task)}
                      </Td>
                      <Td>
                        {review ? (
                          <Badge t={QC_VERDICT_TONE[review.verdict]}>{review.verdict}</Badge>
                        ) : (
                          <Badge t="slate">Unreviewed</Badge>
                        )}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {rework > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.6875rem] font-semibold"
                            style={{ background: tone.red.soft, color: tone.red.text }}
                          >
                            <RotateCcw size={11} />
                            {rework}× sent back
                          </span>
                        ) : (
                          <span className="text-[0.75rem] text-muted">
                            {task.qcReviews.length || "—"}
                          </span>
                        )}
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <ReviewPanel task={task} onDone={() => setOpenId(null)} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- review panel -- */

function ReviewPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const { state, submitQcReview } = useStore();
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<QcVerdict | null>(null);

  const assignees = employeesByIds(state, task.assignedTo);
  const deduction = pointsFor(task, failed);
  const canReview = task.status === "Done";

  const toggle = (id: string) =>
    setFailed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const commit = (verdict: QcVerdict) => {
    submitQcReview(task.id, { verdict, failedItemIds: [...failed], note });
    setFailed(new Set());
    setNote("");
    onDone();
  };

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      {/* scoring */}
      <div className="space-y-4 xl:col-span-7">
        <div>
          <SectionLabel>Description</SectionLabel>
          <p className="text-[0.8125rem] leading-relaxed text-text">{task.description}</p>
        </div>

        <div className="rounded-sm border border-line bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <SectionLabel>
              {task.checklist.length} subtask{task.checklist.length === 1 ? "" : "s"} —{" "}
              {checklistPoints(task)} KRA point{checklistPoints(task) === 1 ? "" : "s"} at stake
            </SectionLabel>
            {failed.size > 0 && (
              <span
                className="rounded-sm px-2 py-0.5 text-[0.75rem] font-bold"
                style={{ background: tone.red.soft, color: tone.red.text }}
              >
                {failed.size} rejected · −{deduction} KRA
              </span>
            )}
          </div>

          <ul className="divide-y divide-line">
            {task.checklist.map((c) => {
              const isFailed = failed.has(c.id);
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap"
                  style={isFailed ? { background: tone.red.soft } : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] text-text">{c.label}</span>
                    <span className="text-[0.6875rem] text-muted">
                      {/*
                       * Two numbers, and they answer different questions:
                       * acceptance is how far the assignee says this subtask
                       * got; the points are what rejecting it costs each of
                       * them off their KRA.
                       */}
                      Acceptance {Math.round(clampScore(c.score) * 100)}% · worth{" "}
                      {itemPoints(c)} KRA point{itemPoints(c) === 1 ? "" : "s"}
                    </span>
                  </span>

                  {/* pass / fail — the whole point of this module */}
                  <span className="flex shrink-0 overflow-hidden rounded-sm border border-line">
                    <button
                      type="button"
                      onClick={() => isFailed && toggle(c.id)}
                      aria-pressed={!isFailed}
                      disabled={!canReview}
                      title="Satisfies the requirement"
                      className={`flex h-8 w-10 items-center justify-center transition-colors disabled:opacity-50 ${
                        isFailed ? "bg-card text-muted hover:text-primary" : "text-white"
                      }`}
                      style={!isFailed ? { background: tone.sky.solid } : undefined}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => !isFailed && toggle(c.id)}
                      aria-pressed={isFailed}
                      disabled={!canReview}
                      title="Not satisfying — counts towards the KRA deduction"
                      className={`flex h-8 w-10 items-center justify-center border-s border-line transition-colors disabled:opacity-50 ${
                        isFailed ? "text-white" : "bg-card text-muted hover:text-danger"
                      }`}
                      style={isFailed ? { background: "rgb(var(--danger-rgb))" } : undefined}
                    >
                      <X size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {canReview ? (
          <>
            <TextArea
              label="Review note"
              rows={2}
              value={note}
              onChange={setNote}
              placeholder="What was wrong, or what to check on the next pass."
              hint="Optional. Stored against the task's history."
            />

            {/*
             * What flagging costs — and, just as importantly, what it does not.
             *
             * This panel used to turn red the moment a subtask was flagged and
             * announce a per-person before/after, whichever verdict you were
             * heading for. A manager flagging subtasks in order to request
             * CORRECTIONS read that as "this is about to cost my team KRA",
             * which is the opposite of what Corrections does. It is neutral
             * now, and says the rule outright.
             */}
            <div
              className="rounded-sm p-3"
              style={{ background: tone.slate.soft, color: tone.slate.text }}
            >
              <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold">
                <Gauge size={13} />
                KRA impact
              </p>
              <p className="mt-1 text-[0.75rem] leading-relaxed">
                <strong>Only an Error verdict moves KRA.</strong> Approving or
                requesting corrections never costs anyone points, however many
                subtasks are flagged.
              </p>
              <p className="mt-1.5 text-[0.75rem] leading-relaxed">
                {deduction === 0 ? (
                  <>No subtasks flagged — an Error verdict would deduct nothing.</>
                ) : (
                  <>
                    If you record an <strong>Error</strong>: {deduction} point
                    {deduction === 1 ? "" : "s"} off <strong>each</strong> of{" "}
                    {assignees.length} assignee{assignees.length === 1 ? "" : "s"} — not
                    shared between them.
                  </>
                )}
              </p>
              {deduction > 0 && assignees.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {assignees.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-[0.75rem]">
                      <Avatar initials={initialsOf(e.name)} t={e.tone} size={22} />
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      {/* Prefixed, so this can't be read as a change already made. */}
                      <span className="font-mono font-semibold">
                        on Error: {e.kraScore} → {Math.max(0, e.kraScore - deduction)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button icon={ThumbsUp} onClick={() => setConfirm("Approved")}>
                Approve
              </Button>
              <Button variant="ghost" icon={PenLine} onClick={() => setConfirm("Corrections")}>
                Request corrections
              </Button>
              <Button
                variant="danger"
                icon={XCircle}
                disabled={failed.size === 0}
                title={
                  failed.size === 0 ? "Flag at least one subtask to record an error" : undefined
                }
                onClick={() => setConfirm("Error")}
              >
                Mark error
              </Button>
            </div>
          </>
        ) : (
          <p
            className="flex items-start gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
            style={{ background: tone.orange.soft, color: tone.orange.text }}
          >
            <CircleAlert size={14} className="mt-px shrink-0" />
            This task is back with the team as <strong>{task.status}</strong>. It returns to the
            queue once it is marked Done again.
          </p>
        )}
      </div>

      {/* history + context */}
      <div className="space-y-4 xl:col-span-5">
        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <Row label="Created by" value={task.createdBy} />
          <Row label="Created" value={formatDate(task.createdAt)} />
          <Row label="Priority" value={priorityMeta(task.priority).label} />
          <Row label="Status" value={task.status} />
        </dl>

        <div>
          <SectionLabel>Assigned to ({assignees.length})</SectionLabel>
          <ul className="space-y-1.5">
            {assignees.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5">
                <Avatar initials={initialsOf(e.name)} t={e.tone} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-heading">
                    {e.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-muted">
                    {e.role} · KRA {e.kraScore}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <QcHistory task={task} />
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && commit(confirm)}
        title={
          confirm === "Approved"
            ? "Sign this task off"
            : confirm === "Corrections"
              ? "Send back for corrections"
              : "Record an error"
        }
        confirmLabel={
          confirm === "Approved" ? "Approve" : confirm === "Corrections" ? "Send back" : "Deduct and send back"
        }
        message={
          confirm === "Approved"
            ? `${task.taskId} will be signed off. No KRA changes.`
            : confirm === "Corrections"
              ? `${task.taskId} goes back to In Progress with ${failed.size} line${failed.size === 1 ? "" : "s"} flagged. Nobody loses KRA.`
              : `${deduction} KRA point${deduction === 1 ? "" : "s"} will be deducted from each of ${assignees.length} assignee${assignees.length === 1 ? "" : "s"}, and ${task.taskId} goes back to In Progress.`
        }
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[0.75rem] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[0.8125rem] font-medium text-heading">
        {value}
      </dd>
    </div>
  );
}

/**
 * The QC trail for a task. Shared with Task Management so the same history
 * reads identically wherever it is opened.
 */
export function QcHistory({ task }: { task: Task }) {
  const { state } = useStore();

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        <History size={14} />
        <SectionLabel>QC history ({task.qcReviews.length})</SectionLabel>
      </div>

      {task.qcReviews.length === 0 ? (
        <p className="text-[0.75rem] text-muted">Not reviewed yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...task.qcReviews].reverse().map((r) => {
            const failedLabels = task.checklist
              .filter((c) => r.failedItemIds.includes(c.id))
              .map((c) => c.label);
            return (
              <li key={r.id} className="rounded-sm border border-line bg-card p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge t={QC_VERDICT_TONE[r.verdict]}>{r.verdict}</Badge>
                  <span className="text-[0.6875rem] text-muted">
                    {r.by} · {formatDate(r.at)}
                  </span>
                </div>

                {r.note && (
                  <p className="mt-1.5 text-[0.75rem] leading-relaxed text-text">{r.note}</p>
                )}

                {failedLabels.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {failedLabels.map((l) => (
                      <li
                        key={l}
                        className="flex items-start gap-1.5 text-[0.6875rem]"
                        style={{ color: tone.red.text }}
                      >
                        <X size={11} className="mt-0.5 shrink-0" />
                        {l}
                      </li>
                    ))}
                  </ul>
                )}

                {r.pointsDeducted > 0 && (
                  <div
                    className="mt-2 rounded-sm px-2 py-1.5 text-[0.6875rem]"
                    style={{ background: tone.red.soft, color: tone.red.text }}
                  >
                    <p className="font-semibold">
                      −{r.pointsDeducted} KRA to each of {r.affected.length}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {r.affected.map((a) => {
                        const person = state.employees.find((e) => e.id === a.employeeId);
                        return (
                          <li key={a.employeeId} className="flex justify-between gap-2">
                            <span className="truncate">{person?.name ?? "Removed employee"}</span>
                            <span className="font-mono">
                              {a.from} → {a.to}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
