import { ShieldCheck, Palette } from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Avatar,
  Button,
  tone,
} from "@/components/ui";
import WorkspacePrefs from "./WorkspacePrefs";
import AccountSettings from "./AccountSettings";

/* =============================================================== settings == */

function Field({
  label,
  value,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.8125rem] font-medium text-heading">{label}</label>
      <input
        type={type}
        defaultValue={value}
        className="h-10 w-full rounded-sm border border-input-border bg-form-bg px-3 text-[0.8125rem] text-text outline-none transition-colors focus:border-primary"
      />
      {hint && <p className="mt-1 text-[0.6875rem] text-muted">{hint}</p>}
    </div>
  );
}

function Toggle({ label, desc, on = false }: { label: string; desc: string; on?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium text-heading">{label}</p>
        <p className="mt-0.5 text-[0.75rem] text-muted">{desc}</p>
      </div>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? "bg-primary" : "bg-light"
        }`}
        role="switch"
        aria-checked={on}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
            on ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
    </div>
  );
}

export function Settings({
  user,
  role,
  accessEditor,
}: {
  user: string;
  role: string;
  /** Rendered above the profile cards for portals that can manage access. */
  accessEditor?: React.ReactNode;
}) {
  /*
   * The static cards below are the original demo settings. AccountSettings
   * shows the real profile, password and module-access panels when someone is
   * signed into the API, and falls back to these when nobody is — so the demo
   * portals keep the screen they always had.
   */
  const staticCards = (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-7 xl:space-y-4">
        <Card>
          <CardHeader title="Profile" desc="How you appear to the rest of the workspace." />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar
                initials={user
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
                t="blue"
                size={56}
              />
              <div>
                <Button variant="ghost">Change photo</Button>
                <p className="mt-1.5 text-[0.6875rem] text-muted">PNG or JPG, up to 2 MB.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={user} />
              <Field label="Job title" value={role} />
              <Field label="Email" value="you@jadvix.com" type="email" />
              <Field label="Phone" value="+44 20 7946 0812" />
            </div>
          </CardBody>
        </Card>

        <Card className="mt-4 xl:mt-0">
          <CardHeader title="Notifications" desc="Choose what reaches your inbox." />
          <CardBody className="py-1">
            <Toggle label="Task assignments" desc="When something is assigned to you." on />
            <Toggle label="Leave decisions" desc="Approvals and rejections on your requests." on />
            <Toggle label="Invoice activity" desc="When an invoice is raised or settled." />
            <Toggle label="Weekly digest" desc="A Monday summary of the week ahead." on />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 space-y-4 xl:col-span-5 xl:mt-0">
        <Card>
          <CardHeader title="Security" desc="Protect your account." />
          <CardBody className="space-y-4">
            <Field label="Current password" value="" type="password" />
            <Field
              label="New password"
              value=""
              type="password"
              hint="At least 12 characters, with a number and a symbol."
            />
            <div className="flex items-center justify-between rounded-sm bg-subtle p-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={17} style={{ color: tone.sky.text }} />
                <div>
                  <p className="text-[0.8125rem] font-medium text-heading">Two-factor auth</p>
                  <p className="text-[0.6875rem] text-muted">Enabled via authenticator app</p>
                </div>
              </div>
              <Badge t="sky">On</Badge>
            </div>
            <Button>Update password</Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Workspace"
            desc="Defaults for this portal, and how records are numbered."
          />
          <CardBody className="space-y-4">
            <WorkspacePrefs />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Language" value="English (UK)" />
              <Field label="Time zone" value="GMT+05:30 — Kolkata" />
              <Field label="Date format" value="DD MMM YYYY" />
              <Field label="Currency" value="USD ($)" />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-sm bg-subtle p-3">
              <Palette size={16} className="text-muted" />
              <p className="flex-1 text-[0.75rem] text-muted">
                Theme follows the toggle in the header.
              </p>
            </div>
          </CardBody>
        </Card>
        </div>
    </div>
  );

  /*
   * The portal access matrix is DEMO-ONLY, and now says so by construction.
   *
   * It edits a per-browser cookie keyed by portal, which has no bearing on what
   * the API lets anyone do. Rendering it beside the real, per-user editor in
   * AccountSettings gave a signed-in super admin two grids that disagreed — and
   * the one they were most likely to use was the one the backend ignores. It is
   * inside the fallback now, so it appears only when nobody is signed in.
   */
  return (
    <AccountSettings
      fallback={
        <div className="space-y-4">
          {accessEditor}
          {staticCards}
        </div>
      }
    />
  );
}

