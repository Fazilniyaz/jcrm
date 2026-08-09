"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import {
  Users,
  UserPlus,
  CalendarOff,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  ListChecks,
  FolderKanban,
  Gauge,
  ShieldCheck,
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
  IconButton,
  SearchBox,
  Chip,
  Grid,
  EmptyState,
  ModuleSkeleton,
  SectionLabel,
  tone,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/overlay";
import { SelectInput } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import {
  employeesByIds,
  formatDate,
  initialsOf,
  openTaskCount,
  projectsForEmployee,
  scopedEmployees,
  projectsByIds,
  taskScore,
  tasksForEmployee,
} from "@/lib/store/selectors";
import {
  ACCOUNT_STATE_TONE,
  EMPLOYEE_ROLES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_TONE,
  PROJECT_STATUS_TONE,
  ROLE_TONE,
  TASK_STATUS_TONE,
  priorityMeta,
  type Employee,
  type EmployeeRole,
  type EmployeeStatus,
} from "@/lib/store/types";
import EmployeeForm from "./EmployeeForm";
import { EmployeeModuleAccess } from "./EmployeeModuleAccess";
import KraHistory from "./KraHistory";

type SortKey = "name" | "kra" | "joined" | "load";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "kra", label: "KRA score (low first)" },
  { value: "load", label: "Workload (busiest)" },
  { value: "joined", label: "Newest joiner" },
];

/** KRA bands, so the colour means the same thing everywhere it appears. */
function kraTone(score: number) {
  if (score >= 95) return "sky" as const;
  if (score >= 85) return "blue" as const;
  if (score >= 70) return "orange" as const;
  return "red" as const;
}

/**
 * The account lifecycle badge — Invited until the emailed link is accepted.
 *
 * Absent `accountState` means the demo store, where nobody has a login at all;
 * that reads as Active rather than as a workspace of people who never joined.
 */
function AccountBadge({ employee }: { employee: Employee }) {
  const account = employee.accountState ?? "Active";
  if (account === "Invited" && employee.inviteExpired) {
    return <Badge t="red">Invite expired</Badge>;
  }
  return <Badge t={ACCOUNT_STATE_TONE[account]}>{account}</Badge>;
}

