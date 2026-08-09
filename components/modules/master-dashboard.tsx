"use client";

import {
  Building2,
  CheckCircle2,
  Clock3,
  FolderKanban,
  MailWarning,
  Ban,
  Users,
} from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Grid,
  Progress,
  StatTile,
  TableWrap,
  Td,
  Th,
  Tr,
  tone,
} from "@/components/ui";
import { useMasterDashboardQuery } from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { formatDate, relativeTime } from "@/lib/store/selectors";

/*
 * The master portal's own dashboard.
 *
 * Built from scratch rather than reusing the Valex sales dashboard, because the
 * master has no sales: it has tenants. Every number here is a company count, an
 * invite that has not been accepted, or a tenant that has gone quiet — the three
 * things the platform owner actually acts on.
 */

const STATE_TONE = { active: "sky", invited: "orange", disabled: "red" } as const;

export default function MasterDashboard() {
  const { data, isLoading, isError, error } = useMasterDashboardQuery();

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <p className="py-10 text-center text-[0.875rem] text-muted">Loading tenants…</p>
        </CardBody>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Building2}
            title="Can't load the platform overview"
            desc={apiErrorMessage(error, "The API didn't answer.")}
          />
        </CardBody>
      </Card>
    );
  }

  const { counts, recent, pendingInvites } = data;
  // The share of tenants that have actually been activated — the one number
  // that says whether onboarding is working.
  const activationRate = counts.total === 0 ? 0 : Math.round((counts.active / counts.total) * 100);

  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <StatTile
          label="Companies"
          value={String(counts.total)}
          hint={`${counts.active} active`}
          t="blue"
          icon={Building2}
        />
        <StatTile
          label="Awaiting activation"
          value={String(counts.invited)}
          hint="Owner hasn't set a password"
          t="orange"
          icon={Clock3}
        />
        <StatTile
          label="People"
          value={String(counts.users)}
          hint="Across every tenant"
          t="sky"
          icon={Users}
        />
        <StatTile
          label="Projects"
          value={String(counts.projects)}
          hint="Across every tenant"
          t="blue"
          icon={FolderKanban}
        />
      </Grid>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Card className="h-full">
            <CardHeader title="Recent companies" desc="Newest tenants first." />
            {recent.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={Building2}
                  title="No companies yet"
                  desc="Create one from the Companies module to send its owner an invitation."
                />
              </CardBody>
            ) : (
              <TableWrap>
                <thead>
                  <tr className="border-b border-line">
                    <Th>Company</Th>
                    <Th>Owner</Th>
                    <Th>People</Th>
                    <Th>Created</Th>
                    <Th>State</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((company) => (
                    <Tr key={company.id}>
                      <Td className="whitespace-nowrap font-medium text-heading">
                        {company.companyName}
                        <span className="block text-[0.6875rem] font-normal text-muted">
                          {company.headBranch}
                        </span>
                      </Td>
                      <Td>
                        {company.ownerName}
                        <span className="block text-[0.6875rem] text-muted">{company.email}</span>
                      </Td>
                      <Td className="font-mono text-[0.75rem]">{company.userCount ?? 0}</Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDate(company.createdAt.slice(0, 10))}
                      </Td>
                      <Td>
                        <Badge t={STATE_TONE[company.state]}>{company.state}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Card>
            <CardHeader title="Activation" desc="Tenants whose owner has signed in at least once." />
            <CardBody className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[0.8125rem]">
                  <span>Activated</span>
                  <span className="font-semibold text-heading">{activationRate}%</span>
                </div>
                <Progress value={activationRate} t={activationRate >= 70 ? "sky" : "orange"} />
              </div>

              <ul className="space-y-2.5">
                {(
                  [
                    ["Active", counts.active, "sky", CheckCircle2],
                    ["Invited", counts.invited, "orange", Clock3],
                    ["Disabled", counts.disabled, "red", Ban],
                  ] as const
                ).map(([label, value, t, Icon]) => (
                  <li key={label} className="flex items-center gap-2.5 text-[0.8125rem]">
                    <Icon size={15} style={{ color: tone[t].text }} />
                    <span className="flex-1">{label}</span>
                    <span className="font-semibold text-heading">{value}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Invitations outstanding"
              desc="Owners who haven't set a password yet."
            />
            {pendingInvites.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing outstanding"
                  desc="Every company owner has activated their account."
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {pendingInvites.map((invite) => (
                  <li key={invite.userId} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <MailWarning
                      size={16}
                      className="mt-0.5 shrink-0"
                      style={{ color: tone[invite.expired ? "red" : "orange"].text }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium text-heading">
                        {invite.companyName}
                      </p>
                      <p className="truncate text-[0.75rem] text-muted">{invite.email}</p>
                    </div>
                    <span className="shrink-0 text-[0.6875rem] text-muted">
                      {invite.expired
                        ? "expired"
                        : invite.expiresAt
                          ? `expires ${relativeTime(invite.expiresAt)}`
                          : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
