"use client";

import { Loader2, Lock } from "lucide-react";
import { Card, CardBody } from "@/components/ui";
import { fromApiModuleSlugs, type ModuleSlug } from "@/lib/modules";
import { useSession } from "@/lib/api/session";

/*
 * The per-request access check, for a signed-in account.
 *
 * Hiding an item from the sidebar is cosmetic — someone can type the URL. The
 * server-side gate in this route reads the demo cookie, which says nothing
 * about who is signed in, so it cannot answer this question; the session can,
 * and the session only exists in the browser because the access token is held
 * in memory on purpose.
 *
 * This is not the security boundary. Every endpoint behind these screens is
 * gated by `requireModule` on the API, and that is what actually protects the
 * data. This exists so a module nobody is allowed to use stops being rendered
 * as though it worked.
 */
export default function ModuleGuard({
  slug,
  children,
}: {
  slug: ModuleSlug;
  children: React.ReactNode;
}) {
  const session = useSession();

  // Nobody signed into the API: a demo portal, already gated by the cookie.
  if (session.status === "anonymous") return <>{children}</>;

  if (session.status === "loading") {
    return (
      <Card>
        <CardBody>
          <p className="flex items-center gap-2 py-10 text-[0.875rem] text-muted">
            <Loader2 size={16} className="animate-spin" /> Checking your access…
          </p>
        </CardBody>
      </Card>
    );
  }

  const granted =
    session.status === "user" ? session.user.modules : session.master.modules;

  if (fromApiModuleSlugs(granted).includes(slug)) return <>{children}</>;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Lock size={22} className="text-muted" />
          <p className="text-[0.875rem] font-semibold text-heading">
            This module isn&rsquo;t enabled for your account
          </p>
          <p className="max-w-sm text-[0.75rem] leading-relaxed text-muted">
            Your role decides which modules you start with, and a super admin can
            grant more from Settings. Ask yours if you need this one.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
