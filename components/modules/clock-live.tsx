"use client";

/*
 * Attendance, against the real API.
 *
 * The demo portals keep the local-store version in clock.tsx; this is what a
 * signed-in workspace gets. The two are deliberately separate files rather
 * than one component with branches everywhere: the data shapes have nothing in
 * common (a Shift row vs. a ClockEntry), and interleaving them is how the demo
 * path quietly breaks every time the live one changes.
 *
 * "Clocked in" has ONE definition and it lives on the server: a shift row with
 * no `outAt`. Nothing here caches or re-derives it, which is why the button,
 * the counts and the two tabs cannot disagree.
 */

import { useMemo, useState } from "react";
import {
  Coffee,
  Download,
  LogIn,
  LogOut,
  TimerReset,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Grid,
  ModuleSkeleton,
  SearchBox,
  StatTile,
  Td,
  Th,
  Toolbar,
  TableWrap,
  Tr,
  tone,
} from "@/components/ui";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { StatusTag } from "@/components/ui/StatusTag";
import {
  useClockInMutation,
  useClockOutMutation,
  useClockRosterQuery,
  useMyClockQuery,
  useToggleBreakMutation,
} from "@/lib/api/api";
import { useSession } from "@/lib/api/session";
import { toUiRole } from "@/lib/api/adapters";
import { useNow } from "@/lib/use-now";
import { clockTime, formatMinutes, initialsOf } from "@/lib/store/selectors";
import { ClockStatsPanel } from "./clock-stats";
import type { RosterPerson, Shift } from "@/lib/api/types";
import type { Tone } from "@/lib/ui/tone";

/**
 * The viewer's own calendar day.
 *
 * Built from the LOCAL date parts rather than `toISOString().slice(0,10)`,
 * which is the UTC day and is a day out for anyone east of London after
 * mid-evening — they would clock in and the shift would be filed under
 * tomorrow.
 */
