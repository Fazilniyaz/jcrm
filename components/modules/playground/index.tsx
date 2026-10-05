"use client";

/*
 * "Your Playground" — the whole office on one floor.
 *
 * Super-admin territory: the API guards `/playground` with the module, and no
 * role carries it by default, so anyone else gets a 403 and the empty state
 * below rather than a half-drawn scene.
 *
 * The WebGL floor is the headline, but it is deliberately NOT the only way to
 * read this screen. Every person the canvas draws is also a real row in the
 * list beneath it — focusable, searchable, readable by a screen reader — so
 * the module degrades to something useful when WebGL is unavailable, when
 * someone is on a keyboard, or when reduced motion is on.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Orbit, Search, Users, Gauge, FolderKanban, X } from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Grid,
  ModuleSkeleton,
  Progress,
  StatTile,
  tone,
} from "@/components/ui";
import { usePlaygroundQuery } from "@/lib/api/api";
import { useSession } from "@/lib/api/session";
import { toUiRole } from "@/lib/api/adapters";
import type { PlaygroundPerson } from "@/lib/api/types";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import type { Tone } from "@/lib/ui/tone";
import type { ScenePerson } from "./Scene";

/*
 * The canvas is client-only. `ssr: false` matters for more than hydration:
 * three.js reaches for `window` and a WebGL context at module scope, so
 * rendering it on the server throws rather than degrading.
 */
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-card bg-subtle" />,
});

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** The API's tone names are the same vocabulary the UI kit uses. */
function toneOf(value: string): Tone {
  return (value in tone ? value : "blue") as Tone;
}

