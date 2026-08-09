"use client";

import { useMemo, useState } from "react";
import { Save, Wand2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import {
  FormGrid,
  NumberInput,
  SelectInput,
  Span,
  TextInput,
} from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  ASSIGNABLE_ROLES,
  EMPLOYEE_STATUSES,
  type Employee,
  type EmployeeRole,
  type EmployeeStatus,
} from "@/lib/store/types";
import type { Tone } from "@/lib/ui/tone";

/*
 * Create / edit an employee.
 *
 * The employee ID field follows the workspace setting: on "auto" it is filled
 * from the highest number in use and locked, on "manual" it is typed. Editing
 * an existing person always leaves the ID editable — a badge number that is
 * already printed shouldn't be reassigned by a setting.
 */

const AVATAR_TONES: Tone[] = ["blue", "sky", "orange", "slate", "red"];

type Draft = {
  empId: string;
  name: string;
  email: string;
  phone: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  kraScore: number;
  createdAt: string;
  branch: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function draftFrom(employee: Employee | undefined, nextId: string): Draft {
  return {
    empId: employee?.empId ?? nextId,
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    role: employee?.role ?? "Developer",
    status: employee?.status ?? "Idle",
    // A new employee starts on a full KRA score and is marked down from there.
    kraScore: employee?.kraScore ?? 100,
    createdAt: employee?.createdAt ?? todayISO(),
    branch: employee?.branch ?? "",
  };
}

export default function EmployeeForm({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee?: Employee;
  onClose: () => void;
}) {
  const { employees, settings, createEmployee, updateEmployee, suggestEmployeeId } = useStore();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(employee, suggestEmployeeId()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  const autoId = settings.autoEmployeeId && !employee;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = "Enter the employee's name.";
    if (!draft.empId.trim()) next.empId = "An employee ID is required.";
    else if (
      employees.some(
        (e) => e.empId.toLowerCase() === draft.empId.trim().toLowerCase() && e.id !== employee?.id,
      )
    )
      next.empId = "That ID already belongs to someone else.";
    if (!draft.email.trim()) next.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
      next.email = "That doesn't look like an email address.";
    if (!draft.phone.trim()) next.phone = "Enter a contact number.";
    // No branch check: the API places a new joiner in the branch the workspace
    // is currently scoped to, so there is nothing for the form to ask.
    if (!draft.createdAt) next.createdAt = "Pick a joining date.";
    if (!Number.isFinite(draft.kraScore) || draft.kraScore < 0 || draft.kraScore > 100)
      next.kraScore = "The KRA score runs from 0 to 100.";
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  function save() {
    if (!validate()) return;
    const payload = {
      empId: draft.empId.trim(),
      name: draft.name.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      role: draft.role,
      status: draft.status,
      kraScore: draft.kraScore,
      createdAt: draft.createdAt,
      branch: draft.branch.trim(),
    };

    if (employee) {
      updateEmployee(employee.id, payload);
    } else {
      // Avatar colour is rotated rather than asked for — one less decision in
      // the form, and the directory still reads as varied.
      createEmployee({
        ...payload,
        tone: AVATAR_TONES[employees.length % AVATAR_TONES.length],
      });
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${employee.name}` : "New employee"}
      desc={
        employee
          ? "Changes apply across projects, tasks and the directory."
          : "New joiners start on a KRA score of 100."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            {employee ? "Save changes" : "Create employee"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <TextInput
          label="Full name"
          required
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="Neha Iyer"
          error={errors.name}
        />
        <TextInput
          label="Employee ID"
          required
          value={draft.empId}
          onChange={(v) => set("empId", v)}
          disabled={autoId}
          hint={
            autoId
              ? "Generated automatically — switch to manual in Settings to type your own."
              : "Must be unique across the workspace."
          }
          error={errors.empId}
        />

        <TextInput
          label="Email address"
          required
          type="email"
          value={draft.email}
          onChange={(v) => set("email", v)}
          placeholder="neha.iyer@jadvix.com"
          error={errors.email}
        />
        <TextInput
          label="Phone number"
          required
          type="tel"
          value={draft.phone}
          onChange={(v) => set("phone", v)}
          placeholder="+91 98470 11041"
          error={errors.phone}
        />

        <SelectInput<EmployeeRole>
          label="Role"
          value={draft.role}
          onChange={(v) => set("role", v)}
          // Super Admin is not offered: it belongs to the company owner and the
          // API refuses to grant it through any endpoint.
          options={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: r }))}
        />
        <SelectInput<EmployeeStatus>
          label="Status"
          value={draft.status}
          onChange={(v) => set("status", v)}
          options={EMPLOYEE_STATUSES.map((s) => ({ value: s, label: s }))}
        />

        <TextInput
          label="Joined on"
          required
          type="date"
          value={draft.createdAt}
          onChange={(v) => set("createdAt", v)}
          error={errors.createdAt}
        />

        <Span>
          <NumberInput
            label="KRA score"
            required
            value={draft.kraScore}
            onChange={(v) => set("kraScore", v)}
            min={0}
            max={100}
            suffix="/ 100"
            hint={
              employee
                ? "Adjusted at review time."
                : "Everyone starts on 100 and is marked down from there."
            }
            error={errors.kraScore}
          />
        </Span>

        {autoId && (
          <Span>
            <p className="flex items-center gap-1.5 text-[0.75rem] text-muted">
              <Wand2 size={13} />
              Auto ID is on. The next badge number in the series is{" "}
              <span className="font-mono font-semibold text-heading">{draft.empId}</span>.
            </p>
          </Span>
        )}
      </FormGrid>
    </Modal>
  );
}
