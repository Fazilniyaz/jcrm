"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2, GitPullRequest } from "lucide-react";
import { Button, IconButton, SectionLabel, tone } from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import {
  Field,
  FormGrid,
  MultiSelect,
  SelectInput,
  Span,
  TextArea,
  TextInput,
  type Option,
} from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import { clampScore, initialsOf, itemPoints } from "@/lib/store/selectors";
import {
  PRIORITIES,
  ROLE_TONE,
  TASK_STATUSES,
  type Subtask,
  type Task,
  type TaskStatus,
} from "@/lib/store/types";

/*
 * Create / edit a task.
 *
 * On edit the form works out what actually changed and writes that into the
 * task's audit trail, so `updatedBy` is a real history rather than a timestamp.
 */

type Draft = {
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  projectIds: string[];
  assignedTo: string[];
  reportTo: string[];
  startDate: string;
  endDate: string;
  prUrl: string;
  /** Named `checklist` because that is still the field on the wire. */
  checklist: Subtask[];
};

let rowSeq = 0;
const newRow = (): Subtask => ({
  id: `cl-${Date.now()}-${rowSeq++}`,
  label: "",
  score: 0,
  points: 1,
});

function draftFrom(task: Task | undefined, nextCode: string): Draft {
  return {
    taskId: task?.taskId ?? nextCode,
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "New",
    priority: task?.priority ?? 3,
    projectIds: task?.projectIds ?? [],
    assignedTo: task?.assignedTo ?? [],
    reportTo: task?.reportTo ?? [],
    startDate: task?.startDate ?? "",
    endDate: task?.endDate ?? "",
    prUrl: task?.prUrl ?? "",
    checklist: task ? task.checklist.map((c) => ({ ...c })) : [newRow()],
  };
}

/** Human summary of what changed, for the audit trail. */
function describeChanges(before: Task, after: Draft, projectNames: (ids: string[]) => string): string {
  const parts: string[] = [];
  if (before.title !== after.title.trim()) parts.push("retitled");
  if (before.status !== after.status) parts.push(`status ${before.status} → ${after.status}`);
  if (before.priority !== after.priority) parts.push(`priority P${before.priority} → P${after.priority}`);
  if (before.assignedTo.join() !== after.assignedTo.join()) parts.push("reassigned");
  if (before.reportTo.join() !== after.reportTo.join()) parts.push("reporting line changed");
  if (before.projectIds.join() !== after.projectIds.join())
    parts.push(`projects → ${projectNames(after.projectIds) || "none"}`);
  if ((before.endDate ?? "") !== after.endDate) parts.push("end date changed");
  if ((before.prUrl ?? "") !== after.prUrl.trim()) parts.push("PR link changed");

  const beforeScores = before.checklist.map((c) => `${c.label}:${c.score}`).join("|");
  const afterScores = after.checklist.map((c) => `${c.label}:${c.score}`).join("|");
  if (beforeScores !== afterScores) parts.push("subtasks updated");

  if (parts.length === 0) return "";
  return parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
}

