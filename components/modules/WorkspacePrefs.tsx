"use client";

import { useState } from "react";
import { Hash, RotateCcw, Database } from "lucide-react";
import { Button, Skeleton, tone } from "@/components/ui";
import { SwitchField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useStore } from "@/lib/store/StoreProvider";

/*
 * The parts of Settings that actually drive behaviour. Everything else on the
 * Settings page is still a static demo form; these two write to the store.
 */
export default function WorkspacePrefs() {
  const { hydrated, settings, setSettings, resetDemoData, suggestEmployeeId, employees, projects, tasks } =
    useStore();
  const [confirmReset, setConfirmReset] = useState(false);

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-line p-3">
        <SwitchField
          label="Generate employee IDs automatically"
          desc={
            settings.autoEmployeeId
              ? "New joiners get the next number in the series and the field is locked."
              : "You type the badge number yourself when adding someone."
          }
          checked={settings.autoEmployeeId}
          onChange={(v) => setSettings({ autoEmployeeId: v })}
        />
        {settings.autoEmployeeId && (
          <p className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2.5 text-[0.75rem] text-muted">
            <Hash size={13} />
            Next ID in the series:
            <span className="font-mono font-semibold text-heading">{suggestEmployeeId()}</span>
          </p>
        )}
      </div>

      <div className="rounded-sm bg-subtle p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-heading">
              <Database size={14} />
              Workspace data
            </p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">
              {employees.length} employees · {projects.length} projects · {tasks.length} tasks, held
              in this browser only.
            </p>
          </div>
          <Button variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
            Reset demo data
          </Button>
        </div>
        <p className="mt-2.5 text-[0.6875rem]" style={{ color: tone.orange.text }}>
          Projects, tasks and employees are stored in this browser&rsquo;s local storage. Clearing
          site data or opening another browser starts from the seed again.
        </p>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetDemoData}
        title="Reset demo data"
        message="Every project, task and employee you have added or edited will be discarded and the original demo set restored."
        confirmLabel="Reset everything"
      />
    </div>
  );
}
