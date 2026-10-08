"use client";

/*
 * Daily reports.
 *
 * Two readings of one table, as tabs rather than two modules: an employee
 * writes up a day and watches the stars accumulate against those days; a super
 * admin reads a day across the whole company and rates it out of five. A super
 * admin is also somebody who worked today, so they get both tabs.
 *
 * The day is the unit. One report per person per date, enforced by the API, so
 * saving twice revises rather than duplicates — and the editor here is bound to
 * a date you pick rather than to "now", because reports get written the
 * following morning more often than anyone admits.
 */

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Save,
  Sparkles,
  Star,
  UserX,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  EmptyState,
  Grid,
  ModuleSkeleton,
  SearchBox,
  StatTile,
  tone,
} from "@/components/ui";
import { TextInput } from "@/components/ui/form";
import { RichTextEditor } from "@/components/ui/RichTextEditorLazy";
import { RichTextView, hasRichText } from "@/components/ui/RichText";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import {
  useRateReportMutation,
  useReportDayQuery,
  useReportHistoryQuery,
  useSaveMyReportMutation,
} from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { useSession } from "@/lib/api/session";
import { toUiRole } from "@/lib/api/adapters";
import { initialsOf } from "@/lib/store/selectors";
import { localDay } from "./clock-stats";
import type { DailyReport, ReportDayRow } from "@/lib/api/types";

/** The API's window: a day can be written up for this long afterwards. */
const EDIT_WINDOW_DAYS = 7;

/** Midnight UTC for a local calendar day, the anchor all this maths uses. */
function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function addDays(day: string, n: number): string {
  return new Date(dayNumber(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  return Math.round((dayNumber(to) - dayNumber(from)) / 86_400_000);
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** The last day of the month `day` falls in — day 0 of the next one. */
function monthEnd(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

function shiftMonth(day: string, by: number): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + by, 1)).toISOString().slice(0, 10);
}

function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function prettyMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ================================================================ module == */

export function Reports() {
  const session = useSession();
  const isSuperAdmin =
    session.status === "user" && session.user.roles.includes("superAdmin");

  const [tab, setTab] = useState<"mine" | "team">(isSuperAdmin ? "team" : "mine");

  if (session.status === "loading") return <ModuleSkeleton rows={4} />;

  if (session.status !== "user") {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="Sign in to write a report"
          desc="A daily report belongs to an account, so the demo portals have none."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <div className="flex flex-wrap gap-2">
          <Chip active={tab === "team"} onClick={() => setTab("team")}>
            Everyone&rsquo;s day
          </Chip>
          <Chip active={tab === "mine"} onClick={() => setTab("mine")}>
            My reports
          </Chip>
        </div>
      )}

      {tab === "mine" ? <MyReports /> : <TeamReports />}
    </div>
  );
}

/* --------------------------------------------------------------- mine ---- */

