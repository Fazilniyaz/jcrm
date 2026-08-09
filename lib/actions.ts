"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findPortalByCredentials, isPortalSlug, PORTALS, type PortalSlug } from "./portals";
import { OPTIONAL_MODULES, type ModuleSlug } from "./modules";
import { createSession, destroySession, getSession } from "./session";
import { canManageAccess, writeGrants } from "./access";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both an email address and a password." };
  }

  const portal = findPortalByCredentials(email, password);
  if (!portal) {
    // Deliberately vague: don't reveal which half was wrong.
    return { error: "Those credentials don't match any demo portal." };
  }

  await createSession(portal.slug);
  redirect(`/${portal.slug}`);
}

/** One-click sign-in used by the demo credential list on the login screen. */
export async function loginAsDemo(formData: FormData): Promise<void> {
  const slug = String(formData.get("portal") ?? "");
  if (!isPortalSlug(slug)) redirect("/login");
  await createSession(slug);
  redirect(`/${slug}`);
}

/**
 * Open a portal shell for an account that has already authenticated against
 * jadvix-backend.
 *
 * The API owns the credentials; this cookie only records WHICH portal shell to
 * render, and every module still asks the API what it is allowed to show. So a
 * forged cookie buys a sidebar and nothing behind it — the data endpoints check
 * the bearer token, not this.
 */
export async function establishPortalSession(slug: string): Promise<void> {
  if (!isPortalSlug(slug)) return;
  await createSession(slug);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export type AccessState = { ok?: boolean; error?: string };

/**
 * Persist the module-access matrix.
 *
 * Re-checks the caller's own session rather than trusting anything the form
 * sent — otherwise any portal could POST this action and grant itself modules.
 */
export async function saveModuleAccess(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const session = await getSession();
  if (!session || !canManageAccess(session.slug)) {
    return { error: "You don't have permission to change module access." };
  }

  // Checkbox values arrive as "<portal>:<module>"; anything unrecognised is dropped.
  const optional = new Set<string>(OPTIONAL_MODULES);
  const grants = {} as Record<PortalSlug, ModuleSlug[]>;
  for (const p of PORTALS) grants[p.slug] = [];

  for (const raw of formData.getAll("grant")) {
    const [portal, mod] = String(raw).split(":");
    if (!isPortalSlug(portal) || !optional.has(mod)) continue;
    grants[portal].push(mod as ModuleSlug);
  }

  await writeGrants(grants);
  // The sidebar is rendered in the portal layout, so refresh the whole tree.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Jump straight between portals from the header switcher. */
export async function switchPortal(formData: FormData): Promise<void> {
  const slug = String(formData.get("portal") ?? "");
  if (!isPortalSlug(slug)) redirect("/login");
  await createSession(slug);
  redirect(`/${slug}`);
}
