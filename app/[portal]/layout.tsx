import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getPortal } from "@/lib/portals";
import { getSession } from "@/lib/session";
import { getEffectiveModules } from "@/lib/access";
import { RAIL_COOKIE } from "@/lib/ui-prefs";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function PortalLayout({ children, params }: LayoutProps<"/[portal]">) {
  const { portal: slug } = await params;
  const portal = getPortal(slug);
  if (!portal) notFound();

  // Proxy only checks that a cookie exists; the real check happens here.
  const session = await getSession();
  if (!session) redirect("/login");

  // Signed into a different portal than the URL asks for — send them to theirs
  // rather than rendering someone else's workspace.
  if (session.slug !== portal.slug) redirect(`/${session.slug}`);

  const modules = await getEffectiveModules(portal.slug);

  // Read the rail preference on the server so the sidebar renders at its final
  // width immediately — toggling it client-side only would flash on every load.
  const railCollapsed = (await cookies()).get(RAIL_COOKIE)?.value === "1";

  return (
    <DashboardShell
      portal={portal.slug}
      portalName={portal.name}
      tag={portal.tag}
      modules={modules}
      user={portal.demo.user}
      role={portal.demo.role}
      initialCollapsed={railCollapsed}
    >
      {children}
    </DashboardShell>
  );
}
