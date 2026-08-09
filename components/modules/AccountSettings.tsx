"use client";

import { useState } from "react";
import { Building2, Check, KeyRound, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, tone } from "@/components/ui";
import { AccordionSection } from "@/components/ui/accordion";
import { TextInput } from "@/components/ui/form";
import { fromApiModuleSlugs, getModule } from "@/lib/modules";
import WorkspacePrefs from "./WorkspacePrefs";
import {
  useChangePasswordMutation,
  useGetProfileQuery,
  useModuleAccessMatrixQuery,
  useSetModuleAccessMutation,
  useUpdateProfileMutation,
} from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { useSession } from "@/lib/api/session";

/*
 * Settings, for an account that is actually signed into the API.
 *
 * When nobody is, this renders `fallback` — the original static cards — so the
 * demo portals look and behave exactly as they did.
 *
 * Three things live here, and they are the three the brief asks for on every
 * portal: your own details, changing your own password, and (superAdmin only)
 * granting modules to other people.
 */

export default function AccountSettings({ fallback }: { fallback: React.ReactNode }) {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <Card>
        <CardBody>
          <p className="flex items-center gap-2 py-8 text-[0.875rem] text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading your account…
          </p>
        </CardBody>
      </Card>
    );
  }

  if (session.status === "master") return <MasterSettings email={session.master.email} />;
  if (session.status !== "user") return <>{fallback}</>;

  const isSuperAdmin =
    session.user.isOwner || session.user.roles.includes("superAdmin");

  /*
   * One accordion, not a grid of cards.
   *
   * Settings is four unrelated jobs on one screen and only one of them is ever
   * the reason someone opened it. Collapsed sections mean the one you came for
   * is always in reach without scrolling past the other three. Profile is open
   * by default because it is the most common errand.
   */
  return (
    <div className="space-y-3">
      <AccordionSection
        title="Profile"
        desc="How you appear to the rest of the workspace."
        icon={UserRound}
        defaultOpen
      >
        <ProfileCard />
      </AccordionSection>

      <AccordionSection
        title="Security"
        desc="Changing your password signs out your other devices."
        icon={KeyRound}
      >
        <PasswordCard />
      </AccordionSection>

      <AccordionSection
        title="Workspace"
        desc="Branch scope and how records are numbered."
        icon={Building2}
      >
        <WorkspacePrefs />
      </AccordionSection>

      {isSuperAdmin && (
        <AccordionSection
          title="Module access"
          desc="Who can open which module. Enforced by the API, not just the menu."
          icon={ShieldCheck}
        >
          <ModuleAccessCard />
        </AccordionSection>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- profile -- */

function ProfileCard() {
  const { data: profile, isLoading } = useGetProfileQuery();
  const [updateProfile, state] = useUpdateProfileMutation();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  /*
   * Seeded from the server once, then owned by the form.
   *
   * Adjusted during render rather than in an effect, and keyed on WHO the
   * profile is rather than on the object's identity. An effect on `[profile]`
   * re-ran on every refetch — and since queries now refetch on window focus,
   * that meant alt-tabbing mid-edit silently replaced what you had typed with
   * the stored values. Keyed this way a refetch of the same person changes
   * nothing, and only actually becoming someone else re-seeds.
   */
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (profile && seededFor !== profile.email) {
    setSeededFor(profile.email);
    setName(profile.name);
    setPhone(profile.phone ?? "");
  }

  if (isLoading || !profile) {
    return <p className="py-2 text-[0.875rem] text-muted">Loading…</p>;
  }

  async function save() {
    setMessage(null);
    try {
      await updateProfile({ name, phone }).unwrap();
      setMessage("Saved.");
    } catch (err) {
      setMessage(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Full name" value={name} onChange={setName} />
          <TextInput label="Phone" value={phone} onChange={setPhone} type="tel" />
        </div>

        <dl className="grid gap-x-4 gap-y-2.5 rounded-sm bg-subtle p-3 text-[0.8125rem] sm:grid-cols-2">
          {(
            [
              ["Email", profile.email],
              ["Employee ID", profile.empId],
              ["Company", profile.company.companyName],
              ["Branch", profile.branch ?? "—"],
              ["Reports to", profile.reportsTo?.name ?? "—"],
              ["KRA score", `${profile.kra} / 100`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="truncate font-medium text-heading">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.75rem] text-muted">Roles</span>
          {profile.roles.map((role) => (
            <Badge key={role} t="blue">
              {role}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={state.isLoading}>
            {state.isLoading ? "Saving…" : "Save profile"}
          </Button>
          {message && <span className="text-[0.8125rem] text-muted">{message}</span>}
        </div>
    </div>
  );
}

/* ------------------------------------------------------------ password -- */

/** The same rules the API enforces, shown live rather than after a failed post. */
const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "Upper and lower case", test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
  { label: "A symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function PasswordCard() {
  const [changePassword, state] = useChangePasswordMutation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const failing = RULES.filter((r) => !r.test(next));
  const ready =
    current.length > 0 && next.length > 0 && failing.length === 0 && next === confirm;

  async function submit() {
    setMessage(null);
    setFailed(false);
    try {
      const result = await changePassword({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      }).unwrap();
      setMessage(result.message);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setFailed(true);
      setMessage(apiErrorMessage(err, "Couldn't change your password."));
    }
  }

  return (
    <div className="space-y-4">
        <TextInput label="Current password" value={current} onChange={setCurrent} type="password" />
        <TextInput label="New password" value={next} onChange={setNext} type="password" />
        <TextInput
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          type="password"
        />

        <ul className="space-y-1.5 rounded-sm bg-subtle p-3">
          {RULES.map((rule) => {
            const passed = next.length > 0 && rule.test(next);
            return (
              <li
                key={rule.label}
                className={`flex items-center gap-2 text-[0.75rem] ${
                  passed ? "text-heading" : "text-muted"
                }`}
              >
                <Check size={13} className={passed ? "opacity-100" : "opacity-25"} />
                {rule.label}
              </li>
            );
          })}
        </ul>

        {message && (
          <p
            className="rounded-sm px-3 py-2 text-[0.8125rem]"
            style={
              failed
                ? {
                    background: "rgba(var(--brand-red-rgb),0.12)",
                    color: "rgb(var(--danger-rgb))",
                  }
                : { background: tone.sky.soft, color: tone.sky.text }
            }
          >
            {message}
          </p>
        )}

        <Button icon={KeyRound} onClick={() => void submit()} disabled={!ready || state.isLoading}>
          {state.isLoading ? "Updating…" : "Update password"}
        </Button>
    </div>
  );
}

/* ------------------------------------------------------- module access -- */

/** API slug -> the label the rest of the app shows for the same module. */
function moduleLabel(apiSlug: string): string {
  const [uiSlug] = fromApiModuleSlugs([apiSlug]);
  return (uiSlug && getModule(uiSlug)?.label) ?? apiSlug;
}

/** Grants keyed by user id — the edit buffer, before anything is sent. */
type Draft = Record<string, string[]>;

function ModuleAccessCard() {
  const { data, isLoading, isError } = useModuleAccessMatrixQuery();
  const [setModuleAccess, saveState] = useSetModuleAccessMutation();

  /*
   * Ticks are local until Save.
   *
   * Each checkbox used to PUT immediately, and that mutation invalidated the
   * matrix, the employee roster AND the session — three refetches per click,
   * with the box bound to server state so it did not visibly move until they
   * all came back. On a remote database that is the several seconds a single
   * tick was taking. Now a click is a state update, and the round trip happens
   * once, for the rows that actually changed.
   */
  const [draft, setDraft] = useState<Draft>({});
  const [message, setMessage] = useState<string | null>(null);

  // Only a superAdmin can read this endpoint; for everyone else it 403s and the
  // card simply isn't rendered.
  if (isLoading || isError || !data) return null;

  const { modules, rows } = data;

  const grantsFor = (row: (typeof rows)[number]) => draft[row.id] ?? row.granted;

  const dirtyRows = rows.filter((row) => {
    const next = draft[row.id];
    if (!next) return false;
    return next.length !== row.granted.length || next.some((s) => !row.granted.includes(s));
  });

  function toggle(row: (typeof rows)[number], slug: string) {
    // Role baselines aren't revocable here — change the role to change those.
    if (row.defaults.includes(slug)) return;
    setMessage(null);
    setDraft((current) => {
      const granted = current[row.id] ?? row.granted;
      return {
        ...current,
        [row.id]: granted.includes(slug)
          ? granted.filter((s) => s !== slug)
          : [...granted, slug],
      };
    });
  }

  async function save() {
    setMessage(null);
    try {
      // Sequential rather than parallel: each save invalidates the matrix, and
      // firing ten at once would have them racing the same refetch.
      for (const row of dirtyRows) {
        await setModuleAccess({ userId: row.id, modules: draft[row.id] ?? [] }).unwrap();
      }
      setDraft({});
      setMessage(
        dirtyRows.length === 1
          ? "Access updated. They will see it the next time their session refreshes."
          : `Access updated for ${dirtyRows.length} people.`,
      );
    } catch (err) {
      setMessage(apiErrorMessage(err, "Couldn't save those changes."));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.75rem] leading-relaxed text-muted">
        Grant extra modules on top of what a role already includes. Role defaults
        are locked on — change the person&rsquo;s role to change those.
      </p>

      <div className="w-full overflow-x-auto rounded-sm border border-line">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-[var(--custom-white)] px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-muted sm:px-5">
                Person
              </th>
              {modules.map((slug) => (
                <th
                  key={slug}
                  className="px-2 py-3 text-center text-[0.625rem] font-semibold text-muted"
                >
                  <span className="block max-w-[5rem] truncate" title={moduleLabel(slug)}>
                    {moduleLabel(slug)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const granted = grantsFor(row);
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-[var(--custom-white)] px-4 py-2.5 sm:px-5">
                    <span className="flex items-center gap-2">
                      <UserRound size={14} className="text-muted" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-heading">{row.name}</span>
                        <span className="block truncate text-[0.6875rem] text-muted">
                          {row.empId} · {row.roles.join(", ")}
                        </span>
                      </span>
                    </span>
                  </td>
                  {modules.map((slug) => {
                    const isDefault = row.defaults.includes(slug);
                    const on = isDefault || granted.includes(slug);
                    return (
                      <td key={slug} className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={row.locked || isDefault}
                          aria-label={`${moduleLabel(slug)} for ${row.name}`}
                          onChange={() => toggle(row, slug)}
                          className="h-4 w-4 accent-[rgb(var(--primary-rgb))] disabled:opacity-40"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void save()}
          disabled={dirtyRows.length === 0 || saveState.isLoading}
        >
          {saveState.isLoading
            ? "Saving…"
            : dirtyRows.length > 0
              ? `Save ${dirtyRows.length} change${dirtyRows.length === 1 ? "" : "s"}`
              : "Save changes"}
        </Button>
        {dirtyRows.length > 0 && !saveState.isLoading && (
          <Button variant="ghost" onClick={() => setDraft({})}>
            Discard
          </Button>
        )}
        {message && <span className="text-[0.8125rem] text-muted">{message}</span>}
      </div>

      <p className="flex items-center gap-2 text-[0.75rem] text-muted">
        <ShieldCheck size={13} />A super admin always has every module, so their
        row is read-only.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- master -- */

function MasterSettings({ email }: { email: string }) {
  return (
    <Card>
      <CardHeader title="Master account" desc="The platform owner's credentials." />
      <CardBody className="space-y-3">
        <dl className="space-y-2 rounded-sm bg-subtle p-3 text-[0.8125rem]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Email</dt>
            <dd className="font-medium text-heading">{email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Modules</dt>
            <dd className="font-medium text-heading">Dashboard, Companies, Settings</dd>
          </div>
        </dl>
        <p className="text-[0.75rem] leading-relaxed text-muted">
          The master password is not stored in the database — only its argon2
          hash, in the API&rsquo;s <code>MASTER_PASSWORD_HASH</code> environment
          variable. To change it, run <code>npm run hash-master</code> in
          jadvix-backend and replace the value in <code>.env</code>.
        </p>
      </CardBody>
    </Card>
  );
}
