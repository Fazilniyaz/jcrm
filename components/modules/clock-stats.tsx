"use client";

/*
 * Hours worked, and how consistently.
 *
 * One component for two places, which is the point: an employee reads it about
 * themselves on the Clock page, and a super admin reads it about someone else
 * in the Playground panel. Both render the same payload from the same endpoint
 * (/clock/stats, which allows ?userId only for a super admin), so the two can
 * never disagree about what a month came to.
 *
 * CONSISTENCY deserves a word, because it is not "days present over weekdays".
 * The denominator is days the COMPANY was open, counted from attendance —
 * nothing in the data says which days this company works, and assuming
 * Monday-to-Friday would read a six-day week as 120% and a four-day week as
 * chronically absent. A public holiday simply never becomes an expected day.
 */

import { Activity, CalendarRange, Clock3, Flame } from "lucide-react";
import { Card, CardBody, CardHeader, Progress, tone } from "@/components/ui";
import { useClockStatsQuery } from "@/lib/api/api";
import { formatMinutes } from "@/lib/store/selectors";
import type { ClockStats } from "@/lib/api/types";
import type { Tone } from "@/lib/ui/tone";

/**
 * The viewer's own calendar day — the same local-parts build as the clock
 * module, not `toISOString()`, which is the UTC day and a day out for anyone
 * east of London after mid-evening.
 */
export function localDay(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Green above four fifths, amber in the middle, red when it is a problem. */
function consistencyTone(pct: number): Tone {
  if (pct >= 80) return "green";
  if (pct >= 55) return "orange";
  return "red";
}

export function ClockStatsPanel({
  userId,
  title = "Hours",
  desc,
}: {
  /** Omitted reads your own; anyone else is super admin only, per the API. */
  userId?: string;
  title?: string;
  desc?: string;
}) {
  const { data, isLoading, isError } = useClockStatsQuery({ date: localDay(), userId });

  return (
    <Card>
      <CardHeader
        title={title}
        desc={desc ?? "Today, this week and this month, with how steady the attendance is."}
      />
      <CardBody>
        {isLoading ? (
          <div className="h-28 animate-pulse rounded-sm bg-light" />
        ) : isError || !data ? (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            Those hours couldn&rsquo;t be loaded.
          </p>
        ) : (
          <StatsBody stats={data} />
        )}
      </CardBody>
    </Card>
  );
}

/** The figures on their own, for a panel that brings its own frame. */
export function ClockStatsBody({ userId }: { userId?: string }) {
  const { data, isLoading, isError } = useClockStatsQuery({ date: localDay(), userId });

  if (isLoading) return <div className="h-24 animate-pulse rounded-sm bg-light" />;
  if (isError || !data) {
    return <p className="text-[0.75rem] text-muted">Hours couldn&rsquo;t be loaded.</p>;
  }
  return <StatsBody stats={data} />;
}

function StatsBody({ stats }: { stats: ClockStats }) {
  const pct = stats.consistency ?? 0;
  const t = consistencyTone(pct);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-2">
        <Figure icon={Clock3} label="Today" value={formatMinutes(stats.todayMinutes)} t="blue" />
        <Figure
          icon={CalendarRange}
          label="This week"
          value={formatMinutes(stats.weekMinutes)}
          t="purple"
        />
        <Figure
          icon={Activity}
          label="This month"
          value={formatMinutes(stats.monthMinutes)}
          t="sky"
        />
      </dl>

      <div className="rounded-sm border border-line p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
              Consistency
            </p>
            <p className="text-[0.75rem] text-muted">
              {stats.consistency === null
                ? "No attendance to compare with yet."
                : `${stats.daysPresent} of ${stats.daysExpected} days the office was open`}
            </p>
          </div>
          <p className="shrink-0 font-mono text-[1.375rem] font-bold leading-none" style={{ color: tone[t].text }}>
            {stats.consistency === null ? "—" : `${pct}%`}
          </p>
        </div>
        <div className="mt-2">
          <Progress value={pct} t={t} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-2.5">
          <span className="flex items-center gap-1.5 text-[0.75rem] text-muted">
            <Flame size={13} style={{ color: tone.orange.solid }} />
            <span className="font-semibold text-heading">{stats.streak}</span>
            day{stats.streak === 1 ? "" : "s"} in a row
          </span>
          <span className="text-[0.75rem] text-muted">
            Average day{" "}
            <span className="font-semibold text-heading">
              {formatMinutes(stats.averageMinutes)}
            </span>
          </span>
        </div>
      </div>

      {stats.days.length > 0 && <MonthStrip stats={stats} />}
    </div>
  );
}

/**
 * The month to date, one bar per open day.
 *
 * Heights are relative to the longest day rather than to a fixed eight-hour
 * target: the product never asks anyone to declare their hours, so a bar drawn
 * against an assumed workday would be inventing the benchmark it measures.
 * An absent day is a flat line, which is the thing worth seeing at a glance.
 */
function MonthStrip({ stats }: { stats: ClockStats }) {
  const peak = Math.max(...stats.days.map((d) => d.minutes), 1);

  return (
    <div>
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
        This month, day by day
      </p>
      <div className="flex h-12 items-end gap-[3px]">
        {stats.days.map((d) => (
          <span
            key={d.date}
            title={`${d.date} — ${d.present ? formatMinutes(d.minutes) : "absent"}`}
            className="min-w-0 flex-1 rounded-t-[2px] transition-[height]"
            style={{
              height: d.present ? `${Math.max(8, (d.minutes / peak) * 100)}%` : "3px",
              background: d.present ? tone.blue.solid : "var(--color-line)",
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.625rem] text-muted">
        <span>{stats.days[0]?.date.slice(8)}</span>
        <span>{stats.days[stats.days.length - 1]?.date.slice(8)}</span>
      </div>
    </div>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  t,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  t: Tone;
}) {
  return (
    <div className="rounded-sm border border-line p-2.5">
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-muted">
        <Icon size={13} style={{ color: tone[t].solid }} />
        {label}
      </dt>
      <dd className="mt-1 font-mono text-[1.0625rem] font-bold text-heading">{value}</dd>
    </div>
  );
}

export default ClockStatsPanel;
