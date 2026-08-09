"use client";

import { Fragment, useMemo, useState } from "react";
import {
  LogIn,
  LogOut,
  Coffee,
  ChevronRight,
  Users,
  Clock3,
  CalendarOff,
  TimerReset,
  Download,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Avatar,
  Progress,
  StatTile,
  TableWrap,
  Th,
  Td,
  Tr,
  ExpandRow,
  Toolbar,
  Button,
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  tone,
} from "@/components/ui";
import { useStore } from "@/lib/store/StoreProvider";
import { useNow } from "@/lib/use-now";
import {
  clockFor,
  clockTime,
  formatDate,
  formatMinutes,
  initialsOf,
  latestShifts,
  openShift,
  shiftMinutes,
} from "@/lib/store/selectors";
import {
  CLOCK_STATUS_TONE,
  EMPLOYEE_STATUS_TONE,
  EMPLOYEE_ROLES,
  ROLE_TONE,
  STANDARD_DAY_MINUTES,
  type ClockEntry,
  type Employee,
  type EmployeeRole,
} from "@/lib/store/types";

/*
 * Clock.
 *
 * Two views from one module. Everyone gets their own attendance — clock in,
 * clock out, and the week behind them. An admin portal additionally gets the
 * whole roster: who is in right now, who has not started, and each person's
 * history behind their row.
 *
 * Times render from the stored instant in the viewer's timezone, the same way
 * the leave notice does.
 */

