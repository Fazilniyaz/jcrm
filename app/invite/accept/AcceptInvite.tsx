"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAcceptInviteMutation, useValidateInviteQuery } from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";

/*
 * The rules mirror the server's exactly (lib/password.ts). They are shown live
 * so nobody has to submit to find out what is missing — but the server is what
 * enforces them; this list is a courtesy, not a gate.
 */
const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
  { label: "A symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
  {
    label: "No common words or repeated runs",
    test: (v) =>
      v.length > 0 &&
      !/(.)\1{3,}/.test(v) &&
      !/password|qwerty|123456|admin|letmein|welcome|jadvix|abc123/i.test(v),
  },
];

function Field({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-medium text-heading">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-sm border border-input-border bg-form-bg px-3 pr-11 text-[0.875rem] text-text outline-none transition-colors focus:border-primary"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted transition-colors hover:text-primary"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function AcceptInvite({ token }: { token: string }) {
  const { data, isLoading, isError, error } = useValidateInviteQuery(token, { skip: !token });
  const [accept, acceptState] = useAcceptInviteMutation();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return <Notice title="Missing invitation" body="That link has no token in it." />;
  }
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-[0.875rem] text-muted">
        <Loader2 size={16} className="animate-spin" /> Checking your invitation…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <Notice
        title="This invitation isn't valid"
        body={apiErrorMessage(error, "The link may have expired or already been used.")}
      />
    );
  }

  if (done) {
    return (
      <div>
        <h1 className="text-[1.5rem] font-bold text-heading">You&rsquo;re all set</h1>
        <p className="mt-2 text-[0.875rem] text-muted">
          Your password is saved. Sign in to open {data.companyName}.
        </p>
        <Link
          href="/login"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-sm bg-primary text-[0.875rem] font-semibold text-white transition-[filter] hover:brightness-110"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const failing = RULES.filter((r) => !r.test(password));
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length > 0 && failing.length === 0 && !mismatch && confirm.length > 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    try {
      await accept({ token, password, confirmPassword: confirm }).unwrap();
      setDone(true);
    } catch (err) {
      setFailure(apiErrorMessage(err, "Couldn't set that password."));
    }
  }

  return (
    <div>
      <h1 className="text-[1.5rem] font-bold text-heading">
        {data.isOwner ? `Activate ${data.companyName}` : `Join ${data.companyName}`}
      </h1>
      <p className="mt-1 text-[0.875rem] text-muted">
        Hi {data.name} — choose a password for <span className="text-heading">{data.email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggle={() => setShow((v) => !v)}
        />
        <Field
          id="confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          show={show}
          onToggle={() => setShow((v) => !v)}
        />

        <ul className="space-y-1.5 rounded-sm bg-subtle p-3">
          {RULES.map((rule) => {
            const passed = password.length > 0 && rule.test(password);
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

        {mismatch && (
          <p className="text-[0.8125rem] text-muted">The two passwords don&rsquo;t match yet.</p>
        )}

        {failure && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-sm px-3 py-2 text-[0.8125rem]"
            style={{
              background: "rgba(var(--brand-red-rgb),0.12)",
              color: "rgb(var(--danger-rgb))",
            }}
          >
            <AlertCircle size={15} className="mt-px shrink-0" />
            {failure}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || acceptState.isLoading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-primary text-[0.875rem] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {acceptState.isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving…
            </>
          ) : (
            "Set password"
          )}
        </button>
      </form>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-[1.5rem] font-bold text-heading">{title}</h1>
      <p className="mt-2 text-[0.875rem] text-muted">{body}</p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-sm border border-line px-5 text-[0.875rem] font-semibold text-heading transition-colors hover:border-primary"
      >
        Back to sign in
      </Link>
    </div>
  );
}