function localDay(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Minutes worked so far, recomputed here so an open shift ticks up between
 * polls. `now` is epoch milliseconds — what `useNow` hands back.
 */
function liveMinutes(shift: Shift, now: number): number {
  if (!shift.open) return shift.workedMinutes;
  const gross = Math.max(0, Math.round((now - new Date(shift.inAt).getTime()) / 60_000));
  const running = shift.breakAt
    ? Math.max(0, Math.round((now - new Date(shift.breakAt).getTime()) / 60_000))
    : 0;
  return Math.max(0, gross - shift.breakMinutes - running);
}

export function LiveClock() {
  const session = useSession();
  const isSuperAdmin =
    session.status === "user" && session.user.roles.includes("superAdmin");

  return (
    <div className="space-y-4">
      <OwnClock />
      {/*
        The totals, for everyone — an employee's own hours are not an admin
        surface. The server answers for the caller when no userId is sent.
      */}
      <ClockStatsPanel title="Your hours" />
      {isSuperAdmin && <RosterAttendance />}
    </div>
  );
}

/* ------------------------------------------------------------- own clock -- */

function OwnClock() {
  const { data, isLoading } = useMyClockQuery();
  const [clockIn, inState] = useClockInMutation();
  const [clockOut, outState] = useClockOutMutation();
  const [toggleBreak, breakState] = useToggleBreakMutation();
  const now = useNow();

  const busy = inState.isLoading || outState.isLoading || breakState.isLoading;

  if (isLoading) return <ModuleSkeleton rows={4} />;

  const open = data?.open ?? null;
  const shifts = data?.shifts ?? [];
  const today = open ? liveMinutes(open, now) : 0;

  // The last five recorded days, which is what the three figures underneath
  // describe. Not "this week": a week boundary would make Monday morning read
  // as a person who has done nothing.
  const recent = shifts.slice(0, 5);
  const recentMinutes = recent.reduce((n, s) => n + liveMinutes(s, now), 0);
  const breakMinutes = recent.reduce((n, s) => n + s.breakMinutes, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <Card className="h-full">
          <CardHeader title="Today" desc={new Date().toDateString()} />
          <CardBody className="text-center">
            <p className="font-mono text-[2.5rem] font-bold leading-none text-heading">
              {formatMinutes(today)}
            </p>
            <p className="mt-2 text-[0.8125rem] text-muted">
              {open
                ? open.onBreak
                  ? `On break since ${clockTime(open.breakAt ?? undefined)}`
                  : `Clocked in at ${clockTime(open.inAt)}`
                : "Not clocked in"}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {!open ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clockIn({ date: localDay() })}
                  className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-[0.8125rem] font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn size={15} />
                  Clock In
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleBreak()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-sm py-2.5 text-[0.8125rem] font-semibold transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: tone.orange.soft, color: tone.orange.text }}
                  >
                    <Coffee size={15} />
                    {open.onBreak ? "End break" : "Break"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clockOut()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-sm py-2.5 text-[0.8125rem] font-semibold transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: tone.red.soft, color: tone.red.text }}
                  >
                    <LogOut size={15} />
                    Clock Out
                  </button>
                </>
              )}
            </div>

            {/*
              Deliberately NOT today/week/month: those are in the stats panel
              below, read from the server, and two sets of the same three
              figures computed two different ways is how they come to disagree.
              These are the three the panel does not cover.
            */}
            <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-left">
              {[
                { k: "Last 5 days", v: formatMinutes(recentMinutes) },
                { k: "Breaks", v: formatMinutes(breakMinutes) },
                { k: "Shifts", v: String(shifts.length) },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[0.6875rem] text-muted">{s.k}</dt>
                  <dd className="mt-0.5 text-[0.875rem] font-bold text-heading">{s.v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="lg:col-span-8">
        <Card className="h-full">
          <CardHeader
            title="Your timesheet"
            desc="Every shift recorded against you, newest first."
            action={
              <Button variant="ghost" icon={Download}>
                Export
              </Button>
            }
          />
          {shifts.length === 0 ? (
            <EmptyState
              icon={TimerReset}
              title="No shifts yet"
              desc="Clock in and the day appears here."
            />
          ) : (
            <TableWrap>
              <thead>
                <tr className="border-b border-line">
                  <Th>Date</Th>
                  <Th>In</Th>
                  <Th>Out</Th>
                  <Th>Break</Th>
                  <Th>Worked</Th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <Tr key={s.id}>
                    <Td className="whitespace-nowrap font-medium text-heading">{s.date}</Td>
                    <Td className="whitespace-nowrap text-muted">{clockTime(s.inAt)}</Td>
                    <Td className="whitespace-nowrap text-muted">
                      {s.outAt ? clockTime(s.outAt) : <OpenPill />}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatMinutes(s.breakMinutes)}
                    </Td>
                    <Td className="whitespace-nowrap font-semibold text-heading">
                      {formatMinutes(liveMinutes(s, now))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
}

function OpenPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[0.1875rem] text-[0.6875rem] font-semibold"
      style={{ background: tone.green.soft, color: tone.green.text }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: tone.green.solid }}
      />
      Still in
    </span>
  );
}

/* ---------------------------------------------------------------- roster -- */

type Tab = "in" | "out";

/**
 * Who is in and who is out, as two tabs.
 *
 * "Out" covers both "finished for the day" and "never started": from this side
 * they are the same question — who is not working right now — and the row says
 * which it is rather than making it a third tab nobody would click.
 */
function RosterAttendance() {
  const [tab, setTab] = useState<Tab>("in");
  const [query, setQuery] = useState("");
  const date = localDay();

  /*
   * Polled, because the whole point of this screen is that it is current.
   * Somebody else clocking in raises no mutation in this tab, so without a
   * poll an admin watching the board sees the state it had when they opened
   * it.
   */
  const { data, isLoading } = useClockRosterQuery(
    { date, q: query.trim() || undefined },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  );
  const now = useNow();

  const people = useMemo(() => (tab === "in" ? data?.in ?? [] : data?.out ?? []), [data, tab]);
  const counts = data?.counts;

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Clocked In"
          value={String(counts?.in ?? 0)}
          hint={`of ${counts?.total ?? 0} on the roster`}
          t="green"
          icon={UserCheck}
        />
        <StatTile
          label="On Break"
          value={String(counts?.onBreak ?? 0)}
          hint="Clocked in, stepped away"
          t="orange"
          icon={Coffee}
        />
        <StatTile
          label="Clocked Out"
          value={String(counts?.finished ?? 0)}
          hint="Worked today and finished"
          t="blue"
          icon={UserX}
        />
        <StatTile
          label="Not Started"
          value={String(counts?.notStarted ?? 0)}
          hint="No shift recorded today"
          t="slate"
          icon={TimerReset}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Attendance — everyone"
          desc={`Live for ${date}. Clocked in means a shift with no clock-out.`}
          action={
            <Toolbar>
              <SearchBox
                placeholder="Search people…"
                value={query}
                onChange={setQuery}
                className="sm:w-52"
              />
            </Toolbar>
          }
        />

        {/*
          Tabs rather than chips: these two lists are mutually exclusive views
          of the same roster, which is what a tab means. A chip row would read
          as filters that could be combined.
        */}
        <div
          role="tablist"
          aria-label="Attendance"
          className="flex gap-1 border-b border-line px-4 pt-1 sm:px-5"
        >
          <TabButton
            active={tab === "in"}
            onClick={() => setTab("in")}
            count={counts?.in}
            t="green"
            icon={UserCheck}
          >
            Clocked in
          </TabButton>
          <TabButton
            active={tab === "out"}
            onClick={() => setTab("out")}
            count={counts?.out}
            t="slate"
            icon={UserX}
          >
            Clocked out
          </TabButton>
        </div>

        {isLoading ? (
          <ModuleSkeleton rows={5} stats={false} />
        ) : people.length === 0 ? (
          <EmptyState
            icon={Users}
            title={tab === "in" ? "Nobody is clocked in" : "Everyone is clocked in"}
            desc={
              tab === "in"
                ? "Nobody on the roster has an open shift right now."
                : "Every person on the roster has an open shift."
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Branch</Th>
                <Th>Status</Th>
                <Th>Clock in</Th>
                <Th>Clock out</Th>
                <Th>Worked</Th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <RosterRow key={p.id} person={p} now={now} today={date} />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
  count,
  t,
  icon: Icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  t: Tone;
  icon: typeof UserCheck;
}) {
  const c = tone[t];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      /* The active tab sits ON the border it shares with the table, so the
         panel below reads as belonging to it rather than as a separate box. */
      className={`-mb-px flex items-center gap-2 rounded-t-sm border-b-2 px-3 py-2.5 text-[0.8125rem] font-semibold transition-colors ${
        active ? "text-heading" : "border-transparent text-muted hover:text-heading"
      }`}
      style={active ? { borderColor: c.solid } : undefined}
    >
      <Icon size={15} style={active ? { color: c.solid } : undefined} />
      {children}
      {count !== undefined && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none"
          style={
            active
              ? { background: c.soft, color: c.text }
              : { background: "var(--default-background)", color: "inherit" }
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

function RosterRow({
  person,
  now,
  today,
}: {
  person: RosterPerson;
  now: number;
  today: string;
}) {
  const shift = person.shift;
  // Finished today vs. never started — the one distinction the "out" tab
  // collapses, restored here in the row where it belongs.
  const neverStarted = !person.clockedIn && shift?.date !== today;

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2.5">
          <PersonAvatar
            name={person.name}
            initials={initialsOf(person.name)}
            avatar={person.avatar}
            t={person.tone as Tone}
            size={34}
            presence={person.presence}
          />
          <span className="min-w-0">
            <span className="block whitespace-nowrap font-semibold text-heading">
              {person.name}
            </span>
            <span className="block truncate font-mono text-[0.6875rem] text-muted">
              {person.empId}
            </span>
          </span>
        </div>
      </Td>
      <Td className="whitespace-nowrap text-muted">{toUiRole(person.roles)}</Td>
      <Td className="whitespace-nowrap text-muted">{person.branch ?? "—"}</Td>
      <Td>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusTag
            status={person.status}
            workStatus={person.currentStatus}
            presence={person.presence}
          />
          {person.onBreak && <StatusTag workStatus="break" />}
        </div>
      </Td>
      <Td className="whitespace-nowrap text-muted">
        {shift && !neverStarted ? clockTime(shift.inAt) : "—"}
      </Td>
      <Td className="whitespace-nowrap text-muted">
        {person.clockedIn ? (
          <OpenPill />
        ) : shift && !neverStarted && shift.outAt ? (
          clockTime(shift.outAt)
        ) : (
          <span className="text-[0.75rem] text-muted">Not started</span>
        )}
      </Td>
      <Td className="whitespace-nowrap font-semibold text-heading">
        {shift && !neverStarted ? formatMinutes(liveMinutes(shift, now)) : "—"}
      </Td>
    </Tr>
  );
}

export default LiveClock;
