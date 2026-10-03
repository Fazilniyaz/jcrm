"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Badge, Button, SectionLabel, tone } from "@/components/ui";
import { fromApiModuleSlugs, getModule } from "@/lib/modules";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import {
  useModuleAccessMatrixQuery,
  useSetModuleAccessMutation,
} from "@/lib/api/api";
import { useSession } from "@/lib/api/session";

/*
 * One person's module access, inside their row in the Employees module.
 *
 * The same grid lives in Settings; this is the per-person view of it, for when
 * you are already looking at someone and want to know why they can or cannot
 * open something. Reads the same endpoint, which only a super admin may call —
 * for everyone else the query 403s and this renders nothing at all.
 *
 * Role defaults are shown but not editable. They follow the role, so the way to
 * change one is to change the person's role; making them clickable here would
 * offer an edit the API discards.
 */

/** The three states a module can be in for one person. */
type AccessState = "off" | "view" | "edit";

const STATES: { value: AccessState; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

/**
 * A three-way segmented control.
 *
 * A radiogroup rather than two checkboxes: the states are mutually exclusive
 * and ordered, and "view + edit both ticked" is not a thing that can be true.
 */
function LevelPicker({
  value,
  onChange,
  label,
}: {
  value: AccessState;
  onChange: (next: AccessState) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`${label} access`}
      className="flex shrink-0 overflow-hidden rounded-card border border-line"
    >
      {STATES.map((state) => {
        const on = value === state.value;
        // Off is a neutral state, not a bad one, so it greys rather than reds.
        const tint =
          state.value === "off"
            ? { background: "var(--list-hover-focus-bg)", color: "var(--card-title-color)" }
            : state.value === "view"
              ? { background: tone.blue.soft, color: tone.blue.text }
              : { background: tone.sky.soft, color: tone.sky.text };
        return (
          <button
            key={state.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(state.value)}
            className={`px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${
              on ? "" : "text-muted hover:bg-hover hover:text-heading"
            }`}
            style={on ? tint : undefined}
          >
            {state.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmployeeModuleAccess({ employeeId }: { employeeId: string }) {
  const session = useSession();
  const isSuperAdmin =
    session.status === "user" &&
    (session.user.isOwner || session.user.roles.includes("superAdmin"));

  const { data } = useModuleAccessMatrixQuery(undefined, { skip: !isSuperAdmin });
  const [setModuleAccess, saveState] = useSetModuleAccessMutation();

  /*
   * The whole grid is local until Save, so a change is one round trip rather
   * than one per click — see the same note in AccountSettings.
   *
   * The draft is a full slug -> state map, not a list of extras: the three
   * states are "off", "view" and "edit", and a list cannot say "this role
   * module is reduced to view".
   */
  const [draft, setDraft] = useState<Record<string, AccessState> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const row = data?.rows.find((r) => r.id === employeeId);
  if (!data || !row) return null;

  /** What the server currently has, as the same map the draft uses. */
  const saved: Record<string, AccessState> = {};
  for (const slug of data.modules) saved[slug] = row.levels?.[slug] ?? "off";

  const current = draft ?? saved;
  const dirty = data.modules.some((slug) => current[slug] !== saved[slug]);

  const label = (apiSlug: string) => {
    const [uiSlug] = fromApiModuleSlugs([apiSlug]);
    return (uiSlug && getModule(uiSlug)?.label) ?? apiSlug;
  };

  function setLevel(slug: string, next: AccessState) {
    setMessage(null);
    setDraft((prev) => ({ ...(prev ?? saved), [slug]: next }));
  }

  async function save() {
    setMessage(null);
    // Only modules that are actually on are sent; the server drops the ones a
    // role already covers at the same level, so nothing redundant is stored.
    const modules = data!.modules
      .filter((slug) => current[slug] !== "off")
      .map((slug) => `${slug}:${current[slug]}`);
    try {
      await setModuleAccess({ userId: employeeId, modules }).unwrap();
      setDraft(null);
      setMessage("Saved.");
    } catch (err) {
      setMessage(apiErrorMessage(err, "Couldn't save those changes."));
    }
  }

  return (
    <div className="rounded-sm border border-line bg-card p-4">
      <SectionLabel>Module access</SectionLabel>

      {row.locked ? (
        <p className="mt-2 flex items-center gap-2 text-[0.75rem] leading-relaxed text-muted">
          <ShieldCheck size={13} />A super admin has every module. This cannot be
          reduced.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">
            Pick what each module gives them. <strong>View</strong> lets them
            open it and read; every change is refused. <strong>Edit</strong> is
            the full module. A padlock marks one their role already includes —
            you can still reduce it to view.
          </p>

          <div className="mt-3 space-y-1">
            {data.modules.map((slug) => {
              const isDefault = row.defaults.includes(slug);
              const value = current[slug] ?? "off";
              return (
                <div
                  key={slug}
                  className="flex items-center justify-between gap-3 rounded-card px-2 py-1.5 transition-colors hover:bg-hover"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[0.75rem] text-heading">
                    {isDefault && (
                      <Lock size={10} className="shrink-0 text-muted" aria-label="From their role" />
                    )}
                    <span className="truncate">{label(slug)}</span>
                  </span>
                  <LevelPicker
                    value={value}
                    onChange={(next) => setLevel(slug, next)}
                    label={label(slug)}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} disabled={!dirty || saveState.isLoading}>
              {saveState.isLoading ? "Saving…" : "Save access"}
            </Button>
            {dirty && !saveState.isLoading && (
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
            )}
            {message && <span className="text-[0.75rem] text-muted">{message}</span>}
          </div>
        </>
      )}

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
        <Badge t="slate">{fromApiModuleSlugs(row.effective).length}</Badge> modules
        in total, counting the ones their role already includes.
      </p>
    </div>
  );
}

export default EmployeeModuleAccess;
