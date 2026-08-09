import "server-only";
import { cookies } from "next/headers";
import {
  MANDATORY_MODULES,
  OPTIONAL_MODULES,
  MODULES,
  type ModuleSlug,
} from "./modules";
import { PORTALS, type PortalSlug } from "./portals";

/*
 * Which portal may open which module.
 *
 * Grants live in a cookie so the demo keeps its state without a database.
 * That also means they are per-browser and trivially forgeable — a real
 * deployment must hold this server-side and re-check it on every request.
 * The runtime check in the module page is what actually enforces access;
 * hiding an item from the sidebar is only cosmetic.
 */

export const ACCESS_COOKIE = "jadvix_access";

/** Portals whose module set can never be reduced. */
const ALWAYS_FULL: readonly PortalSlug[] = ["super-admin"];

export type AccessMap = Record<PortalSlug, ModuleSlug[]>;

/** Default state: every portal starts with everything switched on. */
export function defaultGrants(): Record<PortalSlug, ModuleSlug[]> {
  const out = {} as Record<PortalSlug, ModuleSlug[]>;
  for (const p of PORTALS) out[p.slug] = [...OPTIONAL_MODULES];
  return out;
}

/* ----------------------------------------------------------- encoding ---- */
/*
 * `slug:mask:width` triples joined by `.`, where mask is a base36 bitmask over
 * OPTIONAL_MODULES. Compact enough to stay well inside the 4KB cookie limit.
 *
 * `width` is how many optional modules existed when the cookie was written.
 * Without it, appending a module to OPTIONAL_MODULES would read as a zero bit
 * in every stored cookie — the new module would be silently switched off for
 * everyone who had ever saved a grant, which is the opposite of the default
 * for a fresh visitor. Anything past the stored width is granted instead, so a
 * new module arrives switched on and any deliberate choice already made is
 * preserved.
 */

/** Optional-module count before `width` was recorded. Do not change. */
const LEGACY_WIDTH = 10;

function encode(grants: Record<PortalSlug, ModuleSlug[]>): string {
  const width = OPTIONAL_MODULES.length.toString(36);
  return PORTALS.map((p) => {
    const granted = new Set(grants[p.slug] ?? []);
    let mask = 0;
    OPTIONAL_MODULES.forEach((m, i) => {
      if (granted.has(m)) mask |= 1 << i;
    });
    return `${p.slug}:${mask.toString(36)}:${width}`;
  }).join(".");
}

function decode(raw: string): Record<PortalSlug, ModuleSlug[]> {
  const out = defaultGrants();
  for (const part of raw.split(".")) {
    const [slug, maskRaw, widthRaw] = part.split(":");
    if (!slug || maskRaw === undefined) continue;
    if (!PORTALS.some((p) => p.slug === slug)) continue;
    const mask = parseInt(maskRaw, 36);
    if (Number.isNaN(mask)) continue;

    const parsedWidth = widthRaw === undefined ? LEGACY_WIDTH : parseInt(widthRaw, 36);
    const width = Number.isNaN(parsedWidth) ? LEGACY_WIDTH : parsedWidth;

    out[slug as PortalSlug] = OPTIONAL_MODULES.filter((_, i) =>
      i < width ? (mask >> i) & 1 : true,
    );
  }
  return out;
}

/* ------------------------------------------------------------- reading ---- */

export async function readGrants(): Promise<Record<PortalSlug, ModuleSlug[]>> {
  const raw = (await cookies()).get(ACCESS_COOKIE)?.value;
  const grants = raw ? decode(raw) : defaultGrants();
  // Portals that can't be restricted are normalised on the way out, so a
  // stale or hand-edited cookie can't lock a super admin out of anything.
  for (const slug of ALWAYS_FULL) grants[slug] = [...OPTIONAL_MODULES];
  return grants;
}

export async function writeGrants(grants: Record<PortalSlug, ModuleSlug[]>) {
  for (const slug of ALWAYS_FULL) grants[slug] = [...OPTIONAL_MODULES];
  (await cookies()).set(ACCESS_COOKIE, encode(grants), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * The master portal's three modules, fixed.
 *
 * It administers tenants and nothing else — there is no project or roster for
 * it to open, and the API refuses those endpoints for a master token anyway, so
 * showing them would only produce a sidebar full of 403s.
 */
const MASTER_MODULES: readonly ModuleSlug[] = ["dashboard", "companies", "settings"];

/** Mandatory modules plus whatever this portal has been granted, in menu order. */
export function effectiveModules(
  portal: PortalSlug,
  grants: Record<PortalSlug, ModuleSlug[]>,
): ModuleSlug[] {
  if (portal === "master-portal") return [...MASTER_MODULES];

  const allowed = new Set<ModuleSlug>([...MANDATORY_MODULES, ...(grants[portal] ?? [])]);
  // Keep MODULES order so the sidebar grouping stays stable.
  return MODULES.map((m) => m.slug).filter((s) => allowed.has(s));
}

export async function getEffectiveModules(portal: PortalSlug): Promise<ModuleSlug[]> {
  return effectiveModules(portal, await readGrants());
}

/**
 * Where to send someone landing on a portal root. Dashboard is grantable, so
 * it can legitimately be switched off — fall back to the first module the
 * portal actually has rather than redirecting into a 404.
 */
export function landingModule(modules: ModuleSlug[]): ModuleSlug {
  return modules.includes("dashboard") ? "dashboard" : (modules[0] ?? "settings");
}

export function canManageAccess(portal: PortalSlug): boolean {
  return PORTALS.find((p) => p.slug === portal)?.canManageAccess ?? false;
}
