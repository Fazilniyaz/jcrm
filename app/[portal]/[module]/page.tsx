import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortal, PORTALS } from "@/lib/portals";
import { getModule } from "@/lib/modules";
import { getEffectiveModules, canManageAccess } from "@/lib/access";
import { PageHead } from "@/components/ui";
import { renderModule } from "@/components/modules/registry";
import ModuleGuard from "@/components/layout/ModuleGuard";

/** Pre-render every portal/module pair. Access is still checked per request. */
export function generateStaticParams() {
  return PORTALS.flatMap((p) => p.modules.map((m) => ({ portal: p.slug, module: m })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[portal]/[module]">): Promise<Metadata> {
  const { portal: pSlug, module: mSlug } = await params;
  const portal = getPortal(pSlug);
  const mod = getModule(mSlug);
  if (!portal || !mod) return { title: "Jadvix CRM" };
  return { title: `${mod.label} · ${portal.name} – Jadvix CRM` };
}

export default async function ModulePage({ params }: PageProps<"/[portal]/[module]">) {
  const { portal: pSlug, module: mSlug } = await params;

  const portal = getPortal(pSlug);
  const mod = getModule(mSlug);
  if (!portal || !mod) notFound();

  // The demo gate: a per-browser cookie, keyed by portal. It is the whole story
  // when nobody is signed into the API, and says nothing at all when someone is
  // — which is why ModuleGuard re-checks below against the actual session.
  const modules = await getEffectiveModules(portal.slug);
  if (!modules.includes(mod.slug)) notFound();

  return (
    <>
      <PageHead title={mod.label} blurb={mod.blurb} />
      <ModuleGuard slug={mod.slug}>
        {renderModule(mod.slug, {
          user: portal.demo.user,
          role: portal.demo.role,
          portal: portal.slug,
          canManageAccess: canManageAccess(portal.slug),
        })}
      </ModuleGuard>
    </>
  );
}

export const dynamicParams = false;
