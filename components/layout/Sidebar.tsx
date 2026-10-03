"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MODULES,
  MODULE_GROUP_ORDER,
  type ModuleGroup,
  type ModuleSlug,
} from "@/lib/modules";
import { tone } from "@/components/ui";
import type { Tone } from "@/lib/ui/tone";
import type { IconType } from "@/lib/ui/icon";

/*
 * A hue per menu section, so a colour comes to mean a place — the same tint is
 * carried on the row's icon tile here, and on that module's tiles inside the
 * page. Reads straight off the shared tone vocabulary.
 */
const GROUP_TONE: Record<ModuleGroup, Tone> = {
  Overview: "primary",
  Work: "blue",
  People: "purple",
  Finance: "green",
  Organisation: "teal",
  System: "slate",
};

function NavRow({
  href,
  label,
  Icon,
  t,
  active,
  onClick,
}: {
  href: string;
  label: string;
  Icon: IconType;
  t: Tone;
  active: boolean;
  onClick: () => void;
}) {
  const c = tone[t];
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`group/row relative mx-3 flex items-center gap-2.5 rounded-card py-[7px] ps-2 pe-3 text-[0.875rem] font-medium transition-colors lg:group-data-[collapsed=true]/rail:mx-2 lg:group-data-[collapsed=true]/rail:justify-center lg:group-data-[collapsed=true]/rail:px-0 ${
        active ? "text-heading" : "text-menu-text hover:bg-hover hover:text-heading"
      }`}
      style={active ? { background: c.soft } : undefined}
    >
      {/* The hue of the place you are in, down the rail's edge. */}
      {active && (
        <span
          className="absolute inset-y-1.5 -start-0 w-[3px] rounded-e-full lg:group-data-[collapsed=true]/rail:hidden"
          style={{ background: c.solid }}
          aria-hidden
        />
      )}
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-card transition-transform duration-200 group-hover/row:scale-110"
        style={
          active
            ? { background: c.solid, color: c.onSolid, boxShadow: `0 6px 14px -6px ${c.solid}` }
            : { background: c.soft, color: c.text }
        }
        aria-hidden
      >
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <span className="flex-1 truncate lg:group-data-[collapsed=true]/rail:hidden">{label}</span>
    </Link>
  );
}

export default function Sidebar({
  open,
  onClose,
  portal,
  workspaceLabel,
  workspaceName,
  caption,
  modules,
  collapsed,
}: {
  open: boolean;
  onClose: () => void;
  portal: string;
  /** "Workspace" for a real account, "Portal" for the demo shells. */
  workspaceLabel: string;
  /** The company someone is signed into — or the demo portal's name. */
  workspaceName: string;
  /** Their role and employee id, shown in the rail footer. */
  caption: string;
  modules: readonly ModuleSlug[];
  /** Desktop rail mode. Never applies while the mobile overlay is open. */
  collapsed: boolean;
}) {
  // The layout can't see the child route's params, so read the active module
  // straight off the pathname: /<portal>/<module>
  const active = usePathname()?.split("/")[2] ?? "";
  const allowed = new Set(modules);
  const groups = MODULE_GROUP_ORDER.map((group) => ({
    group,
    items: MODULES.filter((m) => m.group === group && allowed.has(m.slug)),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* mobile backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={`group/rail fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-menu shadow-[var(--rail-shadow)] transition-[width,transform] duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-sidebar lg:w-rail" : "w-sidebar"}`}
      >
        {/* brand — the wordmark is too wide for the rail, so the collapsed
            state shows just the mark (public/icon.svg) */}
        <Link
          href={`/${portal}`}
          className="flex h-header shrink-0 items-center border-b border-(--menu-border-color) px-5 lg:group-data-[collapsed=true]/rail:justify-center lg:group-data-[collapsed=true]/rail:px-0"
        >
          <Image
            src="/jadvix-logo.svg"
            alt="Jadvix"
            width={2826}
            height={654}
            priority
            unoptimized
            className="h-7 w-auto dark:hidden lg:group-data-[collapsed=true]/rail:hidden"
          />
          <Image
            src="/jadvix-logo-light.svg"
            alt="Jadvix"
            width={2826}
            height={654}
            priority
            unoptimized
            className="hidden h-7 w-auto dark:block lg:dark:group-data-[collapsed=true]/rail:hidden"
          />
          <Image
            src="/icon.svg"
            alt="Jadvix"
            width={654}
            height={654}
            priority
            unoptimized
            className="hidden h-7 w-7 lg:group-data-[collapsed=true]/rail:block"
          />
        </Link>

        {/* whose workspace this is — the company for a real account */}
        <div className="shrink-0 px-3 pt-3 lg:group-data-[collapsed=true]/rail:hidden">
          <div
            className="overflow-hidden rounded-card px-3 py-2.5"
            style={{ background: tone.primary.soft }}
          >
            <p className="truncate text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
              {workspaceLabel}
            </p>
            <p className="mt-0.5 truncate text-[0.8125rem] font-semibold text-heading">
              {workspaceName}
            </p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-1">
          {groups.map((g) => {
            const t = GROUP_TONE[g.group];
            return (
              <div key={g.group} className="mt-4 first:mt-3">
                <p className="mb-2 px-5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] whitespace-nowrap text-menu-category lg:group-data-[collapsed=true]/rail:mx-auto lg:group-data-[collapsed=true]/rail:my-3 lg:group-data-[collapsed=true]/rail:h-px lg:group-data-[collapsed=true]/rail:w-6 lg:group-data-[collapsed=true]/rail:overflow-hidden lg:group-data-[collapsed=true]/rail:bg-(--menu-border-color) lg:group-data-[collapsed=true]/rail:px-0 lg:group-data-[collapsed=true]/rail:text-transparent">
                  {g.group}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((m) => (
                    <li key={m.slug}>
                      <NavRow
                        href={`/${portal}/${m.slug}`}
                        label={m.label}
                        Icon={m.icon}
                        t={t}
                        active={m.slug === active}
                        onClick={onClose}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 overflow-hidden border-t border-(--menu-border-color) px-5 py-3 lg:group-data-[collapsed=true]/rail:hidden">
          <p className="truncate text-[0.6875rem] text-muted">
            {caption} · {modules.length} modules
          </p>
        </div>
      </aside>
    </>
  );
}