export default function TaskForm({
  open,
  task,
  onClose,
  defaultProjectId,
}: {
  open: boolean;
  task?: Task;
  onClose: () => void;
  /** Pre-selects a project when the form is opened from a project context. */
  defaultProjectId?: string;
}) {
  const { employees, projects, createTask, updateTask, suggestTaskCode } = useStore();

  const [draft, setDraft] = useState<Draft>(() => {
    const d = draftFrom(task, suggestTaskCode());
    if (!task && defaultProjectId) d.projectIds = [defaultProjectId];
    return d;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  const peopleOptions: Option[] = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: e.name,
        hint: `${e.role} · ${e.empId}`,
        initials: initialsOf(e.name),
        tone: ROLE_TONE[e.role],
      })),
    [employees],
  );

  const reportOptions: Option[] = useMemo(
    () => peopleOptions.filter((o) => /Manager|Team Leader|QC/.test(o.hint ?? "")),
    [peopleOptions],
  );

  const projectOptions: Option[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name, hint: p.code })),
    [projects],
  );

  /* -------------------------------------------------------------- subtasks */

  const setRow = (id: string, patch: Partial<Subtask>) =>
    set(
      "checklist",
      draft.checklist.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const addRow = () => set("checklist", [...draft.checklist, newRow()]);
  const removeRow = (id: string) =>
    set("checklist", draft.checklist.filter((c) => c.id !== id));

  const filledRows = draft.checklist.filter((c) => c.label.trim());
  const score =
    filledRows.length === 0
      ? 0
      : Math.round((filledRows.reduce((n, c) => n + clampScore(c.score), 0) / filledRows.length) * 100);
  // What the assignees stand to lose if QC rejects every line.
  const totalPoints = filledRows.reduce((n, c) => n + itemPoints(c), 0);

  /* -------------------------------------------------------------- validate */

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = "Give the task a title.";
    if (!draft.taskId.trim()) next.taskId = "A task ID is required.";
    if (!draft.description.trim()) next.description = "Describe what needs doing.";
    if (draft.projectIds.length === 0) next.projectIds = "Pick at least one project.";
    if (draft.assignedTo.length === 0) next.assignedTo = "Assign this to someone.";
    if (draft.reportTo.length === 0) next.reportTo = "Choose at least one reporting line.";
    if (!draft.startDate) next.startDate = "Pick a start date.";
    if (draft.endDate && draft.startDate && draft.endDate < draft.startDate)
      next.endDate = "The end date can't fall before the start date.";
    if (filledRows.length === 0) next.checklist = "Add at least one checklist line.";
    if (draft.prUrl.trim() && !/^https?:\/\//i.test(draft.prUrl.trim()))
      next.prUrl = "Use a full URL starting with http:// or https://";
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  function save() {
    if (!validate()) return;
    const payload = {
      taskId: draft.taskId.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      status: draft.status,
      priority: draft.priority,
      projectIds: draft.projectIds,
      assignedTo: draft.assignedTo,
      reportTo: draft.reportTo,
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      prUrl: draft.prUrl.trim() || undefined,
      // Blank lines are dropped rather than saved as empty acceptance criteria.
      checklist: filledRows.map((c) => ({ ...c, label: c.label.trim(), score: clampScore(c.score) })),
    };

    if (task) {
      const names = (ids: string[]) =>
        ids.map((id) => projects.find((p) => p.id === id)?.code ?? id).join(", ");
      updateTask(task.id, payload, describeChanges(task, draft, names) || undefined);
    } else {
      createTask(payload);
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? `Edit ${task.taskId}` : "New task"}
      desc={
        task
          ? "Every change is written to this task's history."
          : "Subtasks are scored 0 to 1 — that acceptance score drives the task's completion."
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Span>
          <TextInput
            label="Task title"
            required
            value={draft.title}
            onChange={(v) => set("title", v)}
            placeholder="Wire refund flow to the payments API"
            error={errors.title}
          />
        </Span>

        <TextInput
          label="Task ID"
          required
          value={draft.taskId}
          onChange={(v) => set("taskId", v)}
          hint={task ? undefined : "Suggested from the highest ID in use."}
          error={errors.taskId}
        />
        <SelectInput<TaskStatus>
          label="Status"
          value={draft.status}
          onChange={(v) => set("status", v)}
          options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
        />

        <Span>
          <TextArea
            label="Description"
            required
            rows={3}
            value={draft.description}
            onChange={(v) => set("description", v)}
            placeholder="What needs doing, and what done looks like."
            error={errors.description}
          />
        </Span>

        <SelectInput<number>
          label="Priority"
          value={draft.priority}
          onChange={(v) => set("priority", v)}
          options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
          hint="P1 is worked first."
        />
        <TextInput
          label="PR attachment"
          type="url"
          value={draft.prUrl}
          onChange={(v) => set("prUrl", v)}
          placeholder="https://github.com/…/pull/412"
          hint="Optional."
          error={errors.prUrl}
        />

        <Span>
          <MultiSelect
            label="Assigned project(s)"
            required
            value={draft.projectIds}
            onChange={(v) => set("projectIds", v)}
            options={projectOptions}
            placeholder="Choose one or more projects"
            emptyText="No projects yet — create one first"
            error={errors.projectIds}
          />
        </Span>

        <Span>
          <MultiSelect
            label="Assigned to"
            required
            value={draft.assignedTo}
            onChange={(v) => set("assignedTo", v)}
            options={peopleOptions}
            placeholder="Choose one or more people"
            error={errors.assignedTo}
          />
        </Span>

        <Span>
          <MultiSelect
            label="Reports to"
            required
            value={draft.reportTo}
            onChange={(v) => set("reportTo", v)}
            options={reportOptions}
            placeholder="Managers, team leaders and QC"
            error={errors.reportTo}
          />
        </Span>

        <TextInput
          label="Start date"
          required
          type="date"
          value={draft.startDate}
          onChange={(v) => set("startDate", v)}
          error={errors.startDate}
        />
        <TextInput
          label="End date"
          type="date"
          value={draft.endDate}
          onChange={(v) => set("endDate", v)}
          hint="Optional."
          error={errors.endDate}
        />

        {/* ------------------------------------------------------- subtasks */}
        <Span>
          <Field
            label="Subtasks & acceptance scores"
            required
            error={errors.checklist}
            hint="Score is 0 to 1 and drives completion. Points are what the line costs each assignee's KRA if QC rejects it."
          >
            <div className="rounded-sm border border-line bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2">
                <SectionLabel>
                  {filledRows.length} line{filledRows.length === 1 ? "" : "s"} · {totalPoints}{" "}
                  point{totalPoints === 1 ? "" : "s"} at stake
                </SectionLabel>
                <span
                  className="rounded-sm px-2 py-0.5 text-[0.75rem] font-bold"
                  style={{ background: tone.blue.soft, color: tone.blue.text }}
                >
                  {score}%
                </span>
              </div>

              <ul className="divide-y divide-line">
                {draft.checklist.map((c, i) => (
                  <li key={c.id} className="space-y-2 p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={c.label}
                        onChange={(e) => setRow(c.id, { label: e.target.value })}
                        placeholder={`Acceptance line ${i + 1}`}
                        aria-label={`Subtask ${i + 1}`}
                        className="h-9 min-w-0 flex-1 rounded-sm border border-input-border bg-form-bg px-2.5 text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Remove line ${i + 1}`}
                        size={30}
                        onClick={() => removeRow(c.id)}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 ps-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[0.6875rem] text-muted">Score</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={c.score}
                          onChange={(e) => setRow(c.id, { score: Number(e.target.value) })}
                          aria-label={`Score for line ${i + 1}`}
                          className="w-24 accent-[rgb(var(--primary-rgb))]"
                        />
                        <span className="w-7 text-right font-mono text-[0.75rem] font-semibold text-heading">
                          {c.score.toFixed(1)}
                        </span>
                      </span>

                      <span className="flex items-center gap-1.5">
                        <span className="text-[0.6875rem] text-muted">Points</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          step={1}
                          value={c.points}
                          onChange={(e) =>
                            setRow(c.id, { points: Math.max(1, Number(e.target.value) || 1) })
                          }
                          aria-label={`Points for line ${i + 1}`}
                          className="h-8 w-16 rounded-sm border border-input-border bg-form-bg px-2 text-[0.8125rem] text-text outline-none transition-colors focus:border-primary"
                        />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-line p-2.5">
                <Button variant="ghost" icon={Plus} onClick={addRow}>
                  Add subtask
                </Button>
              </div>
            </div>
          </Field>
        </Span>

        {task && task.updatedBy.length > 0 && (
          <Span>
            <SectionLabel>History ({task.updatedBy.length})</SectionLabel>
            <ul className="space-y-1.5 rounded-sm border border-line bg-card p-3">
              {task.updatedBy.map((u) => (
                <li key={u.id} className="text-[0.75rem] leading-relaxed text-muted">
                  <span className="font-medium text-heading">{u.by}</span> · {u.at} — {u.summary}
                </li>
              ))}
            </ul>
          </Span>
        )}

        {draft.prUrl.trim() && (
          <Span>
            <p className="flex items-center gap-1.5 text-[0.75rem] text-muted">
              <GitPullRequest size={13} />
              This task will link out to the pull request above.
            </p>
          </Span>
        )}
      </FormGrid>
    </Modal>
  );
}
