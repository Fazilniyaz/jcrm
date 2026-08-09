"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  CheckCheck,
  ClipboardCheck,
  CalendarOff,
  CalendarDays,
  UserPlus,
  CircleAlert,
  Trash2,
  Undo2,
  Inbox,
} from "lucide-react";
import {
  Card,
  CardHeader,
  Badge,
  StatTile,
  Toolbar,
  Button,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  tone,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useStore } from "@/lib/store/StoreProvider";
import { notificationsFor, relativeTime } from "@/lib/store/selectors";
import { NOTIFICATION_TONE, type NotificationKind } from "@/lib/store/types";

/*
 * The signed-in portal's inbox.
 *
 * Notifications are addressed to one employee, so this only ever shows the
 * current portal's own. Signing in as someone else shows a different inbox —
 * which is the point: it is how you check that an event reached the right
 * person.
 */

const KIND_ICON: Record<NotificationKind, React.ElementType> = {
  "task-assigned": UserPlus,
  "qc-approved": ClipboardCheck,
  "qc-corrections": ClipboardCheck,
  "qc-error": CircleAlert,
  "leave-requested": CalendarOff,
  "leave-approved": CalendarOff,
  "leave-rejected": CalendarOff,
  "leave-withdrawn": Undo2,
  "leave-reopened": Undo2,
  "calendar-event": CalendarDays,
};

const KIND_LABEL: Record<NotificationKind, string> = {
  "task-assigned": "Task assigned",
  "qc-approved": "QC approved",
  "qc-corrections": "QC corrections",
  "qc-error": "QC error",
  "leave-requested": "Leave request",
  "leave-approved": "Leave approved",
  "leave-rejected": "Leave rejected",
  "leave-withdrawn": "Leave withdrawn",
  "leave-reopened": "Decision undone",
  "calendar-event": "Calendar",
};

type Filter = "all" | "unread" | "tasks" | "qc" | "leave";

export function Notifications() {
  const {
    hydrated,
    state,
    currentEmployee,
    currentUser,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
  } = useStore();

  const [filter, setFilter] = useState<Filter>("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const mine = useMemo(
    () => (currentEmployee ? notificationsFor(state, currentEmployee.id) : []),
    [state, currentEmployee],
  );

  const counts = useMemo(
    () => ({
      all: mine.length,
      unread: mine.filter((n) => !n.read).length,
      tasks: mine.filter((n) => n.kind === "task-assigned").length,
      qc: mine.filter((n) => n.kind.startsWith("qc-")).length,
      leave: mine.filter((n) => n.kind.startsWith("leave-")).length,
    }),
    [mine],
  );

  const visible = useMemo(() => {
    if (filter === "unread") return mine.filter((n) => !n.read);
    if (filter === "tasks") return mine.filter((n) => n.kind === "task-assigned");
    if (filter === "qc") return mine.filter((n) => n.kind.startsWith("qc-"));
    if (filter === "leave") return mine.filter((n) => n.kind.startsWith("leave-"));
    return mine;
  }, [mine, filter]);

  if (!hydrated) return <ModuleSkeleton rows={5} />;

  // The client portal has no employee record, so nothing is ever addressed to it.
  if (!currentEmployee) {
    return (
      <Card>
        <EmptyState
          icon={BellOff}
          title="No inbox for this portal"
          desc={`${currentUser} isn't on the employee roster, so nothing is addressed here. Sign in as a staff portal to see notifications.`}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Unread"
          value={String(counts.unread)}
          hint={`${counts.all} in total`}
          t="orange"
          icon={BellRing}
        />
        <StatTile
          label="Task Assignments"
          value={String(counts.tasks)}
          hint="Work sent your way"
          t="blue"
          icon={UserPlus}
        />
        <StatTile
          label="QC Outcomes"
          value={String(counts.qc)}
          hint="Approvals, corrections and errors"
          t="sky"
          icon={ClipboardCheck}
        />
        <StatTile
          label="Leave"
          value={String(counts.leave)}
          hint="Requests and decisions"
          t="slate"
          icon={CalendarOff}
        />
      </Grid>

      <Card>
        <CardHeader
          title={`Inbox — ${currentEmployee.name}`}
          desc="Everything addressed to you, newest first."
          action={
            <Toolbar>
              <Button
                variant="ghost"
                icon={CheckCheck}
                disabled={counts.unread === 0}
                onClick={() => markAllNotificationsRead(currentEmployee.id)}
              >
                Mark all read
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                disabled={counts.all === 0}
                onClick={() => setConfirmClear(true)}
              >
                Clear
              </Button>
            </Toolbar>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["tasks", "Tasks"],
              ["qc", "QC"],
              ["leave", "Leave"],
            ] as const
          ).map(([key, label]) => (
            <Chip
              key={key}
              active={filter === key}
              onClick={() => setFilter(key)}
              count={counts[key]}
            >
              {label}
            </Chip>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter === "unread" ? "Nothing unread" : "Nothing here yet"}
            desc={
              counts.all === 0
                ? "Assignments, QC outcomes and leave decisions land here as they happen."
                : "Try a different filter."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((n) => {
              const Icon = KIND_ICON[n.kind];
              const t = NOTIFICATION_TONE[n.kind];
              return (
                <li key={n.id}>
                  {/* Reading is the only interaction, so the whole row is the
                      control rather than a separate "mark read" button. */}
                  <button
                    type="button"
                    onClick={() => !n.read && markNotificationRead(n.id)}
                    aria-label={n.read ? n.title : `${n.title} — mark as read`}
                    className={`flex w-full gap-3 p-4 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5 ${
                      n.read ? "" : "bg-subtle/50"
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-avatar"
                      style={{ background: tone[t].soft, color: tone[t].text }}
                    >
                      <Icon size={17} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <span
                          className={`text-[0.8125rem] text-heading ${
                            n.read ? "font-medium" : "font-semibold"
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[0.6875rem] text-muted">
                          {relativeTime(n.at)}
                        </span>
                      </span>

                      <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-muted">
                        {n.detail}
                      </span>

                      <span className="mt-1.5 inline-block">
                        <Badge t={t}>{KIND_LABEL[n.kind]}</Badge>
                      </span>
                    </span>

                    {!n.read && (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clearNotifications(currentEmployee.id)}
        title="Clear inbox"
        message={`All ${counts.all} notifications for ${currentEmployee.name} will be removed. New ones still arrive as events happen.`}
        confirmLabel="Clear all"
      />
    </div>
  );
}

/** Unread count for the header bell. Zero when the portal has no employee. */
export function useUnreadCount(): number {
  const { state, currentEmployee } = useStore();
  if (!currentEmployee) return 0;
  return state.notifications.filter((n) => n.to === currentEmployee.id && !n.read).length;
}

export { Bell };
