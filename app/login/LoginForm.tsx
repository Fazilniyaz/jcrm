"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Eye, EyeOff, LogIn, Loader2, ShieldCheck } from "lucide-react";
import { useLoginMutation, useMasterLoginMutation } from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { establishPortalSession } from "@/lib/actions";
import { portalForRoles } from "@/lib/portals";

/*
 * Sign-in against jadvix-backend.
 *
 * Two doors, chosen explicitly rather than guessed from the address:
 *   Company — a User row, scoped to its tenant.
 *   Master  — the platform owner, checked against MASTER_PASSWORD_HASH. No DB
 *             user exists for it at all.
 *
 * On success the API sets an httpOnly refresh cookie and returns an access
 * token, which is kept in memory. The only thing written here is which portal
 * shell to render — the data behind it is authorised by the token, not by that.
 */

type Mode = "company" | "master";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("company");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [login, loginState] = useLoginMutation();
  const [masterLogin, masterState] = useMasterLoginMutation();
  const pending = loginState.isLoading || masterState.isLoading;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setError("Enter both an email address and a password.");
      return;
    }

    try {
      if (mode === "master") {
        await masterLogin({ email, password }).unwrap();
        await establishPortalSession("master-portal");
        router.push("/master-portal");
      } else {
        const { user } = await login({ email, password }).unwrap();
        const slug = portalForRoles(user.roles, user.isOwner);
        await establishPortalSession(slug);
        router.push(`/${slug}`);
      }
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Those credentials don't match an account."));
    }
  }

  const tab = (value: Mode, label: string, Icon: typeof Building2) => (
    <button
      key={value}
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      aria-pressed={mode === value}
      className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-[0.8125rem] font-medium transition-colors ${
        mode === value ? "bg-primary text-white" : "text-muted hover:text-heading"
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="flex gap-1 rounded-sm bg-subtle p-1">
        {tab("company", "Company account", Building2)}
        {tab("master", "Master", ShieldCheck)}
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-[0.8125rem] font-medium text-heading">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder={mode === "master" ? "jadvixltd@gmail.com" : "you@yourcompany.com"}
          className="h-11 w-full rounded-sm border border-input-border bg-form-bg px-3 text-[0.875rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[0.8125rem] font-medium text-heading">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-11 w-full rounded-sm border border-input-border bg-form-bg px-3 pr-11 text-[0.875rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted transition-colors hover:text-primary"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-sm px-3 py-2 text-[0.8125rem]"
          style={{
            background: "rgba(var(--brand-red-rgb),0.12)",
            color: "rgb(var(--danger-rgb))",
          }}
        >
          <AlertCircle size={15} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-primary text-[0.875rem] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-70"
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            <LogIn size={16} />
            Sign in
          </>
        )}
      </button>
    </form>
  );
}
