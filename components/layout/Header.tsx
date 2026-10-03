"use client";

import { useEffect, useRef, useState } from "react";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  MessageSquare,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  Check,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { portalsByGroup } from "@/lib/portals";
import { useStore } from "@/lib/store/StoreProvider";
import { StatusControl } from "./StatusControl";

/** A 34px square icon control — the bar's one button shape (from the Ropix skin). */
function BarButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-card border transition-colors ${
        active
          ? "border-transparent bg-hover text-heading"
          : "border-line text-muted hover:border-transparent hover:bg-hover hover:text-heading"
      } disabled:cursor-default disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export default function Header({
  onToggle,
  collapsed,
  dark,
  onThemeToggle,
  portal,
  portalName,
  canSwitchPortal,
  user,
  role,
  email,
  onSwitchPortal,
  onLogout,
}: {
  onToggle: () => void;
  collapsed: boolean;
  dark: boolean;
  onThemeToggle: () => void;
  portal: string;
  /** The company for a real session; the demo portal's name otherwise. */
  portalName: string;
  /** False once somebody is signed into the API — see the switcher below. */
  canSwitchPortal: boolean;
  user: string;
  role: string;
  /** Present only for an account signed into the API. */
  email?: string;
  onSwitchPortal: (slug: string) => void;
  onLogout: () => void;
}) {
  const [menu, setMenu] = useState<null | "portal" | "user">(null);
  const wrap = useRef<HTMLDivElement>(null);

  // close either dropdown on an outside click or Escape
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const initials =
    user
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("") || "?";

  return (
    <header className="sticky top-0 z-20 flex h-header items-center gap-2.5 border-b border-(--header-border-color) bg-header px-3 sm:px-4">
      <BarButton
        onClick={onToggle}
        label={collapsed ? "Expand the menu" : "Collapse the menu"}
      >
        <Menu size={18} className="lg:hidden" />
        {collapsed ? (
          <PanelLeftOpen size={17} className="hidden lg:block" />
        ) : (
          <PanelLeftClose size={17} className="hidden lg:block" />
        )}
      </BarButton>

      {/* search collapses away on small screens to leave room for the actions */}
      <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs lg:max-w-sm">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          placeholder="Search…"
          className="h-9 w-full rounded-card border border-input-border bg-form-bg pl-9 pr-14 text-[0.8125rem] text-heading outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.14)]"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-line bg-subtle px-1.5 py-0.5 font-mono text-[0.625rem] text-muted md:block">
          Ctrl K
        </kbd>
      </div>

      <div ref={wrap} className="ms-auto flex items-center gap-2">
        {/*
         * The portal switcher is DEMO-ONLY. It hops between fifteen hard-coded
         * shells, meaningful when nobody is signed in and nonsense when somebody
         * is. A real session gets the company name instead, not a menu.
         */}
        <div className="relative">
          <button
            onClick={() => setMenu((m) => (m === "portal" ? null : "portal"))}
            aria-expanded={menu === "portal"}
            aria-haspopup="menu"
            disabled={!canSwitchPortal}
            className="flex h-[34px] items-center gap-1.5 rounded-card border border-line px-2.5 text-[0.75rem] font-medium text-muted transition-colors enabled:hover:border-transparent enabled:hover:bg-hover enabled:hover:text-heading disabled:cursor-default"
          >
            <Building2 size={15} />
            <span className="hidden max-w-[10rem] truncate md:inline">{portalName}</span>
            {canSwitchPortal && <ChevronDown size={13} />}
          </button>

          {canSwitchPortal && menu === "portal" && (
            <div
              role="menu"
              className="pk-menu absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-card border border-line bg-card shadow-pop"
            >
              <p className="border-b border-line px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                Switch portal
              </p>
              <div className="max-h-80 overflow-y-auto py-1">
                {portalsByGroup().map(({ group, items }) => (
                  <div key={group}>
                    <p className="px-3 pb-1 pt-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
                      {group}
                    </p>
                    <ul>
                      {items.map((p) => (
                        <li key={p.slug}>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setMenu(null);
                              onSwitchPortal(p.slug);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-hover"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.8125rem] font-medium text-heading">
                                {p.name}
                              </span>
                              <span className="block truncate text-[0.6875rem] text-muted">
                                {p.demo.user} · {p.demo.role}
                              </span>
                            </span>
                            {p.slug === portal && (
                              <Check size={15} className="shrink-0 text-primary" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <StatusControl />
        <NotificationBell portal={portal} />
        <IconBtn label="Messages" dot="success">
          <MessageSquare size={17} />
        </IconBtn>

        <BarButton
          label={dark ? "Switch to bright mode" : "Switch to dark mode"}
          onClick={onThemeToggle}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </BarButton>

        <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden />

        {/* user menu */}
        <div className="relative">
          <button
            onClick={() => setMenu((m) => (m === "user" ? null : "user"))}
            aria-expanded={menu === "user"}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-card py-1 ps-1 pe-1.5 transition-colors hover:bg-hover"
          >
            <span className="pk-hero inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold">
              {initials}
            </span>
            <span className="hidden text-left leading-tight lg:block">
              <span className="block max-w-[9rem] truncate text-[0.8125rem] font-semibold text-heading">
                {user}
              </span>
              <span className="block max-w-[9rem] truncate text-[0.6875rem] text-muted">
                {role}
              </span>
            </span>
            <ChevronDown size={14} className="hidden text-muted lg:block" />
          </button>

          {menu === "user" && (
            <div
              role="menu"
              className="pk-menu absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-card border border-line bg-card shadow-pop"
            >
              <div className="pk-hero flex items-center gap-3 px-4 py-4">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[0.875rem] font-bold"
                  style={{ background: "rgba(255,255,255,0.18)", color: "var(--on-hero)" }}
                  aria-hidden
                >
                  {initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.875rem] font-semibold">{user}</span>
                  <span className="block truncate text-[0.75rem]">{email ?? role}</span>
                </span>
              </div>
              <div className="p-1.5">
                <button
                  role="menuitem"
                  onClick={onLogout}
                  className="flex w-full items-center gap-3 rounded-card px-2.5 py-2 text-left text-[0.8125rem] font-medium transition-colors hover:bg-hover"
                  style={{ color: "rgb(var(--danger-rgb))" }}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-card"
                    style={{ background: "var(--danger-soft)" }}
                  >
                    <LogOut size={14} />
                  </span>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Bell with the signed-in portal's real unread count. Links into the module
 * rather than opening a popover — the inbox is a page.
 */
function NotificationBell({ portal }: { portal: string }) {
  const { hydrated, currentEmployee, state } = useStore();
  const unread =
    hydrated && currentEmployee
      ? state.notifications.filter((n) => n.to === currentEmployee.id && !n.read).length
      : 0;

  return (
    <Link
      href={`/${portal}/notifications`}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      title={unread > 0 ? `${unread} unread` : "Notifications"}
      className="relative hidden h-[34px] w-[34px] items-center justify-center rounded-card border border-line text-muted transition-colors hover:border-transparent hover:bg-hover hover:text-heading sm:flex"
    >
      <Bell size={17} />
      {unread > 0 && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.625rem] font-bold text-white"
          style={{ background: "rgb(var(--danger-vivid-rgb))" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

function IconBtn({
  children,
  label,
  dot,
}: {
  children: React.ReactNode;
  label: string;
  dot?: "danger" | "success";
}) {
  return (
    <button
      aria-label={label}
      className="relative hidden h-[34px] w-[34px] items-center justify-center rounded-card border border-line text-muted transition-colors hover:border-transparent hover:bg-hover hover:text-heading sm:flex"
    >
      {children}
      {dot && (
        <span
          className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${
            dot === "danger" ? "bg-danger" : "bg-primary"
          }`}
        />
      )}
    </button>
  );
}
