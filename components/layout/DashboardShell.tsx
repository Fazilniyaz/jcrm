"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { fromApiModuleSlugs, type ModuleSlug } from "@/lib/modules";
import { logout, switchPortal } from "@/lib/actions";
import { useLogoutMutation } from "@/lib/api/api";
import { useSession } from "@/lib/api/session";
import { roleLabelFor } from "@/lib/api/adapters";
import { RAIL_COOKIE } from "@/lib/ui-prefs";
import { StoreProvider } from "@/lib/store/StoreProvider";
import ApiStoreProvider from "@/lib/store/ApiStoreProvider";
import { BranchBanner } from "./StatusControl";

const DESKTOP = "(min-width: 1024px)";

/** Stable identity, so an unresolved session doesn't re-render the sidebar. */
const EMPTY_MODULES: readonly ModuleSlug[] = [];

/** Subscribes to the viewport instead of setting state from an effect. */
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true, // server render assumes desktop, matching the default layout
  );
}

export default function DashboardShell({
  children,
  portal,
  portalName,
  tag,
  modules,
  user,
  role,
  initialCollapsed,
}: {
  children: React.ReactNode;
  portal: string;
  portalName: string;
  tag: string;
  modules: readonly ModuleSlug[];
  user: string;
  role: string;
  initialCollapsed: boolean;
}) {
  const isDesktop = useIsDesktop();
  const session = useSession();

  /*
   * Who the header names.
   *
   * `user` and `role` arrive from the server as the PORTAL's demo identity —
   * "Aarav Menon, Super Administrator" — which is right for a demo portal and
   * wrong for anyone actually signed in. The session is client-side (the access
   * token lives in memory, deliberately), so the real identity can only be
   * resolved here and the props are the fallback rather than the answer.
   */
  const identity =
    session.status === "user"
      ? { name: session.user.name, role: roleLabelFor(session.user), email: session.user.email }
      : session.status === "master"
        ? { name: session.master.name, role: "Master Administrator", email: session.master.email }
        : { name: user, role, email: undefined };

  /*
   * What the sidebar calls this workspace.
   *
   * `portalName` and `tag` are the DEMO portal's — "Employee 1", fixed at login
   * by which credential row was used and keyed to nothing real. They do not
   * move when someone's role changes, so promoting a developer to manager left
   * the rail still announcing "Portal · Employee 1".
   *
   * For a signed-in account the workspace is the COMPANY and the caption is the
   * person's actual role, both read from /auth/me — so a role change shows up as
   * soon as the session refetches.
   */
  const workspace =
    session.status === "user"
      ? {
          label: "Workspace",
          name: session.user.company.name,
          caption: `${roleLabelFor(session.user)} · ${session.user.empId}`,
        }
      : session.status === "master"
        ? { label: "Portal", name: "Master Portal", caption: "Platform owner" }
        : { label: "Portal", name: portalName, caption: tag };

  /*
   * What the sidebar is allowed to list.
   *
   * The `modules` prop is the DEMO grant map — a per-browser cookie keyed by
   * portal, from before there was a backend. For anyone actually signed in it
   * is not the authority and never was: the API decides, per user, from role
   * defaults plus whatever the super admin granted, and it enforces that on
   * every request. Rendering the cookie's list to a signed-in user is what put
   * modules on screen that the server then refused to let them use.
   *
   * So: signed in, the session's own list wins outright. Signed out, the demo
   * portals keep the cookie exactly as before. While the session is still
   * resolving we list nothing rather than guess — showing a module and taking
   * it away a moment later is worse than a brief empty rail.
   */
  const visibleModules: readonly ModuleSlug[] =
    session.status === "user"
      ? fromApiModuleSlugs(session.user.modules)
      : session.status === "master"
        ? fromApiModuleSlugs(session.master.modules)
        : session.status === "loading"
          ? EMPTY_MODULES
          : modules;

  /*
   * Two independent things, deliberately not merged:
   *   mobileOpen — the overlay drawer on small screens
   *   collapsed  — the desktop rail squeeze
   * The same button drives whichever one applies at the current width.
   */
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const [dark, setDark] = useState(false);
  const [, startTransition] = useTransition();
  const [apiLogout] = useLogoutMutation();

  /**
   * Signing out has to end BOTH sessions: the API's refresh token (so the
   * cookie is revoked server-side and cannot be replayed) and the portal
   * cookie that decides which shell renders. Clearing only the second would
   * leave a live refresh token behind.
   */
  const signOut = () => {
    void apiLogout()
      .unwrap()
      .catch(() => undefined) // a demo portal has no API session to end
      .finally(() => startTransition(() => void logout()));
  };

  // Valex drives the theme from a root data attribute, not a class
  useEffect(() => {
    document.documentElement.setAttribute("data-theme-mode", dark ? "dark" : "light");
  }, [dark]);

  const toggleRail = () => {
    if (!isDesktop) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      const next = !v;
      // Persisted client-side so the server can render the right width on the
      // next load — a readable cookie is enough, it's only a UI preference.
      document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  };

  // On desktop the sidebar is always on screen; on mobile it slides in.
  const visible = isDesktop || mobileOpen;

  return (
    // Two providers on one context, outer first:
    //   StoreProvider    — the local demo store (leads, clients, leave, clock,
    //                      calendar). Unchanged.
    //   ApiStoreProvider — swaps employees, projects, tasks and settings for
    //                      live API data when someone is signed into the
    //                      backend, and is a pass-through when nobody is.
    <StoreProvider currentUser={identity.name} currentPortal={portal}>
      <ApiStoreProvider>
      <div className="min-h-screen">
        <Sidebar
          open={visible}
          onClose={() => setMobileOpen(false)}
          portal={portal}
          workspaceLabel={workspace.label}
          workspaceName={workspace.name}
          caption={workspace.caption}
          modules={visibleModules}
          collapsed={collapsed}
        />

        <div
          className={`transition-[padding] duration-300 ease-out ${
            collapsed ? "lg:pl-rail" : "lg:pl-sidebar"
          }`}
        >
          <Header
            onToggle={toggleRail}
            collapsed={collapsed}
            dark={dark}
            onThemeToggle={() => setDark((v) => !v)}
            portal={portal}
            portalName={workspace.name}
            canSwitchPortal={session.status === "anonymous"}
            user={identity.name}
            role={identity.role}
            email={identity.email}
            onSwitchPortal={(slug) =>
              startTransition(() => {
                const fd = new FormData();
                fd.set("portal", slug);
                void switchPortal(fd);
              })
            }
            onLogout={signOut}
          />
          <main className="px-2">
            <div className="px-2 py-4">
              <BranchBanner />
              {children}
            </div>
          </main>
        </div>
      </div>
      </ApiStoreProvider>
    </StoreProvider>
  );
}
