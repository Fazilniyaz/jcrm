"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  FolderKanban,
  Inbox,
  Loader2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Grid,
  StatTile,
  tone,
} from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import {
  useListEmployeesQuery,
  useProjectInvitationsQuery,
  useRespondToProjectMutation,
} from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { useSession } from "@/lib/api/session";
import { formatDate, relativeTime } from "@/lib/store/selectors";
import type { ProjectInvitation } from "@/lib/api/types";

/*
 * Requests — where a project invitation is answered.
 *
 * The acceptance step was always in the model; until now it had nowhere to
 * happen. Every invitation across every project lands here, and accepting one
 * is what puts the person on the project's team:
 *
 *   manager invites  ->  ProjectMember{ state: invited }  ->  shows up here
 *   employee accepts ->  ProjectMember{ state: accepted } ->  now an assigned
 *                                                             employee, and now
 *                                                             assignable a task
 *
 * Declining is recorded rather than erased, so a manager can see the answer and
 * re-invite if it was a mistake.
 */

const ROLE_COPY = {
  manager: {
    label: "Lead this project",
    detail:
      "You have been asked to run this project. Accepting makes you its manager — you can then add people to the team and create work on it.",
  },
  member: {
    label: "Join the team",
    detail:
      "You have been added to this project. Accepting puts you on the team, and tasks on it can then be assigned to you.",
  },
} as const;

export function Requests() {
  const session = useSession();
  const { data: invitations = [], isLoading, isError, error } = useProjectInvitationsQuery(
    undefined,
    { skip: session.status !== "user" },
  );
  const { data: employees = [] } = useListEmployeesQuery(undefined, {
    skip: session.status !== "user",
  });
  const [respond, respondState] = useRespondToProjectMutation();

  const [confirming, setConfirming] = useState<{
    invitation: ProjectInvitation;
    action: "accept" | "decline";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (session.status !== "user") {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Inbox}
            title="Sign in to see your requests"
            desc="Project invitations belong to an account on the API."
          />
        </CardBody>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <p className="flex items-center gap-2 py-10 text-[0.875rem] text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading your requests…
          </p>
        </CardBody>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Inbox}
            title="Can't load your requests"
            desc={apiErrorMessage(error, "The API didn't answer.")}
          />
        </CardBody>
      </Card>
    );
  }

  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "Someone";

  async function submit() {
    if (!confirming) return;
    const { invitation, action } = confirming;
    setFailure(null);
    try {
      await respond({ id: invitation.project.id, response: action }).unwrap();
      setNotice(
        action === "accept"
          ? `You're on ${invitation.project.name}. It now appears in your Projects.`
          : `You declined ${invitation.project.name}.`,
      );
      setConfirming(null);
    } catch (err) {
      setFailure(apiErrorMessage(err, "Couldn't record your answer."));
    }
  }

  const leadRequests = invitations.filter((i) => i.role === "manager");

  return (
    <div className="space-y-4">
      <Grid cols={3}>
        <StatTile
          label="Waiting on you"
          value={String(invitations.length)}
          hint={invitations.length === 1 ? "One invitation" : "Project invitations"}
          t={invitations.length > 0 ? "orange" : "slate"}
          icon={Inbox}
        />
        <StatTile
          label="To lead"
          value={String(leadRequests.length)}
          hint="Projects you'd manage"
          t="blue"
          icon={ShieldCheck}
        />
        <StatTile
          label="To join"
          value={String(invitations.length - leadRequests.length)}
          hint="Projects you'd work on"
          t="sky"
          icon={UserRound}
        />
      </Grid>

      {notice && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3 py-3">
            <Check size={15} style={{ color: tone.sky.text }} />
            <p className="min-w-0 flex-1 text-[0.8125rem] text-heading">{notice}</p>
            <Button variant="ghost" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Project requests"
          desc="Accepting a project puts you on its team. Until you do, it isn't yours."
        />

        {invitations.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={Inbox}
              title="Nothing waiting on you"
              desc="When a manager invites you to a project, it will appear here to accept."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {invitations.map((invitation) => {
              const copy = ROLE_COPY[invitation.role];
              return (
                <li key={invitation.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FolderKanban size={15} className="shrink-0 text-muted" />
                        <p className="text-[0.9375rem] font-semibold text-heading">
                          {invitation.project.name}
                        </p>
                        {invitation.project.code && (
                          <span className="font-mono text-[0.6875rem] text-muted">
                            {invitation.project.code}
                          </span>
                        )}
                        <Badge t={invitation.role === "manager" ? "blue" : "sky"}>
                          {copy.label}
                        </Badge>
                      </div>

                      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
                        {copy.detail}
                      </p>

                      {invitation.project.description && (
                        <p className="mt-2 line-clamp-2 text-[0.75rem] text-muted">
                          {invitation.project.description}
                        </p>
                      )}

                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-muted">
                        <span>
                          Invited by{" "}
                          <span className="text-heading">{nameOf(invitation.invitedById)}</span>{" "}
                          {relativeTime(invitation.invitedAt)}
                        </span>
                        {invitation.project.dueDate && (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={11} />
                            Due {formatDate(invitation.project.dueDate.slice(0, 10))}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        icon={Check}
                        onClick={() => {
                          setFailure(null);
                          setConfirming({ invitation, action: "accept" });
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        icon={X}
                        onClick={() => {
                          setFailure(null);
                          setConfirming({ invitation, action: "decline" });
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={
          confirming?.action === "accept"
            ? `Accept ${confirming.invitation.project.name}?`
            : `Decline ${confirming?.invitation.project.name ?? "project"}?`
        }
        desc={
          confirming?.action === "accept"
            ? confirming.invitation.role === "manager"
              ? "You'll become this project's manager: you can add people to it, create tasks on it, and it will count towards your workload."
              : "You'll join this project's team. Tasks on it can then be assigned to you, and it will count towards your workload."
            : "The manager who invited you will be told. They can invite you again if this was a mistake."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant={confirming?.action === "decline" ? "danger" : "primary"}
              disabled={respondState.isLoading}
              onClick={() => void submit()}
            >
              {respondState.isLoading
                ? "Saving…"
                : confirming?.action === "accept"
                  ? "Yes, accept"
                  : "Yes, decline"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-sm bg-subtle p-3 text-[0.8125rem]">
            <p className="font-medium text-heading">{confirming?.invitation.project.name}</p>
            <p className="mt-0.5 text-[0.75rem] text-muted">
              Invited by {confirming ? nameOf(confirming.invitation.invitedById) : "—"}
            </p>
          </div>
          {failure && (
            <p
              role="alert"
              className="rounded-sm px-3 py-2 text-[0.8125rem]"
              style={{
                background: "rgba(var(--brand-red-rgb),0.12)",
                color: "rgb(var(--danger-rgb))",
              }}
            >
              {failure}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