/** Resolve a CSS custom property to a real colour the canvas can use. */
function resolved(cssColour: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = cssColour;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out || fallback;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function Playground() {
  const session = useSession();
  const signedIn = session.status === "user";

  const { data, isLoading, isError } = usePlaygroundQuery(undefined, { skip: !signedIn });
  const reduced = usePrefersReducedMotion();

  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "kra" | "load">("name");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  /*
   * The entrance, with GSAP.
   *
   * Imported dynamically so the animation library is not in the bundle of
   * every other module, and skipped entirely under reduced motion — a person
   * who asked their system for less motion should not get a staged reveal.
   */
  useEffect(() => {
    if (reduced || !data) return;
    let cancelled = false;
    let ctx: { revert: () => void } | undefined;

    void import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        gsap.from(headerRef.current, { y: -14, opacity: 0, duration: 0.5, ease: "power3.out" });
        gsap.from(stageRef.current, {
          opacity: 0,
          scale: 0.97,
          duration: 0.8,
          delay: 0.1,
          ease: "power3.out",
        });
      });
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [reduced, data]);

  // Escape clears the focused person, matching the click-away on the canvas.
  useEffect(() => {
    if (!focusedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusedId]);

  const people = useMemo(() => {
    const all = data?.people ?? [];
    const term = query.trim().toLowerCase();

    const filtered = all.filter((p) => {
      if (branch !== "all" && p.branch !== branch) return false;
      if (role !== "all" && !p.roles.includes(role as PlaygroundPerson["roles"][number])) {
        return false;
      }
      if (!term) return true;
      // Search the things someone actually types: a name, an id, an email, or
      // the project they half-remember this person being on.
      return (
        `${p.name} ${p.empId} ${p.email} ${p.branch ?? ""}`.toLowerCase().includes(term) ||
        p.projects.some((pr) => `${pr.name} ${pr.code ?? ""}`.toLowerCase().includes(term))
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "kra") return b.kra - a.kra;
      if (sort === "load") return b.openTasks - a.openTasks;
      return a.name.localeCompare(b.name);
    });
  }, [data, query, branch, role, sort]);

  /* Colours are resolved once, here, and handed to the canvas as rgb strings. */
  const scenePeople: ScenePerson[] = useMemo(
    () =>
      people.map((p) => {
        const t = tone[toneOf(p.tone)];
        return {
          id: p.id,
          name: p.name,
          initials: initialsOf(p.name),
          role: toUiRole(p.roles),
          kra: p.kra,
          colour: resolved(t.solid, "#2b7cb5"),
          onColour: resolved(t.onSolid, "#ffffff"),
          busy: p.presence === "online",
        };
      }),
    [people],
  );

  const focused = people.find((p) => p.id === focusedId) ?? null;

  if (!signedIn) {
    return (
      <Card>
        <EmptyState
          icon={Orbit}
          title="Sign in to open the Playground"
          desc="The floor is drawn from live employee records, so it needs an account on the API. The demo portals have no roster behind them."
        />
      </Card>
    );
  }

  if (isLoading) return <ModuleSkeleton rows={6} />;

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={Orbit}
          title="The Playground isn't available for your account"
          desc="It is a super-admin module. Ask a super admin to grant it if you need it."
        />
      </Card>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-4">
      <div ref={headerRef}>
        <Grid cols={3}>
          <StatTile
            label="On the floor"
            value={String(stats?.total ?? 0)}
            hint={`${people.length} shown`}
            t="primary"
            icon={Users}
          />
          <StatTile
            label="Average KRA"
            value={`${stats?.avgKra ?? 0}`}
            hint="Across everyone not disabled"
            t="sky"
            icon={Gauge}
          />
          <StatTile
            label="Branches"
            value={String(stats?.branches.length ?? 0)}
            hint={stats?.branches.slice(0, 2).join(", ") || "None recorded"}
            t="purple"
            icon={FolderKanban}
          />
        </Grid>
      </div>

      {/* ---- controls ---- */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, id, email or project…"
              aria-label="Search the roster"
              className="h-9 w-full rounded-card border border-input-border bg-form-bg pl-9 pr-3 text-[0.8125rem] text-heading outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.14)]"
            />
          </div>

          <Picker label="Branch" value={branch} onChange={setBranch} options={stats?.branches ?? []} />
          <Picker
            label="Role"
            value={role}
            onChange={setRole}
            options={stats?.roles ?? []}
            format={(r) => toUiRole([r as PlaygroundPerson["roles"][number]])}
          />

          <label className="ms-auto flex items-center gap-1.5 text-[0.75rem] text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="h-9 rounded-card border border-input-border bg-form-bg px-2 text-[0.8125rem] text-heading outline-none focus:border-primary"
            >
              <option value="name">Name</option>
              <option value="kra">KRA, highest first</option>
              <option value="load">Open work, most first</option>
            </select>
          </label>
        </CardBody>
      </Card>

      {/* ---- the floor ---- */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Card className="overflow-hidden">
            <div
              ref={stageRef}
              className="relative h-[clamp(20rem,52vh,34rem)] w-full"
              style={{
                background:
                  "radial-gradient(120% 90% at 50% 0%, var(--primary-soft) 0%, transparent 70%)",
              }}
            >
              {people.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <p className="text-[0.875rem] text-muted">
                    Nobody matches that. Clear the search or widen the filters.
                  </p>
                </div>
              ) : (
                <Scene
                  people={scenePeople}
                  focusedId={focusedId}
                  onFocus={setFocusedId}
                  reduced={reduced}
                />
              )}

              {focused && (
                <button
                  type="button"
                  onClick={() => setFocusedId(null)}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-card border border-line bg-card text-muted transition-colors hover:text-heading"
                  aria-label="Clear focus"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </Card>
        </div>

        {/* ---- the person ---- */}
        <div className="xl:col-span-4">
          {focused ? (
            <PersonDetail person={focused} />
          ) : (
            <Card className="h-full">
              <CardHeader title="Pick someone" desc="Click a tile on the floor, or a row below." />
              <CardBody>
                <p className="text-[0.8125rem] leading-relaxed text-muted">
                  The floor shows everyone at once: the bar across each tile is their KRA, and a
                  dot in the corner means they are on assigned work right now.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* ---- the same roster, as real rows ---- */}
      <Card>
        <CardHeader
          title="Everyone"
          desc="The same people the floor draws — searchable, and readable without WebGL."
        />
        <CardBody className="pt-0">
          <ul className="divide-y divide-(--default-border)">
            {people.map((p) => {
              const t = toneOf(p.tone);
              const on = p.id === focusedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setFocusedId(on ? null : p.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-hover ${
                      on ? "bg-hover" : ""
                    }`}
                  >
                    <PersonAvatar
                      name={p.name}
                      initials={initialsOf(p.name)}
                      avatar={p.avatar}
                      t={t}
                      size={34}
                      presence={p.presence}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold text-heading">
                        {p.name}
                      </span>
                      <span className="block truncate text-[0.6875rem] text-muted">
                        {p.status?.text ? (
                          <>
                            {p.status.emoji ? `${p.status.emoji} ` : ""}
                            {p.status.text}
                          </>
                        ) : (
                          <>
                            {toUiRole(p.roles)}
                            {p.branch ? ` · ${p.branch}` : ""} · {p.empId}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="hidden w-28 shrink-0 sm:block">
                      <Progress value={p.kra} t={p.kra >= 70 ? "sky" : p.kra >= 40 ? "orange" : "red"} />
                      <span className="mt-1 block text-end text-[0.625rem] text-muted">
                        KRA {p.kra}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-end text-[0.6875rem] text-muted md:block">
                      {p.openTasks} open · {p.projects.length} projects
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- controls -- */

function Picker({
  label,
  value,
  onChange,
  options,
  format = (v: string) => v,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  format?: (v: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <label className="flex items-center gap-1.5 text-[0.75rem] text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-card border border-input-border bg-form-bg px-2 text-[0.8125rem] text-heading outline-none focus:border-primary"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/* --------------------------------------------------------------- detail -- */

function PersonDetail({ person }: { person: PlaygroundPerson }) {
  const t = toneOf(person.tone);
  return (
    <Card className="h-full">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <PersonAvatar
            name={person.name}
            initials={initialsOf(person.name)}
            avatar={person.avatar}
            t={t}
            size={52}
            presence={person.presence}
          />
          <div className="min-w-0">
            <p className="truncate text-[1rem] font-semibold text-heading">{person.name}</p>
            <p className="truncate text-[0.75rem] text-muted">
              {toUiRole(person.roles)} · {person.empId}
            </p>
            {person.status?.text && (
              <p className="mt-0.5 truncate text-[0.75rem] text-heading">
                {person.status.emoji ? `${person.status.emoji} ` : ""}
                {person.status.text}
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
              KRA score
            </span>
            <span className="text-[0.8125rem] font-bold text-heading">{person.kra} / 100</span>
          </div>
          <div className="mt-1.5">
            <Progress
              value={person.kra}
              t={person.kra >= 70 ? "sky" : person.kra >= 40 ? "orange" : "red"}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Open" value={person.openTasks} />
          <Stat label="Done" value={person.doneTasks} />
          <Stat label="Projects" value={person.projects.length} />
        </div>

        <div>
          <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
            Contributed projects
          </p>
          {person.projects.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Not on any project yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {person.projects.map((pr) => (
                <li
                  key={pr.id}
                  className="flex items-center justify-between gap-2 rounded-card bg-subtle px-2.5 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.75rem] font-medium text-heading">
                      {pr.name}
                    </span>
                    {pr.code && (
                      <span className="block truncate font-mono text-[0.625rem] text-muted">
                        {pr.code}
                      </span>
                    )}
                  </span>
                  <Badge t={pr.role === "manager" ? "purple" : "slate"}>{pr.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1 border-t border-line pt-3 text-[0.6875rem] text-muted">
          <p className="truncate">{person.email}</p>
          {person.branch && <p>{person.branch}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-subtle py-2">
      <p className="text-[1.125rem] font-bold leading-none text-heading">{value}</p>
      <p className="mt-1 text-[0.625rem] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

export default Playground;
