"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Bug as BugIcon,
  CircleAlert,
  CheckCircle2,
  Timer,
  Plus,
  ChevronRight,
  ArrowRight,
  Save,
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
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  tone,
} from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import {
  FormGrid,
  MultiSelect,
  SelectInput,
  Span,
  TextArea,
  TextInput,
  type Option,
} from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  bugTasks,
  employeesByIds,
  formatDate,
  initialsOf,
  nextTaskCode,
  projectsByIds,
  scopedTasks,
  taskScore,
} from "@/lib/store/selectors";
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_TONE,
  ROLE_TONE,
  TASK_STATUS_TONE,
  type BugSeverity,
  type Task,
} from "@/lib/store/types";

/*
 * Proposed Bugs.
 *
 * A defect is not a parallel record — it is a task with an `origin`. Raising
 * one here creates it in Task Management, marked as raised by QC, so it picks
 * up an assignee, subtasks and a QC pass like any other work rather than
 * sitting in a list nobody schedules.
 */

export function ProposedBugs() {
  const { hydrated, state } = useStore();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<BugSeverity | "All">("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const bugs = useMemo(() => bugTasks(scopedTasks(state)), [state]);

  const counts = useMemo(
    () => ({
      total: bugs.length,
      open: bugs.filter((b) => b.status !== "Done").length,
      critical: bugs.filter((b) => b.origin?.severity === "Critical" && b.status !== "Done").length,
      fixed: bugs.filter((b) => b.status === "Done").length,
      bySeverity: Object.fromEntries(
        BUG_SEVERITIES.map((s) => [s, bugs.filter((b) => b.origin?.severity === s).length]),
      ) as Record<BugSeverity, number>,
    }),
    [bugs],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bugs
      .filter((b) => {
        if (severity !== "All" && b.origin?.severity !== severity) return false;
        if (!q) return true;
        return `${b.title} ${b.taskId} ${b.description} ${b.origin?.raisedBy ?? ""}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.priority - b.priority || a.taskId.localeCompare(b.taskId));
  }, [bugs, query, severity]);

  if (!hydrated) return <ModuleSkeleton />;

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Open Defects"
          value={String(counts.open)}
          hint={`${counts.total} raised in total`}
          t="orange"
          icon={BugIcon}
        />
        <StatTile
          label="Critical"
          value={String(counts.critical)}
          hint="Blocking a release"
          t="red"
          icon={CircleAlert}
        />
        <StatTile
          label="Fixed"
          value={String(counts.fixed)}
          hint="Closed and scored"
          t="sky"
          icon={CheckCircle2}
        />
        <StatTile
          label="In Review"
          value={String(bugs.filter((b) => b.status === "In Review").length)}
          hint="With QC for sign-off"
          t="blue"
          icon={Timer}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Proposed Bugs"
          desc="Every defect here is a task. Raising one puts it straight on the board."
          action={
            <Toolbar>
              <SearchBox
                placeholder="Search defects…"
                value={query}
                onChange={setQuery}
                className="sm:w-52"
              />
              <Button icon={Plus} onClick={() => setFormOpen(true)}>
                Raise Bug
              </Button>
            </Toolbar>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Chip active={severity === "All"} onClick={() => setSeverity("All")} count={counts.total}>
            All
          </Chip>
          {BUG_SEVERITIES.map((s) => (
            <Chip
              key={s}
              active={severity === s}
              onClick={() => setSeverity(s)}
              count={counts.bySeverity[s]}
            >
              {s}
            </Chip>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={BugIcon}
            title={bugs.length === 0 ? "No defects raised" : "Nothing matches those filters"}
            desc={
              bugs.length === 0
                ? "Raising a bug creates a task on the board, tagged as found by QC."
                : "Try a different search term or severity."
            }
            action={
              bugs.length === 0 ? (
                <Button icon={Plus} onClick={() => setFormOpen(true)}>
                  Raise Bug
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Defect</Th>
                <Th>Project</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th className="w-32">Fix progress</Th>
                <Th>Assigned</Th>
                <Th>Raised by</Th>
                <Th>Raised</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((bug) => {
                const expanded = openId === bug.id;
                const people = employeesByIds(state, bug.assignedTo);
                const projects = projectsByIds(state, bug.projectIds);
                const sev = bug.origin?.severity ?? "Minor";

                return (
                  <Fragment key={bug.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : bug.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${bug.title}` : `Expand ${bug.title}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <span className="min-w-0">
                            <span className="block font-medium text-heading">{bug.title}</span>
                            <span className="font-mono text-[0.6875rem] text-muted">
                              {bug.taskId}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {projects.map((p) => p.code).join(", ") || "—"}
                      </Td>
                      <Td>
                        <Badge t={BUG_SEVERITY_TONE[sev]}>{sev}</Badge>
                      </Td>
                      <Td>
                        <Badge t={TASK_STATUS_TONE[bug.status]}>{bug.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Progress value={taskScore(bug)} t={TASK_STATUS_TONE[bug.status]} />
                          <span className="w-9 shrink-0 text-right text-[0.75rem] font-semibold text-heading">
                            {taskScore(bug)}%
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
                      <Td className="whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.6875rem] font-semibold"
                          style={{ background: tone.orange.soft, color: tone.orange.text }}
                        >
                          <BugIcon size={11} />
                          QC · {bug.origin?.raisedBy ?? "—"}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(bug.createdAt)}</Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <BugDetail bug={bug} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {formOpen && <RaiseBugForm open={formOpen} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- detail -- */

function BugDetail({ bug }: { bug: Task }) {
  const { state } = useStore();
  const people = employeesByIds(state, bug.assignedTo);
  const projects = projectsByIds(state, bug.projectIds);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-7">
        <div>
          <SectionLabel>What happens</SectionLabel>
          <p className="text-[0.8125rem] leading-relaxed text-text">{bug.description}</p>
        </div>

        <div className="rounded-sm border border-line bg-card">
          <div className="border-b border-line px-3 py-2.5">
            <SectionLabel>Fix subtasks</SectionLabel>
          </div>
          <ul className="divide-y divide-line">
            {bug.checklist.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-2.5">
                <span className="min-w-0 flex-1 text-[0.8125rem] text-text">{c.label}</span>
                <span className="shrink-0 font-mono text-[0.75rem] font-semibold text-heading">
                  {c.score.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
           style={{ background: tone.blue.soft, color: tone.blue.text }}>
          <ArrowRight size={14} className="shrink-0" />
          This defect is task <strong>{bug.taskId}</strong> — schedule, assign and score it from
          Task Management like any other work.
        </p>
      </div>

      <div className="space-y-4 xl:col-span-5">
        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <Row label="Raised by" value={bug.origin?.raisedBy ?? "—"} />
          <Row label="Found in" value={bug.origin?.foundIn ?? "—"} />
          <Row label="Severity" value={bug.origin?.severity ?? "—"} />
          <Row label="Project" value={projects.map((p) => p.name).join(", ") || "—"} />
          <Row label="Raised" value={formatDate(bug.createdAt)} />
          <Row label="Target" value={formatDate(bug.endDate)} />
        </dl>

        <div>
          <SectionLabel>Assigned to ({people.length})</SectionLabel>
          {people.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Nobody assigned yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {people.map((e) => (
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
      </div>
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

/* ------------------------------------------------------------ raise form -- */

/**
 * Raising a bug writes a task.
 *
 * The fields are the defect's, but what comes out the other side is an
 * ordinary task with subtasks built from the fix steps, so it can be
 * scheduled and scored without anyone re-typing it.
 */
function RaiseBugForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, employees, projects, createTask, currentUser } = useStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("Major");
  const [foundIn, setFoundIn] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [reportTo, setReportTo] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const reportOptions = useMemo(
    () => peopleOptions.filter((o) => /Manager|Team Leader|QC/.test(o.hint ?? "")),
    [peopleOptions],
  );

  const projectOptions: Option[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name, hint: p.code })),
    [projects],
  );

  // Critical defects jump the queue; minor ones queue behind planned work.
  const priorityFor = (s: BugSeverity) => (s === "Critical" ? 1 : s === "Major" ? 2 : 4);

  function save() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Summarise the defect in one line.";
    if (!description.trim()) next.description = "Describe what happens, and how to see it.";
    if (projectIds.length === 0) next.projectIds = "Which project is this in?";
    if (reportTo.length === 0) next.reportTo = "Choose at least one reporting line.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const today = new Date().toISOString().slice(0, 10);
    createTask({
      taskId: nextTaskCode(state.tasks),
      title: title.trim(),
      description: description.trim(),
      status: "New",
      priority: priorityFor(severity),
      projectIds,
      assignedTo,
      reportTo,
      startDate: today,
      checklist: [
        { id: "c1", label: "Reproduced on a clean build", score: 0, points: 1 },
        { id: "c2", label: "Root cause fixed", score: 0, points: severity === "Critical" ? 3 : 2 },
        { id: "c3", label: "Regression case added", score: 0, points: 2 },
      ],
      origin: {
        kind: "qc-bug",
        severity,
        raisedBy: currentUser,
        foundIn: foundIn.trim() || undefined,
      },
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a bug"
      desc="This creates a task on the board, tagged as found by QC."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            Raise and create task
          </Button>
        </>
      }
    >
      <FormGrid>
        <Span>
          <TextInput
            label="Summary"
            required
            value={title}
            onChange={setTitle}
            placeholder="Cart total ignores multi-currency rounding"
            error={errors.title}
          />
        </Span>

        <SelectInput<BugSeverity>
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={BUG_SEVERITIES.map((s) => ({ value: s, label: s }))}
          hint={`Sets the task's priority — P${priorityFor(severity)}.`}
        />
        <TextInput
          label="Found in"
          value={foundIn}
          onChange={setFoundIn}
          placeholder="Staging build 218, Chrome 141"
          hint="Optional — build, browser or device."
        />

        <Span>
          <TextArea
            label="What happens"
            required
            rows={3}
            value={description}
            onChange={setDescription}
            placeholder="What you did, what you expected, what happened instead."
            error={errors.description}
          />
        </Span>

        <Span>
          <MultiSelect
            label="Project"
            required
            value={projectIds}
            onChange={setProjectIds}
            options={projectOptions}
            placeholder="Where the defect is"
            error={errors.projectIds}
          />
        </Span>

        <Span>
          <MultiSelect
            label="Assign to"
            value={assignedTo}
            onChange={setAssignedTo}
            options={peopleOptions}
            placeholder="Leave empty to triage later"
            hint="Optional — unassigned defects land in the New column."
          />
        </Span>

        <Span>
          <MultiSelect
            label="Reports to"
            required
            value={reportTo}
            onChange={setReportTo}
            options={reportOptions}
            placeholder="Managers, team leaders and QC"
            error={errors.reportTo}
          />
        </Span>

        <Span>
          <p
            className="flex items-start gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
            style={{ background: tone.blue.soft, color: tone.blue.text }}
          >
            <BugIcon size={14} className="mt-px shrink-0" />
            Three fix subtasks are added automatically — reproduce, fix, add a regression
            case. Adjust it from the task once it is created.
          </p>
        </Span>
      </FormGrid>
    </Modal>
  );
}