function MyReports() {
  const today = localDay();
  const [month, setMonth] = useState(monthStart(today));
  const [day, setDay] = useState(today);

  const from = monthStart(month);
  const to = monthEnd(month);
  const { data, isLoading } = useReportHistoryQuery({ from, to });

  const byDate = useMemo(
    () => new Map((data?.reports ?? []).map((r) => [r.date, r])),
    [data?.reports],
  );
  const current = byDate.get(day) ?? null;

  if (isLoading && !data) return <ModuleSkeleton rows={4} />;

  const lifetime = data?.lifetime;

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Stars earned"
          value={String(lifetime?.stars ?? 0)}
          hint="All time, across every rated day"
          icon={Star}
          t="amber"
        />
        <StatTile
          label="Average rating"
          value={lifetime?.average === null || lifetime === undefined ? "—" : `${lifetime.average} / 5`}
          hint={`${lifetime?.ratedDays ?? 0} day${lifetime?.ratedDays === 1 ? "" : "s"} rated`}
          icon={Sparkles}
          t="purple"
        />
        <StatTile
          label="Filed this month"
          value={String(data?.summary.submitted ?? 0)}
          hint={prettyMonth(month)}
          icon={CalendarCheck}
          t="sky"
        />
        <StatTile
          label="Awaiting a rating"
          value={String(data?.summary.awaitingRating ?? 0)}
          hint="Written up, not yet starred"
          icon={CalendarDays}
          t="orange"
        />
      </Grid>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <DayEditor day={day} onPickDay={setDay} today={today} existing={current} />
        </div>

        <div className="xl:col-span-5">
          <Card className="h-full">
            <CardHeader
              title={prettyMonth(month)}
              desc="Your days, newest first. Pick one to read or revise it."
              action={
                <span className="flex items-center gap-1">
                  <MonthButton
                    label="Previous month"
                    icon={ChevronLeft}
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  />
                  <MonthButton
                    label="Next month"
                    icon={ChevronRight}
                    disabled={monthStart(month) >= monthStart(today)}
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  />
                </span>
              }
            />
            {(data?.reports ?? []).length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nothing written up this month"
                desc="Fill in today on the left and it appears here."
              />
            ) : (
              <CardBody>
                <ul className="space-y-2">
                  {data?.reports.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setDay(r.date)}
                        className={`w-full rounded-card border px-3 py-2 text-left transition-colors ${
                          r.date === day
                            ? "border-primary bg-primary/5"
                            : "border-line hover:bg-hover"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[0.8125rem] font-semibold text-heading">
                            {prettyDay(r.date)}
                          </span>
                          <Stars value={r.stars} />
                        </span>
                        {r.headline && (
                          <span className="mt-0.5 block truncate text-[0.75rem] text-muted">
                            {r.headline}
                          </span>
                        )}
                        {r.feedback && (
                          <span className="mt-1 block text-[0.6875rem] italic text-muted">
                            “{r.feedback}”
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The editor for one day.
 *
 * Remounted per day by its caller's key so the draft never leaks from one date
 * to the next — the mistake that would silently file Tuesday's work against
 * Monday.
 */
function DayEditor({
  day,
  today,
  existing,
  onPickDay,
}: {
  day: string;
  today: string;
  existing: DailyReport | null;
  onPickDay: (day: string) => void;
}) {
  const [save, saveState] = useSaveMyReportMutation();
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [headlineDraft, setHeadlineDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  /*
   * Drafts over the saved value, as in the profile panel: null means "not
   * touched", so switching days or getting a refetch shows what is actually
   * stored, and typing is never overwritten.
   */
  const body = bodyDraft ?? existing?.body ?? "";
  const headline = headlineDraft ?? existing?.headline ?? "";

  // How long ago the day being edited was. Negative means the future, which
  // the API refuses outright.
  const age = daysBetween(day, today);
  const tooOld = age > EDIT_WINDOW_DAYS;
  const rated = existing?.stars !== null && existing !== null;
  const locked = tooOld || rated;

  async function submit() {
    setError(null);
    setSaved(null);
    try {
      await save({ date: day, today, body, headline: headline.trim() || undefined }).unwrap();
      setBodyDraft(null);
      setHeadlineDraft(null);
      setSaved("Saved.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save that report."));
    }
  }

  return (
    <Card className="h-full">
      <CardHeader
        title={day === today ? "What did you do today?" : `Report for ${prettyDay(day)}`}
        desc={
          rated
            ? "This day has been rated, so it is closed to changes."
            : tooOld
              ? `Days can be written up for ${EDIT_WINDOW_DAYS} days. This one is closed.`
              : "One entry per day. Saving again revises it."
        }
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <TextInput
              label="Day"
              type="date"
              value={day}
              onChange={(v) => v && onPickDay(v)}
            />
          </div>
          <div className="flex gap-1.5 pb-0.5">
            {[0, 1, 2].map((n) => {
              const d = addDays(today, -n);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onPickDay(d)}
                  className={`rounded-card border px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors ${
                    d === day ? "border-primary text-primary" : "border-line text-muted hover:bg-hover"
                  }`}
                >
                  {n === 0 ? "Today" : n === 1 ? "Yesterday" : prettyDay(d)}
                </button>
              );
            })}
          </div>
        </div>

        {locked ? (
          <div className="rounded-sm border border-line bg-subtle p-3">
            {hasRichText(existing?.body) ? (
              <RichTextView html={existing?.body} />
            ) : (
              <p className="text-[0.8125rem] text-muted">Nothing was written up for this day.</p>
            )}
            {rated && (
              <p className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-[0.75rem] text-muted">
                <Stars value={existing?.stars ?? null} />
                {existing?.feedback && <span className="italic">“{existing.feedback}”</span>}
              </p>
            )}
          </div>
        ) : (
          <>
            <TextInput
              label="One-line summary"
              value={headline}
              onChange={setHeadlineDraft}
              placeholder="Shipped the invoice export"
              hint="Optional. It is what a super admin sees in the list."
            />
            <RichTextEditor
              label="What you worked on"
              value={body}
              onChange={setBodyDraft}
              rows={8}
              placeholder="The tasks you moved, what got in the way, what is next…"
              required
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                icon={saveState.isLoading ? Loader2 : Save}
                onClick={() => void submit()}
                disabled={saveState.isLoading || !hasRichText(body)}
              >
                {saveState.isLoading ? "Saving…" : existing ? "Update the day" : "File the day"}
              </Button>
              {saved && <span className="text-[0.75rem] text-muted">{saved}</span>}
              {error && (
                <span className="text-[0.75rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
                  {error}
                </span>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------- team ---- */

function TeamReports() {
  const today = localDay();
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState<"all" | "filed" | "missing" | "unrated">("all");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useReportDayQuery({ date: day, filter });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data?.rows ?? [];
    return (data?.rows ?? []).filter((r) =>
      `${r.user.name} ${r.user.empId} ${r.user.email}`.toLowerCase().includes(q),
    );
  }, [data?.rows, query]);

  if (isLoading && !data) return <ModuleSkeleton rows={5} />;

  const counts = data?.counts;

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile label="On the floor" value={String(counts?.total ?? 0)} icon={ClipboardList} />
        <StatTile
          label="Filed"
          value={String(counts?.filed ?? 0)}
          hint={prettyDay(day)}
          icon={CalendarCheck}
          t="green"
        />
        <StatTile
          label="Not written up"
          value={String(counts?.missing ?? 0)}
          hint="Nobody is chasing these but you"
          icon={UserX}
          t="red"
        />
        <StatTile
          label="Waiting on a star"
          value={String(counts?.unrated ?? 0)}
          hint="Filed, unrated"
          icon={Star}
          t="amber"
        />
      </Grid>

      <Card>
        <CardHeader
          title="Everyone's day"
          desc="Pick a date, read what each person did, and rate it out of five."
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <TextInput label="Day" type="date" value={day} onChange={(v) => v && setDay(v)} />
            </div>
            <div className="flex gap-1.5 pb-0.5">
              <MonthButton
                label="Previous day"
                icon={ChevronLeft}
                onClick={() => setDay(addDays(day, -1))}
              />
              <MonthButton
                label="Next day"
                icon={ChevronRight}
                disabled={day >= today}
                onClick={() => setDay(addDays(day, 1))}
              />
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <SearchBox
                placeholder="Search people…"
                value={query}
                onChange={setQuery}
                className="sm:w-56"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "all", label: "Everyone", count: counts?.total },
                { key: "filed", label: "Filed", count: counts?.filed },
                { key: "missing", label: "Missing", count: counts?.missing },
                { key: "unrated", label: "Unrated", count: counts?.unrated },
              ] as const
            ).map((f) => (
              <Chip
                key={f.key}
                active={filter === f.key}
                count={f.count}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Chip>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nothing here"
              desc="No one matches that filter for this day."
            />
          ) : (
            <ul className="space-y-2.5">
              {rows.map((row) => (
                <TeamRow key={row.user.id} row={row} day={day} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function TeamRow({ row, day }: { row: ReportDayRow; day: string }) {
  const [open, setOpen] = useState(false);
  const [rate, rateState] = useRateReportMutation();
  const [feedbackDraft, setFeedbackDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = row.report;
  const feedback = feedbackDraft ?? report?.feedback ?? "";

  async function give(stars: number) {
    if (!report) return;
    setError(null);
    try {
      await rate({ id: report.id, stars, feedback: feedback.trim() || undefined }).unwrap();
      setFeedbackDraft(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save that rating."));
    }
  }

  return (
    <li
      className={`rounded-card border px-3 py-2.5 transition-colors ${
        report ? "border-line" : "border-dashed border-line bg-subtle/50"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <PersonAvatar
          name={row.user.name}
          initials={initialsOf(row.user.name)}
          avatar={row.user.avatar}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-semibold text-heading">{row.user.name}</p>
          <p className="truncate text-[0.6875rem] text-muted">
            {toUiRole(row.user.roles)} · {row.user.empId}
            {row.user.branch ? ` · ${row.user.branch}` : ""}
          </p>
        </div>

        {report ? (
          <>
            <p className="min-w-0 flex-[2] truncate text-[0.8125rem] text-heading">
              {report.headline ?? <span className="text-muted">No summary</span>}
            </p>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="shrink-0 text-[0.75rem] font-semibold text-primary hover:underline"
            >
              {open ? "Hide" : "Read"}
            </button>
            <Rater value={report.stars} busy={rateState.isLoading} onRate={(n) => void give(n)} />
          </>
        ) : (
          <Badge t="red">Nothing filed</Badge>
        )}
      </div>

      {report && open && (
        <div className="mt-2.5 space-y-2.5 border-t border-line pt-2.5">
          <RichTextView html={report.body} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                label="Feedback"
                value={feedback}
                onChange={setFeedbackDraft}
                placeholder="A line back to them — saved with the next star you click."
              />
            </div>
          </div>
          {report.ratedAt && (
            <p className="text-[0.625rem] text-muted">
              Rated {new Date(report.ratedAt).toLocaleString()} — clicking a different star
              replaces it.
            </p>
          )}
          {error && (
            <p className="text-[0.75rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
              {error}
            </p>
          )}
        </div>
      )}
      {!report && (
        <p className="mt-1.5 text-[0.6875rem] text-muted">
          Nothing to rate for {prettyDay(day)}.
        </p>
      )}
    </li>
  );
}

/* ------------------------------------------------------- playground bit -- */

/**
 * One person's reports, compact — for the Playground panel.
 *
 * The month on screen is the current one, so this answers "has this person
 * been writing up their days, and how have they been rated" without being a
 * second Reports module. Reading someone else's is super admin only on the
 * API, so the caller gates on it.
 */
export function ReportStarsBody({ userId }: { userId: string }) {
  const today = localDay();
  const { data, isLoading, isError } = useReportHistoryQuery({
    from: monthStart(today),
    to: monthEnd(today),
    userId,
  });

  if (isLoading) return <div className="h-16 animate-pulse rounded-sm bg-light" />;
  if (isError || !data) {
    return <p className="text-[0.75rem] text-muted">Reports couldn&rsquo;t be loaded.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-card bg-subtle px-2.5 py-2">
        <span className="text-[0.75rem] text-muted">
          <span className="text-[1rem] font-bold text-heading">{data.lifetime.stars}</span> stars
          all time
        </span>
        <span className="text-[0.75rem] text-muted">
          {data.lifetime.average === null ? "Unrated" : `${data.lifetime.average} / 5 average`}
        </span>
      </div>
      {data.reports.length === 0 ? (
        <p className="text-[0.75rem] text-muted">Nothing written up this month.</p>
      ) : (
        <ul className="space-y-1">
          {data.reports.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[0.75rem] text-heading">
                {prettyDay(r.date)}
                {r.headline && <span className="text-muted"> · {r.headline}</span>}
              </span>
              <Stars value={r.stars} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- bits ---- */

/** Read-only stars, for a day that already has a rating. */
function Stars({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="shrink-0 text-[0.6875rem] text-muted">Unrated</span>;
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          style={{
            color: n <= value ? tone.amber.solid : "var(--color-line)",
            fill: n <= value ? tone.amber.solid : "transparent",
          }}
        />
      ))}
    </span>
  );
}

/** The five buttons a super admin clicks. Clicking a different one replaces. */
function Rater({
  value,
  busy,
  onRate,
}: {
  value: number | null;
  busy: boolean;
  onRate: (stars: number) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={busy}
          onClick={() => onRate(n)}
          aria-label={`Rate ${n} out of 5`}
          aria-pressed={value !== null && n <= value}
          title={`${n} / 5`}
          className="rounded p-0.5 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Star
            size={16}
            style={{
              color: value !== null && n <= value ? tone.amber.solid : "var(--color-line)",
              fill: value !== null && n <= value ? tone.amber.solid : "transparent",
            }}
          />
        </button>
      ))}
    </span>
  );
}

function MonthButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof ChevronLeft;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-card border border-line text-muted transition-colors enabled:hover:bg-hover enabled:hover:text-heading disabled:opacity-40"
    >
      <Icon size={15} />
    </button>
  );
}

export default Reports;
