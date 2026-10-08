import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui";

/*
 * The 404.
 *
 * Not decoration: `notFound()` is a real code path in this app, thrown by
 * app/[portal]/layout.tsx for an unknown portal slug and by
 * app/[portal]/[module]/page.tsx both for an unknown module AND for a module
 * the current portal has not been granted. That last one is the common case —
 * someone follows a link to a module their role does not carry — and until now
 * it rendered the framework's unstyled default: black Helvetica on white, no
 * navigation, no way back into the workspace.
 *
 * Deliberately a Server Component with no store access. It has to render for a
 * signed-out visitor and inside a failed layout, so it cannot depend on a
 * provider that may not have mounted.
 */

export const metadata: Metadata = {
  title: "Page not found – Jadvix CRM",
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardBody>
          <p className="font-mono text-[0.6875rem] tracking-wider text-muted">ERROR 404</p>

          <h1 className="mt-2 text-[1.375rem] font-semibold leading-tight tracking-tight text-heading">
            We couldn&rsquo;t find that page
          </h1>

          <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
            The link may be out of date, or the module may not be enabled for your account. Your
            workspace administrator can grant access to a module from Settings.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {/*
              Both routes are safe for anyone: "/" resolves the signed-in
              portal and redirects to /login when there is no session, so
              neither link is a dead end for a visitor who is not signed in.
            */}
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-sm bg-primary px-3 py-2 text-[0.8125rem] font-medium text-on-primary transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Back to your workspace
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-sm border border-line bg-card px-3 py-2 text-[0.8125rem] font-medium text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign in
            </Link>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
