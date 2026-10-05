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
  TextInput,
  type Option,
} from "@/components/ui/form";
import { hasRichText } from "@/components/ui/RichText";
import { RichTextEditor } from "@/components/ui/RichTextEditorLazy";
import { useStore } from "@/lib/store/StoreProvider";
import { useListTeamsQuery } from "@/lib/api/api";
import { useSession } from "@/lib/api/session";
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
  assignedTeams: string[];
  reportTo: string[];
  status: ProjectStatus;
  /** "default" follows the workspace setting; the other two override it. */
  acceptance: "default" | "required" | "direct";
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
    assignedTeams: project?.assignedTeams ?? [],
    reportTo: project?.reportTo ?? [],
    status: project?.status ?? "Planning",
    acceptance:
      project?.requireAcceptance == null
        ? "default"
        : project.requireAcceptance
          ? "required"
          : "direct",
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

  const session = useSession();
  const isSuperAdmin =
    session.status === "user" &&
    (session.user.isOwner || session.user.roles.includes("superAdmin"));

  // Skipped on the demo portals, where there is no API to ask.
  const { data: teams = [] } = useListTeamsQuery(undefined, {
    skip: session.status !== "user",
  });

  const teamOptions: Option[] = useMemo(
    () =>
      teams.map((t) => ({
        value: t.id,
        label: t.name,
        hint: `${t.memberIds.length} ${t.memberIds.length === 1 ? "person" : "people"}`,
        initials: t.name.slice(0, 2).toUpperCase(),
        tone: (t.tone in ROLE_TONE ? ROLE_TONE.Developer : "blue") as Option["tone"],
      })),
    [teams],
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
    // `hasRichText`, not `.trim()`: an editor that has been typed into and then
    // cleared holds "<p></p>", which is a non-empty string and no words at all.
    if (!hasRichText(draft.description)) next.description = "Describe what the project delivers.";
    if (!hasRichText(draft.problemStatement))
      next.problemStatement = "State the problem being solved.";
    if (!hasRichText(draft.solution)) next.solution = "Outline the proposed solution.";
    if (!draft.startDate) next.startDate = "Pick a start date.";
    if (draft.endDate && draft.startDate && draft.endDate < draft.startDate)
      next.endDate = "The end date can't fall before the start date.";
    /*
     * Staffing is deliberately NOT required.
     *
     * A project is routinely created before anyone is free to work on it — the
     * client has signed, the dates are known, the team is not. Forcing a name
     * into these two fields at create time only produces a wrong one that
     * someone has to remember to correct. Both can be filled in by editing the
     * project the moment the answer is real.
     */
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  function save() {
    if (!validate()) return;
    const payload = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      // Already HTML; the server sanitises it and collapses an empty document.
      description: draft.description,
      client: draft.client.trim(),
      problemStatement: draft.problemStatement.trim(),
      solution: draft.solution.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      assignedEmployees: draft.assignedEmployees,
      assignedTeams: draft.assignedTeams,
      // "default" means store nothing and let the workspace setting decide.
      requireAcceptance:
        draft.acceptance === "default" ? null : draft.acceptance === "required",
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
          <RichTextEditor
            label="Description"
            required
            rows={4}
            value={draft.description}
            onChange={(v) => set("description", v)}
            placeholder="What this engagement delivers, in a sentence or two."
            error={errors.description}
          />
        </Span>

        <Span>
          <RichTextEditor
            label="Problem statement"
            required
            rows={4}
            value={draft.problemStatement}
            onChange={(v) => set("problemStatement", v)}
            placeholder="What is broken today, and what it costs the client."
            hint="Be specific — numbers here make the solution measurable later."
            error={errors.problemStatement}
          />
        </Span>

        <Span>
          <RichTextEditor
            label="Solution"
            required
            rows={4}
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
            value={draft.assignedEmployees}
            onChange={(v) => set("assignedEmployees", v)}
            options={peopleOptions}
            placeholder="Choose who works on this"
            hint="Optional — you can staff the project later by editing it."
            error={errors.assignedEmployees}
          />
        </Span>

        <Span>
          <MultiSelect
            label="Assigned team"
            value={draft.assignedTeams}
            onChange={(v) => set("assignedTeams", v)}
            options={teamOptions}
            placeholder="Put a whole team on this"
            hint="Optional. Everyone on the team is added as a member — picking people above as well is fine, nobody is added twice."
            emptyText="No teams yet — create one in the Teams module"
          />
        </Span>

        {/*
          Who may change this: a super admin only. The API refuses it from
          anyone else, so offering the control would be offering a 403.
        */}
        {isSuperAdmin && (
          <Span>
            <SelectInput
              label="Joining this project"
              value={draft.acceptance}
              onChange={(v) => set("acceptance", v as Draft["acceptance"])}
              options={[
                { value: "default", label: "Follow the workspace setting" },
                { value: "required", label: "Needs the person to accept it" },
                { value: "direct", label: "Add them straight away, no acceptance" },
              ]}
              hint="Acceptance puts an invitation in their Requests module. Without it they are placed on the project immediately and simply told."
            />
          </Span>
        )}

        <Span>
          <MultiSelect
            label="Reports to"
            value={draft.reportTo}
            onChange={(v) => set("reportTo", v)}
            options={reportOptions}
            placeholder="Managers, team leaders and QC"
            hint="Optional — only managers, team leaders and QC can be a reporting line."
            error={errors.reportTo}
          />
        </Span>
      </FormGrid>
    </Modal>
  );
}
