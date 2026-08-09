"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Building2, X } from "lucide-react";
import { tone } from "@/components/ui";
import { useStore } from "@/lib/store/StoreProvider";
import { canSetDefaultBranch } from "@/lib/store/selectors";
import { useSession } from "@/lib/api/session";
import { EMPLOYEE_STATUSES, EMPLOYEE_STATUS_TONE, type EmployeeStatus } from "@/lib/store/types";

/*
 * The header's availability control.
 *
 * Shown for the people whose availability others actually schedule around —
 * developers, QC and sales. Managers and the admin portals do not get one:
 * their status is not what anyone is waiting on, and a control that changes
 * nothing is worse than no control.
 */

const ROLES_WITH_STATUS = ["Developer", "QC", "Sales"];

const HINT: Record<EmployeeStatus, string> = {
  Idle: "Free and looking for work",
  "Work Assigned": "Heads down on something",
  Break: "Stepped away, back shortly",
  Leave: "Off today — greyed out for everyone else",
};

export function StatusControl() {
  const { hydrated, currentEmployee, setEmployeeStatus } = useStore();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hydrated || !currentEmployee || !ROLES_WITH_STATUS.includes(currentEmployee.role)) {
    return null;
  }

  const status = currentEmployee.status;
  const t = tone[EMPLOYEE_STATUS_TONE[status]];

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`You are ${status}`}
        className="flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[0.75rem] font-semibold transition-[filter] hover:brightness-105"
        style={{ background: t.soft, color: t.text }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.solid }} />
        <span className="hidden max-w-[7rem] truncate sm:inline">{status}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-card border border-line bg-card shadow-pop"
        >
          <p className="border-b border-line px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
            Set your status
          </p>
          <ul className="py-1">
            {EMPLOYEE_STATUSES.map((s) => {
              const st = tone[EMPLOYEE_STATUS_TONE[s]];
              return (
                <li key={s}>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setEmployeeStatus(currentEmployee.id, s);
                      setOpen(false);
                    }}
                    aria-current={s === status}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: st.solid }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[0.8125rem] text-heading ${
                          s === status ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {s}
                      </span>
                      <span className="block text-[0.6875rem] leading-snug text-muted">
                        {HINT[s]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Says which branch the numbers describe.
 *
 * Only for the people who can change it. An admin who pinned London last week
 * comes back to a dashboard showing two of fourteen employees and needs to be
 * told it is a filter rather than a bug — but an employee has no second branch
 * to compare against, cannot unpin it, and does not need to know how many other
 * offices exist. To them the scope is simply the workspace.
 */
export function BranchBanner() {
  const { hydrated, settings, setDefaultBranch, currentPortal } = useStore();
  const session = useSession();

  const isAdmin =
    session.status === "user"
      ? session.user.roles.includes("superAdmin") || session.user.isOwner
      : // No API session — this is a demo portal, where the old rule applies.
        canSetDefaultBranch(currentPortal);

  if (!hydrated || !settings.defaultBranch || !isAdmin) return null;

  const canClear = isAdmin;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-sm px-3 py-2 text-[0.75rem]"
      style={{ background: tone.orange.soft, color: tone.orange.text }}
    >
      <Building2 size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        Scoped to <strong>{settings.defaultBranch}</strong> — every count on this page describes
        that branch only.
      </span>
      {canClear && (
        <button
          type="button"
          onClick={() => setDefaultBranch(null)}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 font-semibold transition-colors hover:bg-black/5"
        >
          <X size={12} />
          Show all branches
        </button>
      )}
    </div>
  );
}
