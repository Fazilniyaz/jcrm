"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui";
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
import { initialsOf } from "@/lib/store/selectors";
import { PROJECT_STATUSES, ROLE_TONE, type Project, type ProjectStatus } from "@/lib/store/types";


/*
 * Create / edit a project. One modal serves both: passing a `project` switches
 * it to edit, otherwise it opens blank with the next code pre-filled.
 */

type Draft = {
  code: string;
  name: string;
  description: string;
  client: string;
  problemStatement: string;
  solution: string;
  startDate: string;
  endDate: string;
  assignedEmployees: string[];
  reportTo: string[];
  status: ProjectStatus;
};

function draftFrom(project: Project | undefined, nextCode: string): Draft {
  return {
    code: project?.code ?? nextCode,
    name: project?.name ?? "",
    description: project?.description ?? "",
    client: project?.client ?? "",
    problemStatement: project?.problemStatement ?? "",
    solution: project?.solution ?? "",
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
    assignedEmployees: project?.assignedEmployees ?? [],
    reportTo: project?.reportTo ?? [],
    status: project?.status ?? "Planning",
  };
}

export default function ProjectForm({
  open,
  project,
  onClose,
}: {
  open: boolean;
  /** Omit to create. */
  project?: Project;
  onClose: () => void;
}) {
  const { employees, clients, createProject, updateProject, suggestProjectCode } = useStore();

  // Keyed remount from the caller guarantees a fresh draft per open, so this
  // only has to seed once.
  const [draft, setDraft] = useState<Draft>(() => draftFrom(project, suggestProjectCode()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // Clear the message as soon as the field is touched; re-validated on save.
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  // The company owner is never a team member — they already reach every
  // project as super admin, and the API refuses to add them as one.
  const assignable = useMemo(
    () => employees.filter((e) => !e.isOwner && e.role !== "Super Admin"),
    [employees],
  );

  const peopleOptions: Option[] = useMemo(
    () =>
      assignable.map((e) => ({
        value: e.id,
        label: e.name,
        hint: `${e.role} · ${e.empId}`,
        initials: initialsOf(e.name),
        tone: ROLE_TONE[e.role],
      })),
    [assignable],
  );

  // Reporting lines are the oversight roles only — a developer doesn't get
  // reported into.
  const reportOptions = useMemo(
    () =>
      assignable
        .filter((e) => e.role === "Manager" || e.role === "Team Leader" || e.role === "QC")
        .map((e) => ({
          value: e.id,
          label: e.name,
          hint: `${e.role} · ${e.empId}`,
          initials: initialsOf(e.name),
          tone: ROLE_TONE[e.role],
        })),
    [assignable],
  );



  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = "Give the project a name.";
    if (!draft.code.trim()) next.code = "A project code is required.";
    if (!draft.client.trim()) next.client = "Every project belongs to a client account.";
    if (!draft.description.trim()) next.description = "Describe what the project delivers.";
    if (!draft.problemStatement.trim()) next.problemStatement = "State the problem being solved.";
    if (!draft.solution.trim()) next.solution = "Outline the proposed solution.";
    if (!draft.startDate) next.startDate = "Pick a start date.";
    if (draft.endDate && draft.startDate && draft.endDate < draft.startDate)
      next.endDate = "The end date can't fall before the start date.";
    if (draft.assignedEmployees.length === 0)
      next.assignedEmployees = "Assign at least one person.";
    if (draft.reportTo.length === 0) next.reportTo = "Choose at least one reporting line.";
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  function save() {
    if (!validate()) return;
    const payload = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      client: draft.client.trim(),
      problemStatement: draft.problemStatement.trim(),
      solution: draft.solution.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      assignedEmployees: draft.assignedEmployees,
      reportTo: draft.reportTo,
      status: draft.status,
      clientId: clients.find((c) => c.name === draft.client.trim())?.id,
      // A new project starts with an empty plan and vault; both are edited
      // from the project detail rather than crowding the create form.
      plan: project?.plan ?? [],
      secrets: project?.secrets ?? [],
    };
    if (project) updateProject(project.id, payload);
    else createProject(payload);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? `Edit ${project.code}` : "New project"}
      desc={
        project
          ? "Changes apply immediately across the workspace."
          : "Everything marked with an asterisk is needed before this can be saved."
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            {project ? "Save changes" : "Create project"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <TextInput
          label="Project name"
          required
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="Northwind Commerce Replatform"
          error={errors.name}
        />
        <TextInput
          label="Project code"
          required
          value={draft.code}
          onChange={(v) => set("code", v)}
          hint={project ? undefined : "Suggested from the highest code in use."}
          error={errors.code}
        />

        {/* An account, not free text — the link is what puts the delivery plan
            in front of that client on their Monitor page. */}
        <SelectInput<string>
          label="Client account"
          required
          value={draft.client}
          onChange={(v) => set("client", v)}
          options={[
            { value: "", label: "Choose an account…" },
            ...clients.map((c) => ({ value: c.name, label: `${c.name} · ${c.id}` })),
          ]}
          hint="Add the account in Clients first if it is not listed."
          error={errors.client}
        />
        <SelectInput<ProjectStatus>
          label="Status"
          value={draft.status}
          onChange={(v) => set("status", v)}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
        />

        <Span>
          <TextArea
            label="Description"
            required
            rows={3}
            value={draft.description}
            onChange={(v) => set("description", v)}
            placeholder="What this engagement delivers, in a sentence or two."
            error={errors.description}
          />
        </Span>

        <Span>
          <TextArea
            label="Problem statement"
            required
            rows={3}
            value={draft.problemStatement}
            onChange={(v) => set("problemStatement", v)}
            placeholder="What is broken today, and what it costs the client."
            hint="Be specific — numbers here make the solution measurable later."
            error={errors.problemStatement}
          />
        </Span>

        <Span>
          <TextArea
            label="Solution"
            required
            rows={3}
            value={draft.solution}
            onChange={(v) => set("solution", v)}
            placeholder="The approach being taken, and how it addresses the problem."
            error={errors.solution}
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
          hint="Optional — leave blank while the date is still open."
          error={errors.endDate}
        />

        <Span>
          <MultiSelect
            label="Assigned employees"
            required
            value={draft.assignedEmployees}
            onChange={(v) => set("assignedEmployees", v)}
            options={peopleOptions}
            placeholder="Choose who works on this"
            error={errors.assignedEmployees}
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
            hint="Only managers, team leaders and QC can be a reporting line."
            error={errors.reportTo}
          />
        </Span>
      </FormGrid>
    </Modal>
  );
}