export function EmployeeManagement() {
  const { hydrated, state, currentEmployee, deleteEmployee } = useStore();

  /*
   * Who the row buttons are offered to.
   *
   * These mirror what the API will actually accept, so a button is never shown
   * that can only produce a 403. Holding the Employees module is what authorises
   * writing to OTHER people's records; it buys nothing on your own, where the
   * server allows a super admin everything and everyone else only the fields
   * Settings already exposes (name, phone, avatar, availability).
   */
  const isAdmin = Boolean(currentEmployee?.isOwner) || currentEmployee?.role === "Super Admin";
  const isSelf = (e: Employee) => Boolean(currentEmployee) && e.id === currentEmployee?.id;
  const canEdit = (e: Employee) => !isSelf(e) || isAdmin;
  // Nobody, admin or not, may remove their own account.
  const canDelete = (e: Employee) => !isSelf(e);
  // Narrowed by the pinned branch, so every count here describes one office.
  const employees = useMemo(() => scopedEmployees(state), [state]);

  const [query, setQuery] = useState("");
  const [role, setRole] = useState<EmployeeRole | "All">("All");
  const [status, setStatus] = useState<EmployeeStatus | "All">("All");
  const [sort, setSort] = useState<SortKey>("name");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);

  const counts = useMemo(() => {
    const byStatus = (s: EmployeeStatus) => employees.filter((e) => e.status === s).length;
    return {
      total: employees.length,
      onLeave: byStatus("Leave"),
      idle: byStatus("Idle"),
      working: byStatus("Work Assigned"),
      // The owner is excluded: they are not scored, so counting their default
      // 100 would flatter the workspace average by a person who never earns it.
      avgKra: (() => {
        const scored = employees.filter((e) => !e.isOwner);
        return scored.length
          ? Math.round(scored.reduce((n, e) => n + e.kraScore, 0) / scored.length)
          : 0;
      })(),
      byRole: Object.fromEntries(
        EMPLOYEE_ROLES.map((r) => [r, employees.filter((e) => e.role === r).length]),
      ) as Record<EmployeeRole, number>,
    };
  }, [employees]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = employees.filter((e) => {
      if (role !== "All" && e.role !== role) return false;
      if (status !== "All" && e.status !== status) return false;
      if (!q) return true;
      return `${e.name} ${e.empId} ${e.email} ${e.branch} ${e.role}`.toLowerCase().includes(q);
    });

    const sorted = [...rows];
    if (sort === "kra") sorted.sort((a, b) => a.kraScore - b.kraScore);
    else if (sort === "joined") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "load")
      sorted.sort((a, b) => openTaskCount(state, b.id) - openTaskCount(state, a.id));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [employees, query, role, status, sort, state]);

  if (!hydrated) return <ModuleSkeleton />;

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Headcount"
          value={String(counts.total)}
          hint={`${counts.working} with work assigned`}
          t="blue"
          icon={Users}
        />
        <StatTile
          label="Available"
          value={String(counts.idle)}
          hint="Idle and ready for work"
          t="sky"
          icon={UserPlus}
        />
        <StatTile
          label="On Leave"
          value={String(counts.onLeave)}
          hint="Not available today"
          t="orange"
          icon={CalendarOff}
        />
        <StatTile
          label="Average KRA"
          value={String(counts.avgKra)}
          hint="Across the whole roster"
          t={kraTone(counts.avgKra)}
          icon={Gauge}
        />
      </Grid>

      <Card>
        <CardHeader
          title="Employee Directory"
          desc="Select a row to open the profile, workload and ID card."
          action={
            <Toolbar>
              <SearchBox
                placeholder="Search people…"
                value={query}
                onChange={setQuery}
                className="sm:w-52"
              />
              <Button icon={Plus} onClick={openCreate}>
                Add Employee
              </Button>
            </Toolbar>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Chip active={role === "All"} onClick={() => setRole("All")} count={counts.total}>
            All roles
          </Chip>
          {EMPLOYEE_ROLES.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(r)} count={counts.byRole[r]}>
              {r}
            </Chip>
          ))}

          <div className="ms-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="w-40">
              <SelectInput<EmployeeStatus | "All">
                label="Filter by status"
                hideLabel
                value={status}
                onChange={setStatus}
                options={[
                  { value: "All", label: "Any status" },
                  ...EMPLOYEE_STATUSES.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>
            <div className="w-44">
              <SelectInput<SortKey>
                label="Sort people by"
                hideLabel
                value={sort}
                onChange={setSort}
                options={SORTS}
              />
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={employees.length === 0 ? "Nobody on the roster" : "Nothing matches those filters"}
            desc={
              employees.length === 0
                ? "Add the first employee to start assigning projects and tasks."
                : "Try a different search term, or clear the role and status filters."
            }
            action={
              employees.length === 0 ? (
                <Button icon={Plus} onClick={openCreate}>
                  Add Employee
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                    setRole("All");
                    setStatus("All");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Employee</Th>
                <Th>ID</Th>
                <Th>Role</Th>
                <Th>Branch</Th>
                <Th className="w-40">KRA</Th>
                <Th>Open work</Th>
                <Th>Status</Th>
                <Th>Account</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const expanded = openId === e.id;
                const open = openTaskCount(state, e.id);
                return (
                  <Fragment key={e.id}>
                    <Tr expanded={expanded} onClick={() => setOpenId(expanded ? null : e.id)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? `Collapse ${e.name}` : `Expand ${e.name}`}
                            aria-expanded={expanded}
                            className="shrink-0 text-muted transition-transform hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <Avatar initials={initialsOf(e.name)} t={e.tone} size={36} />
                          <span className="min-w-0">
                            <span
                              className={`block whitespace-nowrap font-semibold ${
                                e.status === "Leave" ? "text-muted line-through" : "text-heading"
                              }`}
                            >
                              {e.name}
                            </span>
                            <span className="block truncate text-[0.6875rem] text-muted">
                              {e.email}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-[0.75rem] text-muted">
                        {e.empId}
                      </Td>
                      <Td>
                        <Badge t={ROLE_TONE[e.role]}>{e.role}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{e.branch}</Td>
                      <Td>
                        {e.isOwner ? (
                          // KRA measures delivery against assigned work. The
                          // owner is never assigned any, so a score would be a
                          // number that could not move.
                          <span className="text-[0.75rem] text-muted">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Progress value={e.kraScore} t={kraTone(e.kraScore)} />
                            <span className="w-8 shrink-0 text-right text-[0.75rem] font-semibold text-heading">
                              {e.kraScore}
                            </span>
                          </div>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="font-semibold text-heading">{open}</span>
                        <span className="text-muted"> task{open === 1 ? "" : "s"}</span>
                      </Td>
                      <Td>
                        <Badge t={EMPLOYEE_STATUS_TONE[e.status]}>{e.status}</Badge>
                      </Td>
                      <Td>
                        <AccountBadge employee={e} />
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                          {e.isOwner ? (
                            // The company owner's row is read-only. They cannot
                            // be demoted, disabled or removed — the API refuses
                            // all three — so offering the buttons would only
                            // produce a 400.
                            <span className="text-[0.6875rem] text-muted">Account owner</span>
                          ) : (
                            <>
                              {canEdit(e) && (
                                <IconButton
                                  icon={Pencil}
                                  label={`Edit ${e.name}`}
                                  onClick={() => openEdit(e)}
                                />
                              )}
                              {canDelete(e) && (
                                <IconButton
                                  icon={Trash2}
                                  label={`Remove ${e.name}`}
                                  tone="red"
                                  onClick={() => setPendingDelete(e)}
                                />
                              )}
                              {/*
                               * Your own row. Nobody may delete themselves —
                               * the API returns "You can't remove your own
                               * account", and an admin who could would lock the
                               * tenant out. Editing your own name, phone and
                               * avatar lives in Settings, which is the only
                               * place a non-admin is allowed to change them.
                               */}
                              {isSelf(e) && (
                                <span className="text-[0.6875rem] text-muted">
                                  {canEdit(e) ? "You" : "You — edit in Settings"}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </Td>
                    </Tr>

                    {expanded && (
                      <ExpandRow colSpan={9}>
                        <EmployeeDetail employee={e} />
                      </ExpandRow>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {formOpen && (
        <EmployeeForm
          key={editing?.id ?? "new"}
          open={formOpen}
          employee={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteEmployee(pendingDelete.id)}
        title="Remove employee"
        message={`${pendingDelete?.name ?? "This person"} will be removed from the directory and unassigned from every project and task they were on.`}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- detail -- */

function EmployeeDetail({ employee }: { employee: Employee }) {
  const { state } = useStore();
  const tasks = tasksForEmployee(state, employee.id);
  const openTasks = tasks.filter((t) => t.status !== "Done");
  const projects = projectsForEmployee(state, employee.id);
  // "Recent" is by start date, newest first — the store has no activity clock.
  const recent = [...tasks].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 4);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      {/* ID card + contact */}
      <div className="space-y-4 xl:col-span-4">
        <IdCard employee={employee} />

        <dl className="divide-y divide-line rounded-sm border border-line bg-card px-3 py-1">
          <ContactRow icon={Mail} label="Email" value={employee.email} />
          <ContactRow icon={Phone} label="Phone" value={employee.phone} />
          <ContactRow icon={MapPin} label="Branch" value={employee.branch} />
          <ContactRow icon={ShieldCheck} label="Joined" value={formatDate(employee.createdAt)} />
        </dl>

        {/* Renders only for a super admin — the endpoint behind it 403s for
            everyone else, which is what decides whether it appears. */}
        <EmployeeModuleAccess employeeId={employee.id} />

        {/* Why the KRA number on their row is what it is. */}
        {!employee.isOwner && <KraHistory employeeId={employee.id} />}

        {/* Says why someone who was added is not signing in yet. */}
        {employee.accountState === "Invited" && (
          <div className="rounded-sm border border-line bg-card p-4">
            <SectionLabel>Account</SectionLabel>
            <p className="mt-2 flex items-center gap-2">
              <AccountBadge employee={employee} />
            </p>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
              {employee.inviteExpired
                ? "Their invitation expired before it was used. Re-send it to give them a fresh link."
                : "They have been emailed a link and have not set a password yet. They become Active the moment they do."}
            </p>
          </div>
        )}
      </div>

      {/* KRA + workload */}
      <div className="space-y-4 xl:col-span-4">
        {/* The owner is never assigned work, so there is nothing for a KRA
            score to measure — showing a static 100 would imply otherwise. */}
        {employee.isOwner ? (
          <div className="rounded-sm border border-line bg-card p-4">
            <SectionLabel>KRA score</SectionLabel>
            <p className="mt-2 text-[0.8125rem] font-semibold text-heading">Not scored</p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
              KRA measures delivery against assigned work. The account owner
              isn&rsquo;t assigned any, so there is nothing to score.
            </p>
          </div>
        ) : (
          <div className="rounded-sm border border-line bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>KRA score</SectionLabel>
              <span
                className="rounded-sm px-2 py-0.5 text-[0.8125rem] font-bold"
                style={{
                  background: tone[kraTone(employee.kraScore)].soft,
                  color: tone[kraTone(employee.kraScore)].text,
                }}
              >
                {employee.kraScore} / 100
              </span>
            </div>
            <div className="mt-3">
              <Progress value={employee.kraScore} t={kraTone(employee.kraScore)} />
            </div>
            <p className="mt-2 text-[0.6875rem] text-muted">
              {employee.kraScore >= 95
                ? "Exceeding expectations."
                : employee.kraScore >= 85
                  ? "Meeting expectations."
                  : employee.kraScore >= 70
                    ? "Needs support this quarter."
                    : "On a performance plan."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "Open", v: openTasks.length },
            { k: "Done", v: tasks.length - openTasks.length },
            { k: "Projects", v: projects.length },
          ].map((s) => (
            <div key={s.k} className="rounded-sm border border-line bg-card p-3 text-center">
              <p className="text-[1.125rem] font-bold leading-none text-heading">{s.v}</p>
              <p className="mt-1 text-[0.6875rem] text-muted">{s.k}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-muted">
            <FolderKanban size={14} />
            <SectionLabel>Assigned projects ({projects.length})</SectionLabel>
          </div>
          {projects.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Not on any project yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-sm border border-line bg-card px-2.5 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8125rem] font-medium text-heading">
                      {p.name}
                    </span>
                    <span className="font-mono text-[0.6875rem] text-muted">
                      {p.code}
                      {p.assignedEmployees.includes(employee.id) ? "" : " · oversight"}
                    </span>
                  </span>
                  <Badge t={PROJECT_STATUS_TONE[p.status]}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* tasks */}
      <div className="space-y-4 xl:col-span-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-muted">
            <ListChecks size={14} />
            <SectionLabel>Assigned tasks ({tasks.length})</SectionLabel>
          </div>
          {tasks.length === 0 ? (
            <p className="rounded-sm border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">
              No tasks assigned.
            </p>
          ) : (
            <ul className="space-y-2">
              {openTasks.slice(0, 5).map((t) => {
                const score = taskScore(t);
                const pri = priorityMeta(t.priority);
                const projects = projectsByIds(state, t.projectIds);
                return (
                  <li key={t.id} className="rounded-sm border border-line bg-card p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] font-medium text-heading">
                          {t.title}
                        </span>
                        <span className="font-mono text-[0.6875rem] text-muted">
                          {t.taskId}
                          {projects[0] ? ` · ${projects[0].code}` : ""}
                        </span>
                      </span>
                      <Badge t={pri.tone}>{pri.short}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={score} t={TASK_STATUS_TONE[t.status]} />
                      <span className="w-9 shrink-0 text-right text-[0.6875rem] font-semibold text-heading">
                        {score}%
                      </span>
                    </div>
                  </li>
                );
              })}
              {openTasks.length > 5 && (
                <li className="text-center text-[0.6875rem] text-muted">
                  and {openTasks.length - 5} more open
                </li>
              )}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel>Recent tasks</SectionLabel>
          {recent.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line bg-card">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span className="min-w-0 truncate text-[0.75rem] text-text">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge t={TASK_STATUS_TONE[t.status]}>{t.status}</Badge>
                    <span className="text-[0.6875rem] text-muted">
                      {formatDate(t.startDate)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
        <Icon size={13} />
        {label}
      </dt>
      <dd className="min-w-0 truncate text-[0.8125rem] font-medium text-heading">{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- ID card -- */

/**
 * Staff pass. Fixed aspect and a gradient header so it reads as a physical
 * object rather than another data panel — the brand blue ramp is the same one
 * the sales cards use.
 */
function IdCard({ employee }: { employee: Employee }) {
  const { state } = useStore();
  const reportsInto = state.projects
    .filter((p) => p.assignedEmployees.includes(employee.id))
    .flatMap((p) => p.reportTo);
  const lead = employeesByIds(state, [...new Set(reportsInto)])[0];

  return (
    <div className="overflow-hidden rounded-card border border-line shadow-card">
      <div className="relative bg-brand-blue-gradient px-4 pb-8 pt-4">
        <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between gap-3">
          <Image
            src="/jadvix-logo-light.svg"
            alt="Jadvix"
            width={2826}
            height={654}
            unoptimized
            className="h-4 w-auto"
          />
          <span className="rounded-sm bg-white/15 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-fixed-white">
            Staff pass
          </span>
        </div>
      </div>

      <div className="relative bg-card px-4 pb-4">
        <div className="-mt-7 mb-2.5 flex items-end gap-3">
          <span className="rounded-avatar ring-4 ring-[var(--custom-white)]">
            <Avatar initials={initialsOf(employee.name)} t={employee.tone} size={54} />
          </span>
          <span className="min-w-0 flex-1 pb-1">
            <span className="block truncate text-[0.9375rem] font-bold text-heading">
              {employee.name}
            </span>
            <span className="block truncate text-[0.75rem] text-muted">{employee.role}</span>
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
          <div>
            <dt className="text-[0.625rem] uppercase tracking-wide text-muted">Employee ID</dt>
            <dd className="font-mono text-[0.8125rem] font-semibold text-heading">
              {employee.empId}
            </dd>
          </div>
          <div>
            <dt className="text-[0.625rem] uppercase tracking-wide text-muted">Joined</dt>
            <dd className="text-[0.8125rem] font-semibold text-heading">
              {formatDate(employee.createdAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[0.625rem] uppercase tracking-wide text-muted">Branch</dt>
            <dd className="truncate text-[0.8125rem] font-semibold text-heading">
              {employee.branch}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[0.625rem] uppercase tracking-wide text-muted">Reports to</dt>
            <dd className="truncate text-[0.8125rem] font-semibold text-heading">
              {lead?.name ?? "—"}
            </dd>
          </div>
        </dl>

        {/* barcode strip — decorative, derived from the ID so it looks stable */}
        <div className="mt-3 flex h-7 items-end gap-px overflow-hidden rounded-sm bg-subtle px-1.5 py-1">
          {Array.from({ length: 44 }, (_, i) => {
            const seed = employee.empId.charCodeAt(i % employee.empId.length) + i * 7;
            return (
              <span
                key={i}
                aria-hidden
                className="flex-1 bg-brand-ink/70"
                style={{ height: `${40 + (seed % 60)}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