export function Clock() {
  const { hydrated, currentEmployee, currentPortal, currentUser } = useStore();
  const isAdmin = currentPortal === "master-portal" || currentPortal === "super-admin";

  if (!hydrated) return <ModuleSkeleton rows={6} />;

  return (
    <div className="space-y-4">
      {currentEmployee && <OwnClock employee={currentEmployee} />}

      {isAdmin && <RosterAttendance />}

      {!currentEmployee && !isAdmin && (
        <Card>
          <EmptyState
            icon={Clock3}
            title="No attendance for this portal"
            desc={`${currentUser} isn't on the employee roster, so there are no shifts to record.`}
          />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- own clock -- */

function OwnClock({ employee }: { employee: Employee }) {
  const { state, clockIn, clockOut, toggleBreak } = useStore();
  const entries = clockFor(state, employee.id);
  const open = openShift(state, employee.id);
  const onLeave = employee.status === "Leave";
  const onBreak = employee.status === "Break";

  // Ticks every 30s so an open shift counts up on its own.
  const now = useNow();
  const todayMinutes = open ? shiftMinutes(open, now) : 0;

  const weekMinutes = entries
    .slice(0, 5)
    .reduce((n, e) => n + shiftMinutes(e, now), 0);
  const breakMinutes = entries.slice(0, 5).reduce((n, e) => n + e.breakMinutes, 0);
  const overtime = entries
    .slice(0, 5)
    .reduce((n, e) => n + Math.max(0, shiftMinutes(e, now) - STANDARD_DAY_MINUTES), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <Card className="h-full">
          <CardHeader title="Today" desc={formatDate(new Date().toISOString().slice(0, 10))} />
          <CardBody className="text-center">
            <p className="font-mono text-[2.5rem] font-bold leading-none text-heading">
              {formatMinutes(todayMinutes)}
            </p>
            <p className="mt-2 text-[0.8125rem] text-muted">
              {onLeave
                ? "You are on leave today"
                : open
                  ? `Clocked in at ${clockTime(open.inAt)}`
                  : "Not clocked in"}
            </p>

            <div className="mt-3 flex justify-center">
              <Badge t={EMPLOYEE_STATUS_TONE[employee.status]}>{employee.status}</Badge>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {!open ? (
                <button
                  type="button"
                  disabled={onLeave}
                  onClick={() => clockIn(employee.id)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-[0.8125rem] font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn size={15} />
                  Clock In
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => toggleBreak(employee.id, 15)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-sm py-2.5 text-[0.8125rem] font-semibold transition-[filter] hover:brightness-110"
                    style={{ background: tone.orange.soft, color: tone.orange.text }}
                  >
                    <Coffee size={15} />
                    {onBreak ? "End break" : "Break"}
                  </button>
                  <button
                    type="button"
                    onClick={() => clockOut(employee.id)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-sm py-2.5 text-[0.8125rem] font-semibold transition-[filter] hover:brightness-110"
                    style={{ background: tone.red.soft, color: tone.red.text }}
                  >
                    <LogOut size={15} />
                    Clock Out
                  </button>
                </>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-left">
              {[
                { k: "Last 5 days", v: formatMinutes(weekMinutes) },
                { k: "Overtime", v: formatMinutes(overtime) },
                { k: "Breaks", v: formatMinutes(breakMinutes) },
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
          {entries.length === 0 ? (
            <EmptyState
              icon={TimerReset}
              title="No shifts yet"
              desc="Clock in and the day appears here."
            />
          ) : (
            <ShiftTable entries={entries} now={now} />
          )}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- roster -- */

/**
 * The admin view: everyone's attendance in one place.
 *
 * Ordered so the people who need attention surface first — still clocked in,
 * then not started, then done for the day.
 */
function RosterAttendance() {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<EmployeeRole | "All">("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const now = useNow();
  const rows = useMemo(() => latestShifts(state), [state]);

  const counts = useMemo(() => {
    const inNow = rows.filter((r) => r.entry && !r.entry.outAt).length;
    return {
      total: rows.length,
      inNow,
      onLeave: rows.filter((r) => r.employee.status === "Leave").length,
      notStarted: rows.filter(
        (r) => r.employee.status !== "Leave" && (!r.entry || r.entry.date !== todayKey()),
      ).length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(({ employee }) => {
        if (role !== "All" && employee.role !== role) return false;
        if (!q) return true;
        return `${employee.name} ${employee.empId} ${employee.branch} ${employee.role}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const rank = (r: typeof a) =>
          r.entry && !r.entry.outAt ? 0 : r.employee.status === "Leave" ? 2 : 1;
        return rank(a) - rank(b) || a.employee.name.localeCompare(b.employee.name);
      });
  }, [rows, query, role]);

  const byRole = useMemo(
    () =>
      Object.fromEntries(
        EMPLOYEE_ROLES.map((r) => [r, rows.filter((x) => x.employee.role === r).length]),
      ) as Record<EmployeeRole, number>,
    [rows],
  );

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Clocked In Now"
          value={String(counts.inNow)}
          hint={`of ${counts.total} on the roster`}
          t="blue"
          icon={Clock3}
        />
        <StatTile
          label="Not Started"
          value={String(counts.notStarted)}
          hint="No shift recorded today"
          t="orange"
          icon={TimerReset}
        />
        <StatTile
          label="On Leave"
          value={String(counts.onLeave)}
          hint="Not expected in"
          t="slate"
          icon={CalendarOff}
        />
        <StatTile
          label="Roster"
          value={String(counts.total)}
          hint="Everyone in scope"
          t="sky"
          icon={Users}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Attendance — everyone"
          desc="Select a person to see every shift they have recorded."
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

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Chip active={role === "All"} onClick={() => setRole("All")} count={counts.total}>
            Everyone
          </Chip>
          {EMPLOYEE_ROLES.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(r)} count={byRole[r]}>
              {r}
            </Chip>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={Users} title="Nobody matches" desc="Try a different search or role." />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Branch</Th>
                <Th>Last shift</Th>
                <Th>Clock in</Th>
                <Th>Clock out</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ employee, entry }) => {
                const expanded = openId === employee.id;
                const onLeave = employee.status === "Leave";
                const live = Boolean(entry && !entry.outAt);

                return (
                  <Fragment key={employee.id}>
                    <Tr
                      expanded={expanded}
                      onClick={() => setOpenId(expanded ? null : employee.id)}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={
                              expanded ? `Collapse ${employee.name}` : `Expand ${employee.name}`
                            }
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <Avatar
                            initials={initialsOf(employee.name)}
                            t={employee.tone}
                            size={34}
                          />
                          <span className="min-w-0">
                            {/* Someone on leave is greyed wherever they are
                                listed, so a gap in the day reads as expected
                                rather than as a missing shift. */}
                            <span
                              className={`block whitespace-nowrap font-semibold ${
                                onLeave ? "text-muted line-through" : "text-heading"
                              }`}
                            >
                              {employee.name}
                            </span>
                            <span className="font-mono text-[0.6875rem] text-muted">
                              {employee.empId}
                            </span>
                          </span>
                          {live && (
                            <span
                              className="ms-1 h-2 w-2 shrink-0 animate-pulse rounded-full"
                              style={{ background: tone.blue.solid }}
                              aria-label="Currently clocked in"
                            />
                          )}
                        </div>
                      </Td>
                      <Td>
                        <Badge t={ROLE_TONE[employee.role]}>{employee.role}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{employee.branch}</Td>
                      <Td className="whitespace-nowrap text-muted">
                        {entry ? formatDate(entry.date) : "—"}
                      </Td>
                      <Td className="font-mono text-[0.75rem]">{clockTime(entry?.inAt)}</Td>
                      <Td className="font-mono text-[0.75rem]">
                        {entry?.outAt ? clockTime(entry.outAt) : entry ? "still in" : "—"}
                      </Td>
                      <Td className="whitespace-nowrap font-semibold text-heading">
                        {entry ? formatMinutes(shiftMinutes(entry, now)) : "—"}
                      </Td>
                      <Td>
                        <Badge t={EMPLOYEE_STATUS_TONE[employee.status]}>{employee.status}</Badge>
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <PersonHistory employee={employee} now={now} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------------------------------------------- history -- */

function PersonHistory({ employee, now }: { employee: Employee; now: number }) {
  const { state } = useStore();
  const entries = clockFor(state, employee.id);
  const total = entries.reduce((n, e) => n + shiftMinutes(e, now), 0);
  const average = entries.length ? Math.round(total / entries.length) : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <div className="flex items-center gap-3 rounded-sm border border-line bg-card p-3">
          <Avatar initials={initialsOf(employee.name)} t={employee.tone} size={40} />
          <div className="min-w-0">
            <p
              className={`truncate text-[0.875rem] font-semibold ${
                employee.status === "Leave" ? "text-muted line-through" : "text-heading"
              }`}
            >
              {employee.name}
            </p>
            <p className="truncate text-[0.75rem] text-muted">
              {employee.role} · {employee.branch}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { k: "Shifts", v: String(entries.length) },
            { k: "Total", v: formatMinutes(total) },
            { k: "Average", v: formatMinutes(average) },
          ].map((s) => (
            <div key={s.k} className="rounded-sm border border-line bg-card p-3 text-center">
              <p className="text-[0.9375rem] font-bold leading-none text-heading">{s.v}</p>
              <p className="mt-1 text-[0.6875rem] text-muted">{s.k}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="xl:col-span-8">
        <SectionLabel>Shift history ({entries.length})</SectionLabel>
        {entries.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">
            No shifts recorded.
          </p>
        ) : (
          <div className="rounded-sm border border-line bg-card">
            <ShiftTable entries={entries} now={now} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- table -- */

function ShiftTable({ entries, now }: { entries: ClockEntry[]; now: number }) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b border-line">
          <Th>Day</Th>
          <Th>Clock in</Th>
          <Th>Clock out</Th>
          <Th>Break</Th>
          <Th>Hours</Th>
          <Th className="w-32">Against 8h</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const worked = shiftMinutes(e, now);
          return (
            <Tr key={e.id}>
              <Td className="whitespace-nowrap font-medium text-heading">{formatDate(e.date)}</Td>
              <Td className="font-mono text-[0.75rem]">{clockTime(e.inAt)}</Td>
              <Td className="font-mono text-[0.75rem]">
                {e.outAt ? clockTime(e.outAt) : <span className="text-muted">still in</span>}
              </Td>
              <Td className="whitespace-nowrap text-muted">{e.breakMinutes}m</Td>
              <Td className="whitespace-nowrap font-semibold text-heading">
                {formatMinutes(worked)}
              </Td>
              <Td>
                <Progress
                  value={(worked / STANDARD_DAY_MINUTES) * 100}
                  t={CLOCK_STATUS_TONE[e.status]}
                />
              </Td>
              <Td>
                <Badge t={CLOCK_STATUS_TONE[e.status]}>{e.status}</Badge>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}
