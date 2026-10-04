"use client";

/*
 * Teams — named groups of people.
 *
 * The module is deliberately thin, because a team is a thin thing: a name, a
 * colour, a lead and a list. Everything interesting happens where a team is
 * ASSIGNED (the project and task forms), and the API expands it into real
 * memberships there.
 *
 * Writes are a lead's job. The API enforces that; this hides the controls so
 * nobody is offered a button that will 403.
 */

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, UsersRound, Crown, Search } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Grid,
  ModuleSkeleton,
  StatTile,
  tone,
} from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import { TextInput } from "@/components/ui/form";
import {
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useListEmployeesQuery,
  useListTeamsQuery,
  useUpdateTeamMutation,
} from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { useSession } from "@/lib/api/session";
import type { Team } from "@/lib/api/types";
import type { Tone } from "@/lib/ui/tone";

const TONES: Tone[] = ["blue", "primary", "sky", "purple", "teal", "orange", "pink", "slate"];

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const toneOf = (value: string): Tone => ((value in tone ? value : "blue") as Tone);

export function Teams() {
  const session = useSession();
  const signedIn = session.status === "user";

  const { data: teams = [], isLoading } = useListTeamsQuery(undefined, { skip: !signedIn });
  const { data: employees } = useListEmployeesQuery(undefined, { skip: !signedIn });

  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [confirming, setConfirming] = useState<Team | null>(null);
  const [deleteTeam, deleteState] = useDeleteTeamMutation();
  const [error, setError] = useState<string | null>(null);

  // Only a lead may write. Mirrors the service's own check so the UI does not
  // offer a button the API will refuse.
  const canManage =
    session.status === "user" &&
    (session.user.isOwner ||
      session.user.roles.some((r) => ["superAdmin", "manager", "teamLeader"].includes(r)) ||
      session.user.empType === "manager" ||
      session.user.empType === "admin");

  if (!signedIn) {
    return (
      <Card>
        <EmptyState
          icon={UsersRound}
          title="Sign in to manage teams"
          desc="Teams are stored on the API, so the demo portals have none."
        />
      </Card>
    );
  }

  if (isLoading) return <ModuleSkeleton rows={4} />;

  const peopleCount = new Set(teams.flatMap((t) => t.memberIds)).size;

  async function remove(team: Team) {
    setError(null);
    try {
      await deleteTeam(team.id).unwrap();
      setConfirming(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't delete that team."));
    }
  }

  return (
    <div className="space-y-4">
      <Grid cols={3}>
        <StatTile label="Teams" value={String(teams.length)} t="primary" icon={UsersRound} />
        <StatTile
          label="People on a team"
          value={String(peopleCount)}
          hint="Counted once, across every team"
          t="sky"
          icon={Search}
        />
        <StatTile
          label="Largest team"
          value={String(teams.reduce((n, t) => Math.max(n, t.memberIds.length), 0))}
          hint={
            [...teams].sort((a, b) => b.memberIds.length - a.memberIds.length)[0]?.name ?? "—"
          }
          t="purple"
          icon={Crown}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Teams"
          desc="Put a whole team on a project or a task in one go. Members are expanded at the moment you assign them."
          action={
            canManage ? (
              <Button icon={Plus} onClick={() => setEditing("new")}>
                New team
              </Button>
            ) : undefined
          }
        />
        <CardBody className={teams.length === 0 ? "" : "pt-0"}>
          {error && (
            <p className="mb-3 text-[0.75rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
              {error}
            </p>
          )}

          {teams.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No teams yet"
              desc="Create one and you can assign it to a project or task instead of ticking names one by one."
            />
          ) : (
            <ul className="divide-y divide-(--default-border)">
              {teams.map((team) => {
                const t = toneOf(team.tone);
                return (
                  <li key={team.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card font-semibold"
                      style={{ background: tone[t].solid, color: tone[t].onSolid }}
                      aria-hidden
                    >
                      {initialsOf(team.name)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-semibold text-heading">
                        {team.name}
                      </p>
                      <p className="truncate text-[0.75rem] text-muted">
                        {team.description || `${team.memberIds.length} people`}
                      </p>
                    </div>

                    {/* The faces, capped — a team of forty should not wrap the row. */}
                    <div className="flex items-center gap-1">
                      {team.members.slice(0, 5).map((m) => (
                        <span key={m.id} title={`${m.name}${m.id === team.leadId ? " — lead" : ""}`}>
                          <Avatar initials={initialsOf(m.name)} t={toneOf(m.tone)} size={26} />
                        </span>
                      ))}
                      {team.members.length > 5 && (
                        <Badge t="slate">+{team.members.length - 5}</Badge>
                      )}
                      {team.members.length === 0 && (
                        <span className="text-[0.75rem] text-muted">No members</span>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(team)}>
                          Edit
                        </Button>
                        <Button variant="danger" icon={Trash2} onClick={() => setConfirming(team)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {editing && (
        <TeamEditor
          team={editing === "new" ? null : editing}
          employees={employees ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {confirming && (
        <Modal open title="Delete this team?" onClose={() => setConfirming(null)} size="sm">
          <div className="space-y-4">
            <p className="text-[0.875rem] leading-relaxed text-text">
              <strong className="text-heading">{confirming.name}</strong> will be removed and
              detached from any project or task that referenced it.
            </p>
            <p className="text-[0.75rem] leading-relaxed text-muted">
              The people stay exactly where they are. They were placed on that work individually
              and may already have tasks on it — deleting the team only removes the grouping.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                disabled={deleteState.isLoading}
                onClick={() => void remove(confirming)}
              >
                {deleteState.isLoading ? "Deleting…" : "Delete team"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- editor -- */

type EmployeeLite = { id: string; name: string; empId?: string; tone?: string };

function TeamEditor({
  team,
  employees,
  onClose,
}: {
  team: Team | null;
  employees: readonly EmployeeLite[];
  onClose: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [toneName, setToneName] = useState<Tone>(toneOf(team?.tone ?? "blue"));
  const [memberIds, setMemberIds] = useState<string[]>(team?.memberIds ?? []);
  const [leadId, setLeadId] = useState<string | null>(team?.leadId ?? null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [create, createState] = useCreateTeamMutation();
  const [update, updateState] = useUpdateTeamMutation();
  const saving = createState.isLoading || updateState.isLoading;

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) => `${e.name} ${e.empId ?? ""}`.toLowerCase().includes(term));
  }, [employees, query]);

  function toggle(id: string) {
    setMemberIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      // A lead who is no longer a member is a state the API rejects, so drop
      // the lead here rather than letting the save fail.
      if (leadId && !next.includes(leadId)) setLeadId(null);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give the team a name.");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      tone: toneName,
      leadId,
      memberIds,
    };
    try {
      if (team) await update({ id: team.id, patch: payload }).unwrap();
      else await create(payload).unwrap();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save that team."));
    }
  }

  return (
    <Modal open title={team ? `Edit ${team.name}` : "New team"} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Team name" value={name} onChange={setName} placeholder="Platform squad" />
          <TextInput
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="What this team looks after"
          />
        </div>

        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-heading">Colour</p>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setToneName(t)}
                aria-label={t}
                aria-pressed={toneName === t}
                className={`h-7 w-7 rounded-card transition-transform ${
                  toneName === t ? "scale-110 ring-2 ring-offset-2 ring-offset-card" : ""
                }`}
                style={{
                  background: tone[t].solid,
                  ...(toneName === t ? { boxShadow: `0 0 0 2px ${tone[t].solid}` } : {}),
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[0.8125rem] font-medium text-heading">
              Members <span className="text-muted">({memberIds.length})</span>
            </p>
            <div className="relative w-48">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find someone…"
                aria-label="Find someone"
                className="h-8 w-full rounded-card border border-input-border bg-form-bg pl-8 pr-2 text-[0.75rem] text-heading outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-card border border-line">
            {shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-[0.8125rem] text-muted">Nobody matches.</p>
            ) : (
              <ul className="divide-y divide-(--default-border)">
                {shown.map((e) => {
                  const on = memberIds.includes(e.id);
                  const isLead = leadId === e.id;
                  return (
                    <li key={e.id} className="flex items-center gap-2 px-2 py-1.5">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(e.id)}
                          className="h-3.5 w-3.5 accent-[rgb(var(--primary-rgb))]"
                        />
                        <Avatar initials={initialsOf(e.name)} t={toneOf(e.tone ?? "blue")} size={24} />
                        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-heading">
                          {e.name}
                          {e.empId && <span className="ms-1.5 text-[0.6875rem] text-muted">{e.empId}</span>}
                        </span>
                      </label>

                      {/* Lead is only offered for someone already on the team —
                          the API refuses a lead who is not a member. */}
                      {on && (
                        <button
                          type="button"
                          onClick={() => setLeadId(isLead ? null : e.id)}
                          title={isLead ? "Remove as lead" : "Make team lead"}
                          aria-pressed={isLead}
                          className={`flex h-6 items-center gap-1 rounded-card px-1.5 text-[0.625rem] font-semibold transition-colors ${
                            isLead ? "" : "text-muted hover:bg-hover hover:text-heading"
                          }`}
                          style={
                            isLead
                              ? { background: tone.orange.soft, color: tone.orange.text }
                              : undefined
                          }
                        >
                          <Crown size={11} />
                          Lead
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <p className="text-[0.75rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : team ? "Save changes" : "Create team"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default Teams;
