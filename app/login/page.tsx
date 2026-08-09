import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { PORTALS, portalsByGroup } from "@/lib/portals";
import LoginForm from "./LoginForm";
import DemoCredentials from "./DemoCredentials";

export const metadata = { title: "Sign in – Jadvix CRM" };

export default function LoginPage() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* ---- brand panel: hidden on small screens where it would just push
             the form below the fold ---- */}
      <aside className="relative hidden overflow-hidden bg-brand-blue-gradient p-10 lg:flex lg:flex-col lg:justify-between">
        <span className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-white/5" />

        <Image
          src="/jadvix-logo-light.svg"
          alt="Jadvix"
          width={2826}
          height={654}
          priority
          unoptimized
          className="relative h-8 w-auto self-start"
        />

        <div className="relative max-w-md">
          <h2 className="text-[1.75rem] font-bold leading-tight text-white">
            One workspace for every part of Jadvix LTD.
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
            Projects, people, payroll and pipeline — each portal shows the same
            system through the lens of the role signing in.
          </p>
          {/* Grouped rather than one line per portal — fifteen bullets would
              crowd the panel and say less than the six groups do. */}
          <ul className="mt-6 space-y-2.5">
            {portalsByGroup().map(({ group, items }) => (
              <li key={group} className="flex items-baseline gap-2.5 text-[0.8125rem] text-white/85">
                <span className="h-1.5 w-1.5 shrink-0 translate-y-[-0.15rem] rounded-full bg-white/70" />
                <span>
                  {group}
                  <span className="text-white/55"> — {items.length} portals</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[0.8125rem] text-white/70">
            {PORTALS.length} sign-ins in total, one per seat.
          </p>
        </div>

        <p className="relative text-[0.75rem] text-white/60">
          © {new Date().getFullYear()} Jadvix LTD. All rights reserved.
        </p>
      </aside>

      {/* ---- form panel ---- */}
      <main className="flex min-h-screen flex-col justify-center bg-body px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <Image
            src="/jadvix-logo.svg"
            alt="Jadvix"
            width={2826}
            height={654}
            priority
            unoptimized
            className="mb-8 h-8 w-auto dark:hidden lg:hidden"
          />
          <Image
            src="/jadvix-logo-light.svg"
            alt="Jadvix"
            width={2826}
            height={654}
            priority
            unoptimized
            className="mb-8 hidden h-8 w-auto dark:block lg:dark:hidden"
          />

          <h1 className="text-[1.5rem] font-bold text-heading">Sign in</h1>
          <p className="mt-1 text-[0.875rem] text-muted">
            Company accounts and the master portal sign in against the Jadvix API.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
              Demo portals (no backend)
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <DemoCredentials />

          <p className="mt-6 flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted">
            <ShieldCheck size={14} className="mt-px shrink-0" />
            <span>
              The demo portals below open the original static build with its
              local sample data — they do not touch the API, and no real records
              are involved. Sign in above to work against the backend.
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
