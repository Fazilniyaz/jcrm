"use client";

import { useActionState, useMemo, useState } from "react";
import { Lock, Save, Check, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui";
import { saveModuleAccess, type AccessState } from "@/lib/actions";
import type { ModuleSlug } from "@/lib/modules";
import type { PortalSlug } from "@/lib/portals";

export type AccessRow = {
  slug: ModuleSlug;
  label: string;
  group: string;
  mandatory: boolean;
};

export type AccessCol = {
  slug: PortalSlug;
  name: string;
  tag: string;
  /** Portals whose access can't be reduced (the super admin). */
  locked: boolean;
};

export default function ModuleAccess({
  rows,
  cols,
  granted,
}: {
  rows: AccessRow[];
  cols: AccessCol[];
  /** "<portal>:<module>" keys that are currently switched on. */
  granted: string[];
}) {
  const [state, action, pending] = useActionState<AccessState, FormData>(saveModuleAccess, {});
  const [on, setOn] = useState<Set<string>>(new Set(granted));

  const savedSet = useMemo(() => new Set(granted), [granted]);

  // Derived rather than a flag: after a save the action revalidates, `granted`
  // arrives updated, and this falls back to false on its own.
  const dirty =
    on.size !== savedSet.size || [...on].some((k) => !savedSet.has(k));

  const key = (p: string, m: string) => `${p}:${m}`;

  const toggle = (p: string, m: string) => {
    setOn((prev) => {
      const next = new Set(prev);
      const k = key(p, m);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const reset = () => setOn(new Set(granted));

  const countFor = (p: AccessCol) =>
    rows.filter((r) => r.mandatory || p.locked || on.has(key(p.slug, r.slug))).length;

  return (
    <Card>
      <CardHeader
        title="Module Access"
        desc="Choose which modules each portal can open. Mandatory modules are always on."
        action={
          <span className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-sm border border-line px-3 py-2 text-[0.8125rem] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            )}
            <Badge t={dirty ? "orange" : "sky"}>
              {dirty ? "Unsaved changes" : "Saved"}
            </Badge>
          </span>
        }
      />

      <form action={action}>
        {/* The matrix is wide by nature — scroll it rather than the page. */}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-muted sm:px-5">
                  Module
                </th>
                {cols.map((c) => (
                  <th key={c.slug} className="px-2 py-3 text-center align-bottom">
                    <span className="block text-[0.75rem] font-semibold text-heading">{c.tag}</span>
                    <span className="mt-0.5 block text-[0.625rem] font-normal text-muted">
                      {countFor(c)} / {rows.length}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-b border-line last:border-0 hover:bg-hover">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2.5 sm:px-5">
                    <span className="block font-medium text-heading">{r.label}</span>
                    <span className="text-[0.6875rem] text-muted">
                      {r.mandatory ? "Mandatory" : r.group}
                    </span>
                  </td>

                  {cols.map((c) => {
                    // Mandatory rows and the super-admin column are fixed on.
                    const fixed = r.mandatory || c.locked;
                    const checked = fixed || on.has(key(c.slug, r.slug));
                    return (
                      <td key={c.slug} className="px-2 py-2.5 text-center">
                        {fixed ? (
                          <span
                            title={
                              r.mandatory
                                ? "Mandatory for every portal"
                                : `${c.name} always has full access`
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted"
                            style={{ background: "var(--custom-bg-color)" }}
                          >
                            <Lock size={13} />
                          </span>
                        ) : (
                          <label className="inline-flex cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              name="grant"
                              value={key(c.slug, r.slug)}
                              checked={checked}
                              onChange={() => toggle(c.slug, r.slug)}
                              className="peer sr-only"
                            />
                            <span
                              aria-hidden
                              className={`flex h-7 w-7 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${
                                checked
                                  ? "border-primary bg-primary text-white"
                                  : "border-line text-transparent hover:border-primary"
                              }`}
                            >
                              <Check size={14} />
                            </span>
                            <span className="sr-only">
                              {r.label} for {c.name}
                            </span>
                          </label>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fixed cells are disabled inputs visually, so post them explicitly. */}
        {cols.map((c) =>
          rows
            .filter((r) => !r.mandatory && c.locked)
            .map((r) => (
              <input
                key={`${c.slug}-${r.slug}`}
                type="hidden"
                name="grant"
                value={key(c.slug, r.slug)}
              />
            )),
        )}

        <CardBody className="flex flex-wrap items-center gap-3 border-t border-line">
          <button
            type="submit"
            disabled={pending || !dirty}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-[0.8125rem] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {pending ? "Saving…" : "Save access"}
          </button>

          {state.ok && !dirty && (
            <span
              className="inline-flex items-center gap-1.5 text-[0.8125rem]"
              style={{ color: "rgb(var(--primary-rgb))" }}
            >
              <Check size={15} />
              Access updated — the sidebar reflects it immediately.
            </span>
          )}
          {state.error && (
            <span
              role="alert"
              className="inline-flex items-center gap-1.5 text-[0.8125rem]"
              style={{ color: "rgb(var(--danger-rgb))" }}
            >
              <AlertCircle size={15} />
              {state.error}
            </span>
          )}

          <span className="ms-auto text-[0.6875rem] text-muted">
            Stored in a cookie for this demo — per browser, not per account.
          </span>
        </CardBody>
      </form>
    </Card>
  );
}
