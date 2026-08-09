"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES, MODULE_GROUP_ORDER, type ModuleSlug } from "@/lib/modules";

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
        className={`group/rail fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-(--menu-border-color) bg-menu transition-[width,transform] duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-sidebar lg:w-rail" : "w-sidebar"}`}
      >
        {/* brand — the wordmark is too wide for the rail, so the collapsed
            state shows just the mark (app/icon.svg) */}
        <Link
          href={`/${portal}`}
          className="flex h-header shrink-0 items-center border-b border-(--menu-border-color) px-5.5 lg:group-data-[collapsed=true]/rail:justify-center lg:group-data-[collapsed=true]/rail:px-0"
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
        <div className="shrink-0 overflow-hidden border-b border-(--menu-border-color) px-5.5 py-3 lg:group-data-[collapsed=true]/rail:hidden">
          <p className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
            {workspaceLabel}
          </p>
          <p className="mt-0.5 truncate text-[0.8125rem] font-semibold text-heading">
            {workspaceName}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-8 pt-1">
          {groups.map((g) => (
            <ul key={g.group}>
              <li className="mt-6 mb-2 px-5.5 text-[11px] font-bold uppercase tracking-[0.03125rem] whitespace-nowrap text-menu-category lg:group-data-[collapsed=true]/rail:mx-4 lg:group-data-[collapsed=true]/rail:mt-4 lg:group-data-[collapsed=true]/rail:mb-2 lg:group-data-[collapsed=true]/rail:h-px lg:group-data-[collapsed=true]/rail:overflow-hidden lg:group-data-[collapsed=true]/rail:bg-(--menu-border-color) lg:group-data-[collapsed=true]/rail:px-0 lg:group-data-[collapsed=true]/rail:text-transparent">
                {g.group}
              </li>
              {g.items.map((m) => {
                const Icon = m.icon;
                const isActive = m.slug === active;
                return (
                  <li key={m.slug}>
                    <Link
                      href={`/${portal}/${m.slug}`}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      // title doubles as the tooltip once labels are hidden
                      title={m.label}
                      className={`relative flex items-center py-2.5 pl-5.5 pr-5 text-[13px] font-normal no-underline transition-colors lg:group-data-[collapsed=true]/rail:justify-center lg:group-data-[collapsed=true]/rail:px-0 ${
                        isActive ? "text-primary" : "text-menu-text hover:text-primary"
                      }`}
                    >
                      {/* active marker is a 3px bar, matching the Valex chrome */}
                      {isActive && (
                        <span className="absolute inset-y-0 left-0 my-auto h-10 w-0.75 bg-primary" />
                      )}
                      <Icon
                        size={18}
                        strokeWidth={1.8}
                        className="me-3.5 h-5.5 w-5.5 shrink-0 lg:group-data-[collapsed=true]/rail:me-0"
                      />
                      <span className="flex-1 truncate lg:group-data-[collapsed=true]/rail:hidden">
                        {m.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>

        <div className="shrink-0 overflow-hidden border-t border-(--menu-border-color) px-5.5 py-3 lg:group-data-[collapsed=true]/rail:hidden">
          <p className="truncate text-[0.6875rem] text-muted">
            {caption} · {modules.length} modules
          </p>
        </div>
      </aside>
    </>
  );
}
