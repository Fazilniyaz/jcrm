"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Badge, Button, SectionLabel } from "@/components/ui";
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

export function EmployeeModuleAccess({ employeeId }: { employeeId: string }) {
  const session = useSession();
  const isSuperAdmin =
    session.status === "user" &&
    (session.user.isOwner || session.user.roles.includes("superAdmin"));

  const { data } = useModuleAccessMatrixQuery(undefined, { skip: !isSuperAdmin });
  const [setModuleAccess, saveState] = useSetModuleAccessMutation();

  // Ticks are local until Save, so a change is one round trip rather than one
  // per checkbox — see the same note in AccountSettings.
  const [draft, setDraft] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const row = data?.rows.find((r) => r.id === employeeId);
  if (!data || !row) return null;

  const granted = draft ?? row.granted;
  const dirty =
    draft !== null &&
    (draft.length !== row.granted.length || draft.some((s) => !row.granted.includes(s)));

  const label = (apiSlug: string) => {
    const [uiSlug] = fromApiModuleSlugs([apiSlug]);
    return (uiSlug && getModule(uiSlug)?.label) ?? apiSlug;
  };

  function toggle(slug: string) {
    if (row!.defaults.includes(slug)) return;
    setMessage(null);
    setDraft((current) => {
      const next = current ?? row!.granted;
      return next.includes(slug) ? next.filter((s) => s !== slug) : [...next, slug];
    });
  }

  async function save() {
    setMessage(null);
    try {
      await setModuleAccess({ userId: employeeId, modules: draft ?? [] }).unwrap();
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
            Locked entries come with their role. Tick the rest to grant them on
            top, then save.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.modules.map((slug) => {
              const isDefault = row.defaults.includes(slug);
              const on = isDefault || granted.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggle(slug)}
                  disabled={isDefault}
                  aria-pressed={on}
                  title={isDefault ? `${label(slug)} — included in their role` : label(slug)}
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[0.6875rem] transition-colors ${
                    on
                      ? "border-primary/40 bg-primary/10 font-medium text-heading"
                      : "border-line text-muted hover:border-primary/40 hover:text-heading"
                  } ${isDefault ? "cursor-default opacity-70" : ""}`}
                >
                  {isDefault && <Lock size={10} />}
                  {label(slug)}
                </button>
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
