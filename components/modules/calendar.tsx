"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  Clock3,
  ListChecks,
  ClipboardCheck,
  TrendingDown,
  CalendarOff,
  Flag,
  CircleAlert,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Avatar,
  StatTile,
  Button,
  IconButton,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  tone,
} from "@/components/ui";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { FormGrid, SelectInput, Span, TextArea, TextInput } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  clockTime,
  dayActivity,
  dayActivityCount,
  eventsInMonth,
  eventsOn,
  formatDate,
  initialsOf,
} from "@/lib/store/selectors";
import {
  CALENDAR_KIND_TONE,
  CALENDAR_KINDS,
  LEAVE_EVENT_TONE,
  MILESTONE_TONE,
  QC_VERDICT_TONE,
  TASK_STATUS_TONE,
  type CalendarEvent,
  type CalendarKind,
} from "@/lib/store/types";

/*
 * Calendar.
 *
 * The month grid carries two things: entries someone put there, and a dot
 * showing the day had activity. Selecting a day opens what actually happened —
 * tasks created, task updates, QC verdicts and the KRA they moved, leave
 * decisions, who was in, and which milestones were due.
 *
 * None of that is a separate activity log. It is read back out of the tasks,
 * reviews, leave and attendance already in the store, so it can never disagree
 * with the modules it came from.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Monday-first index for a month's first day. */
