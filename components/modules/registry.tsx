import type { ModuleSlug } from "@/lib/modules";
import { MODULES, MANDATORY_MODULES, OPTIONAL_MODULES, isMandatory } from "@/lib/modules";
import { PORTALS } from "@/lib/portals";
import { readGrants } from "@/lib/access";
import ModuleAccess, { type AccessRow, type AccessCol } from "./ModuleAccess";
import ModuleView from "./ModuleView";

/*
 * The server half of the registry: the bits that need cookies or the module
 * tables. The slug -> view switch moved to ./ModuleView, which is a Client
 * Component so that next/dynamic actually code-splits each module out of the
 * route bundle — from a Server Component it does not.
 */

export type ModuleViewProps = {
  user: string;
  role: string;
  portal: string;
  canManageAccess: boolean;
};

/** Builds the access matrix from the live grants. Server-side only. */
async function AccessEditor() {
  const grants = await readGrants();

  // Mandatory rows first so the locked baseline reads as a block.
  const rows: AccessRow[] = [
    ...MANDATORY_MODULES,
    ...OPTIONAL_MODULES,
  ].map((slug) => {
    const def = MODULES.find((m) => m.slug === slug)!;
    return {
      slug,
      label: def.label,
      group: def.group,
      mandatory: isMandatory(slug),
    };
  });

  const cols: AccessCol[] = PORTALS.map((p) => ({
    slug: p.slug,
    name: p.name,
    tag: p.tag,
    // The super admin is the one granting access, so it can't be reduced.
    locked: p.slug === "super-admin",
  }));

  const granted = PORTALS.flatMap((p) =>
    (grants[p.slug] ?? []).map((m) => `${p.slug}:${m}`),
  );

  return <ModuleAccess rows={rows} cols={cols} granted={granted} />;
}

/**
 * Slug -> view. Adding a module is one entry in ./ModuleView plus a definition
 * in lib/modules.ts.
 */
export function renderModule(slug: ModuleSlug, props: ModuleViewProps): React.ReactNode {
  return (
    <ModuleView
      slug={slug}
      user={props.user}
      role={props.role}
      portal={props.portal}
      // Only Settings uses it, but it has to be built here: it is an async
      // server component, and a client component cannot render one itself.
      accessEditor={
        slug === "settings" && props.canManageAccess ? <AccessEditor /> : undefined
      }
    />
  );
}
