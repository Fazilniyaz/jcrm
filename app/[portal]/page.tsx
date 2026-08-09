import { notFound, redirect } from "next/navigation";
import { getPortal } from "@/lib/portals";
import { getEffectiveModules, landingModule } from "@/lib/access";

/**
 * /<portal> has no page of its own. Dashboard is a grantable module, so it can
 * legitimately be switched off — land on the first module this portal actually
 * has rather than redirecting into a 404.
 */
export default async function PortalIndex({ params }: PageProps<"/[portal]">) {
  const { portal: slug } = await params;
  const portal = getPortal(slug);
  if (!portal) notFound();

  const modules = await getEffectiveModules(portal.slug);
  redirect(`/${portal.slug}/${landingModule(modules)}`);
}