function firstWeekday(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function Calendar() {
  const { hydrated, state, currentPortal, deleteCalendarEvent } = useStore();

  // The demo clock is August 2026; opening on the current month would show an
  // empty grid against seeded data.
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const [selected, setSelected] = useState<string>("2026-08-04");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | undefined>();
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);

  const canEdit = currentPortal !== "client";

  const monthEvents = useMemo(
    () => eventsInMonth(state, year, month),
    [state, year, month],
  );

  const cells = useMemo(() => {
    const lead = firstWeekday(year, month);
    const days = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  const step = (by: number) => {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  if (!hydrated) return <ModuleSkeleton rows={5} />;

  const activity = dayActivity(state, selected);

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Entries This Month"
          value={String(monthEvents.length)}
          hint={`${MONTH_NAMES[month]} ${year}`}
          t="blue"
          icon={Flag}
        />
        <StatTile
          label="Deadlines"
          value={String(monthEvents.filter((e) => e.kind === "Deadline").length)}
          hint="Dated commitments"
          t="red"
          icon={CircleAlert}
        />
        <StatTile
          label="Demos"
          value={String(monthEvents.filter((e) => e.kind === "Demo").length)}
          hint="Client-facing sessions"
          t="sky"
          icon={CheckCircle2}
        />
        <StatTile
          label="Selected Day"
          value={selected.slice(8)}
          hint={formatDate(selected)}
          t="orange"
          icon={Clock3}
        />
      </Grid>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* month grid */}
        <div className="xl:col-span-7">
          <Card className="h-full">
            <CardHeader
              title={`${MONTH_NAMES[month]} ${year}`}
              desc="Select a day to see everything that happened on it."
              action={
                <span className="flex flex-wrap items-center gap-2">
                  <IconButton icon={ChevronLeft} label="Previous month" onClick={() => step(-1)} />
                  <IconButton icon={ChevronRight} label="Next month" onClick={() => step(1)} />
                  {canEdit && (
                    <Button
                      icon={Plus}
                      onClick={() => {
                        setEditing(undefined);
                        setFormOpen(true);
                      }}
                    >
                      Add entry
                    </Button>
                  )}
                </span>
              }
            />
            <CardBody className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className="pb-2 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-muted"
                    >
                      {d}
                    </div>
                  ))}

                  {cells.map((day, i) => {
                    if (!day) return <div key={i} className="min-h-[86px]" />;
                    const date = iso(year, month, day);
                    const dayEvents = eventsOn(state, date);
                    const count = dayActivityCount(state, date);
                    const isSelected = date === selected;
                    const isToday = date === "2026-08-04";

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelected(date)}
                        aria-pressed={isSelected}
                        aria-label={`${formatDate(date)}, ${count} item${count === 1 ? "" : "s"}`}
                        className={`min-h-[86px] rounded-sm border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                          isSelected
                            ? "border-primary bg-hover"
                            : "border-line bg-card hover:bg-hover"
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${
                              isToday
                                ? "bg-primary text-white"
                                : isSelected
                                  ? "text-primary"
                                  : "text-muted"
                            }`}
                          >
                            {day}
                          </span>
                          {/* A dot means the day has history worth opening,
                              even when nobody scheduled anything on it. */}
                          {count > 0 && dayEvents.length === 0 && (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: tone.slate.solid }}
                            />
                          )}
                        </span>

                        <span className="mt-1 block space-y-1">
                          {dayEvents.slice(0, 3).map((e) => (
                            <span
                              key={e.id}
                              className="block truncate rounded-sm px-1.5 py-0.5 text-[0.625rem] font-medium leading-tight"
                              style={{
                                background: tone[CALENDAR_KIND_TONE[e.kind]].soft,
                                color: tone[CALENDAR_KIND_TONE[e.kind]].text,
                              }}
                              title={`${e.title}${e.time ? ` · ${e.time}` : ""}`}
                            >
                              {e.time ? `${e.time} ` : ""}
                              {e.title}
                            </span>
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="block px-1.5 text-[0.625rem] text-muted">
                              +{dayEvents.length - 3} more
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* the selected day */}
        <div className="xl:col-span-5">
          <Card className="h-full">
            <CardHeader
              title={formatDate(selected)}
              desc="Entries on the day, and what the team actually did."
            />

            <CardBody className="space-y-5">
              {/* scheduled entries */}
              <div>
                <SectionLabel>Scheduled ({activity.events.length})</SectionLabel>
                {activity.events.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-line p-3 text-center text-[0.75rem] text-muted">
                    Nothing scheduled.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {activity.events.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start gap-2.5 rounded-sm border border-line bg-card p-2.5"
                      >
                        <span
                          className="mt-0.5 flex h-8 w-12 shrink-0 items-center justify-center rounded-sm text-[0.6875rem] font-bold"
                          style={{
                            background: tone[CALENDAR_KIND_TONE[e.kind]].soft,
                            color: tone[CALENDAR_KIND_TONE[e.kind]].text,
                          }}
                        >
                          {e.time ?? "All day"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-semibold text-heading">
                            {e.title}
                          </span>
                          <span className="block truncate text-[0.6875rem] text-muted">
                            {e.kind} · set by {e.createdBy}
                          </span>
                          {e.note && (
                            <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">
                              {e.note}
                            </span>
                          )}
                        </span>
                        {canEdit && (
                          <span className="flex shrink-0 gap-1">
                            <IconButton
                              icon={Pencil}
                              label={`Edit ${e.title}`}
                              size={28}
                              onClick={() => {
                                setEditing(e);
                                setFormOpen(true);
                              }}
                            />
                            <IconButton
                              icon={Trash2}
                              label={`Delete ${e.title}`}
                              size={28}
                              tone="red"
                              onClick={() => setPendingDelete(e)}
                            />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <DayActivity date={selected} />
            </CardBody>
          </Card>
        </div>
      </div>

      {formOpen && (
        <EventForm
          key={editing?.id ?? `new-${selected}`}
          open={formOpen}
          event={editing}
          defaultDate={selected}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteCalendarEvent(pendingDelete.id)}
        title="Delete entry"
        message={`"${pendingDelete?.title ?? "This entry"}" will be removed from the calendar.`}
      />
    </div>
  );
}

/* ------------------------------------------------------------ day detail -- */

function DayActivity({ date }: { date: string }) {
  const { state } = useStore();
  const a = dayActivity(state, date);

  const stats = [
    { k: "Created", v: a.created.length, icon: Plus, t: "blue" as const },
    { k: "Updates", v: a.updates.length, icon: ListChecks, t: "slate" as const },
    { k: "Signed off", v: a.completed.length, icon: ClipboardCheck, t: "sky" as const },
    { k: "KRA drops", v: a.kraDrops.length, icon: TrendingDown, t: "red" as const },
  ];

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Activity</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.k} className="rounded-sm border border-line bg-card p-2 text-center">
              <span
                className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-sm"
                style={{ background: tone[s.t].soft, color: tone[s.t].text }}
              >
                <s.icon size={12} />
              </span>
              <p className="text-[0.9375rem] font-bold leading-none text-heading">{s.v}</p>
              <p className="mt-1 text-[0.625rem] leading-tight text-muted">{s.k}</p>
            </div>
          ))}
        </div>
      </div>

      {a.isEmpty && (
        <EmptyState
          icon={CalendarOff}
          title="Nothing recorded"
          desc="No entries, no task activity and no attendance on this day."
        />
      )}

      {a.milestones.length > 0 && (
        <Section label={`Milestones due (${a.milestones.length})`}>
          {a.milestones.map(({ project, milestone }) => (
            <li key={milestone.id} className="flex items-start justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] text-text">{milestone.label}</span>
                <span className="font-mono text-[0.625rem] text-muted">{project.code}</span>
              </span>
              <Badge t={MILESTONE_TONE[milestone.status]}>{milestone.status}</Badge>
            </li>
          ))}
        </Section>
      )}

      {a.created.length > 0 && (
        <Section label={`Tasks created (${a.created.length})`}>
          {a.created.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] text-text">{t.title}</span>
                <span className="font-mono text-[0.625rem] text-muted">
                  {t.taskId} · by {t.createdBy}
                </span>
              </span>
              <Badge t={TASK_STATUS_TONE[t.status]}>{t.status}</Badge>
            </li>
          ))}
        </Section>
      )}

      {a.updates.length > 0 && (
        <Section label={`Task updates (${a.updates.length})`}>
          {a.updates.map(({ task, update }) => (
            <li key={update.id} className="py-1.5">
              <p className="text-[0.8125rem] leading-snug text-text">{update.summary}</p>
              <p className="mt-0.5 font-mono text-[0.625rem] text-muted">
                {task.taskId} · {update.by}
              </p>
            </li>
          ))}
        </Section>
      )}

      {a.reviews.length > 0 && (
        <Section label={`QC reviews (${a.reviews.length})`}>
          {a.reviews.map(({ task, review }) => (
            <li key={review.id} className="flex items-start justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] text-text">{task.title}</span>
                <span className="font-mono text-[0.625rem] text-muted">
                  {task.taskId} · {review.by}
                </span>
              </span>
              <Badge t={QC_VERDICT_TONE[review.verdict]}>{review.verdict}</Badge>
            </li>
          ))}
        </Section>
      )}

      {a.kraDrops.length > 0 && (
        <Section label={`KRA movements (${a.kraDrops.length})`}>
          {a.kraDrops.map((d, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                {d.employee && (
                  <Avatar initials={initialsOf(d.employee.name)} t={d.employee.tone} size={22} />
                )}
                <span className="min-w-0 truncate text-[0.8125rem] text-text">
                  {d.employee?.name ?? "Removed employee"}
                </span>
              </span>
              <span
                className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold"
                style={{ background: tone.red.soft, color: tone.red.text }}
              >
                {d.from} → {d.to}
              </span>
            </li>
          ))}
        </Section>
      )}

      {a.leave.length > 0 && (
        <Section label={`Leave (${a.leave.length})`}>
          {a.leave.map(({ request, event }) => (
            <li key={event.id} className="flex items-start justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] text-text">
                  {request.code} · {request.days} day{request.days === 1 ? "" : "s"} {request.type}
                </span>
                <span className="text-[0.625rem] text-muted">{event.by}</span>
              </span>
              <Badge t={LEAVE_EVENT_TONE[event.action]}>{event.action}</Badge>
            </li>
          ))}
        </Section>
      )}

      {a.clockedIn.length > 0 && (
        <Section label={`Attendance (${a.clockedIn.length} in)`}>
          {a.clockedIn.map((c) => {
            const who = state.employees.find((e) => e.id === c.employeeId);
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  {who && <Avatar initials={initialsOf(who.name)} t={who.tone} size={22} />}
                  <span className="min-w-0 truncate text-[0.8125rem] text-text">
                    {who?.name ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[0.6875rem] text-muted">
                  {clockTime(c.inAt)} → {c.outAt ? clockTime(c.outAt) : "still in"}
                </span>
              </li>
            );
          })}
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <ul className="divide-y divide-line rounded-sm border border-line bg-card px-3">
        {children}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ form -- */

/**
 * Adding an entry notifies the whole roster.
 *
 * The form says so before you save, because "marked the standup as 13:00"
 * lands in fifteen inboxes and that should not be a surprise.
 */
function EventForm({
  open,
  event,
  defaultDate,
  onClose,
}: {
  open: boolean;
  event?: CalendarEvent;
  defaultDate: string;
  onClose: () => void;
}) {
  const { projects, createCalendarEvent, updateCalendarEvent, currentUser } = useStore();

  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [time, setTime] = useState(event?.time ?? "");
  const [kind, setKind] = useState<CalendarKind>(event?.kind ?? "Event");
  const [projectId, setProjectId] = useState(event?.projectId ?? "");
  const [note, setNote] = useState(event?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the entry a title.";
    if (!date) next.date = "Pick a date.";
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      next.time = "Use 24-hour time, e.g. 13:00.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      title: title.trim(),
      date,
      time: time || undefined,
      kind,
      projectId: projectId || undefined,
      note: note.trim() || undefined,
    };

    if (event) updateCalendarEvent(event.id, payload);
    else createCalendarEvent(payload);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? `Edit ${event.title}` : "Add calendar entry"}
      desc={event ? "Editing does not re-notify the team." : "Everyone on the roster is notified."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            {event ? "Save entry" : "Add and notify"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Span>
          <TextInput
            label="Title"
            required
            value={title}
            onChange={setTitle}
            placeholder="Daily standup"
            error={errors.title}
          />
        </Span>

        <TextInput
          label="Date"
          required
          type="date"
          value={date}
          onChange={setDate}
          error={errors.date}
        />
        <TextInput
          label="Time"
          value={time}
          onChange={setTime}
          placeholder="13:00"
          hint="24-hour. Leave blank for an all-day entry."
          error={errors.time}
        />

        <SelectInput<CalendarKind>
          label="Kind"
          value={kind}
          onChange={setKind}
          options={CALENDAR_KINDS.map((k) => ({ value: k, label: k }))}
        />
        <SelectInput<string>
          label="Project"
          value={projectId}
          onChange={setProjectId}
          options={[
            { value: "", label: "Not project-specific" },
            ...projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
          ]}
        />

        <Span>
          <TextArea
            label="Note"
            rows={2}
            value={note}
            onChange={setNote}
            placeholder="Anything the team needs to know before it starts."
          />
        </Span>

        {!event && (
          <Span>
            <p
              className="flex items-start gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
              style={{ background: tone.blue.soft, color: tone.blue.text }}
            >
              <Flag size={14} className="mt-px shrink-0" />
              <span>
                Everyone gets a notification reading{" "}
                <strong>
                  &ldquo;{currentUser} marked {title.trim() || "…"}{" "}
                  {time ? `for ${time}` : "as an all-day entry"}&rdquo;
                </strong>
                .
              </span>
            </p>
          </Span>
        )}
      </FormGrid>
    </Modal>
  );
}
