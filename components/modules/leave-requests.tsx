"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CalendarOff,
  Check,
  X,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  XCircle,
  Undo2,
  RotateCcw,
  History,
  Inbox,
} from "lucide-react";
import {
  Card,
  CardHeader,
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
import { ConfirmDialog } from "@/components/ui/overlay";
import { TextArea } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  canApproveLeave,
  employeeById,
  formatDate,
  initialsOf,
  isShortNotice,
  leaveBalance,
  noticeLabel,
  relativeTime,
  scopedLeave,
} from "@/lib/store/selectors";
import {
  LEAVE_EVENT_TONE,
  LEAVE_STATUS_TONE,
  LEAVE_TYPE_TONE,
  SHORT_NOTICE_HOURS,
  type LeaveRequest,
  type LeaveStatus,
} from "@/lib/store/types";
import LeaveRequestForm from "./LeaveRequestForm";

/*
 * Leave requests.
 *
 * What you see depends on who you are. An employee sees their own balances and
 * their own history; a manager (or either admin portal) additionally sees the
 * queue of everyone else's requests with approve and reject on each.
 *
 * The notice flag is the one piece of judgement the table offers: a request
 * raised less than SHORT_NOTICE_HOURS before the leave starts gets a red
 * warning, anything with more runway gets a green tick. The measured notice is
 * printed next to it so the flag is never the only evidence.
 */

type Tab = "mine" | "queue" | "all";

