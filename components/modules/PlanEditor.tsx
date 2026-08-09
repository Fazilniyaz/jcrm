"use client";

import { useState } from "react";
import { Plus, Save, Trash2, GripVertical } from "lucide-react";
import { Button, IconButton, SectionLabel, tone } from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import { useStore } from "@/lib/store/StoreProvider";
import { orderedPlan } from "@/lib/store/selectors";
import { MILESTONE_STATUSES, type Milestone, type Project } from "@/lib/store/types";

/**
 * Edit a project's delivery plan.
 *
 * Whatever is saved here is what the client reads in Monitor, so the editor
 * says so plainly — it is the one place in the product where internal wording
 * leaks straight to an external audience.
 */

let seq = 0;
const newRow = (): Milestone => ({
  id: `ms-${Date.now()}-${seq++}`,
  label: "",
  due: "",
  status: "Planned",
});

export default function PlanEditor({
  open,
  project,
  onClose,
}: {
  open: boolean;
  project: Project;
  onClose: () => void;
}) {
  const { setProjectPlan } = useStore();
  const [rows, setRows] = useState<Milestone[]>(() =>
    project.plan.length ? orderedPlan(project) : [newRow()],
  );
  const [error, setError] = useState("");

  const set = (id: string, patch: Partial<Milestone>) =>
    setRows((r) => r.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const filled = rows.filter((m) => m.label.trim() && m.due);

  function save() {
    if (rows.some((m) => m.label.trim() && !m.due)) {
      setError("Every milestone needs a date — that is what the client sees.");
      return;
    }
    setProjectPlan(
      project.id,
      filled.map((m) => ({ ...m, label: m.label.trim(), note: m.note?.trim() || undefined })),
    );
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delivery plan — ${project.code}`}
      desc="Visible to the client on their Monitor page. Keep the wording client-facing."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            Save plan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>
            {filled.length} milestone{filled.length === 1 ? "" : "s"} · sorted by date on save
          </SectionLabel>
          {error && (
            <span role="alert" className="text-[0.75rem]" style={{ color: tone.red.text }}>
              {error}
            </span>
          )}
        </div>

        <ul className="space-y-2">
          {rows.map((m, i) => (
            <li key={m.id} className="rounded-sm border border-line bg-card p-2.5">
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="shrink-0 text-muted" aria-hidden />
                <input
                  value={m.label}
                  onChange={(e) => {
                    set(m.id, { label: e.target.value });
                    setError("");
                  }}
                  placeholder={`Milestone ${i + 1} — e.g. "Set up frontend"`}
                  aria-label={`Milestone ${i + 1} label`}
                  className="h-9 min-w-0 flex-1 rounded-sm border border-input-border bg-form-bg px-2.5 text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
                />
                <IconButton
                  icon={Trash2}
                  label={`Remove milestone ${i + 1}`}
                  size={30}
                  onClick={() => setRows((r) => r.filter((x) => x.id !== m.id))}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 ps-6">
                <label className="flex items-center gap-1.5">
                  <span className="text-[0.6875rem] text-muted">Due</span>
                  <input
                    type="date"
                    value={m.due}
                    onChange={(e) => {
                      set(m.id, { due: e.target.value });
                      setError("");
                    }}
                    aria-label={`Milestone ${i + 1} due date`}
                    className="h-8 rounded-sm border border-input-border bg-form-bg px-2 text-[0.8125rem] text-text outline-none focus:border-primary"
                  />
                </label>

                <label className="flex items-center gap-1.5">
                  <span className="text-[0.6875rem] text-muted">Status</span>
                  <select
                    value={m.status}
                    onChange={(e) =>
                      set(m.id, { status: e.target.value as Milestone["status"] })
                    }
                    aria-label={`Milestone ${i + 1} status`}
                    className="h-8 rounded-sm border border-input-border bg-form-bg px-2 text-[0.8125rem] text-text outline-none focus:border-primary"
                  >
                    {MILESTONE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                <input
                  value={m.note ?? ""}
                  onChange={(e) => set(m.id, { note: e.target.value })}
                  placeholder="Note for the client (optional)"
                  aria-label={`Milestone ${i + 1} note`}
                  className="h-8 min-w-0 flex-1 rounded-sm border border-input-border bg-form-bg px-2.5 text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
                />
              </div>
            </li>
          ))}
        </ul>

        <Button variant="ghost" icon={Plus} onClick={() => setRows((r) => [...r, newRow()])}>
          Add milestone
        </Button>
      </div>
    </Modal>
  );
}
