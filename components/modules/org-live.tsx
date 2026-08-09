"use client";

import { GitBranch } from "lucide-react";
import { Card, EmptyState, ModuleSkeleton } from "@/components/ui";
import { useSession } from "@/lib/api/session";
import LiveBranches from "./LiveBranches";

/*
 * Branches.
 *
 * A company's branches are its own records, served by the API — see
 * LiveBranches. This file used to also carry a DemoBranches view built from a
 * static list of four invented offices; that list is gone with the rest of the
 * demo data, and there is nothing sensible to put in its place for a session
 * that is not signed in.
 */

export function Branches() {
  const session = useSession();

  if (session.status === "user") {
    // Only a superAdmin may pin, and the server enforces it too — this just
    // decides whether the controls are worth rendering.
    return (
      <LiveBranches
        canManage={session.user.roles.includes("superAdmin") || session.user.isOwner}
      />
    );
  }
  if (session.status === "loading") return <ModuleSkeleton rows={4} />;

  return (
    <Card>
      <EmptyState
        icon={GitBranch}
        title="Sign in to see branches"
        desc="Offices, headcount and the default branch scope belong to a company account."
      />
    </Card>
  );
}