export function LeaveRequests() {
  const {
    hydrated,
    state,
    currentEmployee,
    currentPortal,
    currentUser,
    withdrawLeaveRequest,
    restoreLeaveRequest,
    undoLeaveDecision,
  } = useStore();

  const leaveRequests = useMemo(() => scopedLeave(state), [state]);
  const approver = canApproveLeave(currentEmployee, currentPortal);
  const [tab, setTab] = useState<Tab>(approver ? "queue" : "mine");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeaveStatus | "All">("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Both undo paths confirm first: one cancels booked time off, the other
  // reverses a decision someone has already been told about.
  const [pendingWithdraw, setPendingWithdraw] = useState<LeaveRequest | null>(null);
  const [pendingUndo, setPendingUndo] = useState<LeaveRequest | null>(null);

  const mine = useMemo(
    () => (currentEmployee ? leaveRequests.filter((l) => l.employeeId === currentEmployee.id) : []),
    [leaveRequests, currentEmployee],
  );
  const queue = useMemo(() => leaveRequests.filter((l) => l.status === "Pending"), [leaveRequests]);

  const balances = useMemo(
    () => (currentEmployee ? leaveBalance(state, currentEmployee.id) : []),
    [state, currentEmployee],
  );

  const visible = useMemo(() => {
    const base = tab === "mine" ? mine : tab === "queue" ? queue : leaveRequests;
    const q = query.trim().toLowerCase();
    return base
      .filter((l) => {
        if (status !== "All" && l.status !== status) return false;
        if (!q) return true;
        const who = employeeById(state, l.employeeId)?.name ?? "";
        return `${l.code} ${who} ${l.type} ${l.reason}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [tab, mine, queue, leaveRequests, query, status, state]);

  if (!hydrated) return <ModuleSkeleton rows={5} />;

  const shortInQueue = queue.filter(isShortNotice).length;

  return (
    <div className="space-y-4">
      {/* balances — only meaningful for someone with a staff record */}
      {currentEmployee ? (
        <Grid cols={4}>
          {balances.map((b) => (
            <Card key={b.type} className="p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                  {b.type}
                </p>
                <p className="text-[0.75rem] text-muted">
                  <span className="text-[1rem] font-bold text-heading">{b.left}</span> / {b.total}
                </p>
              </div>
              <div className="mt-3">
                <Progress value={(b.used / b.total) * 100} t={b.tone} />
              </div>
              <p className="mt-2 text-[0.6875rem] text-muted">{b.used} days taken</p>
            </Card>
          ))}
        </Grid>
      ) : (
        <Grid cols={4}>
          <StatTile
            label="Pending"
            value={String(queue.length)}
            hint="Awaiting a decision"
            t="orange"
            icon={Clock3}
          />
          <StatTile
            label="Short Notice"
            value={String(shortInQueue)}
            hint={`Under ${SHORT_NOTICE_HOURS}h before start`}
            t="red"
            icon={ShieldAlert}
          />
          <StatTile
            label="Approved"
            value={String(leaveRequests.filter((l) => l.status === "Approved").length)}
            hint="All time"
            t="sky"
            icon={CheckCircle2}
          />
          <StatTile
            label="Rejected"
            value={String(leaveRequests.filter((l) => l.status === "Rejected").length)}
            hint="All time"
            t="slate"
            icon={XCircle}
          />
        </Grid>
      )}

      {/* the approver's own summary row, under their balances */}
      {currentEmployee && approver && (
        <Grid cols={4}>
          <StatTile
            label="Awaiting You"
            value={String(queue.length)}
            hint="Across the whole roster"
            t="orange"
            icon={Inbox}
          />
          <StatTile
            label="Short Notice"
            value={String(shortInQueue)}
            hint={`Under ${SHORT_NOTICE_HOURS}h before start`}
            t="red"
            icon={ShieldAlert}
          />
          <StatTile
            label="Approved"
            value={String(leaveRequests.filter((l) => l.status === "Approved").length)}
            hint="All time"
            t="sky"
            icon={CheckCircle2}
          />
          <StatTile
            label="Rejected"
            value={String(leaveRequests.filter((l) => l.status === "Rejected").length)}
            hint="All time"
            t="slate"
            icon={XCircle}
          />
        </Grid>
      )}

      <Card>
        <CardHeader
          title="Leave Requests"
          desc={
            approver
              ? "Approve or reject from the queue. Select a row for the full request."
              : "Your requests and where each one got to."
          }
          action={
            <Toolbar>
              <SearchBox
                placeholder="Search requests…"
                value={query}
                onChange={setQuery}
                className="sm:w-52"
              />
              {currentEmployee && (
                <Button icon={CalendarOff} onClick={() => setFormOpen(true)}>
                  Request Leave
                </Button>
              )}
            </Toolbar>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          {currentEmployee && (
            <Chip active={tab === "mine"} onClick={() => setTab("mine")} count={mine.length}>
              My requests
            </Chip>
          )}
          {approver && (
            <>
              <Chip active={tab === "queue"} onClick={() => setTab("queue")} count={queue.length}>
                Awaiting decision
              </Chip>
              <Chip active={tab === "all"} onClick={() => setTab("all")} count={leaveRequests.length}>
                All
              </Chip>
            </>
          )}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {(["All", "Pending", "Approved", "Rejected", "Withdrawn"] as const).map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title={
              tab === "queue"
                ? "Nothing awaiting a decision"
                : tab === "mine"
                  ? "You haven't requested any leave"
                  : "No requests match"
            }
            desc={
              tab === "queue"
                ? "Requests raised by the team land here for approval."
                : tab === "mine"
                  ? "Raise a request and it goes straight to your manager."
                  : "Try a different filter or search term."
            }
            action={
              currentEmployee && tab === "mine" ? (
                <Button icon={CalendarOff} onClick={() => setFormOpen(true)}>
                  Request Leave
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Days</Th>
                <Th>Notice</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const who = employeeById(state, l.employeeId);
                const expanded = openId === l.id;
                const isMine = currentEmployee?.id === l.employeeId;

                return (
                  <Fragment key={l.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : l.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${l.code}` : `Expand ${l.code}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <Avatar
                            initials={initialsOf(who?.name ?? "?")}
                            t={who?.tone ?? "slate"}
                            size={34}
                          />
                          <span className="min-w-0">
                            <span className="block whitespace-nowrap font-semibold text-heading">
                              {who?.name ?? "Removed employee"}
                            </span>
                            <span className="font-mono text-[0.6875rem] text-muted">{l.code}</span>
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <Badge t={LEAVE_TYPE_TONE[l.type]}>{l.type}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(l.from)}</Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(l.to)}</Td>
                      <Td className="font-semibold text-heading">{l.days}</Td>
                      <Td>
                        <NoticeFlag request={l} />
                      </Td>
                      <Td>
                        <Badge t={LEAVE_STATUS_TONE[l.status]}>{l.status}</Badge>
                      </Td>
                      <Td>
                        <div
                          className="flex flex-wrap justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Approve / reject is the approver's job on someone
                              else's pending request. */}
                          {l.status === "Pending" && approver && !isMine && (
                            <DecisionButtons request={l} />
                          )}

                          {/* The owner can pull a request back — before a
                              decision, and after an approval too, since
                              cancelling booked leave is a normal thing. */}
                          {isMine && (l.status === "Pending" || l.status === "Approved") && (
                            <Button
                              variant="ghost"
                              icon={Undo2}
                              onClick={() => setPendingWithdraw(l)}
                            >
                              Withdraw
                            </Button>
                          )}

                          {isMine && l.status === "Withdrawn" && (
                            <Button
                              variant="ghost"
                              icon={RotateCcw}
                              onClick={() => restoreLeaveRequest(l.id)}
                            >
                              Re-raise
                            </Button>
                          )}

                          {/* The approver can take back what they decided. */}
                          {approver && (l.status === "Approved" || l.status === "Rejected") && (
                            <Button
                              variant="ghost"
                              icon={Undo2}
                              onClick={() => setPendingUndo(l)}
                              title={`Undo the ${l.status.toLowerCase()} decision`}
                            >
                              Undo decision
                            </Button>
                          )}

                          {!isMine && !approver && (
                            <span className="text-[0.75rem] text-muted">—</span>
                          )}
                        </div>
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={8}>
                        <LeaveDetail request={l} canDecide={approver && !isMine} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {formOpen && currentEmployee && (
        <LeaveRequestForm
          open={formOpen}
          employeeId={currentEmployee.id}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingWithdraw)}
        onClose={() => setPendingWithdraw(null)}
        onConfirm={() => pendingWithdraw && withdrawLeaveRequest(pendingWithdraw.id)}
        title="Withdraw request"
        message={
          pendingWithdraw?.status === "Approved"
            ? `${pendingWithdraw.code} was already approved. Withdrawing it cancels the time off, returns the ${pendingWithdraw.days} day${pendingWithdraw.days === 1 ? "" : "s"} to your balance and tells your approvers. You can re-raise it afterwards.`
            : `${pendingWithdraw?.code ?? "This request"} will be marked withdrawn and drop out of your manager's queue. You can re-raise it afterwards.`
        }
        confirmLabel="Withdraw"
      />

      <ConfirmDialog
        open={Boolean(pendingUndo)}
        onClose={() => setPendingUndo(null)}
        onConfirm={() => pendingUndo && undoLeaveDecision(pendingUndo.id)}
        title="Undo decision"
        message={`${pendingUndo?.code ?? "This request"} goes back to Pending and the ${pendingUndo?.status.toLowerCase() ?? ""} decision by ${pendingUndo?.decidedBy ?? "—"} is cleared. ${
          employeeById(state, pendingUndo?.employeeId ?? "")?.name ?? "The employee"
        } will be told it is being reconsidered. The original decision stays in the request's history.`}
        confirmLabel="Undo decision"
      />

      {!currentEmployee && (
        <p className="text-[0.75rem] text-muted">
          {currentUser} isn&rsquo;t on the employee roster, so there is no personal balance to show.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- notice flag -- */

/**
 * Red warning under the threshold, green tick over it, with the measured
 * notice as the label — the flag alone would be a claim without evidence.
 */
function NoticeFlag({ request }: { request: LeaveRequest }) {
  const short = isShortNotice(request);
  const t = short ? tone.red : tone.sky;
  const Icon = short ? ShieldAlert : ShieldCheck;

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1 text-[0.6875rem] font-semibold"
      style={{ background: t.soft, color: t.text }}
      title={
        short
          ? `Raised ${noticeLabel(request)} — under the ${SHORT_NOTICE_HOURS}-hour threshold`
          : `Raised ${noticeLabel(request)}`
      }
    >
      <Icon size={12} />
      {short ? "Short notice" : "In good time"}
    </span>
  );
}

/* ------------------------------------------------------ decision controls -- */

function DecisionButtons({ request }: { request: LeaveRequest }) {
  const { decideLeaveRequest } = useStore();
  return (
    <>
      <button
        type="button"
        aria-label={`Approve ${request.code}`}
        title="Approve"
        onClick={() => decideLeaveRequest(request.id, "Approved")}
        className="flex h-8 w-8 items-center justify-center rounded-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={{ background: tone.sky.soft, color: tone.sky.text }}
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        aria-label={`Reject ${request.code}`}
        title="Reject"
        onClick={() => decideLeaveRequest(request.id, "Rejected")}
        className="flex h-8 w-8 items-center justify-center rounded-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={{ background: tone.red.soft, color: tone.red.text }}
      >
        <X size={15} />
      </button>
    </>
  );
}

/* ---------------------------------------------------------------- detail -- */

function LeaveDetail({ request, canDecide }: { request: LeaveRequest; canDecide: boolean }) {
  const { state, decideLeaveRequest } = useStore();
  const who = employeeById(state, request.employeeId);
  const short = isShortNotice(request);
  const [note, setNote] = useState("");

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-7">
        <div>
          <SectionLabel>Reason given</SectionLabel>
          <p className="text-[0.8125rem] leading-relaxed text-text">{request.reason}</p>
        </div>

        <div
          className="rounded-sm p-3"
          style={{
            background: short ? tone.red.soft : tone.sky.soft,
            color: short ? tone.red.text : tone.sky.text,
          }}
        >
          <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold">
            {short ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
            {short ? "Short notice" : "Raised in good time"}
          </p>
          <p className="mt-1 text-[0.75rem] leading-relaxed">
            Raised {relativeTime(request.requestedAt)}, {noticeLabel(request)}. The threshold is{" "}
            {SHORT_NOTICE_HOURS} hours.
          </p>
        </div>

        {canDecide && request.status === "Pending" && (
          <div className="space-y-3">
            <TextArea
              label="Decision note"
              rows={2}
              value={note}
              onChange={setNote}
              placeholder="Optional — sent to the requester with your decision."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                icon={Check}
                onClick={() => decideLeaveRequest(request.id, "Approved", note)}
              >
                Approve request
              </Button>
              <Button
                variant="danger"
                icon={X}
                onClick={() => decideLeaveRequest(request.id, "Rejected", note)}
              >
                Reject request
              </Button>
            </div>
          </div>
        )}

        {(request.status === "Approved" || request.status === "Rejected") && (
          <div className="rounded-sm border border-line bg-card p-3">
            <SectionLabel>Decision</SectionLabel>
            <p className="text-[0.8125rem] text-text">
              <Badge t={LEAVE_STATUS_TONE[request.status]}>{request.status}</Badge>{" "}
              <span className="ms-1.5 text-muted">
                by {request.decidedBy ?? "—"}
                {request.decidedAt ? `, ${relativeTime(request.decidedAt)}` : ""}
              </span>
            </p>
            {request.decisionNote && (
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-text">
                “{request.decisionNote}”
              </p>
            )}
          </div>
        )}

        {request.status === "Withdrawn" && (
          <p
            className="flex items-start gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
            style={{ background: tone.slate.soft, color: tone.slate.text }}
          >
            <Undo2 size={14} className="mt-px shrink-0" />
            Withdrawn by the requester. The days are back in their balance and it is out of the
            approval queue — it can be re-raised at any point.
          </p>
        )}

        <LeaveTrail request={request} />
      </div>

      <div className="space-y-4 xl:col-span-5">
        <div className="flex items-center gap-3 rounded-sm border border-line bg-card p-3">
          <Avatar initials={initialsOf(who?.name ?? "?")} t={who?.tone ?? "slate"} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[0.875rem] font-semibold text-heading">
              {who?.name ?? "Removed employee"}
            </p>
            <p className="truncate text-[0.75rem] text-muted">
              {who ? `${who.role} · ${who.empId} · ${who.branch}` : "No longer on the roster"}
            </p>
          </div>
        </div>

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <Row label="Request" value={request.code} />
          <Row label="Type" value={request.type} />
          <Row label="First day" value={formatDate(request.from)} />
          <Row label="Last day" value={formatDate(request.to)} />
          <Row label="Days" value={String(request.days)} />
          <Row label="Raised" value={relativeTime(request.requestedAt)} />
        </dl>

        {who && (
          <div>
            <SectionLabel>Balance after approval</SectionLabel>
            <ul className="space-y-2">
              {leaveBalance(state, who.id).map((b) => (
                <li key={b.type}>
                  <div className="mb-1 flex items-center justify-between text-[0.75rem]">
                    <span className={b.type === request.type ? "font-semibold text-heading" : ""}>
                      {b.type}
                    </span>
                    <span className="font-semibold text-heading">
                      {b.type === request.type && request.status === "Pending"
                        ? `${Math.max(0, b.left - request.days)} left`
                        : `${b.left} left`}
                    </span>
                  </div>
                  <Progress value={(b.used / b.total) * 100} t={b.tone} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The request's full trail, newest last.
 *
 * Withdrawals and reversals are appended rather than overwriting what came
 * before, so "approved, then pulled, then re-raised" reads as the sequence it
 * actually was.
 */
function LeaveTrail({ request }: { request: LeaveRequest }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        <History size={14} />
        <SectionLabel>History ({request.history.length})</SectionLabel>
      </div>
      <ul className="space-y-2 border-s border-line ps-3">
        {request.history.map((e) => (
          <li key={e.id} className="relative">
            <span
              className="absolute -start-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full"
              style={{ background: tone[LEAVE_EVENT_TONE[e.action]].solid }}
            />
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge t={LEAVE_EVENT_TONE[e.action]}>{e.action}</Badge>
              <span className="text-[0.6875rem] text-muted">
                {e.by}
                {e.at ? ` · ${relativeTime(e.at)}` : ""}
              </span>
            </p>
            {e.note && (
              <p className="mt-1 text-[0.75rem] leading-relaxed text-text">“{e.note}”</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[0.75rem] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[0.8125rem] font-medium text-heading">
        {value}
      </dd>
    </div>
  );
}
